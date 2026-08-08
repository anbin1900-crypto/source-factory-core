import copy
import json
import tempfile
import unittest
from pathlib import Path

from ten_site_blueprint_materializer import (
    PRODUCT_ARCHETYPES,
    exact_pointer,
    materialize,
    sha256_json,
    validate_input,
    write_outputs,
)


def fixture():
    return json.loads((Path(__file__).parent.parent / "fixtures" / "ten_site_input_v1.json").read_text(encoding="utf-8"))


class TestTenSiteBlueprintMaterializer(unittest.TestCase):
    def receipt(self):
        return materialize(fixture())[0]["B5_MATERIALIZATION_VALIDATION_RECEIPT_V1"]

    def test_fixture_valid(self): self.assertEqual(validate_input(fixture())["site_count"], 10)
    def test_exact_ten_sites(self): self.assertEqual(self.receipt()["site_slot_count"], 10)
    def test_eight_product_blueprints(self): self.assertEqual(self.receipt()["product_blueprint_count"], 8)
    def test_archetype_set(self): self.assertEqual({x["archetype"] for x in materialize(fixture())[0]["B5_AI_REAL_ESTATE_PRODUCT_BLUEPRINT_V1"]["records"]}, set(PRODUCT_ARCHETYPES))
    def test_source_loss_zero(self): self.assertEqual(self.receipt()["source_field_loss_count"], 0)
    def test_source_count_parity(self): self.assertEqual(self.receipt()["source_field_count"], self.receipt()["materialized_source_field_count"])
    def test_waiting_input(self): self.assertEqual(self.receipt()["execution_status"], "WAITING_INPUT")
    def test_three_waiting_producers(self): self.assertEqual(self.receipt()["waiting_producer_count"], 3)
    def test_no_live_pass_claim(self): self.assertFalse(materialize(fixture())[1]["live_pass_claimed"])
    def test_no_prior_rewrite(self): self.assertEqual(self.receipt()["prior_v6_v7_rewrite_count"], 0)
    def test_no_d_canonical_decision(self): self.assertEqual(self.receipt()["d_canonical_schema_decision_count"], 0)
    def test_no_raw_secret_or_pii(self): self.assertEqual(self.receipt()["raw_secret_or_pii_count"], 0)
    def test_no_final_submit(self): self.assertEqual(self.receipt()["final_write_or_edit_submit_count"], 0)
    def test_no_production_write(self): self.assertEqual(self.receipt()["production_write_count"], 0)
    def test_extension_canonical_authority_null(self): self.assertTrue(all(x["canonical_authority"] is None for x in materialize(fixture())[0]["B5_LOSSLESS_SITE_EXTENSION_PACKAGE_V1"]["records"]))
    def test_deterministic(self): self.assertEqual(sha256_json(materialize(fixture())), sha256_json(materialize(fixture())))
    def test_output_set(self): self.assertEqual(set(materialize(fixture())[0]), {"B5_TEN_SITE_SOURCE_ONTOLOGY_V1", "B5_AI_REAL_ESTATE_PRODUCT_BLUEPRINT_V1", "B5_LOSSLESS_SITE_EXTENSION_PACKAGE_V1", "B5_MATERIALIZATION_VALIDATION_RECEIPT_V1"})
    def test_bad_parent_rejected(self):
        value=fixture(); value["parent_v7"]["head"]="0"*40; self.assertRaises(ValueError, validate_input, value)
    def test_nine_sites_rejected(self):
        value=fixture(); value["sites"].pop(); self.assertRaises(ValueError, validate_input, value)
    def test_duplicate_site_rejected(self):
        value=fixture(); value["sites"][1]["site_id"]=value["sites"][0]["site_id"]; self.assertRaises(ValueError, validate_input, value)
    def test_target_url_rejected(self):
        value=fixture(); value["sites"][0]["site_url"]="https://guessed.invalid"; self.assertRaises(ValueError, validate_input, value)
    def test_session_rejected(self):
        value=fixture(); value["sites"][0]["session"]="secret"; self.assertRaises(ValueError, validate_input, value)
    def test_canonical_promotion_rejected(self):
        value=fixture(); value["common_ontology"][0]["mapping_status"]="CANONICAL"; self.assertRaises(ValueError, validate_input, value)
    def test_waiting_pointer_rejected(self):
        value=fixture(); value["producer_slots"]["A4"]["exact_pointer"]={}; self.assertRaises(ValueError, validate_input, value)
    def test_bound_without_exact_pointer_rejected(self):
        value=fixture(); value["producer_slots"]["A4"]["status"]="BOUND"; self.assertRaises(ValueError, validate_input, value)
    def test_bound_exact_pointer_accepted(self):
        value=fixture(); value["producer_slots"]["A4"]={"status":"BOUND","directive_comment":5224505696,"exact_pointer":{"producer_head":"a"*40,"artifact_blob":"b"*40,"artifact_sha256":"c"*64,"artifact_path":"artifact.json","json_pointer":"#/receipt"}}; self.assertEqual(materialize(value)[0]["B5_MATERIALIZATION_VALIDATION_RECEIPT_V1"]["bound_producer_count"], 1)
    def test_exact_pointer_helper(self): self.assertTrue(exact_pointer({"producer_head":"a"*40,"artifact_blob":"b"*40,"artifact_sha256":"c"*64,"artifact_path":"artifact.json","json_pointer":"#/receipt"}))
    def test_conflict_requires_two_candidates(self):
        value=fixture(); ext=value["sites"][0]["source_extensions"][0]; ext["mapping_status"]="CONFLICT"; ext["candidate_field_ids"]=["listing.title"]; self.assertRaises(ValueError, validate_input, value)
    def test_conflict_preserved(self):
        value=fixture(); ext=value["sites"][0]["source_extensions"][0]; ext["mapping_status"]="CONFLICT"; ext["candidate_field_ids"]=["listing.title","listing.status"]; ext["conflict_detail"]="AMBIGUOUS_SOURCE_SEMANTICS"; records=materialize(value)[0]["B5_LOSSLESS_SITE_EXTENSION_PACKAGE_V1"]["records"]; self.assertEqual(records[0]["mapping_status"], "CONFLICT")
    def test_raw_value_preserved(self):
        value=fixture(); value["sites"][0]["source_extensions"][0]["raw_value"]={"nested":[1,"01",None]}; records=materialize(value)[0]["B5_LOSSLESS_SITE_EXTENSION_PACKAGE_V1"]["records"]; self.assertEqual(records[0]["raw_value"], {"nested":[1,"01",None]})
    def test_write_outputs(self):
        with tempfile.TemporaryDirectory() as root:
            pointer=write_outputs(Path(__file__).parent.parent/"fixtures"/"ten_site_input_v1.json", root)
            self.assertEqual(len(list(Path(root).glob("*.json"))), 5)
            self.assertEqual(pointer["terminal"], "B5_AI_BLUEPRINT_ONTOLOGY_MATERIALIZER_PASS")


if __name__ == "__main__":
    unittest.main()
