from __future__ import annotations

import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from d_ready_package_v2 import (  # noqa: E402
    PackageValidationError,
    canonical_json_bytes,
    sha256_json,
    validate_bundle,
    validate_dataset,
    validate_intake_request,
    validate_package,
    validate_processing_events,
)


def load(relative: str):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


class TestDReadyPackageV2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = load("generated/B5_D_READY_FIXTURE_PACKAGE_V2.json")
        cls.dataset = cls.bundle["normalized_dataset"]
        cls.package = cls.bundle["materialized_database_package"]
        cls.request = cls.bundle["d_intake_request"]
        cls.dataset_schema = load("contracts/NORMALIZED_DATASET_V2.schema.json")
        cls.package_schema = load("contracts/MATERIALIZED_DATABASE_PACKAGE_V2.schema.json")
        cls.request_schema = load("contracts/D_INTAKE_REQUEST_V1.schema.json")

    def test_01_schema_files_parse(self):
        self.assertEqual(self.dataset_schema["$schema"], "https://json-schema.org/draft/2020-12/schema")

    def test_02_dataset_schema_id(self):
        self.assertEqual(self.dataset_schema["$id"], "NORMALIZED_DATASET_V2.schema.json")

    def test_03_package_schema_id(self):
        self.assertEqual(self.package_schema["$id"], "MATERIALIZED_DATABASE_PACKAGE_V2.schema.json")

    def test_04_request_schema_id(self):
        self.assertEqual(self.request_schema["$id"], "D_INTAKE_REQUEST_V1.schema.json")

    def test_05_dataset_json_schema(self):
        Draft202012Validator(self.dataset_schema).validate(self.dataset)

    def test_06_package_json_schema(self):
        Draft202012Validator(self.package_schema).validate(self.package)

    def test_07_request_json_schema(self):
        Draft202012Validator(self.request_schema).validate(self.request)

    def test_08_dataset_embedded_hash(self):
        expected = sha256_json({k: v for k, v in self.dataset.items() if k != "dataset_sha256"})
        self.assertEqual(expected, self.dataset["dataset_sha256"])

    def test_09_package_embedded_hash(self):
        expected = sha256_json({k: v for k, v in self.package.items() if k != "package_sha256"})
        self.assertEqual(expected, self.package["package_sha256"])

    def test_10_request_embedded_hash(self):
        expected = sha256_json({k: v for k, v in self.request.items() if k != "request_sha256"})
        self.assertEqual(expected, self.request["request_sha256"])

    def test_11_bundle_embedded_hash(self):
        expected = sha256_json({k: v for k, v in self.bundle.items() if k != "bundle_sha256"})
        self.assertEqual(expected, self.bundle["bundle_sha256"])

    def test_12_source_key_present(self):
        self.assertEqual(self.package["source"]["source_key"], "fixture.real-estate.listings.v1")

    def test_13_source_name_present(self):
        self.assertEqual(self.package["source"]["source_name"], "Fixture Real Estate Listings")

    def test_14_official_url_present(self):
        self.assertTrue(self.package["source"]["official_source_url"].startswith("https://"))

    def test_15_authority_type_from_d_pointer(self):
        authority = self.package["authority_type"]
        self.assertEqual(authority["value"], "USER_SUPPLIED_FIXTURE")
        self.assertEqual(authority["decision_pointer_blob"], "2a76416696b7357f6e76468553d236ab0703f64e")

    def test_16_b5_does_not_create_authority_decision(self):
        self.assertFalse(self.package["authority_type"]["d_decision_created_by_b5"])

    def test_17_no_canonical_source_id(self):
        self.assertIsNone(self.package["source"]["d_canonical_source_id"])
        self.assertFalse(self.package["source"]["d_canonical_id_generation"])

    def test_18_raw_artifact_count(self):
        self.assertEqual(len(self.package["raw_artifacts"]), 2)

    def test_19_raw_mime(self):
        self.assertTrue(all(x["mime_type"] == "application/json" for x in self.package["raw_artifacts"]))

    def test_20_raw_size(self):
        self.assertEqual([x["byte_size"] for x in self.package["raw_artifacts"]], [254, 246])

    def test_21_raw_hashes(self):
        self.assertTrue(all(len(x["sha256"]) == 64 for x in self.package["raw_artifacts"]))

    def test_22_storage_pointer_binds_exact_head(self):
        self.assertTrue(all("@6dfe697363a69f83797775aa549f34614aa3748a/" in x["storage_pointer"] for x in self.package["raw_artifacts"]))

    def test_23_raw_overwrite_false(self):
        self.assertTrue(all(x["raw_overwrite"] is False for x in self.package["raw_artifacts"]))

    def test_24_secret_storage_false(self):
        self.assertTrue(all(x["secret_storage"] is False for x in self.package["raw_artifacts"]))

    def test_25_personal_data_fixture_status(self):
        self.assertTrue(all(x["personal_data_status"] == "NONE_FIXTURE" for x in self.package["raw_artifacts"]))

    def test_26_input_output_duplicate_parity(self):
        self.assertEqual(self.dataset["input_record_count"], self.dataset["output_record_count"] + self.dataset["duplicate_count"])

    def test_27_source_field_loss_zero(self):
        self.assertEqual(self.dataset["source_field_loss_count"], 0)

    def test_28_silent_drop_zero(self):
        self.assertEqual(self.dataset["silent_drop_count"], 0)

    def test_29_record_types(self):
        self.assertEqual({x["record_type"] for x in self.dataset["records"]}, {"LISTING"})

    def test_30_language_codes(self):
        self.assertEqual({x["language_code"] for x in self.dataset["records"]}, {"en"})

    def test_31_record_hashes_match_fields(self):
        for record in self.dataset["records"]:
            self.assertEqual(sha256_json(record["fields"]), record["record_hash"])

    def test_32_rejected_duplicate_preserved(self):
        rejected = self.dataset["rejected_records"][0]
        self.assertTrue(rejected["source_value_preserved"])
        self.assertEqual(rejected["source_fields"]["id"], "L-002")

    def test_33_unmapped_values_preserved(self):
        self.assertEqual(len(self.dataset["unmapped_field_preservation"]), 6)
        self.assertTrue(all(x["preserved"] for x in self.dataset["unmapped_field_preservation"]))

    def test_34_dedup_lineage_covers_all_inputs(self):
        ids = [source for values in self.dataset["dedup_lineage"].values() for source in values]
        self.assertEqual(len(ids), 4)
        self.assertEqual(len(set(ids)), 4)

    def test_35_collection_run_complete(self):
        self.assertEqual(self.package["collection_run"]["status"], "COMPLETED")
        self.assertTrue(self.package["collection_run"]["resumed"])

    def test_36_processing_event_chain(self):
        validate_processing_events(self.package["processing_event_ledger"]["entries"])

    def test_37_database_row_count(self):
        self.assertEqual(self.package["database"]["row_count"], 3)

    def test_38_database_sha(self):
        self.assertEqual(self.package["database"]["decoded_sha256"], "f03e20844e805af3105791934352f8bc3dcbeb1a165ad5c80e5d6ae5739ea14d")

    def test_39_d_contract_refs(self):
        refs = self.package["d_contract_blob_refs"]
        self.assertEqual(refs["schema_profile"]["blob_sha"], "93788d2685d25afae2d8e61c6b59e9615c51d22a")
        self.assertEqual(refs["field_mapping"]["blob_sha"], "c2a3ae441ae0e2b44fb1bb9f95670cf0887bd8ed")
        self.assertEqual(refs["validation_ruleset"]["blob_sha"], "d21291ac77f44f84fffac6d935187f3ee4690dcd")
        self.assertEqual(refs["acceptance_receipt_contract"]["blob_sha"], "9e4a6d872127410c73a73dd9f1fa3036a89acc56")

    def test_40_intake_has_no_acceptance_decision(self):
        self.assertIsNone(self.request["acceptance_decision"])

    def test_41_intake_no_write(self):
        self.assertFalse(self.request["authoritative_db_write_requested"])
        self.assertFalse(self.request["authoritative_db_write_performed"])
        self.assertEqual(self.request["postgresql_connection_count"], 0)

    def test_42_boundaries_false(self):
        boundaries = self.package["boundaries"]
        for key in ["actual_site_extraction", "d_canonical_id_generation", "d_acceptance_decision_generation", "d_canonical_db_write", "authoritative_db_write_performed", "production", "ready", "merge"]:
            self.assertFalse(boundaries[key])

    def test_43_full_custom_validation(self):
        result = validate_bundle(self.bundle)
        self.assertEqual(result["result"], "PASS")

    def test_44_bad_package_hash_rejected(self):
        mutated = copy.deepcopy(self.package)
        mutated["package_sha256"] = "0" * 64
        with self.assertRaises(PackageValidationError):
            validate_package(mutated)

    def test_45_silent_drop_rejected(self):
        mutated = copy.deepcopy(self.dataset)
        mutated["silent_drop_count"] = 1
        mutated["dataset_sha256"] = sha256_json({k: v for k, v in mutated.items() if k != "dataset_sha256"})
        with self.assertRaises(PackageValidationError):
            validate_dataset(mutated)

    def test_46_missing_record_hash_rejected(self):
        mutated = copy.deepcopy(self.dataset)
        del mutated["records"][0]["record_hash"]
        mutated["dataset_sha256"] = sha256_json({k: v for k, v in mutated.items() if k != "dataset_sha256"})
        with self.assertRaises(PackageValidationError):
            validate_dataset(mutated)

    def test_47_acceptance_decision_rejected(self):
        mutated = copy.deepcopy(self.request)
        mutated["acceptance_decision"] = "ACCEPTED"
        mutated["request_sha256"] = sha256_json({k: v for k, v in mutated.items() if k != "request_sha256"})
        with self.assertRaises(PackageValidationError):
            validate_intake_request(mutated, self.package)

    def test_48_upstream_heads_exact(self):
        upstream = self.bundle["upstream_authorities"]
        self.assertEqual(upstream["B-2"]["head"], "7244993335d6bd93a7700bdf9c3294b4c6ee94d4")
        self.assertEqual(upstream["B-3"]["head"], "f8299be24108b84af06abfe53e939c8bf68ec9dd")
        self.assertEqual(upstream["B-4"]["head"], "6dfe697363a69f83797775aa549f34614aa3748a")


if __name__ == "__main__":
    unittest.main()
