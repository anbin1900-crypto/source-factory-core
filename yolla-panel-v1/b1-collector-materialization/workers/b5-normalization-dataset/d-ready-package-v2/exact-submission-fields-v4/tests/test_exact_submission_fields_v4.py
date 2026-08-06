from __future__ import annotations
import json, re, sys, unittest
from datetime import datetime
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/"src"))
from validate_exact_submission_fields_v4 import load, sha256_without, validate_all

class TestExactSubmissionFieldsV4(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = load("D_INTAKE_REQUEST_V1.schema.json")
        cls.request = load("D_INTAKE_REQUEST_V1.json")
        cls.bundle = load("B5_D_READY_FIXTURE_PACKAGE_V2.json")

    def test_01_schema_valid(self): Draft202012Validator.check_schema(self.schema)
    def test_02_request_schema_valid(self): Draft202012Validator(self.schema, format_checker=FormatChecker()).validate(self.request)
    def test_03_four_exact_fields_present(self): self.assertTrue(all(k in self.request for k in ["producer_head","package_blob_or_storage_pointer","record_count","submitted_at"]))
    def test_04_producer_head_exact(self): self.assertEqual(self.request["producer_head"], "59405edba453e2f8512dfddd969ba1ae899526ae")
    def test_05_producer_head_format(self): self.assertRegex(self.request["producer_head"], r"^[0-9a-f]{40}$")
    def test_06_package_blob_exact(self): self.assertEqual(self.request["package_blob_or_storage_pointer"], "3a204094b4a81486646f863228b5059745fba758")
    def test_07_package_blob_format(self): self.assertRegex(self.request["package_blob_or_storage_pointer"], r"^[0-9a-f]{40}$")
    def test_08_package_sha_unchanged(self): self.assertEqual(self.request["package_sha256"], "f97df341fedb2a81e681b1f00fb3f857b95b425de0fe5ce264bb28a5e18905aa")
    def test_09_record_count_integer(self): self.assertIsInstance(self.request["record_count"], int)
    def test_10_record_count_package_parity(self): self.assertEqual(self.request["record_count"], self.bundle["producer_package_ref"]["record_count"])
    def test_11_record_count_dataset_parity(self): self.assertEqual(self.request["record_count"], self.request["preservation"]["record_count"])
    def test_12_record_count_sqlite_parity(self): self.assertEqual(self.request["record_count"], self.request["preservation"]["sqlite_row_count"])
    def test_13_submitted_at_timezone(self): self.assertIsNotNone(datetime.fromisoformat(self.request["submitted_at"]).tzinfo)
    def test_14_request_hash(self): self.assertEqual(sha256_without(self.request, "request_sha256"), self.request["request_sha256"])
    def test_15_bundle_hash(self): self.assertEqual(sha256_without(self.bundle, "bundle_sha256"), self.bundle["bundle_sha256"])
    def test_16_d1_addendum_bound(self): self.assertEqual(self.request["receipt_procedure_ref"]["v1_1_addendum_blob"], "58408175b1683cf566e201b57bd17b5e19c459e8")
    def test_17_d1_decision_bound(self): self.assertEqual(self.request["package_compatibility_decision_ref"]["blob"], "fb1e8f7b82a4516a06fbe58c27da89b46a746431")
    def test_18_tree_v2_bound(self): self.assertEqual(self.request["tree_binding_manifest_ref"]["v2_blob"], "38692279e691ab1de4a97017246c2c85b4ee6d3e")
    def test_19_request_descendant_evidence(self): self.assertEqual(self.bundle["producer_package_ref"]["request_commit_descendant_of_producer_head"], "PASS")
    def test_20_source_field_loss_zero(self): self.assertEqual(self.request["preservation"]["source_field_loss_count"], 0)
    def test_21_silent_drop_zero(self): self.assertEqual(self.request["preservation"]["silent_drop_count"], 0)
    def test_22_no_d_id_or_acceptance(self): self.assertEqual((self.request["producer_generated_canonical_id"], self.request["producer_acceptance_claim"]), (False, False))
    def test_23_forbidden_boundaries_false(self): self.assertTrue(all(v is False for v in self.request["safety"].values()))
    def test_24_full_validator(self): self.assertEqual(validate_all()["submission_fields"], "PASS_4_OF_4")

if __name__ == "__main__":
    unittest.main()
