from __future__ import annotations
import tempfile
from pathlib import Path
import unittest
from src.worker_state_event_store import WorkerBrowserStateEventStore, WorkerStateEventError

class WorkerStateTests(unittest.TestCase):
    def make(self):
        td=tempfile.TemporaryDirectory(); self.addCleanup(td.cleanup); return WorkerBrowserStateEventStore(Path(td.name))
    def common(self): return dict(command_id="C1",worker_id="B-4",source_pointer="source://c1",command_artifact_checkpoint_pointer="cmdart://c1")
    def test_append_and_restart(self):
        s=self.make();s.append_event(**self.common(),page_id="p1",event_seq=1,observed_at="t1",state="OPEN",task_status="RUNNING");s.append_event(**self.common(),page_id="p2",event_seq=2,observed_at="t2",state="COMPLETE",task_status="COMPLETE");r=WorkerBrowserStateEventStore(s.root).restart_readback("C1","B-4");self.assertEqual(r["restored_event_seq"],2);self.assertEqual(r["restored_state"],"COMPLETE")
    def test_duplicate_suppressed(self):
        s=self.make();kw=dict(**self.common(),page_id="p1",event_seq=1,observed_at="t1",state="OPEN",task_status="RUNNING");s.append_event(**kw);r=s.append_event(**kw);self.assertEqual(r["disposition"],"DUPLICATE_SUPPRESSED");self.assertEqual(s.pointer_manifest("C1","B-4")["accepted_event_count"],1)
    def test_tampered_conflict_side_record(self):
        s=self.make();s.append_event(**self.common(),page_id="p1",event_seq=1,observed_at="t1",state="OPEN",task_status="RUNNING");r=s.append_event(**self.common(),page_id="p1",event_seq=1,observed_at="t2",state="MUTATED",task_status="RUNNING");self.assertEqual(r["disposition"],"TAMPERED_CONFLICT");self.assertEqual(s.restart_readback("C1","B-4")["restored_state"],"OPEN")
    def test_out_of_order_rejected(self):
        s=self.make();r=s.append_event(**self.common(),page_id="p2",event_seq=2,observed_at="t2",state="OPEN",task_status="RUNNING");self.assertEqual(r["disposition"],"OUT_OF_ORDER_REJECTED");self.assertEqual(s.restart_readback("C1","B-4")["restored_event_seq"],0)
    def test_receipt_only_after_complete(self):
        s=self.make();s.append_event(**self.common(),page_id="p1",event_seq=1,observed_at="t1",state="OPEN",task_status="RUNNING")
        with self.assertRaises(WorkerStateEventError): s.bind_result_receipt(command_id="C1",worker_id="B-4",result_receipt_pointer="result://x",observed_at="t2")
        s.append_event(**self.common(),page_id="p1",event_seq=2,observed_at="t3",state="COMPLETE",task_status="COMPLETE");r=s.bind_result_receipt(command_id="C1",worker_id="B-4",result_receipt_pointer="result://x",observed_at="t4");self.assertEqual(r["disposition"],"RECEIPT_POINTER_BOUND");self.assertEqual(s.restart_readback("C1","B-4")["result_receipt_pointer"],"result://x")
    def test_secret_fields_rejected(self):
        s=self.make()
        with self.assertRaises(WorkerStateEventError): s.append_event(**self.common(),page_id="p1",event_seq=1,observed_at="t1",state={"headers":{"Authorization":"Bearer abcdefghijkl"}},task_status="RUNNING")
    def test_hash_chain_tamper_detected(self):
        s=self.make();s.append_event(**self.common(),page_id="p1",event_seq=1,observed_at="t1",state="OPEN",task_status="RUNNING");line=s.events_path.read_text();s.events_path.write_text(line.replace('"state": "OPEN"','"state": "TAMPERED"'))
        with self.assertRaises(WorkerStateEventError): s.verify_stream("C1","B-4")
if __name__=="__main__": unittest.main()
