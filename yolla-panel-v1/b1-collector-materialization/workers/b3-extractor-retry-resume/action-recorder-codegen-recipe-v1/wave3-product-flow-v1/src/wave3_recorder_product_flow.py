from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
from typing import Any


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def hash_json(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()


def hash_text(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


LIST_HTML = r'''<!doctype html><html><body style="height:1800px">
<label>Keyword <input data-testid="keyword-input" aria-label="Keyword" /></label>
<label>Region <select data-testid="region-select" aria-label="Region"><option value="">All</option><option value="seoul">Seoul</option></select></label>
<button data-testid="search-button" onclick="document.querySelector('#search-status').textContent='searched:'+document.querySelector('[data-testid=keyword-input]').value+':'+document.querySelector('[data-testid=region-select]').value">Search</button>
<div id="search-status">idle</div>
<button data-testid="route-button" onclick="location.hash='detail'; document.querySelector('#route-status').textContent='route:'+location.hash">Route Detail</button>
<div id="route-status">route:none</div>
<a data-testid="details-link" target="_blank" href="about:blank#popup">Open Detail Popup</a>
</body></html>'''

DETAIL_HTML = r'''<!doctype html><html><body>
<h1>Detail Popup</h1>
<iframe id="details-frame" name="details-frame" srcdoc="<!doctype html><html><body><button data-testid='frame-load' onclick=&quot;document.querySelector('#frame-status').textContent='loaded'&quot;>Load Frame Data</button><div id='frame-status'>idle</div></body></html>"></iframe>
</body></html>'''


@dataclass(frozen=True)
class Locator:
    strategy: str
    value: str

    def to_json(self) -> dict[str, str]:
        return {"strategy": self.strategy, "value": self.value}


class ActionLedger:
    def __init__(self, events: list[dict[str, Any]] | None = None) -> None:
        self.events: list[dict[str, Any]] = deepcopy(events or [])
        self._fingerprints = {event["fingerprint"] for event in self.events}
        self.validate()

    @staticmethod
    def fingerprint(event: dict[str, Any]) -> str:
        core = {
            "kind": event["kind"],
            "page_alias": event.get("page_alias"),
            "frame_name": event.get("frame_name"),
            "locator": event.get("locator"),
            "value": event.get("value"),
            "url": event.get("url"),
            "scroll": event.get("scroll"),
        }
        return hash_json(core)

    def append(self, **event: Any) -> dict[str, Any]:
        payload = deepcopy(event)
        payload["fingerprint"] = self.fingerprint(payload)
        if payload["fingerprint"] in self._fingerprints:
            return next(deepcopy(e) for e in self.events if e["fingerprint"] == payload["fingerprint"])
        payload["sequence"] = len(self.events) + 1
        payload["event_id"] = f"wave3-action-{payload['sequence']:04d}"
        previous_hash = self.events[-1]["event_hash"] if self.events else "0" * 64
        payload["previous_hash"] = previous_hash
        payload["event_hash"] = hash_json({k: v for k, v in payload.items() if k != "event_hash"})
        self.events.append(payload)
        self._fingerprints.add(payload["fingerprint"])
        return deepcopy(payload)

    def validate(self) -> bool:
        seen: set[str] = set()
        previous_hash = "0" * 64
        for expected, event in enumerate(self.events, start=1):
            if event["sequence"] != expected:
                raise ValueError("non-contiguous action sequence")
            if event["fingerprint"] in seen:
                raise ValueError("duplicate action fingerprint")
            if event["previous_hash"] != previous_hash:
                raise ValueError("action hash chain previous mismatch")
            expected_hash = hash_json({k: v for k, v in event.items() if k != "event_hash"})
            if event["event_hash"] != expected_hash:
                raise ValueError("action hash mismatch")
            seen.add(event["fingerprint"])
            previous_hash = expected_hash
        return True

    def to_json(self) -> dict[str, Any]:
        kinds = sorted({event["kind"] for event in self.events})
        return {
            "schema_version": "B3_WAVE3_ACTION_LOG_V1",
            "recorded_event_count": len(self.events),
            "action_types": kinds,
            "duplicate_fingerprint_count": len(self.events) - len({e["fingerprint"] for e in self.events}),
            "events": deepcopy(self.events),
        }


class SessionStateStore:
    @staticmethod
    def save(path: Path, *, ledger: ActionLedger, state: dict[str, Any]) -> dict[str, Any]:
        payload = {"schema_version": "B3_WAVE3_SESSION_STATE_V1", "state": deepcopy(state), "events": deepcopy(ledger.events)}
        payload["state_digest"] = hash_json(payload)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        return payload

    @staticmethod
    def load(path: Path) -> tuple[ActionLedger, dict[str, Any], str]:
        payload = json.loads(path.read_text(encoding="utf-8"))
        digest = payload.pop("state_digest")
        if hash_json(payload) != digest:
            raise ValueError("session state digest mismatch")
        return ActionLedger(payload["events"]), deepcopy(payload["state"]), digest


class RecipeCompiler:
    EXECUTABLE_KINDS = {"input", "select", "click", "scroll", "navigation", "popup", "iframe"}

    @staticmethod
    def compile(ledger: ActionLedger) -> dict[str, Any]:
        steps = []
        for event in ledger.events:
            if event["kind"] not in RecipeCompiler.EXECUTABLE_KINDS:
                continue
            steps.append({
                "step_id": f"step-{len(steps)+1:04d}", "kind": event["kind"],
                "page_alias": event.get("page_alias"), "frame_name": event.get("frame_name"),
                "locator": deepcopy(event.get("locator")), "value": event.get("value"),
                "url": event.get("url"), "scroll": deepcopy(event.get("scroll")),
                "recorded_event_id": event["event_id"],
            })
        recipe = {
            "schema_version": "B3_WAVE3_EXTRACTION_RECIPE_V1", "recipe_id": "b3-wave3-product-flow-001",
            "runtime_bootstrap": {"mode": "INLINE_DOCUMENT", "list_html": LIST_HTML, "detail_html": DETAIL_HTML},
            "steps": steps, "recorded_event_count": len(ledger.events), "executable_step_count": len(steps),
            "required_action_types": sorted(RecipeCompiler.EXECUTABLE_KINDS),
            "a6_adapter_contract": {"consumer_pr": 25, "input_kind": "B3_WAVE3_RECORDED_PRODUCT_FLOW", "required": ["recipe_digest", "adapter_source_sha256", "replay_receipt_sha256", "restart_resume_receipt_sha256"]},
            "safety": {"production": False, "ready": False, "merge": False},
        }
        recipe["recipe_digest"] = hash_json(recipe)
        return recipe


def generate_adapter_source(recipe: dict[str, Any]) -> str:
    encoded = repr(recipe)
    return f'''from __future__ import annotations\n\nRECIPE = {encoded}\n\ndef _loc(scope, locator):\n    if not locator: return None\n    strategy=locator["strategy"]; value=locator["value"]\n    if strategy=="test_id": return scope.get_by_test_id(value)\n    if strategy=="aria_label": return scope.get_by_label(value)\n    if strategy=="css": return scope.locator(value)\n    if strategy=="text": return scope.get_by_text(value, exact=True)\n    raise ValueError(strategy)\n\ndef run(browser):\n    context=browser.new_context(); page=context.new_page(); pages={{"main":page}}; trace=[]\n    page.set_content(RECIPE["runtime_bootstrap"]["list_html"])\n    try:\n      for step in RECIPE["steps"]:\n        kind=step["kind"]\n        if kind in {{"popup","iframe","navigation"}}:\n          if kind=="navigation" and page.url != step["url"]: raise AssertionError((page.url,step["url"]))\n          if kind=="popup" and "popup-1" not in pages: raise AssertionError("popup missing")\n          if kind=="iframe" and pages.get(step["page_alias"],page).frame(name=step["frame_name"]) is None: raise AssertionError("iframe missing")\n          trace.append({{"step_id":step["step_id"],"kind":kind,"status":"PASS"}}); continue\n        target_page=pages.get(step["page_alias"],page); scope=target_page.frame_locator("#details-frame") if step.get("frame_name")=="details-frame" else target_page; locator=_loc(scope,step.get("locator"))\n        if kind=="input": locator.fill(step.get("value") or "")\n        elif kind=="select": locator.select_option(step.get("value") or "")\n        elif kind=="scroll": target_page.evaluate("p=>window.scrollTo(p.x,p.y)",step["scroll"])\n        elif kind=="click" and step.get("locator",{{}}).get("value")=="details-link":\n          with target_page.expect_popup() as pi: locator.click()\n          popup=pi.value; popup.set_content(RECIPE["runtime_bootstrap"]["detail_html"]); pages["popup-1"]=popup\n        elif kind=="click": locator.click()\n        else: raise ValueError(kind)\n        trace.append({{"step_id":step["step_id"],"kind":kind,"status":"PASS"}})\n      popup=pages.get("popup-1"); assertions={{"query":page.get_by_test_id("keyword-input").input_value(),"region":page.get_by_test_id("region-select").input_value(),"search_status":page.locator("#search-status").inner_text(),"navigation_hash":page.evaluate("location.hash"),"popup_opened":popup is not None,"frame_status":popup.frame_locator("#details-frame").locator("#frame-status").inner_text() if popup else None}}; expected={{"query":"apartment","region":"seoul","search_status":"searched:apartment:seoul","navigation_hash":"#detail","popup_opened":True,"frame_status":"loaded"}}\n      return {{"status":"PASS" if assertions==expected else "FAILED","trace":trace,"assertions":assertions,"expected":expected,"step_count":len(trace)}}\n    finally: context.close()\n'''


def load_generated_adapter(path: Path):
    spec = importlib.util.spec_from_file_location("b3_wave3_generated_adapter", path)
    if spec is None or spec.loader is None: raise RuntimeError("cannot load generated adapter")
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
