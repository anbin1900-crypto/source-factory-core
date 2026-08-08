from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

from incremental_cursor import CursorRegressionError, IncrementalCursor, canonical_json, dedup_key
from pagination_loop import (
    AppendOnlyResumeLedger,
    FixturePageAdapter,
    FixtureRequestError,
    NonRetryableFailure,
    PaginationExtractor,
    PaginationPolicy,
    PaginationPolicyError,
    ProgressTracker,
    RetryExhaustedError,
    RetryPolicy,
    SimulatedCrash,
)
from retry_resume_engine import LedgerIntegrityError, ProgressRegressionError


class ExtractorRetryResumeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.package = json.loads((ROOT / "fixtures/b2_fixture_adapter_package.json").read_text(encoding="utf-8"))
        cls.pages = {
            1: json.loads((ROOT / "fixtures/page_001.json").read_text(encoding="utf-8")),
            2: json.loads((ROOT / "fixtures/page_002.json").read_text(encoding="utf-8")),
        }
        cls.policy = PaginationPolicy.from_adapter_package(cls.package)

    def run_engine(self, *, failures=None, crash_after_page=None, ledger=None, progress=None):
        adapter = FixturePageAdapter(self.pages, failures=failures)
        extractor = PaginationExtractor(policy=self.policy)
        receipt = extractor.run(
            adapter_package=self.package,
            adapter=adapter,
            ledger=ledger,
            progress=progress,
            crash_after_page=crash_after_page,
        )
        return receipt, adapter

    def test_01_policy_consumes_b2_page_number(self):
        self.assertEqual(self.policy.strategy, "page_number")

    def test_02_policy_start_page_one(self):
        self.assertEqual(self.policy.start_page, 1)

    def test_03_policy_limits_bound(self):
        self.assertEqual((self.policy.max_pages, self.policy.max_records), (10, 500))

    def test_04_non_fixture_package_rejected(self):
        package = copy.deepcopy(self.package); package["fixture"] = False
        with self.assertRaises(PaginationPolicyError): PaginationPolicy.from_adapter_package(package)

    def test_05_verified_fixture_claim_rejected(self):
        package = copy.deepcopy(self.package); package["verified"] = True
        with self.assertRaises(PaginationPolicyError): PaginationPolicy.from_adapter_package(package)

    def test_06_zero_network_metadata_required(self):
        package = copy.deepcopy(self.package); package["metadata"]["zero_network_calls"] = False
        with self.assertRaises(PaginationPolicyError): PaginationPolicy.from_adapter_package(package)

    def test_07_fixture_input_count_four(self):
        self.assertEqual(sum(len(page["records"]) for page in self.pages.values()), 4)

    def test_08_dedup_key_prefers_id(self):
        self.assertEqual(dedup_key({"id": "L-001", "x": 1}), "id:L-001")

    def test_09_dedup_key_canonical_order(self):
        self.assertEqual(dedup_key({"a": 1, "b": 2}), dedup_key({"b": 2, "a": 1}))

    def test_10_complete_pagination_output_three(self):
        receipt, _ = self.run_engine()
        self.assertEqual(receipt["output_record_count"], 3)

    def test_11_duplicate_count_one(self):
        receipt, _ = self.run_engine()
        self.assertEqual(receipt["duplicate_count"], 1)

    def test_12_last_page_terminates(self):
        receipt, _ = self.run_engine()
        self.assertTrue(receipt["completed"]); self.assertIsNone(receipt["next_page"])

    def test_13_output_order_stable(self):
        receipt, _ = self.run_engine()
        self.assertEqual([item["id"] for item in receipt["output_records"]], ["L-001", "L-002", "L-003"])

    def test_14_zero_network_calls(self):
        receipt, adapter = self.run_engine()
        self.assertEqual(receipt["network_call_count"], 0); self.assertEqual(adapter.network_call_count, 0)

    def test_15_retryable_429_retried(self):
        receipt, adapter = self.run_engine(failures={1: [FixtureRequestError(429)]})
        self.assertEqual(adapter.attempts[1], 2); self.assertEqual(receipt["output_record_count"], 3)

    def test_16_timeout_retried(self):
        receipt, adapter = self.run_engine(failures={1: [TimeoutError("x")]})
        self.assertEqual(adapter.attempts[1], 2); self.assertTrue(receipt["completed"])

    def test_17_nonretryable_400_fails_closed(self):
        with self.assertRaises(NonRetryableFailure): self.run_engine(failures={1: [FixtureRequestError(400)]})

    def test_18_retry_exhaustion(self):
        failures = {1: [FixtureRequestError(500), FixtureRequestError(500), FixtureRequestError(500)]}
        with self.assertRaises(RetryExhaustedError): self.run_engine(failures=failures)

    def test_19_ledger_chain_valid(self):
        ledger = AppendOnlyResumeLedger(); ledger.append("A", {"x": 1}); ledger.append("B", {"x": 2})
        self.assertTrue(ledger.validate())

    def test_20_ledger_tamper_detected(self):
        ledger = AppendOnlyResumeLedger(); ledger.append("A", {"x": 1})
        entries = ledger.entries; entries[0]["payload"]["x"] = 2
        with self.assertRaises(LedgerIntegrityError): AppendOnlyResumeLedger(entries)

    def test_21_cursor_regression_rejected(self):
        cursor = IncrementalCursor(); cursor.commit_page(page=1, next_page=2, records=[])
        with self.assertRaises(CursorRegressionError): cursor.commit_page(page=1, next_page=None, records=[])

    def test_22_progress_monotonic(self):
        progress = ProgressTracker(); progress.append(stage="START", completed_units=0, total_units=2); progress.append(stage="P1", completed_units=1, total_units=2)
        self.assertTrue(progress.validate())

    def test_23_progress_regression_rejected(self):
        progress = ProgressTracker(); progress.append(stage="P1", completed_units=1, total_units=2)
        with self.assertRaises(ProgressRegressionError): progress.append(stage="BAD", completed_units=0, total_units=2)

    def test_24_crash_after_page_commits_cursor(self):
        ledger = AppendOnlyResumeLedger(); progress = ProgressTracker(); adapter = FixturePageAdapter(self.pages)
        extractor = PaginationExtractor(policy=self.policy)
        with self.assertRaises(SimulatedCrash):
            extractor.run(adapter_package=self.package, adapter=adapter, ledger=ledger, progress=progress, crash_after_page=1)
        snapshot = ledger.last_cursor_snapshot(extractor.execution_key(self.package, adapter.pages))
        self.assertEqual(snapshot["last_committed_page"], 1); self.assertEqual(snapshot["next_page"], 2)

    def test_25_resume_from_last_committed_cursor(self):
        ledger = AppendOnlyResumeLedger(); progress = ProgressTracker(); adapter1 = FixturePageAdapter(self.pages); extractor = PaginationExtractor(policy=self.policy)
        with self.assertRaises(SimulatedCrash): extractor.run(adapter_package=self.package, adapter=adapter1, ledger=ledger, progress=progress, crash_after_page=1)
        adapter2 = FixturePageAdapter(self.pages)
        receipt = extractor.run(adapter_package=self.package, adapter=adapter2, ledger=ledger, progress=progress)
        self.assertTrue(receipt["resumed"]); self.assertEqual(adapter2.attempts.get(1, 0), 0); self.assertEqual(adapter2.attempts[2], 1)

    def test_26_crash_resume_counts(self):
        ledger = AppendOnlyResumeLedger(); progress = ProgressTracker(); extractor = PaginationExtractor(policy=self.policy)
        with self.assertRaises(SimulatedCrash): extractor.run(adapter_package=self.package, adapter=FixturePageAdapter(self.pages), ledger=ledger, progress=progress, crash_after_page=1)
        receipt = extractor.run(adapter_package=self.package, adapter=FixturePageAdapter(self.pages), ledger=ledger, progress=progress)
        self.assertEqual((receipt["input_record_count"], receipt["duplicate_count"], receipt["output_record_count"]), (4, 1, 3))

    def test_27_second_run_execution_delta_zero(self):
        ledger = AppendOnlyResumeLedger(); progress = ProgressTracker(); extractor = PaginationExtractor(policy=self.policy)
        first = extractor.run(adapter_package=self.package, adapter=FixturePageAdapter(self.pages), ledger=ledger, progress=progress)
        before = len(ledger.entries)
        second = extractor.run(adapter_package=self.package, adapter=FixturePageAdapter(self.pages), ledger=ledger, progress=progress)
        self.assertEqual(first["execution_delta"], 3); self.assertEqual(second["execution_delta"], 0); self.assertEqual(len(ledger.entries), before)

    def test_28_progress_finishes_100(self):
        receipt, _ = self.run_engine()
        self.assertEqual(receipt["progress_events"][-1]["percent"], 100.0)

    def test_29_retry_events_do_not_reduce_progress(self):
        ledger = AppendOnlyResumeLedger(); progress = ProgressTracker(); self.run_engine(failures={2:[ConnectionError("x")]}, ledger=ledger, progress=progress)
        self.assertTrue(progress.validate())

    def test_30_empty_page_stops(self):
        pages = {1: {"metadata":{}, "records":[], "next_page":2}}
        receipt = PaginationExtractor(policy=self.policy).run(adapter_package=self.package, adapter=FixturePageAdapter(pages))
        self.assertTrue(receipt["completed"]); self.assertEqual(receipt["output_record_count"], 0)

    def test_31_invalid_next_page_rejected(self):
        pages = {1: {"metadata":{}, "records":[{"id":"x"}], "next_page":1}}
        with self.assertRaises(PaginationPolicyError): PaginationExtractor(policy=self.policy).run(adapter_package=self.package, adapter=FixturePageAdapter(pages))

    def test_32_max_records_rejected(self):
        policy = PaginationPolicy("page_number", 1, 50, 10, 1, "empty_page")
        with self.assertRaises(PaginationPolicyError): PaginationExtractor(policy=policy).run(adapter_package=self.package, adapter=FixturePageAdapter(self.pages))


if __name__ == "__main__":
    unittest.main(verbosity=2)
