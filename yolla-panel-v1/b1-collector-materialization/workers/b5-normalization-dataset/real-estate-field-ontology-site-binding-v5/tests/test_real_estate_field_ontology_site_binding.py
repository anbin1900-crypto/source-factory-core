import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from real_estate_field_ontology_site_binding import (
    BINDING_SCHEMA,
    ONTOLOGY_SCHEMA,
    REQUIRED_CANDIDATES,
    TRANSFORM_SCHEMA,
    build_datasets,
    materialize,
    read_json,
    readback,
    sha256_file,
    smoke,
    validate_datasets,
    validate_contracts,
    validate_evidence_files,
    validate_fixture,
)


class RealEstateFieldOntologySiteBindingTests(unittest.TestCase):
    def setUp(self):
        self.fixture_path = ROOT / "fixtures" / "real_estate_field_observations_v1.json"
        self.fixture = read_json(self.fixture_path)
        self.datasets, self.metrics = build_datasets(self.fixture)
        self.temp = tempfile.TemporaryDirectory()
        self.output = Path(self.temp.name) / "materialized"

    def tearDown(self):
        self.temp.cleanup()

    def mutated_fixture(self):
        return copy.deepcopy(self.fixture)

    def mutated_datasets(self):
        return copy.deepcopy(self.datasets)

    def test_01_fixture_schema(self): self.assertEqual(self.fixture["schema_version"], "REAL_ESTATE_FIELD_OBSERVATION_FIXTURE_V1")
    def test_02_two_sites(self): self.assertEqual(self.metrics["site_count"], 2)
    def test_03_twelve_source_fields(self): self.assertEqual(self.metrics["source_field_count"], 12)
    def test_04_required_candidate_set(self): self.assertEqual(set(self.metrics["candidate_counts"]), set(REQUIRED_CANDIDATES))
    def test_05_every_candidate_cross_site(self): self.assertTrue(all(count == 2 for count in self.metrics["candidate_counts"].values()))
    def test_06_three_dataset_contracts(self): self.assertEqual(set(self.datasets), {ONTOLOGY_SCHEMA, BINDING_SCHEMA, TRANSFORM_SCHEMA})
    def test_07_ontology_six_candidates(self): self.assertEqual(len(self.datasets[ONTOLOGY_SCHEMA]["records"]), 6)
    def test_08_binding_twelve_records(self): self.assertEqual(len(self.datasets[BINDING_SCHEMA]["records"]), 12)
    def test_09_transform_twenty_four_records(self): self.assertEqual(len(self.datasets[TRANSFORM_SCHEMA]["records"]), 24)
    def test_10_source_field_loss_zero(self): self.assertEqual(validate_datasets(self.fixture, self.datasets)["source_field_loss_count"], 0)
    def test_11_source_field_synthesis_zero(self): self.assertEqual(validate_datasets(self.fixture, self.datasets)["source_field_synthesis_count"], 0)
    def test_12_labels_preserved(self): self.assertTrue(all(row["source_observation"]["label"] for row in self.datasets[BINDING_SCHEMA]["records"]))
    def test_13_names_preserved(self): self.assertTrue(all(row["source_observation"]["name"] for row in self.datasets[BINDING_SCHEMA]["records"]))
    def test_14_options_preserved(self):
        rows = [row for row in self.datasets[BINDING_SCHEMA]["records"] if row["canonical_candidate_id"] == "direction"]
        self.assertTrue(all("남향" in row["source_observation"]["options"] for row in rows))
    def test_15_units_preserved(self):
        rows = [row for row in self.datasets[BINDING_SCHEMA]["records"] if row["canonical_candidate_id"] == "exclusive_area"]
        self.assertEqual({row["source_observation"]["unit"] for row in rows}, {"㎡"})
    def test_16_validation_preserved(self): self.assertTrue(all(isinstance(row["source_observation"]["validation"], dict) for row in self.datasets[BINDING_SCHEMA]["records"]))
    def test_17_sale_price_cross_site(self):
        rows = [row for row in self.datasets[BINDING_SCHEMA]["records"] if row["canonical_candidate_id"] == "sale_price"]
        self.assertEqual({row["source_field_name"] for row in rows}, {"dealOrWarrantPrc", "매매가"})
    def test_18_deposit_cross_site(self):
        rows = [row for row in self.datasets[BINDING_SCHEMA]["records"] if row["canonical_candidate_id"] == "deposit"]
        self.assertEqual({row["source_field_name"] for row in rows}, {"warrantPrc", "보증금"})
    def test_19_monthly_rent_cross_site(self):
        rows = [row for row in self.datasets[BINDING_SCHEMA]["records"] if row["canonical_candidate_id"] == "monthly_rent"]
        self.assertEqual({row["source_field_name"] for row in rows}, {"rentPrc", "월세"})
    def test_20_all_bindings_candidate(self): self.assertEqual({row["semantic_status"] for row in self.datasets[BINDING_SCHEMA]["records"]}, {"CANDIDATE"})
    def test_21_no_canonical_authority(self): self.assertTrue(all(row["canonical_authority_pointer"] is None for row in self.datasets[BINDING_SCHEMA]["records"]))
    def test_22_business_rules_unknown(self): self.assertEqual({row["business_rule_status"] for row in self.datasets[BINDING_SCHEMA]["records"]}, {"UNKNOWN"})
    def test_23_read_transforms_candidate(self):
        rows = [row for row in self.datasets[TRANSFORM_SCHEMA]["records"] if row["direction"] == "READ"]
        self.assertEqual({row["semantic_status"] for row in rows}, {"CANDIDATE"})
    def test_24_write_transforms_unknown(self):
        rows = [row for row in self.datasets[TRANSFORM_SCHEMA]["records"] if row["direction"] == "WRITE"]
        self.assertEqual({row["semantic_status"] for row in rows}, {"UNKNOWN"})
    def test_25_raw_value_preserved_by_transforms(self): self.assertTrue(all(row["preserve_raw_value"] for row in self.datasets[TRANSFORM_SCHEMA]["records"]))
    def test_26_evidence_on_every_binding(self): self.assertTrue(all(len(row["evidence_pointer"]["artifact_sha256"]) == 64 for row in self.datasets[BINDING_SCHEMA]["records"]))
    def test_27_a5_lineage_preserved(self): self.assertEqual(self.datasets[ONTOLOGY_SCHEMA]["lineage"]["a5_entity_transform_manifest"]["blob"], "ca25f197302a7dd3bc0b04e92811926645d41db6")
    def test_28_parent_v4_lineage_preserved(self): self.assertEqual(self.datasets[ONTOLOGY_SCHEMA]["lineage"]["parent_v4_pointer"]["blob"], "66d3d3d024a30629138da008368435acee491121")
    def test_29_missing_source_binding_rejected(self):
        datasets = self.mutated_datasets(); datasets[BINDING_SCHEMA]["records"].pop()
        self.assertRaises(ValueError, validate_datasets, self.fixture, datasets)
    def test_30_synthetic_binding_rejected(self):
        datasets = self.mutated_datasets(); row = copy.deepcopy(datasets[BINDING_SCHEMA]["records"][0]); row["source_field_name"] = "synthetic"; datasets[BINDING_SCHEMA]["records"].append(row)
        self.assertRaises(ValueError, validate_datasets, self.fixture, datasets)
    def test_31_missing_candidate_rejected(self):
        fixture = self.mutated_fixture(); fixture["sites"][0]["field_observations"] = [row for row in fixture["sites"][0]["field_observations"] if row["canonical_candidate_id"] != "direction"]; fixture["sites"][1]["field_observations"] = [row for row in fixture["sites"][1]["field_observations"] if row["canonical_candidate_id"] != "direction"]
        self.assertRaises(ValueError, validate_fixture, fixture)
    def test_32_unsupported_canonical_rejected(self):
        fixture = self.mutated_fixture(); fixture["sites"][0]["field_observations"][0]["semantic_status"] = "CANONICAL"
        self.assertRaises(ValueError, validate_fixture, fixture)
    def test_33_invalid_confidence_rejected(self):
        fixture = self.mutated_fixture(); fixture["sites"][0]["field_observations"][0]["confidence"] = 1.1
        self.assertRaises(ValueError, validate_fixture, fixture)
    def test_34_duplicate_transform_rejected(self):
        datasets = self.mutated_datasets(); datasets[TRANSFORM_SCHEMA]["records"].append(copy.deepcopy(datasets[TRANSFORM_SCHEMA]["records"][0]))
        self.assertRaises(ValueError, validate_datasets, self.fixture, datasets)
    def test_35_materialize_pointer(self): self.assertEqual(materialize(self.fixture, self.output)["latest_checkpoint_seq"], 2)
    def test_36_materialize_three_files(self): self.assertEqual(len(materialize(self.fixture, self.output)["datasets"]), 3)
    def test_37_checkpoint_sequence(self):
        materialize(self.fixture, self.output)
        self.assertEqual([read_json(path)["checkpoint_seq"] for path in sorted((self.output / "checkpoints").glob("*.json"))], [1, 2])
    def test_38_contextless_readback(self): materialize(self.fixture, self.output); self.assertEqual(readback(self.output)["result"], "PASS")
    def test_39_dataset_hash_readback(self):
        pointer = materialize(self.fixture, self.output)
        self.assertTrue(all(sha256_file(self.output / item["path"]) == item["sha256"] for item in pointer["datasets"].values()))
    def test_40_duplicate_materialization_noop(self):
        materialize(self.fixture, self.output); before = sorted(path.read_bytes() for path in (self.output / "checkpoints").glob("*.json")); result = materialize(self.fixture, self.output); after = sorted(path.read_bytes() for path in (self.output / "checkpoints").glob("*.json"))
        self.assertTrue(result["duplicate_materialization"]); self.assertEqual(before, after)
    def test_41_conflicting_fixture_rejected(self):
        materialize(self.fixture, self.output); fixture = self.mutated_fixture(); fixture["sites"][0]["field_observations"][0]["confidence"] = 0.91
        self.assertRaises(ValueError, materialize, fixture, self.output)
    def test_42_smoke(self): self.assertEqual(smoke(self.fixture_path, self.output)["result"], "PASS")
    def test_43_evidence_artifact_readback(self): self.assertEqual(validate_evidence_files(self.fixture, ROOT)["result"], "PASS")
    def test_44_three_contracts(self): self.assertEqual(validate_contracts(ROOT / "contracts", self.datasets)["contract_count"], 3)
    def test_45_corrupt_dataset_readback_rejected(self):
        materialize(self.fixture, self.output); path = self.output / "datasets" / f"{BINDING_SCHEMA}.json"; value = json.loads(path.read_text(encoding="utf-8")); value["records"].pop(); path.write_text(json.dumps(value), encoding="utf-8")
        self.assertRaises(ValueError, readback, self.output)


if __name__ == "__main__":
    unittest.main()
