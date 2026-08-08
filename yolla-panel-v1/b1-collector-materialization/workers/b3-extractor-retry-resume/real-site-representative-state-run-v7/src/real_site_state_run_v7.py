from __future__ import annotations
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
from typing import Any

SUCCESS_STATUS = "COMPLETE"
NON_OBSERVED_STATUSES = {"BLOCKED", "UNKNOWN", "FAILED"}

def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def digest(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()

class RealSiteStateRunConsumer:
    """Fail-closed consumer for Successor real-site action receipts."""

    def __init__(self, run_plan: dict[str, Any], state: dict[str, Any] | None = None) -> None:
        self.plan = deepcopy(run_plan)
        self.step_by_action: dict[str, dict[str, Any]] = {}
        self.scenario_by_id: dict[str, dict[str, Any]] = {}
        for scenario in self.plan["scenarios"]:
            self.scenario_by_id[scenario["scenario_id"]] = scenario
            for index, step in enumerate(scenario["steps"], start=1):
                row = deepcopy(step)
                row["scenario_id"] = scenario["scenario_id"]
                row["flow"] = scenario["flow"]
                row["step_no"] = index
                self.step_by_action[row["action_id"]] = row
        if state is None:
            self.state = {
                "schema_version":"B3_REAL_SITE_USER_JOURNEY_RESULT_STATE_V1",
                "receipt_ledger":[],
                "receipt_id_index":{},
                "idempotency_index":{},
                "accepted_observations":{},
                "unknown_findings":[],
                "rejected_receipts":[],
            }
        else:
            self.state = deepcopy(state)
            self._validate_state()

    def _validate_state(self) -> None:
        if self.state.get("schema_version") != "B3_REAL_SITE_USER_JOURNEY_RESULT_STATE_V1":
            raise ValueError("unsupported result state schema")
        ids = [r["receipt_id"] for r in self.state.get("receipt_ledger", [])]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate receipt_id in durable state")

    def _receipt_idempotency_key(self, receipt: dict[str, Any]) -> str:
        stable = {
            "scenario_id":receipt["scenario_id"],
            "transition_id":receipt["transition_id"],
            "command_id":receipt["command_id"],
            "page_id":receipt["page_id"],
            "action_id":receipt["action_id"],
            "status":receipt["status"],
            "state_evidence":receipt.get("state_evidence"),
            "api_evidence":receipt.get("api_evidence"),
            "entity_evidence":receipt.get("entity_evidence"),
            "auth":receipt.get("auth"),
        }
        return digest(stable)

    def consume_receipt(self, receipt: dict[str, Any]) -> dict[str, Any]:
        required = self.plan["receipt_required_fields"]
        missing = [k for k in required if k not in receipt]
        if missing:
            return self._reject(receipt, f"MISSING_FIELDS:{','.join(missing)}")
        if receipt["receipt_id"] in self.state["receipt_id_index"]:
            prior = self.state["receipt_id_index"][receipt["receipt_id"]]
            return {"result":"DUPLICATE_RECEIPT_SUPPRESSED","receipt_id":receipt["receipt_id"],"prior_result":prior}
        idem = self._receipt_idempotency_key(receipt)
        if idem in self.state["idempotency_index"]:
            return {"result":"IDEMPOTENT_RECEIPT_SUPPRESSED","receipt_id":receipt["receipt_id"],"prior_receipt_id":self.state["idempotency_index"][idem]}
        step = self.step_by_action.get(receipt["action_id"])
        if not step:
            return self._reject(receipt, "ACTION_NOT_SELECTED_IN_RUN_PLAN")
        exact_fields = ["scenario_id","transition_id","command_id","page_id","action_id"]
        mismatches = [k for k in exact_fields if receipt[k] != step[k]]
        if mismatches:
            return self._reject(receipt, "CORRELATION_MISMATCH:" + ",".join(mismatches))
        auth = receipt["auth"]
        if bool(auth.get("bypass_used")):
            return self._reject(receipt, "AUTH_BYPASS_PROHIBITED")
        if bool(auth.get("required")) and not bool(auth.get("accessible_in_current_session")):
            if receipt["status"] != "BLOCKED":
                return self._reject(receipt, "AUTH_INACCESSIBLE_MUST_BE_BLOCKED")
            return self._record_non_observed(receipt, step, "AUTH_REQUIRED_SESSION_UNAVAILABLE", idem)
        if receipt["status"] not in {SUCCESS_STATUS, *NON_OBSERVED_STATUSES}:
            return self._reject(receipt, "UNSUPPORTED_STATUS")
        if receipt["status"] != SUCCESS_STATUS:
            return self._record_non_observed(receipt, step, "SUCCESSOR_STATUS_" + receipt["status"], idem)

        expected = step["postcondition"]
        state_ev = receipt.get("state_evidence") or {}
        if state_ev.get("state_id") != expected["state_id"] or state_ev.get("ui_state") != expected["ui_state"]:
            return self._record_non_observed(receipt, step, "STATE_EVIDENCE_MISMATCH", idem)

        record = self._append_ledger(receipt, idem, "OBSERVED")
        obs = {
            "scenario_id":step["scenario_id"],"flow":step["flow"],"step_no":step["step_no"],
            "transition_id":step["transition_id"],"command_id":step["command_id"],"page_id":step["page_id"],
            "action_id":step["action_id"],"observed_state_id":state_ev["state_id"],
            "observed_ui_state":state_ev["ui_state"],"state_evidence_pointer":state_ev.get("evidence_pointer"),
            "api_evidence":deepcopy(receipt.get("api_evidence") or []),
            "entity_evidence":deepcopy(receipt.get("entity_evidence") or []),
            "receipt_id":receipt["receipt_id"],"receipt_seq":receipt["receipt_seq"],"timestamp":receipt["timestamp"],
        }
        self.state["accepted_observations"][step["transition_id"]] = obs
        return {"result":"OBSERVED","receipt_id":receipt["receipt_id"],"transition_id":step["transition_id"],"ledger_record":record}

    def _append_ledger(self, receipt: dict[str, Any], idem: str, disposition: str) -> dict[str, Any]:
        rec = deepcopy(receipt)
        rec["idempotency_key"] = idem
        rec["disposition"] = disposition
        rec["ledger_index"] = len(self.state["receipt_ledger"]) + 1
        self.state["receipt_ledger"].append(rec)
        self.state["receipt_id_index"][receipt["receipt_id"]] = disposition
        self.state["idempotency_index"][idem] = receipt["receipt_id"]
        return deepcopy(rec)

    def _record_non_observed(self, receipt: dict[str, Any], step: dict[str, Any], reason: str, idem: str) -> dict[str, Any]:
        self._append_ledger(receipt, idem, "NOT_OBSERVED")
        finding = {
            "receipt_id":receipt["receipt_id"],"scenario_id":step["scenario_id"],"flow":step["flow"],
            "transition_id":step["transition_id"],"action_id":step["action_id"],"reason":reason,
            "status":"UNKNOWN_OR_BLOCKED","timestamp":receipt["timestamp"],
        }
        self.state["unknown_findings"].append(finding)
        return {"result":"NOT_OBSERVED","reason":reason,"transition_id":step["transition_id"]}

    def _reject(self, receipt: dict[str, Any], reason: str) -> dict[str, Any]:
        item = {"receipt_id":receipt.get("receipt_id"),"reason":reason,"receipt_digest":digest(receipt)}
        self.state["rejected_receipts"].append(item)
        return {"result":"REJECTED","reason":reason}

    def observed_coverage(self) -> dict[str, Any]:
        observations = sorted(self.state["accepted_observations"].values(), key=lambda x:(x["scenario_id"],x["step_no"]))
        all_transitions = [s["transition_id"] for x in self.plan["scenarios"] for s in x["steps"]]
        observed_ids = {x["transition_id"] for x in observations}
        flow_rows = {}
        for scenario in self.plan["scenarios"]:
            tids = [s["transition_id"] for s in scenario["steps"]]
            observed = [t for t in tids if t in observed_ids]
            flow_rows[scenario["flow"]] = {
                "scenario_id":scenario["scenario_id"],
                "planned_transition_count":len(tids),
                "observed_transition_count":len(observed),
                "observed_transition_ids":observed,
                "coverage_complete":len(observed) == len(tids),
                "resume_after_action_id":self._resume_after_action_id(scenario),
            }
        return {
            "schema_version":"OBSERVED_STATE_COVERAGE_V1",
            "source":"SUCCESSOR_RECEIPT_ONLY",
            "planned_transition_count":len(all_transitions),
            "observed_transition_count":len(observations),
            "observed_transition_ids":sorted(observed_ids),
            "coverage_ratio":len(observations)/len(all_transitions) if all_transitions else 1.0,
            "flows":flow_rows,
            "observations":observations,
            "fixture_receipts_counted_as_real":False,
        }

    def _resume_after_action_id(self, scenario: dict[str, Any]) -> str | None:
        observed_ids = set(self.state["accepted_observations"])
        last = None
        for step in scenario["steps"]:
            if step["transition_id"] not in observed_ids:
                break
            last = step["action_id"]
        return last

    def unknown_coverage(self) -> dict[str, Any]:
        observed_ids = set(self.state["accepted_observations"])
        selected_unknown = []
        latest_reason = {}
        for item in self.state["unknown_findings"]:
            latest_reason[item["transition_id"]] = item["reason"]
        for scenario in self.plan["scenarios"]:
            for step in scenario["steps"]:
                if step["transition_id"] not in observed_ids:
                    selected_unknown.append({
                        "flow":scenario["flow"],"scenario_id":scenario["scenario_id"],"transition_id":step["transition_id"],
                        "action_id":step["action_id"],"command_id":step["command_id"],"page_id":step["page_id"],
                        "status":"UNKNOWN_NOT_OBSERVED_REAL_SITE",
                        "reason":latest_reason.get(step["transition_id"],"NO_SUCCESSOR_RECEIPT_YET"),
                    })
        return {
            "schema_version":"UNKNOWN_STATE_COVERAGE_V1",
            "selected_unknown_count":len(selected_unknown),
            "selected_unknown":selected_unknown,
            "latent_unknown_unobserved_paths":deepcopy(self.plan.get("latent_unknown_unobserved_paths", [])),
            "latent_unknown_count":len(self.plan.get("latent_unknown_unobserved_paths", [])),
            "unknown_policy":"DO_NOT_FABRICATE_OR_AUTO_COMPLETE",
            "auth_bypass":False,
        }

    def result(self) -> dict[str, Any]:
        observed = self.observed_coverage()
        unknown = self.unknown_coverage()
        return {
            "schema_version":"REAL_SITE_USER_JOURNEY_RESULT_V1",
            "status":"OBSERVATIONS_PRESENT" if observed["observed_transition_count"] else "AWAITING_SUCCESSOR_RECEIPTS",
            "real_successor_receipt_count":len(self.state["receipt_ledger"]),
            "real_observed_transition_count":observed["observed_transition_count"],
            "selected_unknown_transition_count":unknown["selected_unknown_count"],
            "rejected_receipt_count":len(self.state["rejected_receipts"]),
            "duplicate_or_idempotent_receipt_suppression_supported":True,
            "auth_bypass":False,
            "observed_coverage":observed,
            "unknown_coverage":unknown,
        }

    def export_state(self) -> dict[str, Any]:
        return deepcopy(self.state)

    def save_state(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(self.state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    @classmethod
    def load_state(cls, run_plan: dict[str, Any], path: str | Path) -> "RealSiteStateRunConsumer":
        state = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(run_plan, state=state)
