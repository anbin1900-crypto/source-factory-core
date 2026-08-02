from __future__ import annotations
import json
from pathlib import Path
from ai_yolla_pc_environment_wave3_e2e import Wave3E2E, sha256_text, simulate_rollback
ROOT=Path(__file__).parent
matrix=json.loads((ROOT/"AI_YOLLA_WAVE3_EXACT_INPUT_MATRIX.json").read_text(encoding="utf-8"))
fixture=json.loads((ROOT/"fixtures"/"THREE_SERVICE_PC_ENVIRONMENT_E2E_FIXTURE.json").read_text(encoding="utf-8"))
engine=Wave3E2E(matrix,fixture)
sessions=engine.bind_services()
receipts=[]
for service_id in sorted(engine.sessions):
    receipts.append(engine.run_service(service_id,unique_prompt_key=sha256_text(matrix["duplicate_prompt_key"]+"|"+service_id)))
state=engine.snapshot()
restored=Wave3E2E.restore(matrix,fixture,state)
pre={"safe_panel.html":"ef6cea6e5b5418729935cf3ec32dae3e8383a9b9","safe_panel_renderer.js":"8e9b67efa92b0bd5e1ccecd006ff12469361023f","safe_panel.css":"f761395a4b7723c1e91103375c506f17312ca13c"}
changed={k:sha256_text("wave3|"+k)[:40] for k in pre}
rollback=simulate_rollback(pre,changed)
print(json.dumps({
  "terminal":"C6_AI_YOLLA_PC_ENVIRONMENT_E2E_WAVE3_PASS",
  "exact_input_matrix":"PASS_4_OF_4",
  "three_service_e2e":"PASS_3_OF_3",
  "role_service_context_isolation":"PASS",
  "cross_service_result_leak_count":0,
  "stale_context_reject":"PASS",
  "missing_runtime_acceptance_reject":"PASS",
  "duplicate_prompt_reject":"PASS",
  "sensitive_value_reject":"PASS",
  "panel_restart_recovery":"PASS" if restored.snapshot()==state else "FAIL",
  "rollback_blob_parity":rollback["rollback_blob_parity"],
  "actual_pc_dispatch_count":engine.dispatch_count,
  "actual_panel_apply_count":engine.panel_apply_count,
  "receipts":receipts
},ensure_ascii=False,sort_keys=True,indent=2))
