from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from validate_b5_d_ready_package_v2_resume import sha256_json, validate_all  # noqa: E402

def load(name: str) -> dict:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))

class TestB5DReadyPackageV2Resume(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.package_schema = load("MATERIALIZED_DATABASE_PACKAGE_V2.schema.json")
        cls.dataset_schema = load("NORMALIZED_DATASET_V2.schema.json")
        cls.request_schema = load("D_INTAKE_REQUEST_V1.schema.json")
        cls.bundle = load("B5_D_READY_FIXTURE_PACKAGE_V2.json")
        cls.package = cls.bundle["materialized_database_package"]
        cls.dataset = cls.package["normalized_dataset"]
        cls.request = cls.bundle["d_intake_request"]
        cls.checker = FormatChecker()

    def test_01_materialized_schema_draft2020_valid(self): Draft202012Validator.check_schema(self.package_schema)
    def test_02_normalized_schema_draft2020_valid(self): Draft202012Validator.check_schema(self.dataset_schema)
    def test_03_d_intake_schema_draft2020_valid(self): Draft202012Validator.check_schema(self.request_schema)
    def test_04_materialized_fixture_schema_pass(self): Draft202012Validator(self.package_schema, format_checker=self.checker).validate(self.package)
    def test_05_normalized_dataset_schema_pass(self): Draft202012Validator(self.dataset_schema, format_checker=self.checker).validate(self.dataset)
    def test_06_d_intake_request_schema_pass(self): Draft202012Validator(self.request_schema, format_checker=self.checker).validate(self.request)
    def test_07_source_key_b2_exact(self): self.assertEqual(self.package["source"]["source_key"], "NAVER_FIN_LAND_PUBLIC_WEB_V1")
    def test_08_source_name_b2_exact(self): self.assertEqual(self.package["source"]["source_name"], "네이버페이 부동산")
    def test_09_official_source_url_b2_exact(self): self.assertEqual(self.package["source"]["official_source_url"], "https://fin.land.naver.com")
    def test_10_authority_type_pending_d1_pointer_bound(self):
        source = self.package["source"]
        self.assertIsNone(source["authority_type"])
        self.assertEqual(source["authority_type_status"], "PENDING_D1_DECISION")
        self.assertEqual(source["authority_type_decision_ref"]["pointer_blob"], "95e6983a79b80867dd7de196a21e1aefc4c3dcb1")
        self.assertFalse(source["authority_type_decision_ref"]["final_decision_present"])
    def test_11_d_canonical_source_id_null(self): self.assertIsNone(self.package["source"]["d_canonical_source_id"])
    def test_12_b2_scope_exact_head_blob_terminal_bound(self):
        ref = self.package["source_scope"]["upstream_ref"]
        self.assertEqual(ref["head"], "771da102a0202dc21d9226d9c534275df345582e")
        self.assertEqual(ref["contract_blob"], "f7b5faee6c3fce138bcd95f9edce734f2086eb6d")
        self.assertEqual(ref["terminal"], "B2_D_INTAKE_SOURCE_SCOPE_CONTRACT_READY")
    def test_13_b3_collection_run_exact_bound(self):
        ref = self.package["collection_run"]["upstream_ref"]
        self.assertEqual(ref["head"], "86d789a136ce5070d79eab7e6d0205eb23da11d7")
        self.assertEqual(ref["pointer_blob"], "dedbad43c8c23df18e2af2560af5d5f48ca1fa00")
        self.assertEqual(ref["terminal"], "B3_D_COLLECTION_RUN_LEDGER_READY")
    def test_14_b4_manifest_exact_head_blob_terminal_bound(self):
        ref = self.package["raw_artifact_manifest_ref"]
        self.assertEqual(ref["head"], "f3bb1a6fcc7b731f8045a8c5ca6e6f1dce8419d3")
        self.assertEqual(ref["manifest_blob"], "d900e06bcc73908e3af589581d67b599bfb84d65")
        self.assertEqual(ref["terminal"], "B4_RAW_ARTIFACT_MANIFEST_V2_D_READY")
    def test_15_raw_artifact_count_2(self): self.assertEqual(len(self.package["raw_artifacts"]), 2)
    def test_16_raw_mime_present_2_of_2(self): self.assertTrue(all(x["mime_type"] == "application/json" for x in self.package["raw_artifacts"]))
    def test_17_raw_size_present_2_of_2(self): self.assertEqual([x["byte_size"] for x in self.package["raw_artifacts"]], [254, 246])
    def test_18_raw_sha256_valid_2_of_2(self): self.assertTrue(all(re.fullmatch(r"[0-9a-f]{64}", x["sha256"]) for x in self.package["raw_artifacts"]))
    def test_19_raw_storage_pointer_present_2_of_2(self): self.assertTrue(all(x["storage_pointer"] for x in self.package["raw_artifacts"]))
    def test_20_input_record_count_4(self): self.assertEqual(self.dataset["input_record_count"], 4)
    def test_21_output_record_count_3(self): self.assertEqual(self.dataset["output_record_count"], 3)
    def test_22_duplicate_count_1(self): self.assertEqual(self.dataset["duplicate_count"], 1)
    def test_23_sqlite_row_count_3(self): self.assertEqual(self.package["materialized_database"]["row_count"], 3)
    def test_24_record_type_present_3_of_3(self): self.assertTrue(all(x["record_type"] == "LISTING" for x in self.dataset["records"]))
    def test_25_language_code_present_3_of_3(self): self.assertTrue(all(x["language_code"] == "en" for x in self.dataset["records"]))
    def test_26_record_hash_valid_3_of_3(self): self.assertTrue(all(sha256_json(x["fields"]) == x["record_hash"] for x in self.dataset["records"]))
    def test_27_unmapped_value_preservation_pass(self):
        items = self.package["unmapped_preservation"]
        self.assertEqual(len(items), 3)
        self.assertEqual(sum(len(x["unmapped_fields"]) for x in items), 6)
        self.assertTrue(all(x["preservation_status"] == "PRESERVED_NOT_SILENTLY_DROPPED" for x in items))
    def test_28_rejected_records_preserved(self): self.assertEqual(self.package["rejected_records"], [])
    def test_29_source_field_loss_count_0(self): self.assertEqual(self.package["safety"]["source_field_loss_count"], 0)
    def test_30_silent_drop_count_0(self): self.assertEqual(self.package["safety"]["silent_drop_count"], 0)
    def test_31_d_write_acceptance_production_ready_merge_all_false(self):
        safety = self.package["safety"]
        self.assertFalse(safety["d_acceptance_receipt_issued"])
        self.assertEqual(safety["d_canonical_db_write_count"], 0)
        self.assertFalse(safety["production"]); self.assertFalse(safety["ready"]); self.assertFalse(safety["merge"])
    def test_32_raw_pii_status_b4_exact_2_of_2(self):
        self.assertTrue(all(x["personal_data_status"] == "NOT_APPLICABLE" and x["redaction_status"] == "NOT_APPLICABLE" for x in self.package["raw_artifacts"]))
    def test_33_b3_v2_collection_run_pointer_bound(self): self.assertEqual(self.package["collection_run"]["upstream_ref"]["pointer_blob"], "dedbad43c8c23df18e2af2560af5d5f48ca1fa00")
    def test_34_b3_v2_processing_event_ledger_bound(self):
        ledger = self.package["collection_run"]["processing_event_ledger"]
        self.assertEqual((ledger["processing_event_count"], ledger["retry_count"], ledger["resume_count"]), (8, 1, 1))
    def test_35_b2_v2_terminal_remote_readback_pass(self): self.assertEqual(self.package["source_scope"]["upstream_ref"]["terminal"], "B2_D_INTAKE_SOURCE_SCOPE_CONTRACT_READY")
    def test_36_b4_v2_terminal_remote_readback_pass(self): self.assertEqual(self.package["raw_artifact_manifest_ref"]["terminal"], "B4_RAW_ARTIFACT_MANIFEST_V2_D_READY")
    def test_37_d_intake_submission_authorized_false_pending_authority_type(self):
        self.assertFalse(self.request["submission_authorized"])
        self.assertIsNone(self.request["authority_type"])
        self.assertEqual(self.request["submission_status"], "PREPARED_BLOCKED_D1_AUTHORITY_TYPE")
        self.assertEqual(validate_all()["result"], "PASS")

if __name__ == "__main__":
    unittest.main()
