from __future__ import annotations

import json
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from wave3_recorder_product_flow import (
    ActionLedger, DETAIL_HTML, LIST_HTML, Locator, RecipeCompiler, SessionStateStore,
    generate_adapter_source, hash_text, load_generated_adapter,
)

CHROMIUM = "/usr/bin/chromium"
OUT = ROOT / "generated"
OUT.mkdir(parents=True, exist_ok=True)
STATE_PATH = OUT / "B3_WAVE3_SESSION_STATE_V1.json"


def loc_testid(value: str): return Locator("test_id", value).to_json()


def record_phase1() -> tuple[str, int]:
    ledger = ActionLedger()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM, headless=True, args=["--no-sandbox"])
        page = browser.new_page(); page.set_content(LIST_HTML)
        page.get_by_test_id("keyword-input").fill("apartment")
        ledger.append(kind="input", page_alias="main", frame_name=None, locator=loc_testid("keyword-input"), value="apartment", url=None, scroll=None)
        page.get_by_test_id("region-select").select_option("seoul")
        ledger.append(kind="select", page_alias="main", frame_name=None, locator=loc_testid("region-select"), value="seoul", url=None, scroll=None)
        page.get_by_test_id("search-button").click()
        ledger.append(kind="click", page_alias="main", frame_name=None, locator=loc_testid("search-button"), value=None, url=None, scroll=None)
        page.evaluate("window.scrollTo(0, 700)")
        ledger.append(kind="scroll", page_alias="main", frame_name=None, locator=None, value=None, url=None, scroll={"x": 0, "y": 700})
        page.get_by_test_id("route-button").click()
        ledger.append(kind="click", page_alias="main", frame_name=None, locator=loc_testid("route-button"), value=None, url=None, scroll=None)
        if page.evaluate("location.hash") != "#detail": raise AssertionError("hash navigation failed")
        ledger.append(kind="navigation", page_alias="main", frame_name=None, locator=None, value=None, url=page.url, scroll=None)
        state = {"query":"apartment","region":"seoul","search_status":page.locator("#search-status").inner_text(),"scroll_y":int(page.evaluate("scrollY")),"navigation_hash":page.evaluate("location.hash")}
        saved = SessionStateStore.save(STATE_PATH, ledger=ledger, state=state); browser.close()
        return saved["state_digest"], len(ledger.events)


def restore_product_state(page, state):
    page.set_content(LIST_HTML)
    page.get_by_test_id("keyword-input").fill(state["query"])
    page.get_by_test_id("region-select").select_option(state["region"])
    page.get_by_test_id("search-button").click()
    page.evaluate("p => window.scrollTo(p.x,p.y)", {"x":0,"y":state["scroll_y"]})
    if state["navigation_hash"]: page.evaluate("h => location.hash = h", state["navigation_hash"])


def record_phase2() -> tuple[ActionLedger, dict, str, int]:
    ledger, state, digest = SessionStateStore.load(STATE_PATH); before = len(ledger.events)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM, headless=True, args=["--no-sandbox"])
        context = browser.new_context(); page = context.new_page(); restore_product_state(page, state)
        with page.expect_popup() as pi: page.get_by_test_id("details-link").click()
        ledger.append(kind="click", page_alias="main", frame_name=None, locator=loc_testid("details-link"), value=None, url=None, scroll=None)
        popup = pi.value; popup.set_content(DETAIL_HTML)
        ledger.append(kind="popup", page_alias="popup-1", frame_name=None, locator=None, value=None, url=popup.url, scroll=None)
        frame = popup.frame(name="details-frame")
        if frame is None: raise AssertionError("frame missing")
        ledger.append(kind="iframe", page_alias="popup-1", frame_name="details-frame", locator=None, value=None, url=frame.url, scroll=None)
        popup.frame_locator("#details-frame").get_by_test_id("frame-load").click()
        ledger.append(kind="click", page_alias="popup-1", frame_name="details-frame", locator=loc_testid("frame-load"), value=None, url=None, scroll=None)
        if popup.frame_locator("#details-frame").locator("#frame-status").inner_text() != "loaded": raise AssertionError("frame click failed")
        browser.close()
    return ledger, state, digest, before


def main():
    digest1, phase1_count = record_phase1(); ledger, state, digest2, before_resume = record_phase2()
    assert digest1 == digest2; assert ledger.validate()
    required = {"click","input","select","scroll","popup","iframe","navigation"}; actual = {e["kind"] for e in ledger.events}
    if not required.issubset(actual): raise AssertionError((required, actual))
    duplicate_count = len(ledger.events) - len({e["fingerprint"] for e in ledger.events})
    if duplicate_count != 0: raise AssertionError("duplicate actions")
    recipe = RecipeCompiler.compile(ledger); action_log = ledger.to_json(); adapter_source = generate_adapter_source(recipe)
    adapter_path = OUT / "B3_TO_A6_WAVE3_GENERATED_ADAPTER_V1.py"; adapter_path.write_text(adapter_source, encoding="utf-8")
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM, headless=True, args=["--no-sandbox"])
        replay = load_generated_adapter(adapter_path).run(browser); browser.close()
    if replay["status"] != "PASS": raise AssertionError(replay)
    (OUT / "B3_WAVE3_ACTION_LOG_V1.json").write_text(json.dumps(action_log, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    (OUT / "B3_WAVE3_EXTRACTION_RECIPE_V1.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    replay_receipt = {"schema_version":"B3_WAVE3_REPLAY_RECEIPT_V1","status":"PASS","adapter_execution":True,"recipe_digest":recipe["recipe_digest"],"adapter_source_sha256":hash_text(adapter_source),"trace":replay["trace"],"assertions":replay["assertions"],"step_count":replay["step_count"],"actual_chromium_runtime":True,"http_pass_claimed":False}
    (OUT / "B3_WAVE3_REPLAY_RECEIPT_V1.json").write_text(json.dumps(replay_receipt, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    resume_receipt = {"schema_version":"B3_WAVE3_RESTART_RESUME_RECEIPT_V1","status":"PASS","browser_process_restart_count":1,"state_digest":digest2,"phase1_event_count":phase1_count,"event_count_before_resume":before_resume,"final_event_count":len(ledger.events),"resume_appended_event_count":len(ledger.events)-before_resume,"duplicate_fingerprint_count":duplicate_count,"restored_state":state,"no_action_duplication":duplicate_count==0}
    (OUT / "B3_WAVE3_RESTART_RESUME_RECEIPT_V1.json").write_text(json.dumps(resume_receipt, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    result = {"schema_version":"B3_WAVE3_PRODUCT_FLOW_EXECUTION_RESULT_V1","status":"PASS","actual_chromium_runtime":True,"runtime_bootstrap_mode":"INLINE_DOCUMENT","http_pass_claimed":False,"recorded_event_count":len(ledger.events),"action_types":sorted(actual),"required_action_types":sorted(required),"recipe_digest":recipe["recipe_digest"],"replay_status":replay["status"],"restart_resume":"PASS","no_action_duplication":"PASS","adapter_source_sha256":hash_text(adapter_source)}
    (OUT / "B3_WAVE3_PRODUCT_FLOW_EXECUTION_RESULT_V1.json").write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))

if __name__ == "__main__": main()
