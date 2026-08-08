import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/'src'))
from user_journey_state_machine_v5 import UserJourneyStateMachine
f=json.loads((ROOT/'fixtures/user_journey_state_machine_fixture_v5.json').read_text())
m=UserJourneyStateMachine(f['mission_id'],f['session_id'])
for a in f['actions']: m.record_action(a)
for e in f['worker_lifecycle']: m.record_worker_lifecycle(e)
for u in f['unobserved_candidates']: m.add_unobserved_path(u['from_state'],u['to_state'],u['flow'])
mat=m.materialize(); cp=mat['journey_checkpoints']['create-edit']; ids=[x['action_id'] for x in m.next_actions_after_resume('create-edit',cp['resume_token'])]
sp=ROOT/'generated/B3_USER_JOURNEY_STATE_MACHINE_STATE_V5.json'; m.save(sp); r=UserJourneyStateMachine.load(sp); cp2=r.materialize()['journey_checkpoints']['create-edit']; ids2=[x['action_id'] for x in r.next_actions_after_resume('create-edit',cp2['resume_token'])]
receipt={"schema_version":"B3_USER_JOURNEY_STATE_MACHINE_FIXTURE_RECEIPT_V5","status":"PASS","representative_transition_count":m.representative_transition_count(),"equivalent_action_suppressed_count":m.equivalent_action_suppressed_count(),"flow_transition_counts":{k:len(v['representative_transition_ids']) for k,v in mat['flows'].items()},"shared_state_mylisting_visible_flows":mat['states'][next(k for k,v in mat['states'].items() if v['ui_state']=='MYLISTING_VISIBLE')]['flows'],"last_completed_action_id":cp['last_completed_action_id'],"resume_action_ids":ids,"restart_resume_match":ids==ids2,"unobserved_path_count":len(mat['unobserved_paths']),"worker_lifecycle_side_stream_count":len(mat['worker_lifecycle_side_stream'])}
(ROOT/'generated/USER_JOURNEY_STATE_MACHINE_V1.json').write_text(json.dumps(mat,ensure_ascii=False,indent=2)+'\n')
(ROOT/'generated/B3_USER_JOURNEY_STATE_MACHINE_FIXTURE_RECEIPT_V5.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(receipt,ensure_ascii=False))
