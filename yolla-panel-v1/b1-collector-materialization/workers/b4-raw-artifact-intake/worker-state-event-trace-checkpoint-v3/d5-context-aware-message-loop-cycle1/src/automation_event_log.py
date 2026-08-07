from __future__ import annotations

import hashlib
import json
import queue
import sys
import threading
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping

_UPSTREAM = Path(__file__).resolve().parents[2] / "src"
if _UPSTREAM.exists() and str(_UPSTREAM) not in sys.path:
    sys.path.insert(0, str(_UPSTREAM))

from worker_state_event_store import WorkerBrowserStateEventStore, WorkerStateEventError, canonical_json_bytes  # type: ignore

EVENT_TYPES = {
    "COMMAND_CREATED",
    "CONTEXT_SELECTED",
    "MESSAGE_SENT",
    "WORKING",
    "REPLY_COMPLETED",
    "ERROR",
    "RETRY",
    "RESULT_RETURNED",
}

TRANSITIONS: dict[str | None, set[str]] = {
    None: {"COMMAND_CREATED"},
    "COMMAND_CREATED": {"CONTEXT_SELECTED", "ERROR"},
    "CONTEXT_SELECTED": {"MESSAGE_SENT", "ERROR"},
    "MESSAGE_SENT": {"WORKING", "ERROR"},
    "WORKING": {"REPLY_COMPLETED", "ERROR"},
    "REPLY_COMPLETED": {"RESULT_RETURNED", "ERROR"},
    "ERROR": {"RETRY", "RESULT_RETURNED"},
    "RETRY": {"MESSAGE_SENT", "WORKING", "ERROR"},
    "RESULT_RETURNED": set(),
}

SEND_FAILURE_CAUSES = {"SEND_FAILURE", "MESSAGE_SEND_FAILURE", "TRANSPORT_SEND_FAILURE"}
IMPROVEMENT_MAP = {
    "SEND_FAILURE": "MESSAGE_SEND_TRANSPORT_HEALTH_AND_RETRY_REPAIR",
    "MESSAGE_SEND_FAILURE": "MESSAGE_SEND_TRANSPORT_HEALTH_AND_RETRY_REPAIR",
    "TRANSPORT_SEND_FAILURE": "MESSAGE_SEND_TRANSPORT_HEALTH_AND_RETRY_REPAIR",
    "CONTEXT_MISMATCH": "CONTEXT_ID_READBACK_BEFORE_MESSAGE_SEND",
    "REPLY_TIMEOUT": "REPLY_COMPLETION_TIMEOUT_AND_RETRY_POLICY_REPAIR",
    "STATE_DETECTION_FAILURE": "WORKING_REPLY_STATE_DETECTOR_REPAIR",
    "RESULT_RETURN_FAILURE": "RESULT_RETURN_CHANNEL_RETRY_AND_ACK_REPAIR",
}

class AutomationEventLogError(ValueError):
    pass


def _sha(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_json_bytes(dict(value))).hexdigest()


