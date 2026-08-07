import json,tempfile,unittest,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/'src'))
from user_journey_state_machine_v5 import UserJourneyStateMachine,state_id
class T(unittest.TestCase):
 @classmethod
 def setUpClass(c): c.f=json.loads((ROOT/'fixtures/user_journey_state_machine_fixture_v5.json').read_text())
 def build(s):
  m=UserJourneyStateMachine(s.f['mission_id'],s.f['session_id'])
  for a in s.f['actions']: m.record_action(a)
  for e in s.f['worker_lifecycle']: m.record_worker_lifecycle(e)
  for u in s.f['unobserved_candidates']: m.add_unobserved_path(u['from_state'],u['to_state'],u['flow'])
  return m
 def test_schema(s): s.assertEqual(s.build().materialize()['schema_version'],'USER_JOURNEY_STATE_MACHINE_V1')
 def test_flows(s):
  f=s.build().materialize()['flows']; s.assertEqual((len(f['PUBLIC_READ']['representative_transition_ids']),len(f['CREATE']['representative_transition_ids']),len(f['MY_LISTING']['representative_transition_ids']),len(f['EDIT']['representative_transition_ids'])),(3,2,1,1))
 def test_shared_identity(s):
  st=s.build().materialize()['states'][state_id('MYLISTING_VISIBLE')]; s.assertEqual(set(st['flows']),{'CREATE','MY_LISTING'})
 def test_dedup(s): s.assertEqual((s.build().representative_transition_count(),s.build().equivalent_action_suppressed_count()),(7,1))
 def test_semantics(s):
  t=next(iter(s.build().materialize()['representative_transitions'].values()))
  for k in ['precondition','postcondition','page_role','representative_action_id','evidence_pointer']: s.assertIn(k,t)
 def test_unknown(s): s.assertTrue(all(x['status']=='UNKNOWN_UNOBSERVED' and not x['materialized_transition'] for x in s.build().materialize()['unobserved_paths']))
 def test_lifecycle_side(s): s.assertEqual(len(s.build().materialize()['worker_lifecycle_side_stream']),2)
 def test_resume(s): s.assertEqual([x['action_id'] for x in s.build().next_actions_after_resume('create-edit',s.build().materialize()['journey_checkpoints']['create-edit']['resume_token'])],['act-create-save','act-open-edit','act-edit-save'])
 def test_roundtrip(s):
  m=s.build()
  with tempfile.TemporaryDirectory() as td:
   p=Path(td)/'s.json'; m.save(p); r=UserJourneyStateMachine.load(p); s.assertEqual(r.materialize()['journey_checkpoints'],m.materialize()['journey_checkpoints'])
 def test_idempotent(s):
  m=UserJourneyStateMachine(s.f['mission_id'],s.f['session_id']); _,d1=m.record_action(s.f['actions'][0]); _,d2=m.record_action(s.f['actions'][0]); s.assertFalse(d1); s.assertTrue(d2); s.assertEqual(len(m.state['action_index']),1)
 def test_wrong_token(s):
  with s.assertRaises(ValueError): s.build().next_actions_after_resume('create-edit','wrong')
 def test_branch_observed_only(s): s.assertTrue(all(b['observed_branch_count']>=1 for b in s.build().materialize()['branches'].values()))
if __name__=='__main__': unittest.main()
