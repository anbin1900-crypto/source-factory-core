from __future__ import annotations

RECIPE = {'schema_version': 'B3_WAVE3_EXTRACTION_RECIPE_V1', 'recipe_id': 'b3-wave3-product-flow-001', 'runtime_bootstrap': {'mode': 'INLINE_DOCUMENT', 'list_html': '<!doctype html><html><body style="height:1800px">\n<label>Keyword <input data-testid="keyword-input" aria-label="Keyword" /></label>\n<label>Region <select data-testid="region-select" aria-label="Region"><option value="">All</option><option value="seoul">Seoul</option></select></label>\n<button data-testid="search-button" onclick="document.querySelector(\'#search-status\').textContent=\'searched:\'+document.querySelector(\'[data-testid=keyword-input]\').value+\':\'+document.querySelector(\'[data-testid=region-select]\').value">Search</button>\n<div id="search-status">idle</div>\n<button data-testid="route-button" onclick="location.hash=\'detail\'; document.querySelector(\'#route-status\').textContent=\'route:\'+location.hash">Route Detail</button>\n<div id="route-status">route:none</div>\n<a data-testid="details-link" target="_blank" href="about:blank#popup">Open Detail Popup</a>\n</body></html>', 'detail_html': '<!doctype html><html><body>\n<h1>Detail Popup</h1>\n<iframe id="details-frame" name="details-frame" srcdoc="<!doctype html><html><body><button data-testid=\'frame-load\' onclick=&quot;document.querySelector(\'#frame-status\').textContent=\'loaded\'&quot;>Load Frame Data</button><div id=\'frame-status\'>idle</div></body></html>"></iframe>\n</body></html>'}, 'steps': [{'step_id': 'step-0001', 'kind': 'input', 'page_alias': 'main', 'frame_name': None, 'locator': {'strategy': 'test_id', 'value': 'keyword-input'}, 'value': 'apartment', 'url': None, 'scroll': None, 'recorded_event_id': 'wave3-action-0001'}, {'step_id': 'step-0002', 'kind': 'select', 'page_alias': 'main', 'frame_name': None, 'locator': {'strategy': 'test_id', 'value': 'region-select'}, 'value': 'seoul', 'url': None, 'scroll': None, 'recorded_event_id': 'wave3-action-0002'}, {'step_id': 'step-0003', 'kind': 'click', 'page_alias': 'main', 'frame_name': None, 'locator': {'strategy': 'test_id', 'value': 'search-button'}, 'value': None, 'url': None, 'scroll': None, 'recorded_event_id': 'wave3-action-0003'}, {'step_id': 'step-0004', 'kind': 'scroll', 'page_alias': 'main', 'frame_name': None, 'locator': None, 'value': None, 'url': None, 'scroll': {'x': 0, 'y': 700}, 'recorded_event_id': 'wave3-action-0004'}, {'step_id': 'step-0005', 'kind': 'click', 'page_alias': 'main', 'frame_name': None, 'locator': {'strategy': 'test_id', 'value': 'route-button'}, 'value': None, 'url': None, 'scroll': None, 'recorded_event_id': 'wave3-action-0005'}, {'step_id': 'step-0006', 'kind': 'navigation', 'page_alias': 'main', 'frame_name': None, 'locator': None, 'value': None, 'url': 'about:blank#detail', 'scroll': None, 'recorded_event_id': 'wave3-action-0006'}, {'step_id': 'step-0007', 'kind': 'click', 'page_alias': 'main', 'frame_name': None, 'locator': {'strategy': 'test_id', 'value': 'details-link'}, 'value': None, 'url': None, 'scroll': None, 'recorded_event_id': 'wave3-action-0007'}, {'step_id': 'step-0008', 'kind': 'popup', 'page_alias': 'popup-1', 'frame_name': None, 'locator': None, 'value': None, 'url': 'about:blank#popup', 'scroll': None, 'recorded_event_id': 'wave3-action-0008'}, {'step_id': 'step-0009', 'kind': 'iframe', 'page_alias': 'popup-1', 'frame_name': 'details-frame', 'locator': None, 'value': None, 'url': 'about:srcdoc', 'scroll': None, 'recorded_event_id': 'wave3-action-0009'}, {'step_id': 'step-0010', 'kind': 'click', 'page_alias': 'popup-1', 'frame_name': 'details-frame', 'locator': {'strategy': 'test_id', 'value': 'frame-load'}, 'value': None, 'url': None, 'scroll': None, 'recorded_event_id': 'wave3-action-0010'}], 'recorded_event_count': 10, 'executable_step_count': 10, 'required_action_types': ['click', 'iframe', 'input', 'navigation', 'popup', 'scroll', 'select'], 'a6_adapter_contract': {'consumer_pr': 25, 'input_kind': 'B3_WAVE3_RECORDED_PRODUCT_FLOW', 'required': ['recipe_digest', 'adapter_source_sha256', 'replay_receipt_sha256', 'restart_resume_receipt_sha256']}, 'safety': {'production': False, 'ready': False, 'merge': False}, 'recipe_digest': '4a521a4710e55d87bf14f9984b8a5cf746f2498633b33e6a947267733ccbab59'}

