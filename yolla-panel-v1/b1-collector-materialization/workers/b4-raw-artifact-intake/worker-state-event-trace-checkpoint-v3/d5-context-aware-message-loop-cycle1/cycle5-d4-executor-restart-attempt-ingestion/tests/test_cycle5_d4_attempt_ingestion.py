import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from cycle5_d4_attempt_ingestion import AttemptEvent, Cycle5D4AttemptIngestion


def test_actual_ingestion_and_metrics():
    with tempfile.TemporaryDirectory() as td:
        s = Cycle5D4AttemptIngestion(Path(td))
        assert s.replay_prior_d4_lineage()["disposition"] == "ACCEPTED"                         # 1
        out = s.ingest_actual_events()
        assert [x["disposition"] for x in out] == ["ACCEPTED"] * 5                            # 2
        rb = s.restart_readback()
        assert rb["restored_event_seq"] == 6                                                   # 3
        assert rb["restored_state"]["event_type"] == "RECEIPT_PUBLISHED"                     # 4
        m = s.metrics()
        assert abs(m["claim_to_receipt_seconds"] - 2270.813017) < 0.00001                      # 5
        assert abs(m["queue_stall_observation_to_receipt_seconds"] - 1274.879314) < 0.00001    # 6
        assert abs(m["observer_working_duration_seconds"] - 2243.108431) < 0.00001             # 7
        assert m["restart_to_receipt_latency_seconds"] is None                                 # 8
        assert m["retry_count"] == 2                                                           # 9
        assert m["actual_event_count"] == 5                                                   # 10
        assert m["required_event_count"] == 6                                                 # 11
        assert m["missing_actual_event"] == "USER_RESTARTED_EXECUTOR"                         # 12
        assert m["external_blocker_classification_for_schema_failure"] is False                # 13
        assert m["d4_completion_inference"] is False                                           # 14
        assert m["synthetic_event_count"] == 0                                                 # 15
        assert m["upstream_mutation_count"] == 0                                               # 16
        dup = s.ingest_event(s.actual_events()[0])
        assert dup["disposition"] == "DUPLICATE_SUPPRESSED"                                  # 17
        old = AttemptEvent(event="CLAIMED", observed_at="2026-08-07T15:00:00Z", source="NEGATIVE")
        assert s.ingest_event(old)["disposition"] == "ORDER_REVERSED_REJECTED"                # 18
        s.close()


def test_nonblocking_and_restart_restore():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        s = Cycle5D4AttemptIngestion(root)
        assert s.replay_prior_d4_lineage()["disposition"] == "ACCEPTED"
        queued = s.ingest_actual_events_nonblocking()
        assert [x["disposition"] for x in queued] == ["QUEUED_NON_BLOCKING"] * 5
        persisted = s.flush()
        assert [x["disposition"] for x in persisted] == ["ACCEPTED"] * 5
        s.close()
        s2 = Cycle5D4AttemptIngestion(root)
        assert s2.restart_readback()["restored_event_seq"] == 6
        assert s2.restart_readback()["restored_state"]["event_type"] == "RECEIPT_PUBLISHED"
        s2.close()
