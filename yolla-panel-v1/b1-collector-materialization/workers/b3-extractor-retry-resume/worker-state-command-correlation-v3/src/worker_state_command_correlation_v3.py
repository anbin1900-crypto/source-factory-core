from __future__ import annotations
from copy import deepcopy
from dataclasses import dataclass, asdict
from hashlib import sha256
import json
from pathlib import Path
from typing import Any

MAIN_STATES = {"IDLE", "DISPATCHED", "GENERATING", "COMPLETE", "BLOCKED"}
TERMINAL_STATES = {"COMPLETE", "BLOCKED"}
RANK = {"IDLE": 0, "DISPATCHED": 1, "GENERATING": 2, "COMPLETE": 3, "BLOCKED": 3}
SIDE_STATES = {"UNKNOWN"}

def canonical_json(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def digest(v: Any) -> str:
    return sha256(canonical_json(v).encode()).hexdigest()

@dataclass(frozen=True)
class CorrelatedWorkerStateEvent:
    worker_id: str
    page_id: str
    command_id: str
    action_id: str
    session_id: str
    event_seq: int
    observed_at: str
    state: str
    idempotency_key: str
    source_schema: str = "WORKER_BROWSER_STATE_EVENT_V1"

class WorkerStateCommandCorrelation:
    schema_version = "B3_WORKER_STATE_COMMAND_CORRELATION_STATE_V3"

    def __init__(self, *, mission_id: str, state: dict[str, Any] | None = None):
        self.mission_id = mission_id
        self.state = deepcopy(state) if state else {
            "schema_version": self.schema_version,
            "mission_id": mission_id,
            "event_ledger": [],
            "idempotency_index": {},
            "command_state": {},
            "unknown_side_state": {},
            "result_receipt_index": {},
            "action_index": {},
            "session_index": {},
            "worker_page_index": {},
        }
        self._validate_state()

    def _validate_state(self) -> None:
        if self.state.get("schema_version") != self.schema_version:
            raise ValueError("unsupported state schema")
        if self.state.get("mission_id") != self.mission_id:
            raise ValueError("mission mismatch")
        prev="GENESIS"
        last_seq_by_command={}
        for rec in self.state.get("event_ledger", []):
            if rec["prev_hash"] != prev: raise ValueError("broken prev_hash")
            payload={k:deepcopy(v) for k,v in rec.items() if k!="record_hash"}
            if rec["record_hash"] != digest(payload): raise ValueError("record_hash mismatch")
            cmd=rec["command_id"]; seq=int(rec["event_seq"])
            if seq <= last_seq_by_command.get(cmd, -1): raise ValueError("non-monotonic event_seq in ledger")
            last_seq_by_command[cmd]=seq
            prev=rec["record_hash"]

    @staticmethod
    def idempotency_key(event: dict[str, Any]) -> str:
        fields={k:event.get(k) for k in ("worker_id","page_id","command_id","event_seq","observed_at","state")}
        return digest(fields)

    def consume_a3_event(self, event: dict[str, Any], *, action_id: str, session_id: str) -> dict[str, Any]:
        required=("worker_id","page_id","command_id","event_seq","observed_at","state")
        missing=[k for k in required if event.get(k) in (None,"")]
        if missing: raise ValueError(f"missing fields: {missing}")
        state=str(event["state"]).upper()
        if state not in MAIN_STATES | SIDE_STATES:
            raise ValueError(f"unsupported worker state: {state}")
        idem=self.idempotency_key(event)
        prior=self.state["idempotency_index"].get(idem)
        if prior:
            return {"decision":"DUPLICATE_SUPPRESSED","record_hash":prior,"state":self.current_state(event["command_id"])}
        command_id=str(event["command_id"]); seq=int(event["event_seq"])
        current=self.state["command_state"].get(command_id)
        last_seq = int(current["event_seq"]) if current else -1
        if seq <= last_seq:
            return {"decision":"STALE_SUPPRESSED","reason":"EVENT_SEQ_NOT_NEWER","state":self.current_state(command_id)}
        if state=="UNKNOWN":
            self.state["unknown_side_state"][command_id]={
                "event_seq":seq,"observed_at":event["observed_at"],"worker_id":event["worker_id"],
                "page_id":event["page_id"],"action_id":action_id,"session_id":session_id,
            }
            rec=self._append(event, action_id=action_id, session_id=session_id, classification="UNKNOWN_SIDE_STATE", idem=idem)
            return {"decision":"UNKNOWN_SIDE_STATE_RECORDED","record_hash":rec["record_hash"],"state":self.current_state(command_id)}
        if current:
            cur_state=current["state"]
            if cur_state in TERMINAL_STATES:
                return {"decision":"STALE_SUPPRESSED","reason":"TERMINAL_STATE_ALREADY_REACHED","state":deepcopy(current)}
            if RANK[state] < RANK[cur_state]:
                return {"decision":"STALE_SUPPRESSED","reason":"STATE_REGRESSION","state":deepcopy(current)}
            if cur_state=="GENERATING" and state in {"BLOCKED","COMPLETE"}: pass
            elif cur_state=="DISPATCHED" and state in {"GENERATING","COMPLETE","BLOCKED"}: pass
            elif cur_state=="IDLE" and state in {"DISPATCHED","GENERATING","COMPLETE","BLOCKED"}: pass
            elif state==cur_state:
                return {"decision":"DUPLICATE_STATE_SUPPRESSED","state":deepcopy(current)}
        else:
            if state not in {"IDLE","DISPATCHED"}:
                return {"decision":"STALE_SUPPRESSED","reason":"MISSING_DISPATCH_OR_IDLE","state":None}
        rec=self._append(event, action_id=action_id, session_id=session_id, classification="MAIN_STATE", idem=idem)
        state_obj={
            "worker_id":event["worker_id"],"page_id":event["page_id"],"command_id":command_id,
            "action_id":action_id,"session_id":session_id,"event_seq":seq,"observed_at":event["observed_at"],
            "state":state,"record_hash":rec["record_hash"],
        }
        self.state["command_state"][command_id]=state_obj
        self.state["action_index"][command_id]=action_id
        self.state["session_index"][command_id]=session_id
        self.state["worker_page_index"][event["worker_id"]]=event["page_id"]
        return {"decision":"ACCEPTED","record_hash":rec["record_hash"],"state":deepcopy(state_obj)}

    def _append(self,event:dict[str,Any],*,action_id:str,session_id:str,classification:str,idem:str)->dict[str,Any]:
        obj=asdict(CorrelatedWorkerStateEvent(
            worker_id=str(event["worker_id"]),page_id=str(event["page_id"]),command_id=str(event["command_id"]),
            action_id=action_id,session_id=session_id,event_seq=int(event["event_seq"]),
            observed_at=str(event["observed_at"]),state=str(event["state"]).upper(),idempotency_key=idem
        ))
        obj["classification"]=classification
        obj["prev_hash"]=self.state["event_ledger"][-1]["record_hash"] if self.state["event_ledger"] else "GENESIS"
        obj["record_hash"]=digest({k:deepcopy(v) for k,v in obj.items()})
        self.state["event_ledger"].append(obj)
        self.state["idempotency_index"][idem]=obj["record_hash"]
        return obj

    def bind_result_receipt(self, *, command_id: str, receipt: dict[str, Any]) -> dict[str, Any]:
        state=self.state["command_state"].get(command_id)
        if not state or state["state"]!="COMPLETE":
            raise ValueError("result receipt requires COMPLETE state")
        if receipt.get("command_id") != command_id:
            raise ValueError("receipt command_id mismatch")
        if "receipt_id" not in receipt or "result_digest" not in receipt:
            raise ValueError("receipt requires receipt_id and result_digest")
        binding={
            "schema_version":"B3_WORKER_STATE_RESULT_RECEIPT_BINDING_V1","command_id":command_id,
            "worker_id":state["worker_id"],"page_id":state["page_id"],"action_id":state["action_id"],
            "session_id":state["session_id"],"complete_event_seq":state["event_seq"],
            "complete_record_hash":state["record_hash"],"receipt_id":receipt["receipt_id"],
            "result_digest":receipt["result_digest"],"receipt_pointer":receipt.get("receipt_pointer"),
        }
        binding["binding_digest"]=digest(binding)
        self.state["result_receipt_index"][command_id]=binding
        return deepcopy(binding)

    def current_state(self, command_id: str) -> dict[str, Any] | None:
        cur=deepcopy(self.state["command_state"].get(command_id))
        if cur is not None and command_id in self.state["unknown_side_state"]:
            cur["latest_unknown_side_state"]=deepcopy(self.state["unknown_side_state"][command_id])
        return cur

    def reconstruct_from_ledger(self) -> dict[str, Any]:
        replay=WorkerStateCommandCorrelation(mission_id=self.mission_id)
        for rec in self.state["event_ledger"]:
            event={k:rec[k] for k in ("worker_id","page_id","command_id","event_seq","observed_at","state")}
            out=replay.consume_a3_event(event, action_id=rec["action_id"],session_id=rec["session_id"])
            if out["decision"] not in {"ACCEPTED","UNKNOWN_SIDE_STATE_RECORDED"}:
                raise ValueError(f"durable replay rejected ledger record: {out}")
        replay.state["result_receipt_index"]=deepcopy(self.state["result_receipt_index"])
        return deepcopy(replay.state)

    def export_handoff(self) -> dict[str, Any]:
        return {
            "schema_version":"B3_TO_B1_A7_WORKER_STATE_COMMAND_HANDOFF_V1",
            "producer":"B-3","consumers":["B-1","A-7"],
            "required_read_order":["LATEST_POINTER","WORKER_STATE_COMMAND_CORRELATION","ACTION_REPLAY_CHECKPOINT"],
            "correlation_key":"command_id","state_authority":"B3_DURABLE_EVENT_REPLAY",
            "unknown_policy":"SIDE_STATE_ONLY_NEVER_PASS","target_pc_execution_authorized":False,
        }

    def save(self,path:str|Path)->None:
        Path(path).write_text(json.dumps(self.state,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")

    @classmethod
    def load(cls,path:str|Path)->"WorkerStateCommandCorrelation":
        state=json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(mission_id=state["mission_id"],state=state)
