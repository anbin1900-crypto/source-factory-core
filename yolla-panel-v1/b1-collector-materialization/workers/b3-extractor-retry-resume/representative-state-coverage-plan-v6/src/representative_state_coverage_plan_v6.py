from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
from typing import Any

FLOW_ORDER = ("PUBLIC_READ", "CREATE", "MY_LISTING", "EDIT")
UNKNOWN_STATUS = "UNKNOWN_UNOBSERVED"

def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def digest(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()

class CoveragePlanError(ValueError):
    pass

class RepresentativeCoveragePlanner:
    schema_version = "REPRESENTATIVE_STATE_COVERAGE_PLAN_V1"

    def __init__(self, machine: dict[str, Any]) -> None:
        self.machine = deepcopy(machine)
        self._validate_machine()

    def _validate_machine(self) -> None:
        if self.machine.get("schema_version") != "USER_JOURNEY_STATE_MACHINE_V1":
            raise CoveragePlanError("unsupported source schema")
        states = self.machine.get("states")
        transitions = self.machine.get("representative_transitions")
        flows = self.machine.get("flows")
        if not isinstance(states, dict) or not isinstance(transitions, dict) or not isinstance(flows, dict):
            raise CoveragePlanError("states/transitions/flows required")
        for flow in FLOW_ORDER:
            if flow not in flows:
                raise CoveragePlanError(f"missing flow: {flow}")
        for transition_id, transition in transitions.items():
            if transition.get("transition_id") != transition_id:
                raise CoveragePlanError("transition id mismatch")
            if transition.get("from_state_id") not in states or transition.get("to_state_id") not in states:
                raise CoveragePlanError("transition references unknown state")
            for key in ("flow","precondition","postcondition","page_role","representative_action_id","evidence_pointer","structure_signature","target_family","action_type"):
                if key not in transition:
                    raise CoveragePlanError(f"missing transition field: {key}")
        for path in self.machine.get("unobserved_paths", []):
            if path.get("status") != UNKNOWN_STATUS or path.get("materialized_transition") is not False:
                raise CoveragePlanError("unobserved paths must remain UNKNOWN_UNOBSERVED")

    def _flow_transitions(self, flow: str) -> list[dict[str, Any]]:
        ids = self.machine["flows"][flow]["representative_transition_ids"]
        return [deepcopy(self.machine["representative_transitions"][tid]) for tid in ids]

    def _expected_evidence(self, transition: dict[str, Any]) -> dict[str, Any]:
        post = transition["postcondition"]
        return {
            "state": {"status":"EXPECTED_OBSERVED_FROM_CYCLE5","expected_state_id":post["state_id"],"expected_ui_state":post["ui_state"],"evidence_pointer":transition["evidence_pointer"]},
            "api": {"status":UNKNOWN_STATUS,"expectation":"CAPTURE_IF_OBSERVED_IN_LIVE_CYCLE","fabricated":False},
            "entity": {"status":UNKNOWN_STATUS,"expectation":"CAPTURE_ENTITY_IDENTITY_IF_PRESENT_IN_LIVE_CYCLE","fabricated":False},
        }

    def _branch_for_transition(self, transition_id: str) -> str:
        for branch_id, branch in self.machine.get("branches", {}).items():
            if transition_id in branch.get("representative_transition_ids", []):
                return branch_id
        raise CoveragePlanError(f"missing branch for transition: {transition_id}")

    def _scenario(self, flow: str) -> dict[str, Any]:
        transitions = self._flow_transitions(flow)
        if not transitions:
            raise CoveragePlanError(f"flow has no representative transitions: {flow}")
        steps = []
        for index, transition in enumerate(transitions, start=1):
            steps.append({
                "step_no":index,"transition_id":transition["transition_id"],"branch_id":self._branch_for_transition(transition["transition_id"]),
                "precondition":deepcopy(transition["precondition"]),"postcondition":deepcopy(transition["postcondition"]),"page_role":transition["page_role"],
                "action_id":transition["representative_action_id"],"action_type":transition["action_type"],"target_family":transition["target_family"],
                "structure_signature":transition["structure_signature"],"evidence_pointer":transition["evidence_pointer"],"expected_evidence":self._expected_evidence(transition),
                "resume_point_after_step":{"policy":"AFTER_LAST_EVIDENCED_STEP","action_id":transition["representative_action_id"],"state_id":transition["postcondition"]["state_id"]},
            })
        first, last = transitions[0], transitions[-1]
        return {
            "scenario_id":f"scenario-{flow.lower().replace('_', '-')}-representative-v1","flow":flow,"mode":"NEXT_LIVE_CYCLE_INPUT_ONLY","minimum_representative_path":True,
            "precondition":deepcopy(first["precondition"]),"steps":steps,
            "stop_condition":{"type":"EXPECTED_POSTCONDITION_REACHED_OR_FIRST_HARD_BLOCKER","expected_state_id":last["postcondition"]["state_id"],"expected_ui_state":last["postcondition"]["ui_state"],"on_unknown":"STOP_AND_PRESERVE_UNKNOWN","on_blocker":"STOP_AND_RECORD_BLOCKER"},
            "resume_point":{"policy":"AFTER_LAST_EVIDENCED_STEP","source_checkpoint_scope":"FLOW_SCENARIO","start_from_first_step_if_no_evidence":True},
            "live_site_call_this_cycle":False,
        }

    def materialize_coverage_plan(self) -> dict[str, Any]:
        scenarios = [self._scenario(flow) for flow in FLOW_ORDER]
        all_transitions = list(self.machine["representative_transitions"].values())
        equivalent_occurrences = sum(len(t.get("suppressed_equivalent_action_ids", [])) for t in all_transitions)
        return {
            "schema_version":self.schema_version,"source_schema_version":self.machine["schema_version"],"source_machine_digest":digest(self.machine),
            "coverage_strategy":"MINIMAL_REPRESENTATIVE_PATHS_NOT_EXHAUSTIVE_COMBINATIONS","flow_order":list(FLOW_ORDER),"scenario_count":len(scenarios),
            "representative_transition_count":len(all_transitions),"suppressed_equivalent_action_count":equivalent_occurrences,"all_combinations_exhaustive":False,
            "dedup_policy":{"key_fields":["flow","from_state_id","to_state_id","page_role","action_type","target_family","structure_signature"],"preserve_occurrence_count":True,"execute_representative_only":True},
            "scenarios":scenarios,"unknown_unobserved_paths":deepcopy(self.machine.get("unobserved_paths", [])),"unknown_policy":"DO_NOT_FABRICATE_OR_AUTO_COMPLETE",
            "target_pc_execution":False,"live_site_call":False,"production":False,"ready":False,"merge":False,
        }

    def materialize_live_scenario_set(self) -> dict[str, Any]:
        plan = self.materialize_coverage_plan()
        dependencies = {"PUBLIC_READ":[],"CREATE":[],"MY_LISTING":["CREATE"],"EDIT":["MY_LISTING"]}
        scenarios = []
        for scenario in plan["scenarios"]:
            flow = scenario["flow"]
            scenarios.append({"scenario_id":scenario["scenario_id"],"flow":flow,"depends_on_flows":dependencies[flow],"precondition":deepcopy(scenario["precondition"]),"steps":deepcopy(scenario["steps"]),"stop_condition":deepcopy(scenario["stop_condition"]),"resume_point":deepcopy(scenario["resume_point"]),"expected_evidence_classes":["STATE","API","ENTITY"],"api_evidence_status_from_cycle5":UNKNOWN_STATUS,"entity_evidence_status_from_cycle5":UNKNOWN_STATUS,"unknown_policy":"STOP_AND_PRESERVE_UNKNOWN"})
        return {"schema_version":"LIVE_SITE_ACTION_SCENARIO_SET_V1","source_plan_schema":self.schema_version,"execution_authorized_this_cycle":False,"intended_next_cycle_mode":"LIVE_SITE_ACTION_SCENARIO_INPUT","scenario_count":len(scenarios),"scenarios":scenarios,"unknown_unobserved_paths":deepcopy(plan["unknown_unobserved_paths"]),"target_pc_execution":False,"live_site_call":False}

    def validate_done_when(self) -> dict[str, Any]:
        plan = self.materialize_coverage_plan(); scenario_set = self.materialize_live_scenario_set()
        flows = {s["flow"] for s in plan["scenarios"]}; all_steps = [step for s in plan["scenarios"] for step in s["steps"]]
        transition_ids = [step["transition_id"] for step in all_steps]; unknowns = plan["unknown_unobserved_paths"]
        passed = flows == set(FLOW_ORDER) and len(transition_ids) == len(self.machine["representative_transitions"]) and len(set(transition_ids)) == len(transition_ids) and all(p["status"] == UNKNOWN_STATUS for p in unknowns) and scenario_set["execution_authorized_this_cycle"] is False
        return {"flow_coverage":flows == set(FLOW_ORDER),"representative_transition_count":len(transition_ids),"unique_representative_transition_count":len(set(transition_ids)),"equivalent_action_suppressed_count":plan["suppressed_equivalent_action_count"],"unknown_unobserved_path_count":len(unknowns),"unknown_paths_preserved":all(p["status"] == UNKNOWN_STATUS for p in unknowns),"evidence_classes_present":all(set(step["expected_evidence"].keys()) == {"state","api","entity"} for step in all_steps),"scenario_count":scenario_set["scenario_count"],"live_site_execution_authorized":scenario_set["execution_authorized_this_cycle"],"pass":passed}

    @classmethod
    def load(cls, path: str | Path) -> "RepresentativeCoveragePlanner":
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

def write_json(path: str | Path, value: Any) -> None:
    Path(path).write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
