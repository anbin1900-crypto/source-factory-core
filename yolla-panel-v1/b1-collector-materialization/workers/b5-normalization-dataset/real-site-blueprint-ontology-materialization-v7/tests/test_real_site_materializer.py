import copy
import json
import tempfile
import unittest
from pathlib import Path

from real_site_materializer import exact_pointer, materialize, sha256_json, validate_input, write_outputs


def fixture():
    return json.loads((Path(__file__).parent / "input.json").read_text(encoding="utf-8"))


class TestRealSiteMaterializer(unittest.TestCase):
    def test_parent_head(self): self.assertEqual(validate_input(fixture())["observation_count"], 1)
    def test_deterministic(self): self.assertEqual(sha256_json(materialize(fixture())[0]), sha256_json(materialize(fixture())[0]))
    def test_output_set(self): self.assertEqual(set(materialize(fixture())[0]), {"REAL_SITE_BLUEPRINT_DB_UPDATE_V1", "REAL_SITE_ONTOLOGY_BINDING_UPDATE_V1", "REAL_SITE_SITE_BINDING_VERSION_V1", "MATERIALIZATION_RECEIPT_V1"})
    def test_pending_status(self): self.assertEqual(materialize(fixture())[0]["MATERIALIZATION_RECEIPT_V1"]["execution_status"], "EXECUTION_PENDING")
    def test_no_live_claim(self): self.assertEqual(materialize(fixture())[0]["MATERIALIZATION_RECEIPT_V1"]["live_observation_count"], 0)
    def test_source_loss_zero(self): self.assertEqual(materialize(fixture())[0]["MATERIALIZATION_RECEIPT_V1"]["source_field_loss_count"], 0)
    def test_no_parent_rewrite(self): self.assertEqual(materialize(fixture())[0]["MATERIALIZATION_RECEIPT_V1"]["existing_v6_record_rewrite_count"], 0)
    def test_no_canonical_decision(self): self.assertEqual(materialize(fixture())[0]["MATERIALIZATION_RECEIPT_V1"]["d_canonical_schema_decision_count"], 0)
    def test_no_production_write(self): self.assertEqual(materialize(fixture())[0]["MATERIALIZATION_RECEIPT_V1"]["production_write_count"], 0)
    def test_unknown_preserved(self): self.assertEqual(materialize(fixture())[0]["REAL_SITE_SITE_BINDING_VERSION_V1"]["records"][0]["mapping_status"], "UNKNOWN")
    def test_four_pending_slots(self): self.assertEqual(materialize(fixture())[0]["MATERIALIZATION_RECEIPT_V1"]["pending_producer_count"], 4)
    def test_pointer_terminal(self): self.assertEqual(materialize(fixture())[1]["terminal"], "B5_REAL_SITE_BLUEPRINT_ONTOLOGY_MATERIALIZATION_READY")
    def test_duplicate_observation_rejected(self):
        x=fixture(); x["observations"].append(copy.deepcopy(x["observations"][0])); self.assertRaises(ValueError, validate_input, x)
    def test_observed_without_pointer_rejected(self):
        x=fixture(); x["observations"][0]["semantic_status"]="OBSERVED"; self.assertRaises(ValueError, validate_input, x)
    def test_canonical_mapping_rejected(self):
        x=fixture(); x["observations"][0]["mappings"][0]["status"]="CANONICAL"; self.assertRaises(ValueError, validate_input, x)
    def test_bad_parent_rejected(self):
        x=fixture(); x["parent_v6"]["head"]="0"*40; self.assertRaises(ValueError, validate_input, x)
    def test_bad_blob_rejected(self):
        x=fixture(); x["parent_v6"]["dataset_blobs"]["REAL_ESTATE_SITE_BLUEPRINT_DB_V1"]="bad"; self.assertRaises(ValueError, validate_input, x)
    def test_exact_pointer_validation(self):
        p={"producer_head":"a"*40,"artifact_blob":"b"*40,"artifact_sha256":"c"*64,"artifact_path":"x","json_pointer":"#/x"}; self.assertTrue(exact_pointer(p))
    def test_bound_bad_pointer_rejected(self):
        x=fixture(); x["producer_slots"]["B4"]["status"]="BOUND"; self.assertRaises(ValueError, materialize, x)
    def test_write_outputs(self):
        with tempfile.TemporaryDirectory() as d:
            pointer=write_outputs(Path(__file__).parent/"input.json", d); self.assertEqual(len(list(Path(d).glob("*.json"))), 5); self.assertEqual(pointer["execution_status"], "EXECUTION_PENDING")


if __name__ == "__main__": unittest.main()
