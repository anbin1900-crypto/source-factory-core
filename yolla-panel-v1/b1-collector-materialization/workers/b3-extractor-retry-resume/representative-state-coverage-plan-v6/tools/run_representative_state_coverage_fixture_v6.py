from __future__ import annotations
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "representative_state_coverage_plan_v6.py"
INPUT = ROOT.parent / "user-journey-state-machine-v5" / "generated" / "USER_JOURNEY_STATE_MACHINE_V1.json"
SPEC = importlib.util.spec_from_file_location("planner", SOURCE)
MOD = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MOD)

planner = MOD.RepresentativeCoveragePlanner.load(INPUT)
plan = planner.materialize_coverage_plan()
scenario_set = planner.materialize_live_scenario_set()
validation = planner.validate_done_when()

out = ROOT / "generated"
out.mkdir(exist_ok=True)
MOD.write_json(out / "REPRESENTATIVE_STATE_COVERAGE_PLAN_V1.json", plan)
MOD.write_json(out / "LIVE_SITE_ACTION_SCENARIO_SET_V1.json", scenario_set)
MOD.write_json(out / "B3_REPRESENTATIVE_STATE_COVERAGE_SMOKE_RECEIPT_V6.json", {
    "schema_version":"B3_REPRESENTATIVE_STATE_COVERAGE_SMOKE_RECEIPT_V6",
    "status":"PASS" if validation["pass"] else "FAIL",
    "flow_count":4,
    "representative_transition_count":validation["representative_transition_count"],
    "unique_representative_transition_count":validation["unique_representative_transition_count"],
    "equivalent_action_suppressed_count":validation["equivalent_action_suppressed_count"],
    "unknown_unobserved_path_count":validation["unknown_unobserved_path_count"],
    "unknown_paths_preserved":validation["unknown_paths_preserved"],
    "scenario_count":validation["scenario_count"],
    "expected_evidence_classes":["STATE","API","ENTITY"],
    "api_evidence_from_cycle5":"UNKNOWN_UNOBSERVED",
    "entity_evidence_from_cycle5":"UNKNOWN_UNOBSERVED",
    "live_site_execution_authorized":validation["live_site_execution_authorized"],
    "target_pc_execution":False,
    "live_site_call":False
})
if not validation["pass"]:
    raise SystemExit(1)
print("PASS")
