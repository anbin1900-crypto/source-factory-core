from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, asdict
from hashlib import sha256
import json
from pathlib import Path
from typing import Any, Iterable

ACTION_TYPES = {"click", "input", "scroll", "navigation", "wait"}
TERMINAL_STATUSES = {"COMPLETED", "FAILED", "CANCELLED"}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ActionEvent:
    action_id: str
    page_id: str
    command_id: str
    sequence: int
    action_type: str
    payload: dict[str, Any]
    status: str
    fingerprint: str


class RecorderContinuity:
    """Deterministic action/session replay prebuild with restart-safe state."""

    schema_version = "B3_ACTION_RECORDER_SESSION_REPLAY_STATE_V1"

    def __init__(self, session_id: str, state: dict[str, Any] | None = None) -> None:
        self.session_id = session_id
        if state is None:
            self.state: dict[str, Any] = {
                "schema_version": self.schema_version,
                "session_id": session_id,
                "next_sequence": 1,
                "actions": [],
                "replay_events": [],
                "command_action_index": {},
                "action_command_index": {},
                "cdp_evidence_index": {},
                "fingerprints": {},
                "last_completed_action_id": None,
                "pending_action_ids": [],
                "resume_cursor": {
                    "last_sequence": 0,
                    "last_action_id": None,
                    "last_completed_action_id": None,
                    "pending_action_ids": [],
                    "state_digest": None,
                },
            }
            self._refresh_cursor()
        else:
            self.state = deepcopy(state)
            self._validate_loaded_state()

    def _validate_loaded_state(self) -> None:
        if self.state.get("schema_version") != self.schema_version:
            raise ValueError("unsupported state schema")
        if self.state.get("session_id") != self.session_id:
            raise ValueError("session_id mismatch")
        sequences = [int(a["sequence"]) for a in self.state.get("actions", [])]
        if sequences != sorted(sequences) or len(sequences) != len(set(sequences)):
            raise ValueError("action sequences must be unique and monotonic")
        action_ids = [a["action_id"] for a in self.state.get("actions", [])]
        if len(action_ids) != len(set(action_ids)):
            raise ValueError("action_id duplicate")
        self._refresh_cursor()

    @staticmethod
    def _fingerprint(command_id: str, page_id: str, action_type: str, payload: dict[str, Any]) -> str:
        return digest({
            "command_id": command_id,
            "page_id": page_id,
            "action_type": action_type,
            "payload": payload,
        })

    def record_action(
        self,
        *,
        command_id: str,
        page_id: str,
        action_type: str,
        payload: dict[str, Any],
        status: str = "PENDING",
    ) -> tuple[dict[str, Any], bool]:
        if action_type not in ACTION_TYPES:
            raise ValueError(f"unsupported action_type: {action_type}")
        fp = self._fingerprint(command_id, page_id, action_type, payload)
        prior_id = self.state["fingerprints"].get(fp)
        if prior_id:
            prior = self.get_action(prior_id)
            return deepcopy(prior), True
        sequence = int(self.state["next_sequence"])
        action_id = "act-" + digest({
            "session_id": self.session_id,
            "sequence": sequence,
            "fingerprint": fp,
        })[:20]
        event = ActionEvent(
            action_id=action_id,
            page_id=page_id,
            command_id=command_id,
            sequence=sequence,
            action_type=action_type,
            payload=deepcopy(payload),
            status=status,
            fingerprint=fp,
        )
        obj = asdict(event)
        self.state["actions"].append(obj)
        self.state["fingerprints"][fp] = action_id
        self.state["next_sequence"] = sequence + 1
        self.state["command_action_index"].setdefault(command_id, []).append(action_id)
        self.state["action_command_index"][action_id] = command_id
        self._append_replay_candidate(obj)
        self._refresh_cursor()
        return deepcopy(obj), False

    def _append_replay_candidate(self, action: dict[str, Any]) -> None:
        kind_map = {
            "click": "interaction",
            "input": "interaction",
            "scroll": "viewport",
            "navigation": "navigation",
            "wait": "timing",
        }
        replay_event = {
            "replay_event_id": f"rr-{int(action['sequence']):04d}",
            "action_id": action["action_id"],
            "page_id": action["page_id"],
            "kind": kind_map[action["action_type"]],
            "action_type": action["action_type"],
            "payload": deepcopy(action["payload"]),
            "visible": action["action_type"] != "wait",
        }
        self.state["replay_events"].append(replay_event)

    def bind_cdp_evidence(self, *, action_id: str, evidence: Iterable[dict[str, Any]]) -> None:
        self.get_action(action_id)
        normalized = []
        for item in evidence:
            if "evidence_id" not in item or "cdp_method" not in item:
                raise ValueError("cdp evidence requires evidence_id and cdp_method")
            normalized.append(deepcopy(item))
        self.state["cdp_evidence_index"][action_id] = normalized
        self._refresh_cursor()

    def set_status(self, action_id: str, status: str) -> dict[str, Any]:
        for action in self.state["actions"]:
            if action["action_id"] == action_id:
                action["status"] = status
                self._refresh_cursor()
                return deepcopy(action)
        raise KeyError(action_id)

    def get_action(self, action_id: str) -> dict[str, Any]:
        for action in self.state["actions"]:
            if action["action_id"] == action_id:
                return action
        raise KeyError(action_id)

    def _refresh_cursor(self) -> None:
        completed = [a for a in self.state.get("actions", []) if a.get("status") == "COMPLETED"]
        pending = [a["action_id"] for a in self.state.get("actions", []) if a.get("status") not in TERMINAL_STATUSES]
        last_action = self.state.get("actions", [])[-1] if self.state.get("actions") else None
        last_completed = completed[-1]["action_id"] if completed else None
        self.state["last_completed_action_id"] = last_completed
        self.state["pending_action_ids"] = pending
        cursor_payload = {
            "last_sequence": int(last_action["sequence"]) if last_action else 0,
            "last_action_id": last_action["action_id"] if last_action else None,
            "last_completed_action_id": last_completed,
            "pending_action_ids": pending,
        }
        cursor_payload["state_digest"] = digest({
            "session_id": self.session_id,
            "actions": self.state.get("actions", []),
            "replay_events": self.state.get("replay_events", []),
            "command_action_index": self.state.get("command_action_index", {}),
            "cdp_evidence_index": self.state.get("cdp_evidence_index", {}),
            **cursor_payload,
        })
        self.state["resume_cursor"] = cursor_payload

    def command_action_correlation(self) -> dict[str, Any]:
        return {
            "schema_version": "B3_COMMAND_ACTION_CORRELATION_V1",
            "session_id": self.session_id,
            "command_action_index": deepcopy(self.state["command_action_index"]),
            "action_command_index": deepcopy(self.state["action_command_index"]),
            "cdp_evidence_index": deepcopy(self.state["cdp_evidence_index"]),
        }

    def session_replay_binding(self) -> dict[str, Any]:
        by_action: dict[str, Any] = {}
        for replay in self.state["replay_events"]:
            aid = replay["action_id"]
            by_action.setdefault(aid, {"replay_event_ids": [], "cdp_evidence_ids": []})
            by_action[aid]["replay_event_ids"].append(replay["replay_event_id"])
        for aid, evidence in self.state["cdp_evidence_index"].items():
            by_action.setdefault(aid, {"replay_event_ids": [], "cdp_evidence_ids": []})
            by_action[aid]["cdp_evidence_ids"] = [e["evidence_id"] for e in evidence]
        return {
            "schema_version": "B3_SESSION_REPLAY_BINDING_V1",
            "session_id": self.session_id,
            "replay_model": "RRWEB_EQUIVALENT_ACTION_TIMELINE_V1",
            "events": deepcopy(self.state["replay_events"]),
            "action_binding": by_action,
        }

    def export_action_recorder_contract(self) -> dict[str, Any]:
        return {
            "schema_version": "B3_ACTION_RECORDER_V1",
            "action_types": sorted(ACTION_TYPES),
            "required_fields": [
                "action_id", "page_id", "command_id", "sequence", "action_type",
                "payload", "status", "fingerprint",
            ],
            "dedupe_key": "SHA256(command_id,page_id,action_type,payload)",
            "action_id_policy": "DETERMINISTIC_SESSION_SEQUENCE_FINGERPRINT",
            "timeline_order": "sequence ASC",
        }

    def export_resume_cursor_contract(self) -> dict[str, Any]:
        return {
            "schema_version": "B3_RESUME_CURSOR_V1",
            "session_id": self.session_id,
            "cursor": deepcopy(self.state["resume_cursor"]),
            "restore_fields": ["last_completed_action_id", "pending_action_ids", "next_sequence"],
            "contextless_resume": True,
        }

    def save(self, path: str | Path) -> None:
        self._refresh_cursor()
        Path(path).write_text(json.dumps(self.state, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> "RecorderContinuity":
        state = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(str(state["session_id"]), state=state)
