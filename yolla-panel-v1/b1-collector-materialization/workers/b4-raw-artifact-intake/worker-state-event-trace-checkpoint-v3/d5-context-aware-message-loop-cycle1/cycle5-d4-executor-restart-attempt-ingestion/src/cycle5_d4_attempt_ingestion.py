from __future__ import annotations

import json
import queue
import sys
import threading
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
CYCLE5 = HERE.parent
D5_ROOT = CYCLE5.parent
CYCLE2 = D5_ROOT / "cycle2-real-receipt-ingestion"
UPSTREAM_ROOT = HERE.parents[2]
UPSTREAM_SRC = UPSTREAM_ROOT / "src"
if str(UPSTREAM_SRC) not in sys.path:
    sys.path.insert(0, str(UPSTREAM_SRC))

from worker_state_event_store import WorkerBrowserStateEventStore  # type: ignore


def ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class AttemptEvent:
    event: str
    observed_at: str
    reason: str | None = None
    classification: str | None = None
    source: str | None = None


class Cycle5D4AttemptIngestion:
    LINEAGE_COMMAND = "D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE1-20260807-001:D-4"
    LINEAGE_CONTEXT = "UNRESOLVED:D-4"
    EVENT_SCHEMA = "D5_CYCLE5_D4_ATTEMPT_EVENT_V1"

    def __init__(self, root: Path):
        self.root = Path(root)
        self.store = WorkerBrowserStateEventStore(self.root / "event-store")
        self.input = json.loads((CYCLE5 / "D5_CYCLE5_ACTUAL_D4_V3_INPUT_V1.json").read_text(encoding="utf-8"))
        self.q: queue.Queue[AttemptEvent | None] = queue.Queue()
        self.results: list[dict[str, Any]] = []
        self.lock = threading.Lock()
        self.closed = False
        self.thread = threading.Thread(target=self._loop, daemon=True, name="d5-cycle5-d4-attempt-writer")
        self.thread.start()

    def _accepted_rows(self) -> list[dict[str, Any]]:
        return [
            row for row in self.store._jsonl_rows(self.store.events_path)
            if row.get("command_id") == self.LINEAGE_COMMAND and row.get("worker_id") == self.LINEAGE_CONTEXT
        ]

    def replay_prior_d4_lineage(self) -> dict[str, Any]:
        cp = self.store.restart_readback(self.LINEAGE_COMMAND, self.LINEAGE_CONTEXT)
        if int(cp["restored_event_seq"]) > 0:
            return {"disposition": "BASELINE_ALREADY_PRESENT", "checkpoint": cp}
        data = json.loads((CYCLE2 / "ACTUAL_CYCLE1_RECEIPTS_V1.json").read_text(encoding="utf-8"))
        d4 = next(row for row in data["receipts"] if row["worker_id"] == "D-4")
        state = {
            "schema_version": "D5_CYCLE2_RESULT_RECEIPT_EVENT_V1",
            "event_type": "RESULT_RECEIPT",
            "status": d4["status"],
            "detail_code": d4["detail_code"],
            "source_receipt_pointer": d4["source_receipt_pointer"],
            "worker_id": "D-4",
        }
        return self.store.append_event(
            command_id=self.LINEAGE_COMMAND,
            worker_id=self.LINEAGE_CONTEXT,
            page_id="PR-22",
            event_seq=1,
            observed_at=d4["observed_at"],
            state=state,
            task_status="ERROR",
            source_pointer=d4["source_receipt_pointer"],
            metadata={"projection_owner": "D-5_AUTOMATION_EVENT_LOG_AND_IMPROVEMENT_OWNER"},
        )

    def actual_events(self) -> list[AttemptEvent]:
        rows = [AttemptEvent(**row) for row in self.input["actual_observer_events"]]
        rows.sort(key=lambda row: ts(row.observed_at))
        return rows

    def _duplicate(self, event: AttemptEvent) -> dict[str, Any] | None:
        for row in self._accepted_rows():
            state = row.get("state") or {}
            if (
                state.get("schema_version") == self.EVENT_SCHEMA
                and state.get("event_type") == event.event
                and state.get("observed_at") == event.observed_at
                and state.get("source") == event.source
            ):
                return row
        return None

    def ingest_event(self, event: AttemptEvent) -> dict[str, Any]:
        existing = self._duplicate(event)
        if existing is not None:
            return {"disposition": "DUPLICATE_SUPPRESSED", "event": existing}
        cp = self.store.restart_readback(self.LINEAGE_COMMAND, self.LINEAGE_CONTEXT)
        previous_observed_at = cp.get("restored_state", {}).get("observed_at") if isinstance(cp.get("restored_state"), dict) else None
        if previous_observed_at and ts(event.observed_at) < ts(previous_observed_at):
            return {"disposition": "ORDER_REVERSED_REJECTED", "event": None}
        seq = int(cp["restored_event_seq"]) + 1
        state = {
            "schema_version": self.EVENT_SCHEMA,
            "event_type": event.event,
            "observed_at": event.observed_at,
            "actual_v3_command_id": self.input["command"]["command_id"],
            "reason": event.reason,
            "classification": event.classification,
            "source": event.source,
            "live_pass_claimed": False,
        }
        task_status = "RUNNING" if event.event in {"CLAIMED", "WORKING"} else "ERROR"
        return self.store.append_event(
            command_id=self.LINEAGE_COMMAND,
            worker_id=self.LINEAGE_CONTEXT,
            page_id="PR-22",
            event_seq=seq,
            observed_at=event.observed_at,
            state=state,
            task_status=task_status,
            source_pointer=f"github://d4-cycle5/{event.source}/{event.event}",
            metadata={
                "projection_owner": "D-5_AUTOMATION_EVENT_LOG_AND_IMPROVEMENT_OWNER",
                "v3_receipt_blob": self.input["receipt"]["blob"],
                "internal_schema_failure_external": False,
            },
        )

    def ingest_actual_events(self) -> list[dict[str, Any]]:
        return [self.ingest_event(event) for event in self.actual_events()]

    def ingest_actual_events_nonblocking(self) -> list[dict[str, Any]]:
        out = []
        for event in self.actual_events():
            self.q.put_nowait(event)
            out.append({"disposition": "QUEUED_NON_BLOCKING", "event_type": event.event, "observed_at": event.observed_at})
        return out

    def _loop(self) -> None:
        while True:
            event = self.q.get()
            try:
                if event is None:
                    return
                try:
                    result = self.ingest_event(event)
                except Exception as exc:
                    result = {"disposition": "BACKGROUND_LOG_ERROR", "error_type": type(exc).__name__, "error": str(exc)}
                with self.lock:
                    self.results.append(result)
            finally:
                self.q.task_done()

    def flush(self) -> list[dict[str, Any]]:
        self.q.join()
        with self.lock:
            out = list(self.results)
            self.results.clear()
        return out

    def metrics(self) -> dict[str, Any]:
        event_map = {event.event: event for event in self.actual_events()}
        claim = ts(event_map["CLAIMED"].observed_at)
        working = ts(event_map["WORKING"].observed_at)
        stall = ts(event_map["EXECUTOR_STALLED"].observed_at)
        error = ts(event_map["ERROR"].observed_at)
        published = ts(event_map["RECEIPT_PUBLISHED"].observed_at)
        missing_restart = self.input["missing_actual_event"]
        return {
            "schema_version": "D5_CYCLE5_D4_ATTEMPT_METRICS_V1",
            "claim_to_receipt_seconds": (published - claim).total_seconds(),
            "queue_stall_observation_to_receipt_seconds": (published - stall).total_seconds(),
            "observer_working_duration_seconds": (error - working).total_seconds(),
            "restart_to_receipt_latency_seconds": None,
            "retry_count": int(self.input["retry_evidence"]["retry_count"]),
            "actual_event_count": len(event_map),
            "required_event_count": 6,
            "missing_actual_event": missing_restart["event"],
            "missing_actual_restart_timestamp": missing_restart["timestamp"],
            "internal_schema_failure_classification": "INTERNAL_SCHEMA_MISMATCH",
            "external_blocker_classification_for_schema_failure": False,
            "d4_completion_inference": False,
            "synthetic_event_count": 0,
            "upstream_mutation_count": 0,
        }

    def restart_readback(self) -> dict[str, Any]:
        return self.store.restart_readback(self.LINEAGE_COMMAND, self.LINEAGE_CONTEXT)

    def close(self) -> None:
        if self.closed:
            return
        self.flush()
        self.closed = True
        self.q.put_nowait(None)
        self.thread.join(timeout=2.0)
