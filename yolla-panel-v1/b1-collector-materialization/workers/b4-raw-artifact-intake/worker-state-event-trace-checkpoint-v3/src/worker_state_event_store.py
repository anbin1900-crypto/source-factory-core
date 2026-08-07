from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Mapping

FORBIDDEN_KEYS = {
    "authorization", "cookie", "cookies", "token", "access_token", "refresh_token",
    "api_key", "apikey", "secret", "password", "sessionid", "session_id",
    "headers", "raw_headers", "credential", "credentials",
}
SECRET_PATTERNS = [
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/\-=]{8,}\b"),
    re.compile(r"(?i)\b(api[_-]?key|token|secret|password|authorization|cookie)\s*[:=]\s*[^\s,;]{4,}"),
]

class WorkerStateEventError(ValueError):
    pass

def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def _assert_sanitized(value: Any, path: str = "$") -> None:
    if isinstance(value, Mapping):
        for key, nested in value.items():
            if str(key).lower() in FORBIDDEN_KEYS:
                raise WorkerStateEventError(f"secret/raw field prohibited at {path}.{key}")
            _assert_sanitized(nested, f"{path}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            _assert_sanitized(nested, f"{path}[{index}]")
    elif isinstance(value, str):
        if any(pattern.search(value) for pattern in SECRET_PATTERNS):
            raise WorkerStateEventError(f"secret-like value prohibited at {path}")

class WorkerBrowserStateEventStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.events_path = self.root / "worker-browser-state-events.jsonl"
        self.side_records_path = self.root / "worker-browser-state-side-records.jsonl"
        self.receipt_lineage_path = self.root / "result-receipt-lineage.jsonl"
        self.checkpoints_dir = self.root / "checkpoints"
        self.manifests_dir = self.root / "manifests"
        self.checkpoints_dir.mkdir(parents=True, exist_ok=True)
        self.manifests_dir.mkdir(parents=True, exist_ok=True)

    def _jsonl_rows(self, path: Path) -> list[dict[str, Any]]:
        if not path.exists(): return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

    def _append_jsonl(self, path: Path, row: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush(); os.fsync(handle.fileno())

    @staticmethod
    def _stream_key(command_id: str, worker_id: str) -> str:
        return re.sub(r"[^A-Za-z0-9_.-]+", "_", f"{command_id}::{worker_id}")

    def _checkpoint_path(self, command_id: str, worker_id: str) -> Path:
        return self.checkpoints_dir / f"{self._stream_key(command_id, worker_id)}.json"

    def _read_checkpoint(self, command_id: str, worker_id: str) -> dict[str, Any]:
        path = self._checkpoint_path(command_id, worker_id)
        if not path.exists():
            return {"schema_version":"WORKER_BROWSER_LATEST_STATE_CHECKPOINT_V1","command_id":command_id,"worker_id":worker_id,"last_event_seq":0,"last_event_id":None,"last_event_pointer":None,"page_id":None,"state":None,"task_status":None,"observed_at":None,"result_receipt_pointer":None,"restart_rule":"RESTORE_LAST_DURABLE_ACCEPTED_EVENT_ONLY"}
        return json.loads(path.read_text(encoding="utf-8"))

    def _write_checkpoint(self, checkpoint: dict[str, Any]) -> None:
        target=self._checkpoint_path(checkpoint["command_id"],checkpoint["worker_id"]); tmp=target.with_suffix(".tmp")
        tmp.write_text(json.dumps(checkpoint,ensure_ascii=False,indent=2,sort_keys=True),encoding="utf-8"); os.replace(tmp,target)

    def _accepted_events(self, command_id: str, worker_id: str) -> list[dict[str, Any]]:
        return [row for row in self._jsonl_rows(self.events_path) if row["command_id"]==command_id and row["worker_id"]==worker_id]

    def _side_record(self, *, disposition: str, candidate: dict[str, Any], reason: str, existing_event_id: str | None = None) -> dict[str, Any]:
        row={"schema_version":"WORKER_BROWSER_STATE_SIDE_RECORD_V1","disposition":disposition,"command_id":candidate["command_id"],"worker_id":candidate["worker_id"],"candidate_event_seq":candidate["event_seq"],"candidate_event_id":candidate["event_id"],"candidate_payload_sha256":candidate["payload_sha256"],"existing_event_id":existing_event_id,"reason":reason,"recorded_at":candidate["observed_at"]}
        self._append_jsonl(self.side_records_path,row); return row

    def append_event(self, *, command_id: str, worker_id: str, page_id: str, event_seq: int, observed_at: str, state: Any, task_status: str, source_pointer: str, command_artifact_checkpoint_pointer: str | None = None, metadata: Mapping[str, Any] | None = None) -> dict[str, Any]:
        if event_seq < 1: raise WorkerStateEventError("event_seq must be >= 1")
        payload={"command_id":command_id,"worker_id":worker_id,"page_id":page_id,"event_seq":event_seq,"observed_at":observed_at,"state":state,"task_status":task_status,"source_pointer":source_pointer,"command_artifact_checkpoint_pointer":command_artifact_checkpoint_pointer,"metadata":dict(metadata or {})}
        _assert_sanitized(payload); payload_sha=sha256_bytes(canonical_json_bytes(payload)); event_id=f"wse-{self._stream_key(command_id,worker_id)}-{event_seq:06d}-{payload_sha[:12]}"; candidate={**payload,"payload_sha256":payload_sha,"event_id":event_id}
        checkpoint=self._read_checkpoint(command_id,worker_id); accepted=self._accepted_events(command_id,worker_id); by_seq={row["event_seq"]:row for row in accepted}
        if event_seq in by_seq:
            existing=by_seq[event_seq]
            if existing["payload_sha256"]==payload_sha:
                side=self._side_record(disposition="DUPLICATE_SUPPRESSED",candidate=candidate,reason="IDENTICAL_EVENT_SEQ_AND_PAYLOAD_HASH",existing_event_id=existing["event_id"])
                return {"disposition":"DUPLICATE_SUPPRESSED","event":existing,"checkpoint":checkpoint,"side_record":side}
            side=self._side_record(disposition="TAMPERED_CONFLICT",candidate=candidate,reason="SAME_EVENT_SEQ_DIFFERENT_PAYLOAD_HASH",existing_event_id=existing["event_id"])
            return {"disposition":"TAMPERED_CONFLICT","event":None,"checkpoint":checkpoint,"side_record":side}
        expected_seq=int(checkpoint["last_event_seq"])+1
        if event_seq != expected_seq:
            side=self._side_record(disposition="OUT_OF_ORDER_REJECTED",candidate=candidate,reason=f"EXPECTED_EVENT_SEQ_{expected_seq}")
            return {"disposition":"OUT_OF_ORDER_REJECTED","event":None,"checkpoint":checkpoint,"side_record":side}
        previous_event_pointer=checkpoint.get("last_event_pointer"); previous_entry_hash=accepted[-1]["entry_hash"] if accepted else "GENESIS"
        event={"schema_version":"WORKER_BROWSER_STATE_EVENT_V1",**candidate,"previous_event_pointer":previous_event_pointer,"previous_entry_hash":previous_entry_hash}; event["entry_hash"]=sha256_bytes(canonical_json_bytes(event)); self._append_jsonl(self.events_path,event)
        event_pointer=f"worker-state://{command_id}/{worker_id}/{event_seq}"
        new_checkpoint={"schema_version":"WORKER_BROWSER_LATEST_STATE_CHECKPOINT_V1","command_id":command_id,"worker_id":worker_id,"last_event_seq":event_seq,"last_event_id":event_id,"last_event_pointer":event_pointer,"page_id":page_id,"state":state,"task_status":task_status,"observed_at":observed_at,"source_pointer":source_pointer,"command_artifact_checkpoint_pointer":command_artifact_checkpoint_pointer,"result_receipt_pointer":checkpoint.get("result_receipt_pointer"),"restart_rule":"RESTORE_LAST_DURABLE_ACCEPTED_EVENT_ONLY"}
        self._write_checkpoint(new_checkpoint); self.verify_stream(command_id,worker_id); return {"disposition":"ACCEPTED","event":event,"checkpoint":new_checkpoint}

    def bind_result_receipt(self, *, command_id: str, worker_id: str, result_receipt_pointer: str, observed_at: str) -> dict[str, Any]:
        _assert_sanitized({"result_receipt_pointer":result_receipt_pointer}); checkpoint=self._read_checkpoint(command_id,worker_id)
        if checkpoint.get("task_status") != "COMPLETE": raise WorkerStateEventError("result receipt may only bind after COMPLETE")
        existing_pointer=checkpoint.get("result_receipt_pointer")
        if existing_pointer:
            if existing_pointer==result_receipt_pointer: return {"disposition":"DUPLICATE_RECEIPT_POINTER","checkpoint":checkpoint}
            raise WorkerStateEventError("result receipt pointer already bound to a different value")
        lineage={"schema_version":"WORKER_RESULT_RECEIPT_LINEAGE_POINTER_V1","command_id":command_id,"worker_id":worker_id,"complete_event_pointer":checkpoint["last_event_pointer"],"result_receipt_pointer":result_receipt_pointer,"observed_at":observed_at,"storage_mode":"POINTER_ONLY_NO_RECEIPT_RAW_BYTES"}
        self._append_jsonl(self.receipt_lineage_path,lineage); checkpoint["result_receipt_pointer"]=result_receipt_pointer; self._write_checkpoint(checkpoint); return {"disposition":"RECEIPT_POINTER_BOUND","lineage":lineage,"checkpoint":checkpoint}

    def verify_stream(self, command_id: str, worker_id: str) -> None:
        rows=self._accepted_events(command_id,worker_id); prev_hash="GENESIS"; expected_seq=1
        for row in rows:
            if row["event_seq"] != expected_seq: raise WorkerStateEventError(f"accepted event sequence gap at {expected_seq}")
            payload=dict(row); entry_hash=payload.pop("entry_hash")
            if payload["previous_entry_hash"] != prev_hash: raise WorkerStateEventError(f"event hash chain break at seq {expected_seq}")
            if sha256_bytes(canonical_json_bytes(payload)) != entry_hash: raise WorkerStateEventError(f"event hash mismatch at seq {expected_seq}")
            prev_hash=entry_hash; expected_seq+=1
        checkpoint=self._read_checkpoint(command_id,worker_id)
        if rows and (checkpoint["last_event_seq"] != rows[-1]["event_seq"] or checkpoint["last_event_id"] != rows[-1]["event_id"]): raise WorkerStateEventError("latest-state checkpoint does not match event log")

    def restart_readback(self, command_id: str, worker_id: str) -> dict[str, Any]:
        self.verify_stream(command_id,worker_id); checkpoint=self._read_checkpoint(command_id,worker_id)
        return {"schema_version":"WORKER_STATE_RESTART_READBACK_V1","command_id":command_id,"worker_id":worker_id,"restored_event_seq":checkpoint["last_event_seq"],"restored_state":checkpoint.get("state"),"restored_task_status":checkpoint.get("task_status"),"restored_page_id":checkpoint.get("page_id"),"last_event_pointer":checkpoint.get("last_event_pointer"),"result_receipt_pointer":checkpoint.get("result_receipt_pointer"),"status":"PASS"}

    def pointer_manifest(self, command_id: str, worker_id: str) -> dict[str, Any]:
        checkpoint=self._read_checkpoint(command_id,worker_id); side_rows=[row for row in self._jsonl_rows(self.side_records_path) if row["command_id"]==command_id and row["worker_id"]==worker_id]; accepted_count=len(self._accepted_events(command_id,worker_id))
        payload={"schema_version":"A7_B1_WORKER_STATE_POINTER_MANIFEST_V1","command_id":command_id,"worker_id":worker_id,"lookup_key":"command_id+worker_id","event_log_pointer":"worker-browser-state-events.jsonl","latest_state_checkpoint_pointer":str(self._checkpoint_path(command_id,worker_id).relative_to(self.root)).replace("\\","/"),"result_receipt_lineage_pointer":"result-receipt-lineage.jsonl","side_record_pointer":"worker-browser-state-side-records.jsonl","last_event_pointer":checkpoint.get("last_event_pointer"),"last_event_seq":checkpoint.get("last_event_seq",0),"task_status":checkpoint.get("task_status"),"result_receipt_pointer":checkpoint.get("result_receipt_pointer"),"command_artifact_checkpoint_pointer":checkpoint.get("command_artifact_checkpoint_pointer"),"accepted_event_count":accepted_count,"side_record_count":len(side_rows),"consumers":["A-7_RECOVERY","B-1_AGGREGATOR"]}
        target=self.manifests_dir/f"{self._stream_key(command_id,worker_id)}.json"; target.write_text(json.dumps(payload,ensure_ascii=False,indent=2,sort_keys=True),encoding="utf-8"); return payload
