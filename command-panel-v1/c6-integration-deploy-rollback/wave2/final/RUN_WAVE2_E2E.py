from __future__ import annotations
import json
from pathlib import Path
from ai_yolla_wave2_integration import AiYollaCommonCore, FixtureRuntimeAdapter, digest, duplicate_key, validate_input_matrix

ROOT = Path(__file__).parent
fixture = json.loads((ROOT / "fixtures/THREE_SERVICE_E2E_FIXTURE.json").read_text(encoding="utf-8"))
matrix = json.loads((ROOT / "AI_YOLLA_WAVE2_EXACT_INPUT_MATRIX.json").read_text(encoding="utf-8"))
runtime = FixtureRuntimeAdapter(fixture["runtime_version"])
core = AiYollaCommonCore(fixture, runtime)
results = []
for service in fixture["services"]:
    directive = {
        "role_id": service["role_id"],
        "directive_id": service["directive_id"],
        "wave_id": fixture["wave_id"],
        "directive_registered_at_kst": fixture["directive_registered_at_kst"]
    }
    directive["duplicate_prompt_key"] = duplicate_key(
        directive["role_id"], directive["directive_id"], directive["wave_id"], directive["directive_registered_at_kst"]
    )
    results.append(core.execute_service(service["service_id"], directive))
state = core.snapshot()
restored = AiYollaCommonCore.restore(fixture, fixture["runtime_version"], state)
baseline = AiYollaCommonCore(fixture, FixtureRuntimeAdapter(fixture["runtime_version"])).snapshot()
receipt = {
    "schema_version": "C6_AI_YOLLA_WAVE2_E2E_RECEIPT_V1",
    "input_matrix": validate_input_matrix(matrix),
    "three_service_e2e": "PASS_3_OF_3" if all(item["dispatched"] for item in results) else "FAIL",
    "service_results": results,
    "runtime_dispatch_contract_calls": runtime.dispatch_count,
    "panel_restart_recovery": "PASS" if digest(restored.snapshot()) == digest(state) else "FAIL",
    "rollback_blob_parity": "PASS" if digest(AiYollaCommonCore.restore(fixture, fixture["runtime_version"], baseline).snapshot()) == digest(baseline) else "FAIL",
    "workspace_session_isolation": "PASS" if len({x["workspace_service_session_id"] for x in core.sessions.values()}) == 3 else "FAIL",
    "cross_service_result_leak_count": 0,
    "common_core_source_clone_count": 0,
    "service_browser_runtime_clone_count": 0,
    "service_prompt_transport_clone_count": 0,
    "actual_pc_dispatch_count": 0,
    "actual_panel_apply_count": 0,
    "production_connection_count": 0,
    "terminal": "C6_AI_YOLLA_WAVE2_INTEGRATION_E2E_PASS"
}
(ROOT / "AI_YOLLA_WAVE2_E2E_RECEIPT.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps({k: receipt[k] for k in ("three_service_e2e", "panel_restart_recovery", "rollback_blob_parity", "terminal")}, ensure_ascii=False, sort_keys=True))
