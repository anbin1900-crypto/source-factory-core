import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from result_dataset_lineage import ResultDatasetLineage, read_json, sha_file, smoke


class ResultDatasetLineageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "lineage"
        self.store = ResultDatasetLineage(self.root, command_id="CMD-1", session_id="SESSION-1", worker_id="WORKER-1", dataset_id="DATASET-1", recipe_version="v3")
        self.store.initialize()

    def tearDown(self):
        self.temp.cleanup()

    def complete(self):
        return self.store.mark_browser_complete(event_id="COMPLETE-1", completed_at="2026-08-07T22:40:00+09:00")

    def partial(self):
        return self.store.materialize_result(result_event_id="EVENT-P", result_id="RESULT-P", records=[{"id": 1}, {"id": 2}], complete=False, received_at="2026-08-07T22:41:00+09:00")

    def final(self):
        return self.store.materialize_result(result_event_id="EVENT-F", result_id="RESULT-F", records=[{"id": 3}], complete=True, received_at="2026-08-07T22:42:00+09:00")

    def test_01_initial_checkpoint(self): self.assertEqual(self.store.latest_checkpoint()["checkpoint_seq"], 1)
    def test_02_initial_state(self): self.assertEqual(read_json(self.store.state_path)["combined_state"], "BROWSER_RUNNING")
    def test_03_lineage_has_command(self): self.assertEqual(self.store.latest_checkpoint()["command_id"], "CMD-1")
    def test_04_lineage_has_session(self): self.assertEqual(self.store.latest_checkpoint()["session_id"], "SESSION-1")
    def test_05_lineage_has_worker(self): self.assertEqual(self.store.latest_checkpoint()["worker_id"], "WORKER-1")
    def test_06_complete_pending(self): self.complete(); self.assertEqual(read_json(self.store.state_path)["combined_state"], "COMPLETE_RESULT_PENDING")
    def test_07_complete_has_no_records(self): self.complete(); self.assertEqual(self.store.record_count(), 0)
    def test_08_complete_advances_checkpoint(self): self.assertEqual(self.complete()["checkpoint_seq"], 2)
    def test_09_duplicate_complete_noop(self): self.complete(); before=len(self.store.list_checkpoints()); result=self.complete(); self.assertTrue(result["duplicate"]); self.assertEqual(len(self.store.list_checkpoints()), before)
    def test_10_conflicting_complete_rejected(self): self.complete(); self.assertRaises(ValueError, self.store.mark_browser_complete, event_id="COMPLETE-2", completed_at="x")
    def test_11_partial_available(self): self.complete(); self.partial(); self.assertEqual(read_json(self.store.state_path)["combined_state"], "RESULT_AVAILABLE")
    def test_12_partial_count(self): self.partial(); self.assertEqual(self.store.record_count(), 2)
    def test_13_partial_phase(self): self.partial(); self.assertEqual(self.store.latest_checkpoint()["dataset_phase"], "PARTIAL")
    def test_14_final_count(self): self.partial(); self.final(); self.assertEqual(self.store.record_count(), 3)
    def test_15_final_phase(self): self.partial(); self.final(); self.assertEqual(self.store.latest_checkpoint()["dataset_phase"], "COMPLETE")
    def test_16_records_bind_command(self): self.partial(); self.assertTrue(all(row["__source_command_id"] == "CMD-1" for row in self.store.records()))
    def test_17_records_bind_session(self): self.partial(); self.assertTrue(all(row["__source_session_id"] == "SESSION-1" for row in self.store.records()))
    def test_18_records_bind_worker(self): self.partial(); self.assertTrue(all(row["__source_worker_id"] == "WORKER-1" for row in self.store.records()))
    def test_19_duplicate_result_no_append(self): self.partial(); before=self.store.record_count(); result=self.partial(); self.assertTrue(result["duplicate"]); self.assertEqual(self.store.record_count(), before)
    def test_20_duplicate_result_no_checkpoint(self): self.partial(); before=len(self.store.list_checkpoints()); self.partial(); self.assertEqual(len(self.store.list_checkpoints()), before)
    def test_21_conflicting_duplicate_rejected(self): self.partial(); self.assertRaises(ValueError, self.store.materialize_result, result_event_id="EVENT-P", result_id="RESULT-P", records=[{"id": 9}], complete=False, received_at="x")
    def test_22_recover_contextless(self): self.partial(); recovered=ResultDatasetLineage.recover(self.root); self.assertEqual(recovered.meta["command_id"], "CMD-1")
    def test_23_recover_count(self): self.partial(); self.assertEqual(ResultDatasetLineage.recover(self.root).record_count(), 2)
    def test_24_pointer_consumers(self): self.assertEqual(read_json(self.store.latest_path)["consumers"], ["B-1", "B-2", "B-6"])
    def test_25_pointer_state_after_final(self): self.partial(); self.final(); self.assertEqual(read_json(self.store.latest_path)["combined_state"], "RESULT_AVAILABLE")
    def test_26_partial_and_complete_same_lineage(self): self.partial(); p=self.store.latest_checkpoint()["lineage_key"]; self.final(); self.assertEqual(self.store.latest_checkpoint()["lineage_key"], p)
    def test_27_export_receipt_lineage(self): self.partial(); receipt=self.store.export(self.root/"exports"); self.assertEqual(receipt["lineage_key"], self.store.lineage_key)
    def test_28_export_three_formats(self): self.partial(); receipt=self.store.export(self.root/"exports"); self.assertEqual(set(receipt["files"]), {"json", "csv", "xlsx"})
    def test_29_export_hashes_readback(self): self.partial(); receipt=self.store.export(self.root/"exports"); self.assertTrue(all(sha_file(Path(item["path"])) == item["sha256"] for item in receipt["files"].values()))
    def test_30_checkpoint_append_only(self): self.partial(); original=self.store._checkpoint_path(1).read_bytes(); self.final(); self.assertEqual(self.store._checkpoint_path(1).read_bytes(), original)
    def test_31_record_prefix_preserved(self): self.partial(); prefix=self.store.records_path.read_bytes(); self.final(); self.assertTrue(self.store.records_path.read_bytes().startswith(prefix))
    def test_32_complete_checkpoint_pointer(self): self.partial(); result=self.final(); self.assertEqual(result["pointer"]["complete_checkpoint_seq"], result["checkpoint_seq"])
    def test_33_partial_checkpoint_pointer(self): result=self.partial(); self.assertEqual(result["pointer"]["partial_checkpoint_seq"], result["checkpoint_seq"])
    def test_34_result_ids_in_receipt(self): self.partial(); self.final(); self.assertEqual(self.store.export(self.root/"exports")["source_result_ids"], ["RESULT-P", "RESULT-F"])
    def test_35_smoke_all_three(self): result=smoke(Path(self.temp.name)/"smoke"); self.assertEqual(result["result"], "PASS")


if __name__ == "__main__":
    unittest.main()
