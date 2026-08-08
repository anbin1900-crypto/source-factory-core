from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, BrowserContext, Frame, Page, sync_playwright


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def hash_json(value: Any) -> str:
    return sha256(canonical_json(value).encode('utf-8')).hexdigest()


RECORDER_INIT_SCRIPT = r"""
(() => {
  if (window.__yollaRecorderInstalled) return;
  window.__yollaRecorderInstalled = true;
  const snap = (el) => ({
    tag: (el && el.tagName ? el.tagName.toLowerCase() : ''),
    id: el?.id || null,
    test_id: el?.getAttribute?.('data-testid') || null,
    aria_label: el?.getAttribute?.('aria-label') || null,
    name: el?.getAttribute?.('name') || null,
    role: el?.getAttribute?.('role') || null,
    type: el?.getAttribute?.('type') || null,
    text: (el?.innerText || el?.textContent || '').trim().slice(0, 120),
    target: el?.getAttribute?.('target') || null,
    href: el?.getAttribute?.('href') || null
  });
  const emit = (payload) => window.__yolla_record({...payload, document_url:location.href, frame_name:window.name || null, is_top:window.top===window}).catch(() => {});
  document.addEventListener('input', e => emit({kind:'input', value:e.target?.value ?? '', target:snap(e.target)}), true);
  document.addEventListener('change', e => emit({kind:'select', value:e.target?.value ?? '', target:snap(e.target)}), true);
  document.addEventListener('click', e => emit({kind:'click', target:snap(e.target)}), true);
  let scrollSent = false;
  window.addEventListener('scroll', () => {
    if (!scrollSent && window.scrollY > 0) {
      scrollSent = true;
      emit({kind:'scroll', x:window.scrollX, y:window.scrollY, target:{tag:'window'}});
    }
  }, {passive:true});
})();
"""


@dataclass(frozen=True)
class Locator:
    strategy: str
    value: str

    def to_json(self) -> dict[str, str]:
        return {'strategy': self.strategy, 'value': self.value}


class LiveActionRecorder:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self._sequence = 0
        self._page_aliases: dict[int, str] = {}

    def _alias(self, page: Page) -> str:
        key = id(page)
        if key not in self._page_aliases:
            self._page_aliases[key] = 'main' if not self._page_aliases else f'popup-{len(self._page_aliases)}'
        return self._page_aliases[key]

    def _append(self, event: dict[str, Any]) -> None:
        self._sequence += 1
        event = deepcopy(event)
        event['sequence'] = self._sequence
        event['event_id'] = f'live-action-{self._sequence:04d}'
        self.events.append(event)

    def install(self, context: BrowserContext) -> None:
        def binding(source: dict[str, Any], payload: dict[str, Any]) -> None:
            page: Page = source['page']
            self._append({
                'kind': payload['kind'],
                'page_alias': self._alias(page),
                'page_url': payload.get('document_url'),
                'frame_url': payload.get('document_url'),
                'frame_name': payload.get('frame_name'),
                'payload': payload,
                'source': 'DOM_EVENT_LISTENER',
            })

        context.expose_binding('__yolla_record', binding)
        context.add_init_script(RECORDER_INIT_SCRIPT)
        context.on('page', self._on_page)

    def _on_page(self, page: Page) -> None:
        alias = self._alias(page)
        self._append({'kind':'popup','page_alias':alias,'page_url':'about:blank','payload':{},'source':'PLAYWRIGHT_CONTEXT_PAGE'})

    def attach_main(self, page: Page) -> None:
        self._alias(page)

    def _on_navigation(self, page: Page, frame: Frame) -> None:
        self._append({
            'kind':'navigation',
            'page_alias':self._alias(page),
            'page_url':page.url,
            'frame_url':frame.url,
            'frame_name':frame.name or None,
            'payload':{'url':frame.url,'is_main_frame':frame == page.main_frame},
            'source':'PLAYWRIGHT_FRAMENAVIGATED',
        })

    @staticmethod
    def locator_for(target: dict[str, Any]) -> Locator:
        if target.get('test_id'):
            return Locator('test_id', str(target['test_id']))
        if target.get('aria_label'):
            return Locator('aria_label', str(target['aria_label']))
        if target.get('id'):
            return Locator('css', f"#{target['id']}")
        text = str(target.get('text') or '').strip()
        if text:
            return Locator('text', text)
        tag = str(target.get('tag') or '').strip()
        if tag:
            return Locator('css', tag)
        raise ValueError('target has no usable locator')

    def compile_recipe(self, *, start_url: str, runtime_bootstrap: dict[str, str]) -> dict[str, Any]:
        steps: list[dict[str, Any]] = []
        seen: set[tuple[Any, ...]] = set()
        for event in self.events:
            kind = event['kind']
            payload = event.get('payload') or {}
            target = payload.get('target') or {}
            if kind not in {'input','select','click','scroll'}:
                continue
            if kind == 'click' and target.get('tag') not in {'button','a'}:
                continue
            locator = None if kind == 'scroll' else self.locator_for(target).to_json()
            frame_selector = '#details-frame' if event.get('frame_name') == 'details-frame' or str(event.get('frame_url','')).endswith(('frame','frame.html')) else None
            key = (kind, event.get('page_alias'), frame_selector, canonical_json(locator), payload.get('value'), target.get('href'))
            if key in seen:
                continue
            seen.add(key)
            step = {
                'step_id': f'step-{len(steps)+1:04d}',
                'action': kind,
                'page_alias': event.get('page_alias'),
                'frame_selector': frame_selector,
                'locator': locator,
                'value': payload.get('value'),
                'scroll': {'x': int(payload.get('x',0)), 'y': int(payload.get('y',0))} if kind == 'scroll' else None,
                'expect_popup': bool(kind == 'click' and target.get('target') == '_blank'),
                'recorded_event_id': event['event_id'],
            }
            steps.append(step)
        recipe = {
            'schema_version':'B3_LIVE_EXTRACTION_RECIPE_V2',
            'recipe_id':'b3-wave2-live-recorder-001',
            'start_url':start_url,
            'recorded_action_count':len(steps),
            'runtime_bootstrap':deepcopy(runtime_bootstrap),
            'steps':steps,
            'a6_adapter_contract':{
                'consumer_pr':25,
                'input_kind':'RECORDED_ACTION_RECIPE',
                'required_fields':['recipe_hash','steps','generated_adapter_path','replay_trace_path'],
            },
            'safety':{'production':False,'ready':False,'merge':False},
        }
        recipe['recipe_hash'] = hash_json(recipe)
        return recipe


