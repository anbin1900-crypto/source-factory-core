from __future__ import annotations
import sys
import tempfile
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT.parent / "src"))
sys.path.insert(0, str(ROOT / "upstream"))
from automation_event_log import AutomationEventLogAndMetrics, AutomationEventLogError

class D5Tests(unittest.TestCase):
    def make(self):
        td=tempfile.TemporaryDirectory(); self.addCleanup(td.cleanup)
        s=AutomationEventLogAndMetrics(Path(td.name)); self.addCleanup(s.close); return s
    def emit_happy(self,s,cmd="CMD-1",ctx="CTX-1",worker="W2",offset=0):
        base=[
            ("COMMAND_CREATED",0), ("CONTEXT_SELECTED",1), ("MESSAGE_SENT",2),
            ("WORKING",3), ("REPLY_COMPLETED",7), ("RESULT_RETURNED",8),
        ]
        for typ,sec in base:
            s.record_event(command_id=cmd,context_id=ctx,event_type=typ,observed_at=f"2026-08-07T23:00:{sec+offset:02d}+09:00",responsible_worker_id=worker,source_pointer="fixture://cycle1")
    def test_happy_path_metrics(self):
        s=self.make(); self.emit_happy(s); m=s.metrics()
        self.assertEqual(m["MESSAGE_SEND_SUCCESS_RATE"],1.0)
        self.assertEqual(m["AVERAGE_REPLY_TIME"],5.0)
        self.assertEqual(m["COMMAND_TO_RESULT_ELAPSED_TIME"],8.0)
        self.assertEqual(m["ERROR_COUNT"],0)
    def test_duplicate_suppressed(self):
        s=self.make(); kw=dict(command_id="C",context_id="X",event_type="COMMAND_CREATED",observed_at="2026-08-07T23:01:00+09:00",responsible_worker_id="W",source_pointer="x",idempotency_key="same")
        self.assertEqual(s.record_event(**kw)["disposition"],"ACCEPTED")
        self.assertEqual(s.record_event(**kw)["disposition"],"DUPLICATE_SUPPRESSED")
        self.assertEqual(s.metrics()["accepted_event_count"],1)
    def test_order_reversal_blocked(self):
        s=self.make()
        with self.assertRaises(AutomationEventLogError):
            s.record_event(command_id="C",context_id="X",event_type="MESSAGE_SENT",observed_at="2026-08-07T23:01:00+09:00",responsible_worker_id="W",source_pointer="x")
    def test_restart_restore(self):
        s=self.make(); self.emit_happy(s)
        self.assertEqual(s.restart_readback("CMD-1","CTX-1")["restored_event_type"],"RESULT_RETURNED")
        self.assertEqual(s.restart_readback("CMD-1","CTX-1")["restored_event_seq"],6)
    def test_failure_retry_and_metrics(self):
        s=self.make()
        seq=[
            ("COMMAND_CREATED",None),("CONTEXT_SELECTED",None),("MESSAGE_SENT",None),("ERROR","SEND_FAILURE"),("RETRY",None),("MESSAGE_SENT",None),("WORKING",None),("REPLY_COMPLETED",None),("RESULT_RETURNED",None)
        ]
        for i,(typ,cause) in enumerate(seq):
            s.record_event(command_id="C",context_id="X",event_type=typ,observed_at=f"2026-08-07T23:02:{i:02d}+09:00",responsible_worker_id="W2",source_pointer="x",cause=cause)
        m=s.metrics(); self.assertEqual(m["SEND_FAILURE_COUNT"],1); self.assertEqual(m["RETRY_COUNT"],1); self.assertEqual(m["ERROR_COUNT"],1); self.assertAlmostEqual(m["MESSAGE_SEND_SUCCESS_RATE"],2/3)
    def test_context_mismatch_count(self):
        s=self.make()
        s.record_event(command_id="C",context_id="CTX-A",event_type="COMMAND_CREATED",observed_at="2026-08-07T23:03:00+09:00",responsible_worker_id="W3",source_pointer="x")
        s.record_event(command_id="C",context_id="CTX-A",event_type="CONTEXT_SELECTED",observed_at="2026-08-07T23:03:01+09:00",responsible_worker_id="W3",source_pointer="x",observed_context_id="CTX-B")
        self.assertEqual(s.metrics()["CONTEXT_MISMATCH_COUNT"],1)
    def test_manual_action_count(self):
        s=self.make()
        s.record_event(command_id="C",context_id="X",event_type="COMMAND_CREATED",observed_at="2026-08-07T23:04:00+09:00",responsible_worker_id="W",source_pointer="x",user_manual_action=True)
        self.assertEqual(s.metrics()["USER_MANUAL_ACTION_COUNT"],1)
    def test_repeated_failure_improvement_projection(self):
        s=self.make()
        # two separate streams, same responsible worker/cause => one improvement item
        for n in range(2):
            cmd=f"C{n}"
            s.record_event(command_id=cmd,context_id=f"X{n}",event_type="COMMAND_CREATED",observed_at=f"2026-08-07T23:05:{n*10:02d}+09:00",responsible_worker_id="W5",source_pointer="x")
            s.record_event(command_id=cmd,context_id=f"X{n}",event_type="CONTEXT_SELECTED",observed_at=f"2026-08-07T23:05:{n*10+1:02d}+09:00",responsible_worker_id="W5",source_pointer="x")
            s.record_event(command_id=cmd,context_id=f"X{n}",event_type="MESSAGE_SENT",observed_at=f"2026-08-07T23:05:{n*10+2:02d}+09:00",responsible_worker_id="W5",source_pointer="x")
            s.record_event(command_id=cmd,context_id=f"X{n}",event_type="ERROR",observed_at=f"2026-08-07T23:05:{n*10+3:02d}+09:00",responsible_worker_id="W5",source_pointer="x",cause="SEND_FAILURE")
        items=s.metrics()["REPEATED_FAILURE_IMPROVEMENTS"]
        self.assertEqual(len(items),1); self.assertEqual(items[0]["responsible_worker_id"],"W5"); self.assertEqual(items[0]["failure_count"],2)
    def test_nonblocking_queue_flush(self):
        s=self.make()
        r=s.emit_nonblocking(command_id="C",context_id="X",event_type="COMMAND_CREATED",observed_at="2026-08-07T23:06:00+09:00",responsible_worker_id="W",source_pointer="x")
        self.assertEqual(r["disposition"],"QUEUED_NON_BLOCKING")
        results=s.flush(); self.assertEqual(results[0]["disposition"],"ACCEPTED"); self.assertEqual(s.metrics()["accepted_event_count"],1)
    def test_nonblocking_order_reserved(self):
        s=self.make()
        for typ,sec in [("COMMAND_CREATED",0),("CONTEXT_SELECTED",1),("MESSAGE_SENT",2),("WORKING",3)]:
            s.emit_nonblocking(command_id="C",context_id="X",event_type=typ,observed_at=f"2026-08-07T23:07:0{sec}+09:00",responsible_worker_id="W",source_pointer="x")
        results=s.flush(); self.assertEqual([r["disposition"] for r in results],["ACCEPTED"]*4); self.assertEqual(s.restart_readback("C","X")["restored_event_seq"],4)

if __name__ == "__main__": unittest.main()
