from __future__ import annotations
import tempfile
import unittest
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from dataset_preview_checkpoint import DatasetStore, canonical_cell, fixture_records, smoke

class DatasetPrebuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.store = DatasetStore(self.root, "test")
        self.store.initialize()
    def tearDown(self): self.tmp.cleanup()
    def test_01_initial_count_zero(self): self.assertEqual(self.store.load_checkpoint()["last_committed_record_count"], 0)
    def test_02_append_10(self): self.assertEqual(self.store.append(fixture_records(10))["last_committed_record_count"], 10)
    def test_03_pointer_tracks_count(self): self.store.append(fixture_records(3)); self.assertEqual(self.store.write_pointer()["last_committed_record_count"], 3)
    def test_04_contextless_recover(self): self.store.append(fixture_records(4)); self.assertEqual(DatasetStore.recover_from_pointer(self.store.paths.pointer).load_checkpoint()["last_committed_record_count"],4)
    def test_05_field_names(self): self.store.append(fixture_records(5)); self.assertIn("value", [f["name"] for f in self.store.load_checkpoint()["fields"]])
    def test_06_field_type(self): self.store.append(fixture_records(5)); f={x["name"]:x for x in self.store.load_checkpoint()["fields"]}; self.assertEqual(f["value"]["type"],"integer")
    def test_07_field_source(self): self.store.append(fixture_records(2)); f={x["name"]:x for x in self.store.load_checkpoint()["fields"]}; self.assertIn("json_pointer", f["name"]["source"])
    def test_08_confidence(self): self.store.append(fixture_records(2)); f={x["name"]:x for x in self.store.load_checkpoint()["fields"]}; self.assertGreater(f["name"]["confidence"],0.9)
    def test_09_missing_status(self): self.store.append(fixture_records(6)); f={x["name"]:x for x in self.store.load_checkpoint()["fields"]}; self.assertTrue(f["optional_note"]["missing"]["present"])
    def test_10_duplicate_status(self): self.store.append(fixture_records(20)); f={x["name"]:x for x in self.store.load_checkpoint()["fields"]}; self.assertTrue(f["duplicate_bucket"]["duplicate"]["present"])
    def test_11_preview_partial(self): self.store.append(fixture_records(100)); p=self.store.preview_window(50,10,2); self.assertEqual(p["virtual_row_count"],14)
    def test_12_preview_total(self): self.store.append(fixture_records(1001)); self.assertEqual(self.store.preview_window(900,20)["total_record_count"],1001)
    def test_13_preview_does_not_return_all(self): self.store.append(fixture_records(1001)); self.assertLess(self.store.preview_window(900,20)["virtual_row_count"],1001)
    def test_14_edit_overlay(self): self.store.append(fixture_records(10)); self.store.edit(5,"value",999); rows=list(self.store.iter_records()); self.assertEqual(rows[5]["value"],999)
    def test_15_source_unmutated(self): self.store.append(fixture_records(10)); self.store.edit(5,"value",999); raw=list(self.store.iter_records(apply_edits=False)); self.assertEqual(raw[5]["value"],60)
    def test_16_source_field_loss_zero(self): self.store.append(fixture_records(10)); self.assertEqual(self.store.load_checkpoint()["source_field_loss_count"],0)
    def test_17_json_export(self): self.store.append(fixture_records(10)); self.store.export(self.root/"out"); self.assertTrue((self.root/"out/dataset.json").exists())
    def test_18_csv_export(self): self.store.append(fixture_records(10)); self.store.export(self.root/"out"); self.assertTrue((self.root/"out/dataset.csv").exists())
    def test_19_xlsx_export(self): self.store.append(fixture_records(10)); self.store.export(self.root/"out"); self.assertTrue((self.root/"out/dataset.xlsx").exists())
    def test_20_roundtrip_field_parity(self): self.store.append(fixture_records(10)); m=self.store.export(self.root/"out"); self.assertEqual(m["round_trip_field_parity"],"PASS")
    def test_21_roundtrip_value_parity(self): self.store.append(fixture_records(10)); m=self.store.export(self.root/"out"); self.assertEqual(m["round_trip_display_value_parity"],"PASS")
    def test_22_checkpoint_hash(self): self.store.append(fixture_records(10)); self.assertEqual(len(self.store.load_checkpoint()["dataset_sha256"]),64)
    def test_23_overlay_hash(self): self.store.append(fixture_records(10)); self.store.edit(1,"value",5); self.assertEqual(len(self.store.load_checkpoint()["edit_overlay_sha256"]),64)
    def test_24_append_after_recovery(self): self.store.append(fixture_records(5)); r=DatasetStore.recover_from_pointer(self.store.paths.pointer); r.append(fixture_records(4)); self.assertEqual(r.load_checkpoint()["last_committed_record_count"],9)
    def test_25_model_schema(self): self.store.append(fixture_records(2)); self.assertEqual(self.store.normalized_dataset_model()["schema_version"],"NORMALIZED_PREVIEW_DATASET_V1")
    def test_26_pointer_no_context(self): self.store.append(fixture_records(2)); self.assertFalse(self.store.write_pointer()["recovery_requires_chat_context"])
    def test_27_canonical_bool(self): self.assertEqual(canonical_cell(True),"true")
    def test_28_canonical_object(self): self.assertEqual(canonical_cell({"b":2,"a":1}),'{"a":1,"b":2}')
    def test_29_smoke_1205(self): r=smoke(self.root/"smoke",1205); self.assertEqual(r["final_record_count"],1205)
    def test_30_smoke_result(self): r=smoke(self.root/"smoke2",1005); self.assertEqual(r["result"],"PASS")

if __name__ == "__main__": unittest.main()
