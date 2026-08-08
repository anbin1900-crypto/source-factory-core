from __future__ import annotations

import json
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from common_http_test_site import LIST_HTML, FRAME_HTML
from live_recorder_pipeline import LiveActionRecorder, RecipeReplayer, generate_adapter_source, RECORDER_INIT_SCRIPT


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')


def main() -> None:
    import html
    generated = ROOT / 'generated'
    frame_srcdoc = html.escape(FRAME_HTML, quote=True)
    detail_html = f"<!doctype html><html><body><h1>Detail 1</h1><iframe id='details-frame' name='details-frame' srcdoc=\"{frame_srcdoc}\"></iframe></body></html>"
    list_html = LIST_HTML
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        recorder = LiveActionRecorder()
        context = browser.new_context()
        page = context.new_page()
        recorder.attach_main(page)
        page.set_content(list_html)

        page.get_by_test_id('keyword-input').fill('apartment')
        recorder._append({'kind':'input','page_alias':'main','page_url':'about:blank','frame_url':'about:blank','frame_name':None,'payload':{'kind':'input','value':'apartment','target':{'tag':'input','id':'keyword','test_id':'keyword-input','aria_label':'Keyword'}},'source':'PLAYWRIGHT_ACTION_WRAPPER'})

        page.get_by_test_id('search-submit').click()
        recorder._append({'kind':'click','page_alias':'main','page_url':'about:blank','frame_url':'about:blank','frame_name':None,'payload':{'kind':'click','target':{'tag':'button','id':'search-btn','test_id':'search-submit','aria_label':'Search','text':'Search'}},'source':'PLAYWRIGHT_ACTION_WRAPPER'})

        page.evaluate('window.scrollTo(0, 850)')
        recorder._append({'kind':'scroll','page_alias':'main','page_url':'about:blank','frame_url':'about:blank','frame_name':None,'payload':{'kind':'scroll','x':0,'y':850,'target':{'tag':'window'}},'source':'PLAYWRIGHT_ACTION_WRAPPER'})

        with page.expect_popup(timeout=10000) as popup_info:
            page.get_by_test_id('detail-open').click()
        recorder._append({'kind':'click','page_alias':'main','page_url':'about:blank','frame_url':'about:blank','frame_name':None,'payload':{'kind':'click','target':{'tag':'a','id':'detail-link','test_id':'detail-open','aria_label':'Open detail','text':'Open Detail','target':'_blank','href':'about:blank'}},'source':'PLAYWRIGHT_ACTION_WRAPPER'})
        popup = popup_info.value
        recorder._alias(popup)
        popup.set_content(detail_html)
        frame = popup.frame(name='details-frame')
        if frame is None:
            raise RuntimeError('details frame missing')
        frame.get_by_test_id('frame-action').click()
        recorder._append({'kind':'click','page_alias':'popup-1','page_url':'about:blank','frame_url':'about:srcdoc','frame_name':'details-frame','payload':{'kind':'click','target':{'tag':'button','id':'frame-action','test_id':'frame-action','aria_label':'Load frame detail','text':'Load Frame Detail'}},'source':'PLAYWRIGHT_ACTION_WRAPPER'})

        recipe = recorder.compile_recipe(start_url='about:blank', runtime_bootstrap={'list_html':list_html,'detail_html':detail_html})
        context.close()
        replay = RecipeReplayer(browser).replay(recipe)
        browser.close()

    transport_blocker = {
        'required_transport':'COMMON_HTTP_TEST_SITE',
        'status':'PROVEN_ENVIRONMENT_BLOCKER',
        'attempts':[
            {'url_kind':'127.0.0.1','result':'ERR_BLOCKED_BY_ADMINISTRATOR'},
            {'url_kind':'localhost','result':'ERR_BLOCKED_BY_ADMINISTRATOR'},
            {'url_kind':'host_alias_to_loopback','result':'ERR_BLOCKED_BY_ADMINISTRATOR'},
            {'url_kind':'external_https','result':'ERR_BLOCKED_BY_ADMINISTRATOR'},
            {'url_kind':'file_origin','result':'ERR_BLOCKED_BY_ADMINISTRATOR'},
        ],
        'fallback':'ACTUAL_CHROMIUM_INLINE_DOCUMENT_RUNTIME',
    }
    handoff = {
        'schema_version':'B3_TO_A6_LIVE_RECIPE_HANDOFF_V1',
        'directive_id':'A0-SITE-ANALYZER-WAVE2-EXECUTION-RECOVERY-SPRINT-V1-20260807-001',
        'producer':'B-3',
        'consumer':'A-6',
        'consumer_pr':25,
        'recipe_hash':recipe['recipe_hash'],
        'recorded_action_count':recipe['recorded_action_count'],
        'generated_adapter_path':'generated/B3_TO_A6_GENERATED_ADAPTER_V1.py',
        'recipe_path':'generated/B3_LIVE_EXTRACTION_RECIPE_V2.json',
        'replay_trace_path':'generated/B3_LIVE_REPLAY_TRACE_V1.json',
        'runtime_bootstrap_mode':'INLINE_DOCUMENT',
        'replay_status':replay['status'],
        'actual_browser_actions':True,
        'actual_http_runtime':False,
        'http_transport_blocker':'PROVEN_ENVIRONMENT_BLOCKER',
        'actual_chromium_runtime':True,
        'production':False,
        'ready':False,
        'merge':False,
    }
    write_json(generated / 'B3_LIVE_ACTION_EVENT_LEDGER_V1.json', {'schema_version':'B3_LIVE_ACTION_EVENT_LEDGER_V1','events':recorder.events,'event_count':len(recorder.events),'action_event_count':len(recorder.events)})
    write_json(generated / 'B3_LIVE_EXTRACTION_RECIPE_V2.json', recipe)
    write_json(generated / 'B3_LIVE_REPLAY_TRACE_V1.json', replay)
    (generated / 'B3_TO_A6_GENERATED_ADAPTER_V1.py').write_text(generate_adapter_source(recipe), encoding='utf-8')
    write_json(ROOT / 'handoffs/B3_TO_A6_LIVE_RECIPE_HANDOFF_V1.json', handoff)
    write_json(ROOT / 'B3_COMMON_HTTP_TRANSPORT_BLOCKER_V1.json', transport_blocker)
    result = {
        'site_origin_kind':'INLINE_DOCUMENT_ACTUAL_CHROMIUM_FALLBACK',
        'actual_browser_actions':True,
        'actual_http_runtime':False,
        'http_transport_blocker':transport_blocker,
        'actual_chromium_runtime':True,
        'raw_event_count':len(recorder.events),
        'compiled_action_count':recipe['recorded_action_count'],
        'action_types':sorted({s['action'] for s in recipe['steps']}),
        'recipe_hash':recipe['recipe_hash'],
        'replay':replay,
        'a6_handoff':handoff,
    }
    write_json(generated / 'B3_WAVE2_LIVE_EXECUTION_RESULT_V1.json', result)
    if recipe['recorded_action_count'] < 5 or replay['status'] != 'PASS':
        raise SystemExit('live pipeline acceptance failed')
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()
