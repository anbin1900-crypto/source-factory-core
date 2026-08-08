import copy
import json
import unittest
from pathlib import Path

from b1_actual_binding_validator import (
    FailClosedError,
    canonical_sha256,
    classify_normalized_dataset,
    validate_b1_receipt,
    validate_contract_binding,
)

FIXTURE = json.loads(
    (Path(__file__).parent / "C5_B1_ACTUAL_BINDING_TEST_FIXTURE_V1.json")
    .read_text(encoding="utf-8")
)


class TestB1ActualBinding(unittest.TestCase):
    def setUp(self):
        self.n = FIXTURE["normalized_dataset"]
        self.raw = FIXTURE["raw_artifact_manifest"]
        self.env = FIXTURE["source_record_envelope"]
        self.receipt = FIXTURE["extraction_receipt"]
        self.p = FIXTURE["d_schema_profile"]
        self.m = FIXTURE["d_mapping_contract"]
        self.r = FIXTURE["d_validation_ruleset"]

    def classify(self):
        return classify_normalized_dataset(
            self.n, self.m,
            b1_head=FIXTURE["b1_head"],
            d1_head=FIXTURE["d1_head"],
        )

    def test_contract_binding_pass(self):
        self.assertEqual(validate_contract_binding(self.p, self.m, self.r)["decision"], "PASS")

    def test_contract_version_mismatch_fails_closed(self):
        bad = copy.deepcopy(self.m)
        bad["mapping_version"] = "2.0.0"
        with self.assertRaises(FailClosedError):
            validate_contract_binding(self.p, bad, self.r)

    def test_contract_hash_chain_mismatch_fails_closed(self):
        bad = copy.deepcopy(self.r)
        bad["mapping_contract_ref"] = "0" * 64
        with self.assertRaises(FailClosedError):
            validate_contract_binding(self.p, self.m, bad)

    def test_receipt_hash_parity(self):
        self.assertEqual(validate_b1_receipt(self.n, self.raw, self.env, self.receipt)["decision"], "PASS")

    def test_normalized_hash_exact(self):
        self.assertEqual(canonical_sha256(self.n), self.receipt["normalized_dataset_sha256"])

    def test_raw_hash_exact(self):
        self.assertEqual(canonical_sha256(self.raw), self.receipt["raw_artifact_manifest_sha256"])

    def test_envelope_hash_exact(self):
        self.assertEqual(canonical_sha256(self.env), self.receipt["source_record_envelope_sha256"])

    def test_count_parity(self):
        self.assertEqual(
            (self.raw["total_record_count"], self.n["input_record_count"], self.n["output_record_count"], self.n["duplicate_count"]),
            (4, 4, 3, 1),
        )

    def test_fixture_boundary(self):
        self.assertFalse(self.receipt["actual_site_extraction"])
        self.assertEqual(self.receipt["network_call_count"], 0)

    def test_classification_counts(self):
        out = self.classify()
        self.assertEqual(
            (out["valid_count"], out["rejected_count"], out["pending_count"], out["silent_drop_count"]),
            (0, 3, 0, 0),
        )

    def test_unmapped_count(self):
        self.assertEqual(self.classify()["rejection_reason_counts"]["UNMAPPED_FIELD"], 3)

    def test_evidence_missing_count(self):
        self.assertEqual(self.classify()["rejection_reason_counts"]["EVIDENCE_REF_MISSING"], 3)

    def test_provenance_not_missing(self):
        out = self.classify()
        self.assertEqual(out["rejection_reason_counts"]["PROVENANCE_REF_MISSING"], 0)
        self.assertTrue(all(record["provenance_ref_present"] for record in out["rejected_records"]))

    def test_source_preserved(self):
        out = self.classify()
        self.assertTrue(all(record["source_record_preserved"] for record in out["rejected_records"]))
        self.assertEqual(out["rejected_records"][1]["source_record"]["unmapped_fields"]["note"], "preserve-me")

    def test_no_mapping_rules(self):
        out = self.classify()
        self.assertEqual(FIXTURE["d_mapping_audit"]["total_mapping_rows"], 69)
        self.assertEqual(FIXTURE["d_mapping_audit"]["package_counts"]["NORMALIZED_DATASET_V1"], 0)
        self.assertEqual(out["mapping_rule_count_for_normalized_dataset_v1"], 0)
        self.assertEqual(out["first_blocker"], "NO_D_MAPPING_ROWS_FOR_NORMALIZED_DATASET_V1")

    def test_not_d_accepted(self):
        out = self.classify()
        self.assertFalse(out["d_accepted_data"])
        self.assertFalse(out["actual_site_data"])
        self.assertFalse(out["d_canonical_db_write"])

    def test_tampered_receipt_fails_closed(self):
        bad = copy.deepcopy(self.receipt)
        bad["output_record_count"] = 4
        with self.assertRaises(FailClosedError):
            validate_b1_receipt(self.n, self.raw, self.env, bad)


if __name__ == "__main__":
    unittest.main(verbosity=2)
