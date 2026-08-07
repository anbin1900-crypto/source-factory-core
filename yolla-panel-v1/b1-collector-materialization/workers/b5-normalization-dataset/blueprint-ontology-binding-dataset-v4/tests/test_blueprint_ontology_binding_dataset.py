import copy
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from blueprint_ontology_binding_dataset import (
    BlueprintOntologyBindingDataset,
    DATASET_SCHEMAS,
    read_json,
    read_xlsx,
    sha_file,
    smoke,
)


class BlueprintOntologyBindingDatasetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "store"
        self.fixture_path = ROOT / "fixtures" / "blueprint_ontology_fixture_v1.json"
        self.bundle = read_json(self.fixture_path)
        self.store = BlueprintOntologyBindingDataset(self.root, command_id="CMD-4", session_id="SESSION-4", worker_id="WORKER-4", dataset_id="DATASET-4", recipe_version="v4")
        self.store.initialize()

    def tearDown(self):
        self.temp.cleanup()

    def complete(self):
        return self.store.mark_browser_complete(event_id="COMPLETE-4", completed_at="2026-08-08T13:10:00+09:00")

    def materialize(self, bundle=None, **overrides):
        args = {
            "result_event_id": "EVENT-4",
            "result_id": "RESULT-4",
            "blueprint_id": "BLUEPRINT-4",
            "bundle": self.bundle if bundle is None else bundle,
            "complete": True,
            "received_at": "2026-08-08T13:11:00+09:00",
        }
        args.update(overrides)
        return self.store.materialize(**args)

    def test_01_initial_checkpoint(self): self.assertEqual(self.store.latest_checkpoint()["checkpoint_seq"], 1)
    def test_02_initial_state(self): self.assertEqual(read_json(self.store.state_path)["combined_state"], "BROWSER_RUNNING")
    def test_03_required_dataset_count(self): self.assertEqual(len(DATASET_SCHEMAS), 5)
    def test_04_empty_datasets_created(self): self.assertTrue(all(self.store._dataset_path(schema).exists() for schema in DATASET_SCHEMAS))
    def test_05_lineage_has_command(self): self.assertEqual(self.store.latest_checkpoint()["command_id"], "CMD-4")
    def test_06_lineage_has_session(self): self.assertEqual(self.store.latest_checkpoint()["session_id"], "SESSION-4")
    def test_07_lineage_has_worker(self): self.assertEqual(self.store.latest_checkpoint()["worker_id"], "WORKER-4")
    def test_08_complete_pending(self): self.complete(); self.assertEqual(read_json(self.store.state_path)["combined_state"], "COMPLETE_RESULT_PENDING")
    def test_09_complete_advances_checkpoint(self): self.assertEqual(self.complete()["checkpoint_seq"], 2)
    def test_10_duplicate_complete_noop(self): self.complete(); before=len(self.store.list_checkpoints()); result=self.complete(); self.assertTrue(result["duplicate"]); self.assertEqual(len(self.store.list_checkpoints()), before)
    def test_11_conflicting_complete_rejected(self): self.complete(); self.assertRaises(ValueError, self.store.mark_browser_complete, event_id="COMPLETE-X", completed_at="x")
    def test_12_materialize_available(self): self.complete(); self.materialize(); self.assertEqual(read_json(self.store.state_path)["combined_state"], "RESULT_AVAILABLE")
    def test_13_materialize_advances_checkpoint(self): self.complete(); self.assertEqual(self.materialize()["checkpoint_seq"], 3)
    def test_14_five_materialized_schemas(self): self.materialize(); self.assertEqual(set(self.store.bundle()), set(DATASET_SCHEMAS))
    def test_15_source_field_loss_zero(self): self.materialize(); self.assertEqual(read_json(self.store.pointer_path)["source_field_loss_count"], 0)
    def test_16_evidence_pointer_count(self): self.materialize(); self.assertEqual(read_json(self.store.pointer_path)["evidence_pointer_count"], 6)
    def test_17_raw_source_fields_preserved(self): self.materialize(); fields={x["source_field_name"] for x in self.store.bundle()["SITE_LISTING_FIELD_BINDING_V1"]["records"]}; self.assertIn("매매가", fields); self.assertIn("dealOrWarrantPrc", fields)
    def test_18_cross_site_listing_id_candidate(self): self.materialize(); rows=self.store.bundle()["SITE_LISTING_FIELD_BINDING_V1"]["records"]; names={x["source_field_name"] for x in rows if x["canonical_candidate_id"]=="listing_id"}; self.assertEqual(names, {"articleNo", "매물번호"})
    def test_19_cross_site_price_candidate(self): self.materialize(); rows=self.store.bundle()["SITE_LISTING_FIELD_BINDING_V1"]["records"]; names={x["source_field_name"] for x in rows if x["canonical_candidate_id"]=="deal_price_krw"}; self.assertEqual(names, {"dealOrWarrantPrc", "매매가"})
    def test_20_cross_site_area_candidate(self): self.materialize(); rows=self.store.bundle()["SITE_LISTING_FIELD_BINDING_V1"]["records"]; names={x["source_field_name"] for x in rows if x["canonical_candidate_id"]=="exclusive_area_m2"}; self.assertEqual(names, {"area2", "전용면적"})
    def test_21_read_transform_preserved(self): self.materialize(); self.assertTrue(all("read_transform" in x for x in self.store.bundle()["SITE_LISTING_FIELD_BINDING_V1"]["records"]))
    def test_22_write_transform_preserved(self): self.materialize(); self.assertTrue(all("write_transform" in x for x in self.store.bundle()["SITE_LISTING_FIELD_BINDING_V1"]["records"]))
    def test_23_all_fixture_semantics_candidate(self): self.materialize(); counts=read_json(self.store.pointer_path)["semantic_status_counts"]; self.assertEqual(counts["CANONICAL"], 0); self.assertGreater(counts["CANDIDATE"], 0)
    def test_24_unsupported_canonical_rejected(self): bundle=copy.deepcopy(self.bundle); bundle["SITE_LISTING_FIELD_BINDING_V1"]["records"][0]["semantic_status"]="CANONICAL"; self.assertRaises(ValueError, self.materialize, bundle)
    def test_25_supported_canonical_with_authority(self): bundle=copy.deepcopy(self.bundle); row=bundle["SITE_LISTING_FIELD_BINDING_V1"]["records"][0]; row["semantic_status"]="CANONICAL"; row["canonical_authority_pointer"]={"decision_id":"APPROVED-1"}; self.assertFalse(self.materialize(bundle)["duplicate"])
    def test_26_unknown_semantics_allowed(self): bundle=copy.deepcopy(self.bundle); bundle["SITE_LISTING_FIELD_BINDING_V1"]["records"][0]["semantic_status"]="UNKNOWN"; self.assertFalse(self.materialize(bundle)["duplicate"])
    def test_27_missing_source_binding_rejected(self): bundle=copy.deepcopy(self.bundle); bundle["SITE_LISTING_FIELD_BINDING_V1"]["records"].pop(); self.assertRaises(ValueError, self.materialize, bundle)
    def test_28_missing_evidence_rejected(self): bundle=copy.deepcopy(self.bundle); del bundle["SITE_LISTING_FIELD_BINDING_V1"]["records"][0]["evidence_pointer"]; self.assertRaises(ValueError, self.materialize, bundle)
    def test_29_unresolved_candidate_rejected(self): bundle=copy.deepcopy(self.bundle); bundle["SITE_LISTING_FIELD_BINDING_V1"]["records"][0]["canonical_candidate_id"]="missing"; self.assertRaises(ValueError, self.materialize, bundle)
    def test_30_duplicate_result_noop(self): self.materialize(); before=len(self.store.list_checkpoints()); result=self.materialize(); self.assertTrue(result["duplicate"]); self.assertEqual(len(self.store.list_checkpoints()), before)
    def test_31_duplicate_blueprint_noop(self): self.materialize(); result=self.materialize(result_event_id="EVENT-5", result_id="RESULT-5"); self.assertTrue(result["duplicate"])
    def test_32_conflicting_duplicate_rejected(self): self.materialize(); bundle=copy.deepcopy(self.bundle); bundle["REAL_ESTATE_SITE_CAPABILITY_PROFILE_V1"]["records"][0]["capabilities"].append("MAP"); self.assertRaises(ValueError, self.materialize, bundle)
    def test_33_contextless_recover(self): self.materialize(); recovered=BlueprintOntologyBindingDataset.recover(self.root); self.assertEqual(recovered.meta["command_id"], "CMD-4")
    def test_34_recover_dataset_readback(self): self.materialize(); recovered=BlueprintOntologyBindingDataset.recover(self.root); self.assertEqual(recovered.bundle(), self.bundle)
    def test_35_checkpoint_append_only(self): first=self.store._checkpoint_path(1).read_bytes(); self.complete(); self.materialize(); self.assertEqual(self.store._checkpoint_path(1).read_bytes(), first)
    def test_36_checkpoint_sequence(self): self.complete(); self.materialize(); self.assertEqual([read_json(x)["checkpoint_seq"] for x in self.store.list_checkpoints()], [1,2,3])
    def test_37_pointer_consumers(self): self.assertEqual(read_json(self.store.pointer_path)["consumers"], ["B-1","B-2","B-6"])
    def test_38_pointer_contextless(self): self.assertTrue(read_json(self.store.pointer_path)["contextless_recovery"])
    def test_39_export_three_formats(self): self.materialize(); receipt=self.store.export(self.root/"exports"); self.assertEqual(set(receipt["files"]), {"json","csv","xlsx"})
    def test_40_export_hash_readback(self): self.materialize(); receipt=self.store.export(self.root/"exports"); self.assertTrue(all(sha_file(Path(x["path"]))==x["sha256"] for x in receipt["files"].values()))
    def test_41_export_roundtrip(self): self.materialize(); self.assertTrue(all(self.store.export(self.root/"exports")["roundtrip"].values()))
    def test_42_csv_binding_count(self): self.materialize(); receipt=self.store.export(self.root/"exports"); stream=open(receipt["files"]["csv"]["path"], encoding="utf-8-sig", newline=""); self.addCleanup(stream.close); self.assertEqual(len(list(csv.DictReader(stream))), 6)
    def test_43_xlsx_binding_count(self): self.materialize(); receipt=self.store.export(self.root/"exports"); self.assertEqual(len(read_xlsx(Path(receipt["files"]["xlsx"]["path"]))), 6)
    def test_44_contract_const_required(self):
        for schema in DATASET_SCHEMAS:
            contract=read_json(ROOT/"contracts"/f"{schema}.schema.json")
            self.assertEqual(contract["properties"]["schema_version"]["const"], schema)
            self.assertEqual(contract["required"], ["schema_version", "records"])
    def test_45_smoke(self): self.assertEqual(smoke(Path(self.temp.name)/"smoke", self.fixture_path)["result"], "PASS")


if __name__ == "__main__":
    unittest.main()
