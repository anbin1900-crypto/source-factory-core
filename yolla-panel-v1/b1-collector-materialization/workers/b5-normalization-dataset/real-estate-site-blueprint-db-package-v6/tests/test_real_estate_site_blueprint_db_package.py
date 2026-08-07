import copy
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from real_estate_site_blueprint_db_package import (
    BINDING_PACKAGE_SCHEMA,
    BLUEPRINT_SCHEMA,
    CAPABILITY_SCHEMA,
    append_blueprint_record,
    build_packages,
    materialize,
    read_json,
    readback,
    sha256_json,
    smoke,
    validate_contracts,
    validate_fixture,
    validate_packages,
    validate_parent_v5,
    verify_append_and_version,
)


class RealEstateSiteBlueprintDbPackageTests(unittest.TestCase):
    def setUp(self):
        self.fixture_path = ROOT / "fixtures" / "site_blueprint_input_v1.json"
        self.fixture = read_json(self.fixture_path)
        self.packages, self.metrics, self.validation = build_packages(self.fixture)
        self.temp = tempfile.TemporaryDirectory()
        self.output = Path(self.temp.name) / "materialized"

    def tearDown(self):
        self.temp.cleanup()

    def fixture_copy(self):
        return copy.deepcopy(self.fixture)

    def packages_copy(self):
        return copy.deepcopy(self.packages)

    def assert_fixture_error(self, mutate, signature):
        value = self.fixture_copy()
        mutate(value)
        with self.assertRaisesRegex(ValueError, signature):
            validate_fixture(value)

    def test_01_fixture_schema(self): self.assertEqual(self.fixture["schema_version"], "REAL_ESTATE_SITE_BLUEPRINT_INPUT_V1")
    def test_02_parent_v5(self): self.assertEqual(validate_parent_v5(self.fixture["parent_v5"])["result"], "PASS")
    def test_03_parent_three_datasets(self): self.assertEqual(validate_parent_v5(self.fixture["parent_v5"])["dataset_count"], 3)
    def test_04_parent_record_count(self): self.assertEqual(validate_parent_v5(self.fixture["parent_v5"])["record_count"], 42)
    def test_05_two_sites(self): self.assertEqual(self.metrics["site_count"], 2)
    def test_06_four_pages(self): self.assertEqual(self.metrics["page_count"], 4)
    def test_07_six_features(self): self.assertEqual(self.metrics["feature_count"], 6)
    def test_08_eight_capabilities(self): self.assertEqual(self.metrics["capability_count"], 8)
    def test_09_twelve_fields(self): self.assertEqual(self.metrics["source_field_count"], 12)
    def test_10_three_packages(self): self.assertEqual(set(self.packages), {BLUEPRINT_SCHEMA, CAPABILITY_SCHEMA, BINDING_PACKAGE_SCHEMA})
    def test_11_blueprint_record_count(self): self.assertEqual(len(self.packages[BLUEPRINT_SCHEMA]["records"]), 2)
    def test_12_capability_record_count(self): self.assertEqual(len(self.packages[CAPABILITY_SCHEMA]["records"]), 2)
    def test_13_binding_record_count(self): self.assertEqual(len(self.packages[BINDING_PACKAGE_SCHEMA]["records"]), 12)
    def test_14_transform_count(self): self.assertEqual(self.validation["transform_candidate_count"], 24)
    def test_15_source_field_loss_zero(self): self.assertEqual(self.validation["source_field_loss_count"], 0)
    def test_16_source_field_synthesis_zero(self): self.assertEqual(self.validation["source_field_synthesis_count"], 0)
    def test_17_unknown_transform_count(self): self.assertEqual(self.validation["unknown_transform_count"], 12)
    def test_18_unknown_business_rule_count(self): self.assertEqual(self.validation["unknown_business_rule_count"], 12)
    def test_19_no_unsupported_canonical(self): self.assertEqual(self.validation["canonical_confirmed_without_authority_count"], 0)
    def test_20_source_observations_preserved(self):
        source={(s["site_id"],f["source_field_name"]):f["source_observation"] for s in self.fixture["sites"] for f in s["fields"]}
        actual={(r["site_id"],r["source_field_name"]):r["source_observation"] for r in self.packages[BINDING_PACKAGE_SCHEMA]["records"]}
        self.assertEqual(source, actual)
    def test_21_all_blueprints_append_only(self): self.assertTrue(all(r["record_policy"] == "APPEND_ONLY" for r in self.packages[BLUEPRINT_SCHEMA]["records"]))
    def test_22_lineage_key_shared(self): self.assertEqual(len({p["lineage"]["lineage_key"] for p in self.packages.values()}), 1)
    def test_23_parent_head_bound(self): self.assertEqual(self.packages[BLUEPRINT_SCHEMA]["lineage"]["parent_v5_head"], self.fixture["parent_v5"]["head"])
    def test_24_parent_blobs_bound(self): self.assertEqual(len(self.packages[BLUEPRINT_SCHEMA]["lineage"]["parent_dataset_blobs"]), 3)
    def test_25_contracts(self): self.assertEqual(validate_contracts(ROOT / "contracts", self.packages)["contract_count"], 3)
    def test_26_append_new_site(self):
        records=self.packages[BLUEPRINT_SCHEMA]["records"]
        record=copy.deepcopy(records[0]); record["site_id"]="SITE-X"; record["blueprint_record_id"]="SITE-X::BLUEPRINT::V1"
        result=append_blueprint_record(records, record)
        self.assertEqual(len(result), len(records)+1)
    def test_27_append_preserves_existing_hashes(self):
        records=self.packages[BLUEPRINT_SCHEMA]["records"]
        before={r["blueprint_record_id"]:sha256_json(r) for r in records}
        record=copy.deepcopy(records[0]); record["site_id"]="SITE-X"; record["blueprint_record_id"]="SITE-X::BLUEPRINT::V1"
        result=append_blueprint_record(records, record)
        after={r["blueprint_record_id"]:sha256_json(r) for r in result if r["blueprint_record_id"] in before}
        self.assertEqual(before, after)
    def test_28_append_duplicate_rejected(self):
        records=self.packages[BLUEPRINT_SCHEMA]["records"]
        with self.assertRaisesRegex(ValueError, "BLUEPRINT_RECORD_ALREADY_EXISTS"):
            append_blueprint_record(records, records[0])
    def test_29_append_version_verification(self): self.assertEqual(verify_append_and_version(self.packages)["result"], "PASS")
    def test_30_existing_record_rewrite_zero(self): self.assertEqual(verify_append_and_version(self.packages)["existing_record_rewrite_count"], 0)
    def test_31_new_site_append_one(self): self.assertEqual(verify_append_and_version(self.packages)["new_site_append_count"], 1)
    def test_32_new_version_append_one(self): self.assertEqual(verify_append_and_version(self.packages)["new_version_append_count"], 1)
    def test_33_version_lineage(self): self.assertEqual(verify_append_and_version(self.packages)["version_lineage"], "PASS")
    def test_34_materialize_three_packages(self): self.assertEqual(len(materialize(self.fixture, self.output)["packages"]), 3)
    def test_35_checkpoint_sequence(self): self.assertEqual(materialize(self.fixture, self.output)["latest_checkpoint_seq"], 3)
    def test_36_contextless_readback(self): materialize(self.fixture, self.output); self.assertEqual(readback(self.output)["result"], "PASS")
    def test_37_contextless_package_count(self): materialize(self.fixture, self.output); self.assertEqual(readback(self.output)["package_count"], 3)
    def test_38_duplicate_materialization_noop(self): materialize(self.fixture, self.output); self.assertTrue(materialize(self.fixture, self.output)["duplicate_materialization"])
    def test_39_conflicting_fixture_rejected(self):
        materialize(self.fixture, self.output); value=self.fixture_copy(); value["cycle_id"]="CONFLICT"
        with self.assertRaisesRegex(ValueError, "CONFLICTING_FIXTURE"):
            materialize(value, self.output)
    def test_40_smoke(self): self.assertEqual(smoke(self.fixture_path, self.output)["result"], "PASS")
    def test_41_smoke_loss_zero(self): self.assertEqual(smoke(self.fixture_path, self.output)["source_field_loss_count"], 0)
    def test_42_smoke_no_rewrite(self): self.assertEqual(smoke(self.fixture_path, self.output)["existing_record_rewrite_count"], 0)
    def test_43_duplicate_site_rejected(self): self.assert_fixture_error(lambda v: v["sites"].append(copy.deepcopy(v["sites"][0])), "DUPLICATE_OR_MISSING_SITE_ID")
    def test_44_canonical_without_authority_rejected(self): self.assert_fixture_error(lambda v: v["sites"][0]["fields"][0].update({"semantic_status":"CANONICAL"}), "UNSUPPORTED_CANONICAL")
    def test_45_missing_evidence_rejected(self): self.assert_fixture_error(lambda v: v["sites"][0]["fields"][0]["evidence_pointer"].update({"blob":"bad"}), "FIELD_EVIDENCE_INVALID")
    def test_46_invalid_write_promotion_rejected(self): self.assert_fixture_error(lambda v: v["sites"][0]["fields"][0]["transform_candidates"][1].update({"semantic_status":"CANDIDATE"}), "TRANSFORM_STATUS_MISMATCH")
    def test_47_source_field_loss_rejected(self): self.assert_fixture_error(lambda v: v["sites"][0]["fields"].pop(), "PARENT_BINDING_COUNT_PARITY_FAILURE")
    def test_48_contract_const_rejected(self):
        value=self.packages_copy(); value[BLUEPRINT_SCHEMA]["schema_version"]="WRONG"
        with self.assertRaisesRegex(ValueError, "PACKAGE_CONTRACT_MISMATCH"):
            validate_contracts(ROOT / "contracts", value)
    def test_49_package_source_observation_rewrite_rejected(self):
        value=self.packages_copy(); value[BINDING_PACKAGE_SCHEMA]["records"][0]["source_observation"]["label"]="REWRITE"
        with self.assertRaisesRegex(ValueError, "SOURCE_OBSERVATION_REWRITE"):
            validate_packages(self.fixture, value)
    def test_50_package_duplicate_transform_rejected(self):
        value=self.packages_copy(); value[BINDING_PACKAGE_SCHEMA]["records"][1]["transform_candidates"][0]["transform_candidate_id"]=value[BINDING_PACKAGE_SCHEMA]["records"][0]["transform_candidates"][0]["transform_candidate_id"]
        with self.assertRaisesRegex(ValueError, "DUPLICATE_OR_MISSING_TRANSFORM_ID"):
            validate_packages(self.fixture, value)


if __name__ == "__main__":
    unittest.main()
