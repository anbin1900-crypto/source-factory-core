import copy
import json
import unittest
from pathlib import Path

from c3_required_path_rejection_validator import (
    FailClosedError,
    validate_all,
    validate_consumer,
    validate_fixture,
    validate_rejected_bundle,
    validate_validation_result,
    validate_receipt_candidate,
)

ROOT = Path(__file__).parent
def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))

CONSUMER = load("C5_C3_REQUIRED_PATH_REJECTION_CONSUMER_V1.json")
FIXTURE = load("C5_C3_REQUIRED_PATH_VALIDATION_FIXTURE_V1.json")
BUNDLE = load("REJECTED_RECORD_BUNDLE_V2.json")
RESULT = load("C5_PR188_PACKAGE_VALIDATION_RESULT_V2.json")
CANDIDATE = load("KNOWLEDGE_ACCEPTANCE_RECEIPT_CANDIDATE_V1.json")
FINAL = load("C5_D_ALIGNED_FINAL_REPORT_V2.json")

class TestC5Cycle0002(unittest.TestCase):
    def test_01_consumer_pass(self):
        self.assertEqual(validate_consumer(CONSUMER)["decision"], "PASS")
    def test_02_fixture_pass(self):
        self.assertEqual(validate_fixture(FIXTURE)["decision"], "PASS")
    def test_03_bundle_pass(self):
        self.assertEqual(validate_rejected_bundle(BUNDLE)["decision"], "PASS")
    def test_04_validation_result_pass(self):
        self.assertEqual(validate_validation_result(RESULT)["package_decision"], "REJECTED")
    def test_05_candidate_pass(self):
        self.assertEqual(validate_receipt_candidate(CANDIDATE)["authority"], "NON_D_CANDIDATE")
    def test_06_all_pass(self):
        self.assertEqual(len(validate_all(CONSUMER, FIXTURE, BUNDLE, RESULT, CANDIDATE)), 5)
    def test_07_rule_count(self):
        self.assertEqual(len(FIXTURE["entries"]), 22)
    def test_08_unique_rules(self):
        self.assertEqual(len({e["RULE_ID"] for e in FIXTURE["entries"]}), 22)
    def test_09_request_count(self):
        self.assertEqual(len(FIXTURE["requests"]), 7)
    def test_10_request_coverage(self):
        covered = [r for q in FIXTURE["requests"] for r in q["AFFECTED_RULE_IDS"]]
        self.assertEqual(set(covered), {e["RULE_ID"] for e in FIXTURE["entries"]})
        self.assertEqual(len(covered), 22)
    def test_11_package_reject_count(self):
        self.assertEqual(sum(e["REJECTION_SCOPE"] == "PACKAGE" for e in FIXTURE["entries"]), 4)
    def test_12_partial_eligible_count(self):
        self.assertEqual(22 - sum(e["REJECTION_SCOPE"] == "PACKAGE" for e in FIXTURE["entries"]), 18)
    def test_13_preserve_source_all(self):
        self.assertTrue(all(e["PRESERVE_SOURCE"] for e in FIXTURE["entries"]))
    def test_14_missing_status_all(self):
        self.assertTrue(all(e["SOURCE_VALUE_STATUS"] == "MISSING_AT_REQUIRED_PATH" for e in FIXTURE["entries"]))
    def test_15_bundle_preservation(self):
        self.assertEqual(BUNDLE["source_value_preservation_count"], 28)
        self.assertTrue(all(r["source_value_preserved"] for r in BUNDLE["rejected_records"]))
    def test_16_no_source_invention(self):
        self.assertEqual(BUNDLE["source_value_invention_count"], 0)
        self.assertTrue(all(not r["source_value_invented"] for r in BUNDLE["rejected_records"]))
    def test_17_silent_drop_zero(self):
        self.assertEqual(BUNDLE["silent_drop_count"], 0)
    def test_18_c4_consumed(self):
        self.assertTrue(RESULT["c4_v2_package_consumed"])
        self.assertTrue(CONSUMER["source_authority"]["c4"]["c4_v2_package_files_present"])
    def test_19_package_rejected(self):
        self.assertEqual(RESULT["package_decision"], "REJECTED")
        self.assertFalse(RESULT["package_gate_pass"])
    def test_20_exact_blocker(self):
        self.assertEqual(RESULT["first_blocker"], "PR188_REQUIRED_SOURCE_PATHS_MISSING_22")
        self.assertEqual(FINAL["first_blocker"], "PR188_REQUIRED_SOURCE_PATHS_MISSING_22")
    def test_21_pr188_blobs(self):
        p = CONSUMER["pr188_authority"]
        self.assertEqual(p["schema_profile_blob"], "710f1de7860f62143f81f36bd3eb4fbe2b613ff1")
        self.assertEqual(p["mapping_contract_blob"], "fcd879221b8d2b2c8f988a76e4045877ced9336b")
        self.assertEqual(p["validation_ruleset_blob"], "7bc601dd16a84f44b95c7e5757a1a796cb5fd793")
        self.assertEqual(p["acceptance_receipt_contract_blob"], "c5b2d0087c52fb1af4b9c0a31f7181aedebfd410")
    def test_22_non_authority_candidate(self):
        self.assertFalse(CANDIDATE["d_authority_acceptance_receipt_issued"])
        self.assertFalse(CANDIDATE["d_acceptance_claim"])
        self.assertFalse(CANDIDATE["authoritative_db_write_performed"])
    def test_23_runtime_counters_zero(self):
        self.assertEqual(CANDIDATE["postgresql_connection_count"], 0)
        self.assertEqual(CANDIDATE["migration_apply_count"], 0)
    def test_24_final_terminal(self):
        self.assertEqual(FINAL["decision"], "EXACT_BLOCKER")
        self.assertEqual(FINAL["terminal"], "C5_D_SCHEMA_VALIDATOR_REJECTION_READY_OR_EXACT_BLOCKER")
    def test_25_tampered_c3_pointer_fails(self):
        bad = copy.deepcopy(CONSUMER)
        bad["source_authority"]["c3"]["latest_pointer"]["blob"] = "0" * 40
        with self.assertRaises(FailClosedError):
            validate_consumer(bad)
    def test_26_closed_c4_gate_fails(self):
        bad = copy.deepcopy(CONSUMER)
        bad["entry_gate"]["open"] = False
        with self.assertRaises(FailClosedError):
            validate_consumer(bad)
    def test_27_missing_rejection_reason_fails(self):
        bad = copy.deepcopy(BUNDLE)
        bad["rejected_records"][0]["reason_codes"] = []
        with self.assertRaises(FailClosedError):
            validate_rejected_bundle(bad)
    def test_28_source_invention_fails(self):
        bad = copy.deepcopy(BUNDLE)
        bad["rejected_records"][0]["source_value_invented"] = True
        with self.assertRaises(FailClosedError):
            validate_rejected_bundle(bad)
    def test_29_false_d_receipt_claim_fails(self):
        bad = copy.deepcopy(CANDIDATE)
        bad["d_authority_acceptance_receipt_issued"] = True
        with self.assertRaises(FailClosedError):
            validate_receipt_candidate(bad)
    def test_30_invalid_decision_fails(self):
        bad = copy.deepcopy(RESULT)
        bad["package_decision"] = "WAITING"
        with self.assertRaises(FailClosedError):
            validate_validation_result(bad)

if __name__ == "__main__":
    unittest.main(verbosity=2)
