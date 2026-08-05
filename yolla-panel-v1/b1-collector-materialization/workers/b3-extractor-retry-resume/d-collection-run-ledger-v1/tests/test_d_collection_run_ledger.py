from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

from d_collection_run_ledger import (
    CollectionRunLedgerError,
    DCollectionRunResumeLedger,
    IdempotencyConflictError,
    InvalidTransitionError,
    LedgerIntegrityError,
    TimestampRegressionError,
)


class DCollectionRunResumeLedgerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((ROOT / "fixtures/d_collection_run_fixture_v1.json").read_text(encoding="utf-8"))

    def new_ledger(self):
        return DCollectionRunResumeLedger(
            source_key=self.fixture["source_key"],
            native_run_key=self.fixture["native_run_key"],
            package_sha256=self.fixture["package_sha256"],
        )

    def apply_fixture(self, ledger=None):
        ledger = ledger or self.new_ledger()
        created = []
        for item in self.fixture["events"]:
            kwargs = dict(item)
            resume_sequence = kwargs.pop("resume_from_sequence", None)
            if resume_sequence is not None:
                kwargs["resume_from_event_id"] = f"{self.fixture['native_run_key']}:event:{resume_sequence:04d}"
            event, appended = ledger.record_event(**kwargs)
            created.append((event, appended))
        return ledger, created

    def test_01_source_key_required(self):
        with self.assertRaises(CollectionRunLedgerError):
            DCollectionRunResumeLedger(source_key="", native_run_key="x", package_sha256="0" * 64)

    def test_02_native_run_key_required(self):
        with self.assertRaises(CollectionRunLedgerError):
            DCollectionRunResumeLedger(source_key="x", native_run_key="", package_sha256="0" * 64)

    def test_03_package_hash_must_be_sha256(self):
        with self.assertRaises(CollectionRunLedgerError):
            DCollectionRunResumeLedger(source_key="x", native_run_key="y", package_sha256="bad")

    def test_04_created_is_first_transition(self):
        ledger = self.new_ledger()
        event, appended = ledger.record_event(event_type="RUN_CREATED", occurred_at="2026-08-06T00:00:00+09:00", idempotency_key="a")
        self.assertTrue(appended); self.assertEqual(event["status_to"], "CREATED")

    def test_05_start_without_created_rejected(self):
        with self.assertRaises(InvalidTransitionError):
            self.new_ledger().record_event(event_type="RUN_STARTED", occurred_at="2026-08-06T00:00:00+09:00", idempotency_key="a")

    def test_06_fixture_reaches_completed(self):
        ledger, _ = self.apply_fixture()
        self.assertEqual(ledger.status, "COMPLETED")

    def test_07_retry_count_one(self):
        self.assertEqual(self.apply_fixture()[0].to_d_consumption_payload()["collection_run"]["retry_count"], 1)

    def test_08_resume_count_one(self):
        self.assertEqual(self.apply_fixture()[0].to_d_consumption_payload()["collection_run"]["resume_count"], 1)

    def test_09_processing_event_count_eight(self):
        self.assertEqual(self.apply_fixture()[0].to_d_consumption_payload()["collection_run"]["processing_event_count"], 8)

    def test_10_started_at_uses_first_running_event(self):
        self.assertEqual(self.apply_fixture()[0].to_d_consumption_payload()["collection_run"]["started_at"], "2026-08-06T00:01:00+09:00")

    def test_11_ended_at_uses_terminal_event(self):
        self.assertEqual(self.apply_fixture()[0].to_d_consumption_payload()["collection_run"]["ended_at"], "2026-08-06T00:07:00+09:00")

    def test_12_d_canonical_run_id_is_none(self):
        self.assertIsNone(self.apply_fixture()[0].to_d_consumption_payload()["collection_run"]["d_canonical_run_id"])

    def test_13_site_call_count_zero(self):
        self.assertEqual(self.apply_fixture()[0].to_d_consumption_payload()["safety"]["site_call_count"], 0)

    def test_14_automated_pagination_false(self):
        self.assertFalse(self.apply_fixture()[0].to_d_consumption_payload()["safety"]["automated_pagination"])

    def test_15_id_generation_false(self):
        self.assertFalse(self.apply_fixture()[0].to_d_consumption_payload()["safety"]["d_canonical_id_generation"])

    def test_16_resume_lineage_targets_interruption(self):
        payload = self.apply_fixture()[0].to_d_consumption_payload()
        edge = payload["retry_resume_lineage"]["resume_edges"][0]
        self.assertEqual(edge["resume_from_event_id"], payload["retry_resume_lineage"]["interruption_event_ids"][0])

    def test_17_resume_without_lineage_rejected(self):
        ledger = self.new_ledger()
        ledger.record_event(event_type="RUN_CREATED", occurred_at="2026-08-06T00:00:00+09:00", idempotency_key="a")
        ledger.record_event(event_type="RUN_STARTED", occurred_at="2026-08-06T00:01:00+09:00", idempotency_key="b")
        ledger.record_event(event_type="RUN_INTERRUPTED", occurred_at="2026-08-06T00:02:00+09:00", idempotency_key="c")
        with self.assertRaises(CollectionRunLedgerError):
            ledger.record_event(event_type="RUN_RESUMED", occurred_at="2026-08-06T00:03:00+09:00", idempotency_key="d")

    def test_18_wrong_resume_target_rejected(self):
        ledger = self.new_ledger()
        ledger.record_event(event_type="RUN_CREATED", occurred_at="2026-08-06T00:00:00+09:00", idempotency_key="a")
        ledger.record_event(event_type="RUN_STARTED", occurred_at="2026-08-06T00:01:00+09:00", idempotency_key="b")
        ledger.record_event(event_type="RUN_INTERRUPTED", occurred_at="2026-08-06T00:02:00+09:00", idempotency_key="c")
        with self.assertRaises(CollectionRunLedgerError):
            ledger.record_event(event_type="RUN_RESUMED", occurred_at="2026-08-06T00:03:00+09:00", idempotency_key="d", resume_from_event_id="bad")

    def test_19_idempotent_replay_has_zero_delta(self):
        ledger, created = self.apply_fixture()
        before = len(ledger.entries)
        item = dict(self.fixture["events"][-1])
        event, appended = ledger.record_event(**item)
        self.assertFalse(appended); self.assertEqual(len(ledger.entries), before); self.assertEqual(event, created[-1][0])

    def test_20_idempotency_conflict_rejected(self):
        ledger = self.new_ledger()
        ledger.record_event(event_type="RUN_CREATED", occurred_at="2026-08-06T00:00:00+09:00", idempotency_key="same")
        with self.assertRaises(IdempotencyConflictError):
            ledger.record_event(event_type="RUN_CREATED", occurred_at="2026-08-06T00:01:00+09:00", idempotency_key="same")

    def test_21_timestamp_regression_rejected(self):
        ledger = self.new_ledger()
        ledger.record_event(event_type="RUN_CREATED", occurred_at="2026-08-06T00:01:00+09:00", idempotency_key="a")
        with self.assertRaises(TimestampRegressionError):
            ledger.record_event(event_type="RUN_STARTED", occurred_at="2026-08-06T00:00:00+09:00", idempotency_key="b")

    def test_22_retry_attempt_must_increment(self):
        ledger = self.new_ledger()
        ledger.record_event(event_type="RUN_CREATED", occurred_at="2026-08-06T00:00:00+09:00", idempotency_key="a")
        ledger.record_event(event_type="RUN_STARTED", occurred_at="2026-08-06T00:01:00+09:00", idempotency_key="b")
        with self.assertRaises(CollectionRunLedgerError):
            ledger.record_event(event_type="RETRY_SCHEDULED", occurred_at="2026-08-06T00:02:00+09:00", idempotency_key="c", retry_attempt=0)

    def test_23_retry_attempt_regression_rejected(self):
        ledger, _ = self.apply_fixture()
        payload = ledger.to_d_consumption_payload(); payload["processing_events"][6]["retry_attempt"] = 0
        with self.assertRaises(LedgerIntegrityError):
            DCollectionRunResumeLedger.from_d_consumption_payload(payload)

    def test_24_hash_chain_valid(self):
        self.assertTrue(self.apply_fixture()[0].validate())

    def test_25_hash_chain_tamper_detected(self):
        ledger, _ = self.apply_fixture(); entries = ledger.entries
        entries[3]["details"]["retry"] = False
        with self.assertRaises(LedgerIntegrityError):
            DCollectionRunResumeLedger(source_key=self.fixture["source_key"], native_run_key=self.fixture["native_run_key"], package_sha256=self.fixture["package_sha256"], entries=entries)

    def test_26_native_event_ids_deterministic(self):
        ledger, _ = self.apply_fixture()
        self.assertEqual(ledger.entries[0]["native_event_id"], f"{self.fixture['native_run_key']}:event:0001")
        self.assertEqual(ledger.entries[-1]["native_event_id"], f"{self.fixture['native_run_key']}:event:0008")

    def test_27_terminal_prevents_new_event(self):
        ledger, _ = self.apply_fixture()
        with self.assertRaises(InvalidTransitionError):
            ledger.record_event(event_type="RUN_FAILED", occurred_at="2026-08-06T00:08:00+09:00", idempotency_key="after")

    def test_28_roundtrip_exact(self):
        payload = self.apply_fixture()[0].to_d_consumption_payload()
        restored = DCollectionRunResumeLedger.from_d_consumption_payload(payload)
        self.assertEqual(restored.to_d_consumption_payload(), payload)

    def test_29_roundtrip_rejects_d_canonical_id(self):
        payload = self.apply_fixture()[0].to_d_consumption_payload(); payload["collection_run"]["d_canonical_run_id"] = "D-RUN-1"
        with self.assertRaises(CollectionRunLedgerError):
            DCollectionRunResumeLedger.from_d_consumption_payload(payload)

    def test_30_payload_package_hash_preserved(self):
        self.assertEqual(self.apply_fixture()[0].to_d_consumption_payload()["collection_run"]["package_sha256"], self.fixture["package_sha256"])

    def test_31_processing_event_hashes_unique(self):
        events = self.apply_fixture()[0].entries
        self.assertEqual(len({item["event_hash"] for item in events}), len(events))

    def test_32_fixture_package_hash_is_expected(self):
        expected = sha256(b"B3-D-COLLECTION-RUN-FIXTURE-PACKAGE-V1").hexdigest()
        self.assertEqual(self.fixture["package_sha256"], expected)


if __name__ == "__main__":
    unittest.main(verbosity=2)
