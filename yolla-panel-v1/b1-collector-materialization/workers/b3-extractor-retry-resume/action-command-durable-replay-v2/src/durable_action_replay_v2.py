from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, asdict
from hashlib import sha256
import json
from pathlib import Path
from typing import Any, Iterable

ACTION_TYPES = {"click", "input", "scroll", "navigation", "wait"}
TERMINAL_ACTION_STATUSES = {"CONFIRMED", "FAILED", "CANCELLED"}

def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def digest(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()

@dataclass(frozen=True)
class ActionEvent:
    command_id: str
    mission_id: str
    session_id: str
    page_id: str
    action_id: str
    sequence_no: int
    timestamp: str
    action_type: str
    status: str
    payload: dict[str, Any]
    idempotency_key: str

class DurableActionReplay:
    schema_version = "B3_DURABLE_ACTION_REPLAY_STATE_V2"

    def __init__(self, session_id: str, *, mission_id: str, state: dict[str, Any] | None = None) -> None:
        self.session_id = session_id
        self.mission_id = mission_id
        if state is None:
            self.state: dict[str, Any] = {
                "schema_version": self.schema_version,
                "session_id": session_id,
                "mission_id": mission_id,
                "next_sequence_no": 1,
                "ledger": [],
                "idempotency_index": {},
                "action_index": {},
                "command_index": {},
                "evidence_index": {},
                "checkpoint": {"last_confirmed_action_id": None,"last_confirmed_sequence_no": 0,"pending_action_ids": [],"next_sequence_no": 1,"resume_token": None},
            }
            self._refresh_checkpoint()
        else:
            self.state = deepcopy(state)
            self._validate_loaded_state()

    @staticmethod
    def make_idempotency_key(*, mission_id: str, session_id: str, command_id: str, page_id: str, action_type: str, payload: dict[str, Any]) -> str:
        return digest({"mission_id": mission_id,"session_id": session_id,"command_id": command_id,"page_id": page_id,"action_type": action_type,"payload": payload})

    def _validate_loaded_state(self) -> None:
        if self.state.get("schema_version") != self.schema_version: raise ValueError("unsupported state schema")
        if self.state.get("session_id") != self.session_id: raise ValueError("session_id mismatch")
        if self.state.get("mission_id") != self.mission_id: raise ValueError("mission_id mismatch")
        self._validate_ledger_chain(); self._refresh_checkpoint()

    def _validate_ledger_chain(self) -> None:
        prev = "GENESIS"; seen_seq = set(); seen_action = set()
        for record in self.state.get("ledger", []):
            if int(record["sequence_no"]) in seen_seq: raise ValueError("duplicate sequence_no")
            seen_seq.add(int(record["sequence_no"]))
            if record["action_id"] in seen_action: raise ValueError("duplicate action_id")
            seen_action.add(record["action_id"])
            if record["prev_hash"] != prev: raise ValueError("broken prev_hash")
            payload = {k: deepcopy(v) for k, v in record.items() if k != "record_hash"}
            if record["record_hash"] != digest(payload): raise ValueError("record_hash mismatch")
            prev = record["record_hash"]

    def record_action(self, *, command_id: str, page_id: str, action_type: str, payload: dict[str, Any], timestamp: str, status: str = "PENDING") -> tuple[dict[str, Any], bool]:
        if action_type not in ACTION_TYPES: raise ValueError(f"unsupported action_type: {action_type}")
        idem = self.make_idempotency_key(mission_id=self.mission_id,session_id=self.session_id,command_id=command_id,page_id=page_id,action_type=action_type,payload=payload)
        prior_action_id = self.state["idempotency_index"].get(idem)
        if prior_action_id: return deepcopy(self.state["action_index"][prior_action_id]), True
        seq = int(self.state["next_sequence_no"])
        action_id = "act-" + digest({"mission_id":self.mission_id,"session_id":self.session_id,"sequence_no":seq,"idempotency_key":idem})[:20]
        event = asdict(ActionEvent(command_id=command_id,mission_id=self.mission_id,session_id=self.session_id,page_id=page_id,action_id=action_id,sequence_no=seq,timestamp=timestamp,action_type=action_type,status=status,payload=deepcopy(payload),idempotency_key=idem))
        record = deepcopy(event); record["prev_hash"] = self.state["ledger"][-1]["record_hash"] if self.state["ledger"] else "GENESIS"; record["record_hash"] = digest({k:deepcopy(v) for k,v in record.items()})
        self.state["ledger"].append(record); self.state["idempotency_index"][idem] = action_id; self.state["action_index"][action_id] = deepcopy(event); self.state["command_index"].setdefault(command_id, []).append(action_id); self.state["next_sequence_no"] = seq + 1; self._refresh_checkpoint()
        return deepcopy(event), False

    def bind_evidence(self, *, action_id: str, evidence: Iterable[dict[str, Any]]) -> dict[str, Any]:
        if action_id not in self.state["action_index"]: raise KeyError(action_id)
        normalized = []
        for item in evidence:
            if "evidence_id" not in item or "evidence_type" not in item: raise ValueError("evidence requires evidence_id and evidence_type")
            normalized.append({"evidence_id":str(item["evidence_id"]),"evidence_type":str(item["evidence_type"]),"digest":str(item.get("digest") or digest(item)),"metadata":deepcopy(item.get("metadata") or {})})
        self.state["evidence_index"][action_id] = normalized
        return {"schema_version":"ACTION_COMMAND_CORRELATION_V1","mission_id":self.mission_id,"session_id":self.session_id,"action_id":action_id,"command_id":self.state["action_index"][action_id]["command_id"],"evidence":deepcopy(normalized)}

    def _refresh_checkpoint(self) -> None:
        actions = sorted(self.state.get("action_index", {}).values(), key=lambda x:int(x["sequence_no"])); confirmed = [a for a in actions if a.get("status") == "CONFIRMED"]; pending = [a["action_id"] for a in actions if a.get("status") not in TERMINAL_ACTION_STATUSES]; last = confirmed[-1] if confirmed else None
        cp = {"last_confirmed_action_id":last["action_id"] if last else None,"last_confirmed_sequence_no":int(last["sequence_no"]) if last else 0,"pending_action_ids":pending,"next_sequence_no":int(self.state.get("next_sequence_no",1))}
        cp["resume_token"] = digest({"mission_id":self.mission_id,"session_id":self.session_id,"ledger_tail_hash":self.state["ledger"][-1]["record_hash"] if self.state.get("ledger") else "GENESIS",**cp}); self.state["checkpoint"] = cp

    def replay_checkpoint(self) -> dict[str, Any]: return {"schema_version":"ACTION_REPLAY_CHECKPOINT_V1","mission_id":self.mission_id,"session_id":self.session_id,**deepcopy(self.state["checkpoint"])}

    def successor_replay_command(self, *, pointer_path: str, state_path: str) -> dict[str, Any]:
        cp = self.replay_checkpoint(); return {"schema_version":"SUCCESSOR_ACTION_REPLAY_COMMAND_V1","operation":"REPLAY_FROM_CHECKPOINT","mission_id":self.mission_id,"session_id":self.session_id,"pointer_path":pointer_path,"state_path":state_path,"resume_token":cp["resume_token"],"resume_after_sequence_no":cp["last_confirmed_sequence_no"],"resume_after_action_id":cp["last_confirmed_action_id"],"pending_action_ids":cp["pending_action_ids"],"requires_chat_context":False,"target_pc_execution_authorized":False}

    def reconstruct_minimum_order_from_ledger(self) -> list[dict[str, Any]]:
        self._validate_ledger_chain(); return [{"sequence_no":int(r["sequence_no"]),"command_id":r["command_id"],"action_id":r["action_id"],"page_id":r["page_id"],"action_type":r["action_type"],"status":r["status"]} for r in sorted(self.state["ledger"], key=lambda x:int(x["sequence_no"]))]

    def next_replay_actions(self, resume_token: str) -> list[dict[str, Any]]:
        cp = self.replay_checkpoint()
        if resume_token != cp["resume_token"]: raise ValueError("resume token mismatch")
        return [deepcopy(a) for a in sorted(self.state["action_index"].values(), key=lambda x:int(x["sequence_no"])) if int(a["sequence_no"]) > int(cp["last_confirmed_sequence_no"])]

    def save(self, path: str | Path) -> None:
        self._refresh_checkpoint(); Path(path).write_text(json.dumps(self.state, ensure_ascii=False, sort_keys=True, indent=2)+"\n", encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> "DurableActionReplay":
        state = json.loads(Path(path).read_text(encoding="utf-8")); return cls(str(state["session_id"]), mission_id=str(state["mission_id"]), state=state)
