#!/usr/bin/env python3
from __future__ import annotations
import copy
import json
import unittest
from pathlib import Path
from validate_source_record_lineage import LineageValidationError, canonical_sha256, validate_lineage_bundle

ROOT = Path(__file__).resolve().parent
SCHEMA = json.loads((ROOT / "SOURCE_RECORD_LINEAGE_CONTRACT_V1.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((ROOT / "SOURCE_RECORD_LINEAGE_FIXTURE_V1.json").read_text(encoding="utf-8"))

class SourceRecordLineageTests(unittest.TestCase):
    def expect_code(self, code, fn):
        with self.assertRaises(LineageValidationError) as ctx:
            fn()
        self.assertEqual(ctx.exception.code, code)

    def test_01_fixture_passes_contract_and_semantics(self):
        self.assertEqual(validate_lineage_bundle(copy.deepcopy(FIXTURE), SCHEMA)["status"], "PASS")

    def test_02_required_seven_fields_present(self):
        required = {"SOURCE_RECORD_ID","SOURCE_FIELD","SOURCE_VALUE","PROVENANCE_REF","EVIDENCE_REF","VALIDATION_STATUS","REJECTION_REASON"}
        self.assertTrue(all(required.issubset(entry) for entry in FIXTURE["lineage_entries"]))

    def test_03_every_source_field_has_exactly_one_lineage(self):
        result = validate_lineage_bundle(copy.deepcopy(FIXTURE), SCHEMA)
        self.assertEqual(result["source_field_count"], result["lineage_entry_count"])

    def test_04_nested_source_value_is_preserved(self):
        entry = next(e for e in FIXTURE["lineage_entries"] if e["SOURCE_FIELD"] == "geo")
        self.assertEqual(entry["SOURCE_VALUE"], {"lat": 37.5001, "lng": 127.0364})
        self.assertEqual(entry["SOURCE_VALUE_SHA256"], canonical_sha256(entry["SOURCE_VALUE"]))

    def test_05_unmapped_field_is_retained(self):
        entry = next(e for e in FIXTURE["lineage_entries"] if e["SOURCE_FIELD"] == "mystery_code")
        self.assertEqual(entry["SOURCE_VALUE"], "X-999")
        self.assertEqual(entry["REJECTION_REASON"], "UNMAPPED_FIELD")

    def test_06_missing_required_value_is_retained(self):
        entry = next(e for e in FIXTURE["lineage_entries"] if e["SOURCE_FIELD"] == "required_owner_name")
        self.assertIsNone(entry["SOURCE_VALUE"])
        self.assertEqual(entry["REJECTION_REASON"], "MISSING_REQUIRED_VALUE")

    def test_07_format_error_value_is_retained(self):
        entry = next(e for e in FIXTURE["lineage_entries"] if e["SOURCE_FIELD"] == "approved_at")
        self.assertEqual(entry["SOURCE_VALUE"], "2026/99/99")
        self.assertEqual(entry["REJECTION_REASON"], "FORMAT_ERROR")

    def test_08_silent_drop_rejected(self):
        bad = copy.deepcopy(FIXTURE)
        bad["lineage_entries"] = bad["lineage_entries"][:-1]
        bad["coverage_summary"]["lineage_entry_count"] -= 1
        bad["coverage_summary"]["rejected_count"] -= 1
        self.expect_code("SILENT_DROP_DETECTED", lambda: validate_lineage_bundle(bad))

    def test_09_duplicate_field_lineage_rejected(self):
        bad = copy.deepcopy(FIXTURE)
        duplicate = copy.deepcopy(bad["lineage_entries"][0])
        duplicate["LINEAGE_ENTRY_ID"] += "-DUP"
        bad["lineage_entries"].append(duplicate)
        self.expect_code("DUPLICATE_SOURCE_FIELD_LINEAGE", lambda: validate_lineage_bundle(bad))

    def test_10_source_value_mutation_rejected(self):
        bad = copy.deepcopy(FIXTURE)
        bad["lineage_entries"][0]["SOURCE_VALUE"] = "MUTATED"
        self.expect_code("SOURCE_VALUE_MUTATED", lambda: validate_lineage_bundle(bad))

    def test_11_digest_mismatch_rejected(self):
        bad = copy.deepcopy(FIXTURE)
        bad["lineage_entries"][0]["SOURCE_VALUE_SHA256"] = "0" * 64
        self.expect_code("SOURCE_VALUE_DIGEST_MISMATCH", lambda: validate_lineage_bundle(bad))

    def test_12_missing_provenance_rejected(self):
        bad = copy.deepcopy(FIXTURE)
        bad["lineage_entries"][0]["PROVENANCE_REF"] = ""
        self.expect_code("PROVENANCE_REF_MISMATCH", lambda: validate_lineage_bundle(bad))

    def test_13_missing_evidence_rejected(self):
        bad = copy.deepcopy(FIXTURE)
        bad["lineage_entries"][0]["EVIDENCE_REF"] = ""
        self.expect_code("EVIDENCE_REF_MISMATCH", lambda: validate_lineage_bundle(bad))

    def test_14_rejected_without_reason_rejected(self):
        bad = copy.deepcopy(FIXTURE)
        rejected = next(e for e in bad["lineage_entries"] if e["VALIDATION_STATUS"] == "REJECTED")
        rejected["REJECTION_REASON"] = None
        self.expect_code("REJECTED_WITHOUT_REASON", lambda: validate_lineage_bundle(bad))

    def test_15_actual_binding_without_exact_head_path_blob_rejected(self):
        bad = copy.deepcopy(FIXTURE)
        bad["source_authority"]["mode"] = "B1_EXACT_AUTHORITY"
        bad["source_authority"]["actual_input_used"] = True
        bad["source_authority"]["first_blocker"] = None
        self.expect_code("B1_EXACT_AUTHORITY_INCOMPLETE", lambda: validate_lineage_bundle(bad))

    def test_16_fixture_cannot_claim_actual_input(self):
        bad = copy.deepcopy(FIXTURE)
        bad["source_authority"]["actual_input_used"] = True
        self.expect_code("FIXTURE_ACTUAL_INPUT_OVERCLAIM", lambda: validate_lineage_bundle(bad))

    def test_17_coverage_summary_mismatch_rejected(self):
        bad = copy.deepcopy(FIXTURE)
        bad["coverage_summary"]["accepted_count"] += 1
        self.expect_code("COVERAGE_SUMMARY_MISMATCH", lambda: validate_lineage_bundle(bad))

    def test_18_safety_boundaries_all_false(self):
        self.assertTrue(all(value is False for value in FIXTURE["safety"].values()))

if __name__ == "__main__":
    unittest.main(verbosity=2)
