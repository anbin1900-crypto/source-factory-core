from __future__ import annotations

# Generated B-3 Wave2 adapter input for A-6.
RECIPE = {
  "a6_adapter_contract": {
    "consumer_pr": 25,
    "input_kind": "RECORDED_ACTION_RECIPE",
    "required_fields": [
      "recipe_hash",
      "steps",
      "generated_adapter_path",
      "replay_trace_path"
    ]
  },
  "recipe_hash": "22401b16caabd96e7cd59f4a617ed4ff14db9641e8dc17aa59c90bdca3c804d6",
  "recipe_id": "b3-wave2-live-recorder-001",
  "recorded_action_count": 5,
  "runtime_bootstrap": {
    "detail_html": "<!doctype html><html><body><h1>Detail 1</h1><iframe id='details-frame' name='details-frame' srcdoc=\"&lt;!doctype html&gt;\n&lt;html&gt;&lt;head&gt;&lt;meta charset=&#x27;utf-8&#x27;&gt;&lt;title&gt;Frame&lt;/title&gt;&lt;/head&gt;\n&lt;body&gt;&lt;button id=&#x27;frame-action&#x27; data-testid=&#x27;frame-action&#x27; aria-label=&#x27;Load frame detail&#x27;&gt;Load Frame Detail&lt;/button&gt;\n&lt;div id=&#x27;frame-status&#x27;&gt;idle&lt;/div&gt;\n&lt;script&gt;document.querySelector(&#x27;#frame-action&#x27;).addEventListener(&#x27;click&#x27;,()=&gt;document.querySelector(&#x27;#frame-status&#x27;).textContent=&#x27;loaded&#x27;);&lt;/script&gt;\n&lt;/body&gt;&lt;/html&gt;\"></iframe></body></html>",
    "list_html": "<!doctype html>\n<html><head><meta charset='utf-8'><title>YOLLA Analyzer Test</title>\n<style>body{font-family:sans-serif;min-height:1400px}.card{margin-top:700px;padding:16px;border:1px solid #ccc}</style></head>\n<body>\n<h1>Analyzer Test Listings</h1>\n<label>Keyword <input id='keyword' data-testid='keyword-input' aria-label='Keyword'></label>\n<button id='search-btn' data-testid='search-submit' aria-label='Search'>Search</button>\n<div id='search-status'>idle</div>\n<div class='card'>\n<a id='detail-link' data-testid='detail-open' aria-label='Open detail' href='about:blank' target='_blank' onclick=\"window.open('about:blank','_blank'); return false;\">Open Detail</a>\n</div>\n<script>\ndocument.querySelector('#search-btn').addEventListener('click',()=>{\n const value=document.querySelector('#keyword').value;\n document.querySelector('#search-status').textContent='searched:'+value;\n});\n</script>\n</body></html>"
  },
  "safety": {
    "merge": false,
    "production": false,
    "ready": false
  },
  "schema_version": "B3_LIVE_EXTRACTION_RECIPE_V2",
  "start_url": "about:blank",
  "steps": [
    {
      "action": "input",
      "expect_popup": false,
      "frame_selector": null,
      "locator": {
        "strategy": "test_id",
        "value": "keyword-input"
      },
      "page_alias": "main",
      "recorded_event_id": "live-action-0001",
      "scroll": null,
      "step_id": "step-0001",
      "value": "apartment"
    },
    {
      "action": "click",
      "expect_popup": false,
      "frame_selector": null,
      "locator": {
        "strategy": "test_id",
        "value": "search-submit"
      },
      "page_alias": "main",
      "recorded_event_id": "live-action-0002",
      "scroll": null,
      "step_id": "step-0002",
      "value": null
    },
    {
      "action": "scroll",
      "expect_popup": false,
      "frame_selector": null,
      "locator": null,
      "page_alias": "main",
      "recorded_event_id": "live-action-0003",
      "scroll": {
        "x": 0,
        "y": 850
      },
      "step_id": "step-0003",
      "value": null
    },
    {
      "action": "click",
      "expect_popup": true,
      "frame_selector": null,
      "locator": {
        "strategy": "test_id",
        "value": "detail-open"
      },
      "page_alias": "main",
      "recorded_event_id": "live-action-0004",
      "scroll": null,
      "step_id": "step-0004",
      "value": null
    },
    {
      "action": "click",
      "expect_popup": false,
      "frame_selector": "#details-frame",
      "locator": {
        "strategy": "test_id",
        "value": "frame-action"
      },
      "page_alias": "popup-1",
      "recorded_event_id": "live-action-0005",
      "scroll": null,
      "step_id": "step-0005",
      "value": null
    }
  ]
}

def recipe() -> dict:
    return RECIPE
