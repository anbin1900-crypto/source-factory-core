from __future__ import annotations

import importlib.util
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
CYCLE5 = HERE.parent
D5_ROOT = CYCLE5.parent
CYCLE2 = D5_ROOT / "cycle2-real-receipt-ingestion"


def _load_cycle2():
    path = CYCLE2 / "src" / "receipt_ingestion_adapter.py"
    spec = importlib.util.spec_from_file_location("d5_cycle2_receipt_ingestion_adapter", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


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

    def __init__(self, root: Path):
        self.mod = _load_cycle2()
        self.store = self.mod.RealReceiptIngestion(Path(root))
        self.input = json.loads((CYCLE5 / "D5_CYCLE5_ACTUAL_D4_V3_INPUT_V1.json").read_text(encoding="utf-8"))

    def replay_prior_d4_lineage(self):
        data = json.loads((CYCLE2 / "ACTUAL_CYCLE1_RECEIPTS_V1.json").read_text(encoding="utf-8"))
        d4 = next(r for r in data["receipts"] if r["worker_id"] == "D-4")
        return self.store.ingest(self.mod.Receipt(**d4))

    def actual_events(self) -> list[AttemptEvent]:
        rows = [AttemptEvent(**row) for row in self.input["actual_observer_events"]]
        rows.sort(key=lambda row: ts(row.observed_at))
        return rows

    def _to_receipt(self, event: AttemptEvent):
        command = self.input["command"]
        receipt = self.input["receipt"]
        return self.mod.Receipt(
            command_id=self.LINEAGE_COMMAND,
            context_id=self.LINEAGE_CONTEXT,
            worker_id="D-4",
            observed_at=event.observed_at,
            status="LIVE_RESUMED" if event.event == "RECEIPT_PUBLISHED" else "BLOCKED_EXTERNAL",
            detail_code=f"D4_{event.event}:{event.reason or event.classification or 'OBSERVED'}",
            source_receipt_pointer=f"github://d4-cycle5/{command['command_id']}/{event.event}/{event.observed_at}",
            source_pr=22,
            result_commit=receipt["blob"],
            terminal="CHROME_REPLY_COMPLETION_LIVE_BLOCKED",
        )

    def ingest_actual_events(self):
        out = []
        for event in self.actual_events():
            receipt = self._to_receipt(event)
            out.append(self.store.ingest(receipt))
        return out

    def ingest_actual_events_nonblocking(self):
        return [self.store.ingest_nonblocking(self._to_receipt(event)) for event in self.actual_events()]

    def metrics(self):
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

    def restart_readback(self):
        return self.store.restart_readback(self.LINEAGE_COMMAND, self.LINEAGE_CONTEXT)

    def close(self):
        self.store.close()