def _loc(scope, locator):
    if not locator:
        return None
    strategy = locator["strategy"]; value = locator["value"]
    if strategy == "test_id": return scope.get_by_test_id(value)
    if strategy == "aria_label": return scope.get_by_label(value)
    if strategy == "css": return scope.locator(value)
    if strategy == "text": return scope.get_by_text(value, exact=True)
    raise ValueError(f"unsupported locator {strategy}")

def run(browser):
    context = browser.new_context()
    page = context.new_page(); pages = {"main": page}
    page.set_content(RECIPE["runtime_bootstrap"]["list_html"]); trace=[]
    try:
        for step in RECIPE["steps"]:
            kind = step["kind"]
            if kind in {"popup", "iframe", "navigation"}:
                if kind == "navigation":
                    if page.url != step["url"]: raise AssertionError(("navigation", page.url, step["url"]))
                elif kind == "popup":
                    if "popup-1" not in pages: raise AssertionError("popup not opened")
                elif kind == "iframe":
                    p = pages.get(step["page_alias"], page)
                    if p.frame(name=step["frame_name"]) is None: raise AssertionError("iframe not present")
                trace.append({"step_id":step["step_id"],"kind":kind,"status":"PASS"}); continue
            target_page = pages.get(step["page_alias"], page)
            scope = target_page.frame_locator("#details-frame") if step.get("frame_name") == "details-frame" else target_page
            locator = _loc(scope, step.get("locator"))
            if kind == "input": locator.fill(step.get("value") or "")
            elif kind == "select": locator.select_option(step.get("value") or "")
            elif kind == "scroll": target_page.evaluate("p => window.scrollTo(p.x,p.y)", step["scroll"])
            elif kind == "click" and step.get("locator", {}).get("value") == "details-link":
                with target_page.expect_popup() as pi: locator.click()
                popup = pi.value; popup.set_content(RECIPE["runtime_bootstrap"]["detail_html"]); pages["popup-1"] = popup
            elif kind == "click": locator.click()
            else: raise ValueError(kind)
            trace.append({"step_id":step["step_id"],"kind":kind,"status":"PASS"})
        popup=pages.get("popup-1")
        assertions={
          "query": page.get_by_test_id("keyword-input").input_value(),
          "region": page.get_by_test_id("region-select").input_value(),
          "search_status": page.locator("#search-status").inner_text(),
          "navigation_hash": page.evaluate("location.hash"),
          "popup_opened": popup is not None,
          "frame_status": popup.frame_locator("#details-frame").locator("#frame-status").inner_text() if popup else None,
        }
        expected={"query":"apartment","region":"seoul","search_status":"searched:apartment:seoul","navigation_hash":"#detail","popup_opened":True,"frame_status":"loaded"}
        return {"status":"PASS" if assertions==expected else "FAILED","trace":trace,"assertions":assertions,"expected":expected,"step_count":len(trace)}
    finally:
        context.close()
