from __future__ import annotations
import json, re, sys, unittest
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/"src"))
from validate_b5_d_ready_package_v2_ready import sha256_json, validate_all

def load(name):
    return json.loads((ROOT/name).read_text(encoding="utf-8"))

class TestB5DReadyPackageV2Ready(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = load("B5_D_READY_FIXTURE_PACKAGE_V2.json")
        cls.package = cls.bundle["materialized_database_package"]
        cls.dataset = cls.package["normalized_dataset"]
        cls.request = cls.bundle["d_intake_request"]
        cls.ps = load("MATERIALIZED_DATABASE_PACKAGE_V2.schema.json")
        cls.ds = load("NORMALIZED_DATASET_V2.schema.json")
        cls.rs = load("D_INTAKE_REQUEST_V1.schema.json")
        cls.checker = FormatChecker()

    def test_01_package_schema_valid(self): Draft202012Validator.check_schema(self.ps)
    def test_02_dataset_schema_valid(self): Draft202012Validator.check_schema(self.ds)
    def test_03_request_schema_valid(self): Draft202012Validator.check_schema(self.rs)
    def test_04_package_instance_valid(self): Draft202012Validator(self.ps, format_checker=self.checker).validate(self.package)
    def test_05_dataset_instance_valid(self): Draft202012Validator(self.ds, format_checker=self.checker).validate(self.dataset)
    def test_06_request_instance_valid(self): Draft202012Validator(self.rs, format_checker=self.checker).validate(self.request)
    def test_07_common_directive_blob(self): self.assertEqual(self.bundle["common_directive"]["blob"], "0f18e0e999ca1b65be0999e329000deff1831645")
    def test_08_control_pointer_blob(self): self.assertEqual(self.bundle["latest_control_pointer"]["blob"], "c5bee6300675e1c66a3b1fead364851e45a277e4")
    def test_09_d1_authority_type(self): self.assertEqual(self.package["source"]["authority_type"], "OFFICIAL_SECONDARY")
    def test_10_d1_authority_scope(self): self.assertEqual(self.package["source"]["authority_scope"], "SECONDARY_COMMERCIAL_PLATFORM_OBSERVED_PRESENTATION")
    def test_11_d1_decision_blob(self): self.assertEqual(self.package["source"]["authority_decision_ref"]["decision_blob"], "6bf779b937bf2bea761780315b22692ccca07ad9")
    def test_12_no_pending_authority(self):
        text=json.dumps(self.bundle, ensure_ascii=False)
        self.assertNotIn("PENDING_D1_DECISION", text)
        self.assertNotIn("PENDING_AUTHORITY", text)
        self.assertNotIn("PROVISIONAL_", text)
    def test_13_source_key_b001(self): self.assertEqual(self.package["source"]["source_key"], "NAVER_FIN_LAND_PUBLIC_WEB_V1")
    def test_14_no_canonical_source_id(self): self.assertIsNone(self.package["source"]["d_canonical_source_id"])
    def test_15_b001_owner_d1(self): self.assertEqual(self.package["mapping_addendum_ref"]["B001"]["canonical_id_owner"], "D-1_ONLY")
    def test_16_b013_all_languages_present(self): self.assertEqual([r["language_code"] for r in self.dataset["records"]], ["en","en","en"])
    def test_17_b013_no_silent_default(self): self.assertFalse(self.package["mapping_addendum_ref"]["B013"]["silent_default"])
    def test_18_b014_record_hash_count(self): self.assertEqual(len(self.dataset["records"]), 3)
    def test_19_b014_hashes_recomputed(self):
        for rec in self.dataset["records"]:
            material={k:rec[k] for k in ["source_record_id","title","record_type","language_code","fields","raw_text","locator"]}
            self.assertEqual(sha256_json(material), rec["record_hash"])
    def test_20_b014_raw_substitution_false(self): self.assertFalse(self.dataset["record_hash_policy"]["raw_artifact_sha256_substitution"])
    def test_21_b2_head(self): self.assertEqual(self.package["source_scope"]["upstream_ref"]["head"], "771da102a0202dc21d9226d9c534275df345582e")
    def test_22_b2_contract_blob(self): self.assertEqual(self.package["source_scope"]["upstream_ref"]["contract_blob"], "f7b5faee6c3fce138bcd95f9edce734f2086eb6d")
    def test_23_b3_head(self): self.assertEqual(self.package["collection_run"]["upstream_ref"]["head"], "86d789a136ce5070d79eab7e6d0205eb23da11d7")
    def test_24_b3_ledger_preserved(self): self.assertEqual(self.package["collection_run"]["event_count"], 8)
    def test_25_b4_head(self): self.assertEqual(self.package["raw_artifact_manifest_ref"]["head"], "f3bb1a6fcc7b731f8045a8c5ca6e6f1dce8419d3")
    def test_26_b4_manifest_blob(self): self.assertEqual(self.package["raw_artifact_manifest_ref"]["manifest_blob"], "d900e06bcc73908e3af589581d67b599bfb84d65")
    def test_27_raw_artifact_count(self): self.assertEqual(len(self.package["raw_artifacts"]), 2)
    def test_28_raw_pii_exact(self): self.assertTrue(all(x["personal_data_status"]=="NOT_APPLICABLE" for x in self.package["raw_artifacts"]))
    def test_29_raw_redaction_exact(self): self.assertTrue(all(x["redaction_status"]=="NOT_APPLICABLE" for x in self.package["raw_artifacts"]))
    def test_30_input_output_duplicate(self): self.assertEqual((self.dataset["input_record_count"],self.dataset["output_record_count"],self.dataset["duplicate_count"]),(4,3,1))
    def test_31_fields_preserved(self): self.assertEqual([r["fields"] for r in self.dataset["records"]],[{"address":"Seoul","extra":{"floor":3,"tags":["a","b"]},"id":"L-001","name":"Alpha","price":100},{"address":"Busan","id":"L-002","name":"Beta","note":"preserve-me","price":200},{"address":"Incheon","id":"L-003","name":"Gamma","price":300,"unknown_field":{"x":1}}])
    def test_32_unmapped_preserved(self): self.assertEqual(sum(len(x["unmapped_fields"]) for x in self.dataset["records"]), 6)
    def test_33_dedup_lineage_preserved(self): self.assertEqual(self.dataset["dedup_lineage"]["L-002"], ["raw-001-b8ab938fbc39b3f3:1","raw-002-c2bd6c5ae5921e52:0"])
    def test_34_duplicate_not_silent(self): self.assertFalse(self.package["duplicate_preservation"][0]["silently_dropped"])
    def test_35_source_field_loss_zero(self): self.assertEqual(self.package["safety"]["source_field_loss_count"], 0)
    def test_36_silent_drop_zero(self): self.assertEqual(self.package["safety"]["silent_drop_count"], 0)
    def test_37_sqlite_row_count(self): self.assertEqual(self.package["materialized_database"]["row_count"], 3)
    def test_38_mapping_addendum_blob(self): self.assertEqual(self.package["d_contract_refs"]["addendum"], "118d6403dd5db47afafb982991f8fd9a51f35f28")
    def test_39_receipt_procedure_blob(self): self.assertEqual(self.package["b_receipt_procedure_ref"]["blob"], "2a8b7c1b04924728cce14dc21c225ad09598905f")
    def test_40_tree_manifest_blob(self): self.assertEqual(self.package["tree_binding_manifest_ref"]["blob"], "dd37ba938b32d9c03b9bfc50d6e6d638e9d4b7fd")
    def test_41_no_acceptance_claim(self): self.assertFalse(self.package["safety"]["d_acceptance_claim"])
    def test_42_no_db_write(self): self.assertEqual(self.package["safety"]["d_canonical_db_write_count"], 0)
    def test_43_no_production_ready_merge(self): self.assertEqual((self.package["safety"]["production"],self.package["safety"]["ready"],self.package["safety"]["merge"]),(False,False,False))
    def test_44_ready_for_b6_event(self): self.assertEqual((self.package["integration_readiness"],self.package["next_event"]),("READY_FOR_B6_D_PACKAGE_REPREFLIGHT","B6_D_PACKAGE_REPREFLIGHT"))
    def test_45_full_validator(self): self.assertEqual(validate_all()["terminal"], "B5_D_READY_PACKAGE_V2_READY")

if __name__ == "__main__":
    unittest.main()