class RecipeReplayer:
    def __init__(self, browser: Browser) -> None:
        self.browser = browser

    @staticmethod
    def _locator(page_or_frame: Any, locator: dict[str, str]):
        strategy, value = locator['strategy'], locator['value']
        if strategy == 'test_id':
            return page_or_frame.get_by_test_id(value)
        if strategy == 'aria_label':
            return page_or_frame.get_by_label(value)
        if strategy == 'text':
            return page_or_frame.get_by_text(value, exact=True)
        if strategy == 'css':
            return page_or_frame.locator(value)
        raise ValueError(f'unsupported locator strategy: {strategy}')

    def replay(self, recipe: dict[str, Any]) -> dict[str, Any]:
        context = self.browser.new_context()
        pages: dict[str, Page] = {}
        trace: list[dict[str, Any]] = []
        try:
            page = context.new_page()
            pages['main'] = page
            page.set_content(recipe['runtime_bootstrap']['list_html'])
            for step in recipe['steps']:
                page = pages.get(step['page_alias'], pages['main'])
                target: Any = page.frame_locator(step['frame_selector']) if step.get('frame_selector') else page
                action = step['action']
                if action == 'scroll':
                    page.evaluate('(p) => window.scrollTo(p.x, p.y)', step['scroll'])
                else:
                    locator = self._locator(target, step['locator'])
                    if action == 'input':
                        locator.fill(step['value'] or '')
                    elif action == 'select':
                        locator.select_option(step['value'] or '')
                    elif action == 'click' and step.get('expect_popup'):
                        with page.expect_popup() as popup_info:
                            locator.click()
                        popup = popup_info.value
                        popup.set_content(recipe['runtime_bootstrap']['detail_html'])
                        pages['popup-1'] = popup
                    elif action == 'click':
                        locator.click()
                    else:
                        raise ValueError(f'unsupported action: {action}')
                trace.append({'step_id':step['step_id'],'action':action,'status':'PASS'})
            popup = pages.get('popup-1')
            assertions = {
                'search_status': pages['main'].locator('#search-status').inner_text(),
                'popup_opened': popup is not None,
                'frame_status': popup.frame_locator('#details-frame').locator('#frame-status').inner_text() if popup else None,
            }
            passed = assertions == {'search_status':'searched:apartment','popup_opened':True,'frame_status':'loaded'}
            return {'status':'PASS' if passed else 'FAILED','trace':trace,'assertions':assertions,'step_count':len(trace)}
        finally:
            context.close()


def generate_adapter_source(recipe: dict[str, Any]) -> str:
    encoded = json.dumps(recipe, ensure_ascii=False, sort_keys=True, indent=2)
    return f'''from __future__ import annotations\n\n# Generated B-3 Wave2 adapter input for A-6.\nRECIPE = {encoded}\n\ndef recipe() -> dict:\n    return RECIPE\n'''
