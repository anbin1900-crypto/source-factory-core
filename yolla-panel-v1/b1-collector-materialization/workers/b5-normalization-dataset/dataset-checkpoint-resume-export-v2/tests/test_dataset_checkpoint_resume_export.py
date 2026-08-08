from __future__ import annotations
import json, tempfile, unittest
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from dataset_checkpoint_resume_export import CheckpointDataset, fixture_records, smoke, SCHEMA_CHECKPOINT, SCHEMA_RESUME, SCHEMA_EXPORT, SCHEMA_A7

class CheckpointTests(unittest.TestCase):
    def new(self,td):
        return CheckpointDataset(Path(td),command_id="C",session_id="S",dataset_id="D",recipe_version="R",artifact_pointer="A",schema_pointer="SP")
    def test_01_initialize_checkpoint(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); cp=ds.initialize(); self.assertEqual(cp["schema_version"],SCHEMA_CHECKPOINT)
    def test_02_required_exact_fields(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); cp=ds.initialize()
            for k in ["command_id","session_id","dataset_id","recipe_version","record_count","last_cursor","last_action_id","artifact_pointer","schema_pointer","checkpoint_seq"]: self.assertIn(k,cp)
    def test_03_initial_seq_one(self):
        with tempfile.TemporaryDirectory() as td: self.assertEqual(self.new(td).initialize()["checkpoint_seq"],1)
    def test_04_append_creates_seq_two(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,3),last_cursor="c3",last_action_id="a3"); self.assertEqual(ds.latest_checkpoint()["checkpoint_seq"],2)
    def test_05_previous_checkpoint_persists(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); p=ds._checkpoint_path(1); b=p.read_bytes(); ds.append_after_checkpoint(fixture_records(0,3),last_cursor="c3",last_action_id="a3"); self.assertEqual(p.read_bytes(),b)
    def test_06_checkpoint_count(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,3),last_cursor="c3",last_action_id="a3"); self.assertEqual(ds.latest_checkpoint()["record_count"],3)
    def test_07_cursor(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,3),last_cursor="c3",last_action_id="a3"); self.assertEqual(ds.latest_checkpoint()["last_cursor"],"c3")
    def test_08_action(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,3),last_cursor="c3",last_action_id="a3"); self.assertEqual(ds.latest_checkpoint()["last_action_id"],"a3")
    def test_09_resume_schema(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); self.assertEqual(ds.resume_state()["schema_version"],SCHEMA_RESUME)
    def test_10_resume_append_index(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,3),last_cursor=None,last_action_id=None); self.assertEqual(ds.resume_state()["append_from_record_index"],3)
    def test_11_no_rewrite_flag(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); self.assertFalse(ds.resume_state()["existing_records_rewrite_allowed"])
    def test_12_prefix_preserved(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,5),last_cursor="c5",last_action_id="a5"); before=ds.dataset.read_bytes(); ds.append_after_checkpoint(fixture_records(5,5),last_cursor="c10",last_action_id="a10"); self.assertTrue(ds.dataset.read_bytes().startswith(before))
    def test_13_tamper_blocks_resume(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.dataset.write_text("bad\n",encoding="utf-8")
            with self.assertRaises(ValueError): ds.append_after_checkpoint([],last_cursor=None,last_action_id=None)
    def test_14_preview_latest_count(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,20),last_cursor=None,last_action_id=None); self.assertEqual(ds.reconstruct_preview()["record_count"],20)
    def test_15_preview_window(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,100),last_cursor=None,last_action_id=None); self.assertEqual(ds.reconstruct_preview(offset=50,limit=10,overscan=2)["virtual_row_count"],14)
    def test_16_export_schema(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,10),last_cursor=None,last_action_id=None); self.assertEqual(ds.export(Path(td)/"out")["schema_version"],SCHEMA_EXPORT)
    def test_17_export_count(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,10),last_cursor=None,last_action_id=None); self.assertEqual(ds.export(Path(td)/"out")["record_count"],10)
    def test_18_export_fields(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,10),last_cursor=None,last_action_id=None); self.assertEqual(ds.export(Path(td)/"out")["round_trip_field_parity"],"PASS")
    def test_19_export_checkpoint_hash(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,10),last_cursor=None,last_action_id=None); r=ds.export(Path(td)/"out"); self.assertEqual(r["checkpoint_seq"],ds.latest_checkpoint()["checkpoint_seq"])
    def test_20_export_three_formats(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,10),last_cursor=None,last_action_id=None); self.assertEqual(set(ds.export(Path(td)/"out")["files"]),{"json","csv","xlsx"})
    def test_21_a7_schema(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); self.assertEqual(ds.a7_projection()["schema_version"],SCHEMA_A7)
    def test_22_a7_compact_required(self):
        with tempfile.TemporaryDirectory() as td:
            p=self.new(td); p.initialize(); x=p.a7_projection()
            for k in ["checkpoint_seq","record_count","last_cursor","last_action_id","artifact_pointer","schema_pointer","dataset_sha256"]: self.assertIn(k,x)
    def test_23_pointer_contextless(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); p=json.loads(ds.latest.read_text()); self.assertFalse(p["recovery_requires_chat_context"])
    def test_24_three_checkpoint_monotonic(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,2),last_cursor=None,last_action_id=None); ds.append_after_checkpoint(fixture_records(2,2),last_cursor=None,last_action_id=None); self.assertEqual([json.loads(p.read_text())["checkpoint_seq"] for p in ds.list_checkpoints()],[1,2,3])
    def test_25_previous_hash_chain(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,2),last_cursor=None,last_action_id=None); cp=ds.latest_checkpoint(); self.assertIsNotNone(cp["previous_checkpoint_sha256"])
    def test_26_dataset_hash_bound(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,2),last_cursor=None,last_action_id=None); self.assertEqual(ds.resume_state()["dataset_sha256"],ds.latest_checkpoint()["dataset_sha256"])
    def test_27_smoke_1205(self):
        with tempfile.TemporaryDirectory() as td: self.assertEqual(smoke(Path(td),1205,600)["result"],"PASS")
    def test_28_smoke_append_only(self):
        with tempfile.TemporaryDirectory() as td: self.assertEqual(smoke(Path(td),50,20)["existing_record_rewrite_count"],0)
    def test_29_smoke_checkpoint_no_overwrite(self):
        with tempfile.TemporaryDirectory() as td: self.assertEqual(smoke(Path(td),50,20)["previous_checkpoint_overwrite_count"],0)
    def test_30_smoke_export_parity(self):
        with tempfile.TemporaryDirectory() as td: self.assertEqual(smoke(Path(td),50,20)["export_receipt"]["round_trip_record_count_parity"],"PASS")
    def test_31_open_existing_identity(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,2),last_cursor="c",last_action_id="a"); reopened=CheckpointDataset.open_existing(Path(td)); self.assertEqual(reopened.meta["dataset_id"],"D")
    def test_32_open_existing_resume_without_context(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,2),last_cursor="c",last_action_id="a"); reopened=CheckpointDataset.open_existing(Path(td)); self.assertEqual(reopened.resume_state()["last_committed_record_count"],2)
    def test_33_open_existing_append(self):
        with tempfile.TemporaryDirectory() as td:
            ds=self.new(td); ds.initialize(); ds.append_after_checkpoint(fixture_records(0,2),last_cursor="c",last_action_id="a"); reopened=CheckpointDataset.open_existing(Path(td)); reopened.append_after_checkpoint(fixture_records(2,2),last_cursor="c2",last_action_id="a2"); self.assertEqual(reopened.latest_checkpoint()["record_count"],4)

if __name__=="__main__": unittest.main()
