import json, tempfile, unittest
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from worker_state_command_correlation_v3 import WorkerStateCommandCorrelation

class T(unittest.TestCase):
    def setUp(self):
        self.fixture=json.loads((ROOT/'fixtures/worker_state_command_smoke_v3.json').read_text())
        self.c=WorkerStateCommandCorrelation(mission_id=self.fixture['mission_id'])
    def bind(self,event):
        b=self.fixture['action_bindings'][event['command_id']]
        return self.c.consume_a3_event(event,action_id=b['action_id'],session_id=b['session_id'])
    def test_01_dispatched(self): self.assertEqual(self.bind(self.fixture['events'][0])['decision'],'ACCEPTED')
    def test_02_generating(self):
        self.bind(self.fixture['events'][0]); self.assertEqual(self.bind(self.fixture['events'][1])['state']['state'],'GENERATING')
    def test_03_complete(self):
        for e in self.fixture['events'][:3]: out=self.bind(e)
        self.assertEqual(out['state']['state'],'COMPLETE')
    def test_04_duplicate_complete(self):
        for e in self.fixture['events'][:3]: self.bind(e)
        self.assertEqual(self.bind(self.fixture['events'][3])['decision'],'DUPLICATE_SUPPRESSED')
    def test_05_out_of_order_after_complete(self):
        for e in self.fixture['events'][:3]: self.bind(e)
        self.assertEqual(self.bind(self.fixture['events'][4])['reason'],'TERMINAL_STATE_ALREADY_REACHED')
    def test_06_unknown_side_state(self):
        for e in self.fixture['events'][:3]: self.bind(e)
        self.assertEqual(self.bind(self.fixture['events'][5])['decision'],'UNKNOWN_SIDE_STATE_RECORDED')
        self.assertEqual(self.c.current_state('cmd-1')['state'],'COMPLETE')
    def test_07_blocked(self):
        for e in self.fixture['events'][6:8]: out=self.bind(e)
        self.assertEqual(out['state']['state'],'BLOCKED')
    def test_08_receipt_requires_complete(self):
        self.bind(self.fixture['events'][6])
        with self.assertRaises(ValueError): self.c.bind_result_receipt(command_id='cmd-2',receipt={'command_id':'cmd-2','receipt_id':'r','result_digest':'d'})
    def test_09_receipt_bind(self):
        for e in self.fixture['events'][:3]: self.bind(e)
        b=self.c.bind_result_receipt(command_id='cmd-1',receipt=self.fixture['result_receipt'])
        self.assertEqual(b['action_id'],'act-1')
    def test_10_restart_replay(self):
        for e in self.fixture['events'][:3]+[self.fixture['events'][5]]: self.bind(e)
        self.c.bind_result_receipt(command_id='cmd-1',receipt=self.fixture['result_receipt'])
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'s.json'; self.c.save(p); loaded=WorkerStateCommandCorrelation.load(p); rebuilt=loaded.reconstruct_from_ledger()
        self.assertEqual(rebuilt['command_state']['cmd-1']['state'],'COMPLETE')
    def test_11_chain(self):
        for e in self.fixture['events'][:3]: self.bind(e)
        prev='GENESIS'
        for r in self.c.state['event_ledger']:
            self.assertEqual(r['prev_hash'],prev); prev=r['record_hash']
    def test_12_handoff(self): self.assertEqual(self.c.export_handoff()['consumers'],['B-1','A-7'])

if __name__=='__main__': unittest.main()
