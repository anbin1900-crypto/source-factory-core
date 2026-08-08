from __future__ import annotations
import tempfile, unittest
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from durable_action_replay_v2 import DurableActionReplay, ACTION_TYPES

class DurableActionReplayTests(unittest.TestCase):
    def setUp(self): self.e = DurableActionReplay("s1", mission_id="m1")
    def add(self, i=1, status="PENDING"):
        return self.e.record_action(command_id=f"c{i}", page_id="p1", action_type="click", payload={"selector":f"#b{i}"}, timestamp=f"2026-08-07T13:00:0{i}Z", status=status)[0]
    def test_contract_fields(self):
        c=self.e.action_event_contract()
        for k in ["command_id","mission_id","session_id","page_id","action_id","sequence_no","timestamp"]: self.assertIn(k,c["required_fields"])
    def test_record_monotonic(self):
        a1=self.add(1); a2=self.add(2); self.assertEqual([a1["sequence_no"],a2["sequence_no"]],[1,2])
    def test_idempotency_suppresses_duplicate(self):
        a1,d1=self.e.record_action(command_id="c",page_id="p",action_type="click",payload={"x":1},timestamp="2026-08-07T13:00:00Z")
        a2,d2=self.e.record_action(command_id="c",page_id="p",action_type="click",payload={"x":1},timestamp="2026-08-07T13:00:00Z")
        self.assertFalse(d1); self.assertTrue(d2); self.assertEqual(a1["action_id"],a2["action_id"]); self.assertEqual(len(self.e.state["ledger"]),1)
    def test_hash_chain(self):
        self.add(1); self.add(2); self.e._validate_ledger_chain(); self.assertEqual(self.e.state["ledger"][1]["prev_hash"],self.e.state["ledger"][0]["record_hash"])
    def test_bind_evidence_correlation(self):
        a=self.add(1); row=self.e.bind_evidence(action_id=a["action_id"], evidence=[{"evidence_id":"e1","evidence_type":"CDP_NETWORK","digest":"abc"}]); self.assertEqual(row["command_id"],"c1")
    def test_checkpoint_last_confirmed(self):
        a1=self.add(1,"CONFIRMED"); self.add(2,"PENDING"); cp=self.e.replay_checkpoint(); self.assertEqual(cp["last_confirmed_action_id"],a1["action_id"]); self.assertEqual(cp["last_confirmed_sequence_no"],1)
    def test_restart_restore(self):
        self.add(1,"CONFIRMED"); self.add(2,"PENDING")
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/"state.json"; self.e.save(p); r=DurableActionReplay.load(p); self.assertEqual(r.replay_checkpoint(),self.e.replay_checkpoint()); self.assertEqual(r.reconstruct_minimum_order_from_ledger(),self.e.reconstruct_minimum_order_from_ledger())
    def test_resume_next_after_confirmed(self):
        self.add(1,"CONFIRMED"); a2=self.add(2,"PENDING"); cp=self.e.replay_checkpoint(); self.assertEqual([x["action_id"] for x in self.e.next_replay_actions(cp["resume_token"])],[a2["action_id"]])
    def test_wrong_resume_token_fails(self):
        self.add(1)
        with self.assertRaises(ValueError): self.e.next_replay_actions("wrong")
    def test_ledger_only_order_recovery(self):
        self.add(1); self.add(2); self.add(3); self.assertEqual([r["sequence_no"] for r in self.e.reconstruct_minimum_order_from_ledger()],[1,2,3])
    def test_successor_command_contextless(self):
        self.add(1,"CONFIRMED"); c=self.e.successor_replay_command(pointer_path="P",state_path="S"); self.assertFalse(c["requires_chat_context"]); self.assertFalse(c["target_pc_execution_authorized"])
    def test_all_required_action_types(self): self.assertEqual(ACTION_TYPES,{"click","input","scroll","navigation","wait"})

if __name__=="__main__": unittest.main()