def _parse_ts(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AutomationEventLogError(f"invalid observed_at: {value}") from exc


def _task_status(event_type: str) -> str:
    if event_type == "RESULT_RETURNED":
        return "COMPLETE"
    if event_type == "ERROR":
        return "ERROR"
    if event_type == "RETRY":
        return "RETRYING"
    return "RUNNING"


@dataclass(frozen=True)
class EventRequest:
    command_id: str
    context_id: str
    event_type: str
    observed_at: str
    responsible_worker_id: str
    source_pointer: str
    cause: str | None
    observed_context_id: str | None
    user_manual_action: bool
    payload: dict[str, Any]
    idempotency_key: str
    event_seq: int


class AutomationEventLogAndMetrics:
    """D-5 projection over the existing PR #40 append-only event/checkpoint store.

    Durable stream identity is COMMAND_ID + CONTEXT_ID by mapping CONTEXT_ID to the
    upstream store's worker_id slot. The actual responsible worker is preserved in
    event state metadata. Runtime callers should use emit_nonblocking(); record_event()
    exists for deterministic tests and repair tooling.
    """

    def __init__(self, root: Path):
        self.root = Path(root)
        self.backend = WorkerBrowserStateEventStore(self.root / "event-store")
        self._queue: queue.Queue[EventRequest | None] = queue.Queue()
        self._lock = threading.RLock()
        self._reserved_seq: dict[tuple[str, str], int] = {}
        self._pending_event_type: dict[tuple[str, str], str | None] = {}
        self._pending_idempotency: set[tuple[str, str, str]] = set()
        self._background_results: list[dict[str, Any]] = []
        self._closed = False
        self._thread = threading.Thread(target=self._writer_loop, name="d5-event-log-writer", daemon=True)
        self._thread.start()

    def _stream_key(self, command_id: str, context_id: str) -> tuple[str, str]:
        return command_id, context_id

    def _durable_rows(self, command_id: str | None = None, context_id: str | None = None) -> list[dict[str, Any]]:
        rows = self.backend._jsonl_rows(self.backend.events_path)
        out: list[dict[str, Any]] = []
        for row in rows:
            state = row.get("state")
            if not isinstance(state, dict) or state.get("schema_version") != "D5_AUTOMATION_EVENT_V1":
                continue
            if command_id is not None and row.get("command_id") != command_id:
                continue
            if context_id is not None and row.get("worker_id") != context_id:
                continue
            out.append(row)
        return out

    def _last_event_type(self, command_id: str, context_id: str) -> str | None:
        rows = self._durable_rows(command_id, context_id)
        return rows[-1]["state"]["event_type"] if rows else None

    def _next_seq(self, command_id: str, context_id: str) -> int:
        stream = self._stream_key(command_id, context_id)
        if stream not in self._reserved_seq:
            restored = self.backend.restart_readback(command_id, context_id)
            self._reserved_seq[stream] = int(restored["restored_event_seq"])
            self._pending_event_type[stream] = self._last_event_type(command_id, context_id)
        self._reserved_seq[stream] += 1
        return self._reserved_seq[stream]

    def _normalize_request(
        self,
        *,
        command_id: str,
        context_id: str,
        event_type: str,
        observed_at: str,
        responsible_worker_id: str,
        source_pointer: str,
        cause: str | None = None,
        observed_context_id: str | None = None,
        user_manual_action: bool = False,
        payload: Mapping[str, Any] | None = None,
        idempotency_key: str | None = None,
        event_seq: int | None = None,
    ) -> EventRequest | dict[str, Any]:
        event_type = event_type.upper()
        if event_type not in EVENT_TYPES:
            raise AutomationEventLogError(f"unsupported event_type: {event_type}")
        _parse_ts(observed_at)
        event_payload = dict(payload or {})
        key_material = {
            "command_id": command_id,
            "context_id": context_id,
            "event_type": event_type,
            "observed_at": observed_at,
            "responsible_worker_id": responsible_worker_id,
            "cause": cause,
            "observed_context_id": observed_context_id,
            "user_manual_action": bool(user_manual_action),
            "payload": event_payload,
        }
        idem = idempotency_key or _sha(key_material)
        stream = self._stream_key(command_id, context_id)
        durable_keys = {
            row["state"].get("idempotency_key")
            for row in self._durable_rows(command_id, context_id)
            if isinstance(row.get("state"), dict)
        }
        if idem in durable_keys or (command_id, context_id, idem) in self._pending_idempotency:
            return {
                "disposition": "DUPLICATE_SUPPRESSED",
                "command_id": command_id,
                "context_id": context_id,
                "event_type": event_type,
                "idempotency_key": idem,
            }

        previous = self._pending_event_type.get(stream)
        if stream not in self._pending_event_type:
            previous = self._last_event_type(command_id, context_id)
            self._pending_event_type[stream] = previous
        if event_type not in TRANSITIONS.get(previous, set()):
            raise AutomationEventLogError(f"order reversal/invalid transition: {previous} -> {event_type}")

        if event_seq is None:
            seq = self._next_seq(command_id, context_id)
        else:
            expected = self.backend.restart_readback(command_id, context_id)["restored_event_seq"] + 1
            if event_seq != expected:
                raise AutomationEventLogError(f"out-of-order event_seq: expected {expected}, got {event_seq}")
            seq = event_seq
            self._reserved_seq[stream] = seq

        self._pending_event_type[stream] = event_type
        self._pending_idempotency.add((command_id, context_id, idem))
        return EventRequest(
            command_id=command_id,
            context_id=context_id,
            event_type=event_type,
            observed_at=observed_at,
            responsible_worker_id=responsible_worker_id,
            source_pointer=source_pointer,
            cause=cause.upper() if cause else None,
            observed_context_id=observed_context_id,
            user_manual_action=bool(user_manual_action),
            payload=event_payload,
            idempotency_key=idem,
            event_seq=seq,
        )

    def _persist_request(self, req: EventRequest) -> dict[str, Any]:
        mismatch = req.observed_context_id is not None and req.observed_context_id != req.context_id
        state = {
            "schema_version": "D5_AUTOMATION_EVENT_V1",
            "event_type": req.event_type,
            "context_id": req.context_id,
            "responsible_worker_id": req.responsible_worker_id,
            "cause": req.cause,
            "context_mismatch": mismatch,
            "observed_context_id": req.observed_context_id,
            "user_manual_action": req.user_manual_action,
            "idempotency_key": req.idempotency_key,
            "payload": req.payload,
        }
        result = self.backend.append_event(
            command_id=req.command_id,
            worker_id=req.context_id,
            page_id=req.context_id,
            event_seq=req.event_seq,
            observed_at=req.observed_at,
            state=state,
            task_status=_task_status(req.event_type),
            source_pointer=req.source_pointer,
            metadata={"projection_owner": "D-5_AUTOMATION_EVENT_LOG_AND_IMPROVEMENT_OWNER"},
        )
        return {**result, "command_id": req.command_id, "context_id": req.context_id, "event_type": req.event_type}

    def record_event(self, **kwargs: Any) -> dict[str, Any]:
        with self._lock:
            normalized = self._normalize_request(**kwargs)
            if isinstance(normalized, dict):
                return normalized
            try:
                return self._persist_request(normalized)
            finally:
                self._pending_idempotency.discard((normalized.command_id, normalized.context_id, normalized.idempotency_key))

    def emit_nonblocking(self, **kwargs: Any) -> dict[str, Any]:
        if self._closed:
            raise AutomationEventLogError("logger is closed")
        with self._lock:
            normalized = self._normalize_request(**kwargs)
            if isinstance(normalized, dict):
                return normalized
            self._queue.put_nowait(normalized)
            return {
                "disposition": "QUEUED_NON_BLOCKING",
                "command_id": normalized.command_id,
                "context_id": normalized.context_id,
                "event_type": normalized.event_type,
                "event_seq": normalized.event_seq,
                "idempotency_key": normalized.idempotency_key,
            }

    def _writer_loop(self) -> None:
        while True:
            req = self._queue.get()
            try:
                if req is None:
                    return
                try:
                    result = self._persist_request(req)
                except Exception as exc:  # execution path must not block on logging failure
                    result = {
                        "disposition": "BACKGROUND_LOG_ERROR",
                        "command_id": req.command_id,
                        "context_id": req.context_id,
                        "event_type": req.event_type,
                        "error_type": type(exc).__name__,
                        "error": str(exc),
                    }
                with self._lock:
                    self._background_results.append(result)
                    self._pending_idempotency.discard((req.command_id, req.context_id, req.idempotency_key))
            finally:
                self._queue.task_done()

    def flush(self) -> list[dict[str, Any]]:
        self._queue.join()
        with self._lock:
            results = list(self._background_results)
            self._background_results.clear()
            return results

    def close(self) -> None:
        if self._closed:
            return
        self.flush()
        self._closed = True
        self._queue.put_nowait(None)
        self._thread.join(timeout=2.0)

    def restart_readback(self, command_id: str, context_id: str) -> dict[str, Any]:
        restored = self.backend.restart_readback(command_id, context_id)
        state = restored.get("restored_state") or {}
        return {
            "schema_version": "D5_AUTOMATION_EVENT_RESTART_READBACK_V1",
            "command_id": command_id,
            "context_id": context_id,
            "restored_event_seq": restored["restored_event_seq"],
            "restored_event_type": state.get("event_type") if isinstance(state, dict) else None,
            "restored_task_status": restored.get("restored_task_status"),
            "last_event_pointer": restored.get("last_event_pointer"),
            "status": restored.get("status"),
        }

    def metrics(self) -> dict[str, Any]:
        rows = self._durable_rows()
        send_success = 0
        send_failure = 0
        retries = 0
        errors = 0
        mismatches = 0
        manual_actions = 0
        reply_times: list[float] = []
        result_elapsed: list[float] = []
        streams: dict[tuple[str, str], list[dict[str, Any]]] = {}
        failure_groups: dict[tuple[str, str], int] = {}

        for row in rows:
            state = row["state"]
            event_type = state["event_type"]
            if event_type == "MESSAGE_SENT":
                send_success += 1
            elif event_type == "RETRY":
                retries += 1
            elif event_type == "ERROR":
                errors += 1
                cause = (state.get("cause") or "UNKNOWN_ERROR").upper()
                if cause in SEND_FAILURE_CAUSES:
                    send_failure += 1
                worker = state.get("responsible_worker_id") or "UNASSIGNED"
                failure_groups[(worker, cause)] = failure_groups.get((worker, cause), 0) + 1
            if state.get("context_mismatch"):
                mismatches += 1
                worker = state.get("responsible_worker_id") or "UNASSIGNED"
                failure_groups[(worker, "CONTEXT_MISMATCH")] = failure_groups.get((worker, "CONTEXT_MISMATCH"), 0) + 1
            if state.get("user_manual_action"):
                manual_actions += 1
            streams.setdefault((row["command_id"], row["worker_id"]), []).append(row)

        per_stream_elapsed: dict[str, float] = {}
        for (command_id, context_id), stream_rows in streams.items():
            pending_send: datetime | None = None
            command_created: datetime | None = None
            for row in stream_rows:
                event_type = row["state"]["event_type"]
                ts = _parse_ts(row["observed_at"])
                if event_type == "COMMAND_CREATED" and command_created is None:
                    command_created = ts
                elif event_type == "MESSAGE_SENT":
                    pending_send = ts
                elif event_type == "REPLY_COMPLETED" and pending_send is not None:
                    reply_times.append((ts - pending_send).total_seconds())
                    pending_send = None
                elif event_type == "RESULT_RETURNED" and command_created is not None:
                    elapsed = (ts - command_created).total_seconds()
                    result_elapsed.append(elapsed)
                    per_stream_elapsed[f"{command_id}::{context_id}"] = elapsed

        denom = send_success + send_failure
        improvements = []
        for (worker, cause), count in sorted(failure_groups.items()):
            if count < 2:
                continue
            improvements.append({
                "responsible_worker_id": worker,
                "cause": cause,
                "failure_count": count,
                "improvement_item": IMPROVEMENT_MAP.get(cause, "WORKER_CAUSE_SPECIFIC_REPAIR_REQUIRED"),
                "priority": "P0" if count >= 3 else "P1",
            })

        return {
            "schema_version": "D5_AUTOMATION_IMPROVEMENT_METRICS_V1",
            "MESSAGE_SEND_SUCCESS_RATE": (send_success / denom) if denom else 0.0,
            "AVERAGE_REPLY_TIME": (sum(reply_times) / len(reply_times)) if reply_times else 0.0,
            "SEND_FAILURE_COUNT": send_failure,
            "RETRY_COUNT": retries,
            "ERROR_COUNT": errors,
            "CONTEXT_MISMATCH_COUNT": mismatches,
            "COMMAND_TO_RESULT_ELAPSED_TIME": (sum(result_elapsed) / len(result_elapsed)) if result_elapsed else 0.0,
            "USER_MANUAL_ACTION_COUNT": manual_actions,
            "COMMAND_TO_RESULT_BY_STREAM": per_stream_elapsed,
            "REPEATED_FAILURE_IMPROVEMENTS": improvements,
            "accepted_event_count": len(rows),
        }
