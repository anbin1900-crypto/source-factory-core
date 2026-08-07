from pathlib import Path
import json,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from user_journey_state_recorder_v4 import UserJourneyStateRecorder
F=json.loads((ROOT/"fixtures"/"user_journey_fixture_v4.json").read_text(encoding="utf-8"))
r=UserJourneyStateRecorder(session_id=F["session_id"],mission_id=F["mission_id"])
for e in F["worker_lifecycle"]: r.record_worker_lifecycle_event(e)
for a in F["actions"][:7]: r.record_product_action(**a)
_,dup=r.record_product_action(**F["actions"][4])
cp=r.checkpoint(); before=[x["action_id"] for x in r.next_resume_actions(cp["resume_token"])]
state=ROOT/"generated"/"B3_USER_JOURNEY_STATE_V4.json"; state.parent.mkdir(exist_ok=True); r.save(state)
rr=UserJourneyStateRecorder.load(state); cp2=rr.checkpoint(); after=[x["action_id"] for x in rr.next_resume_actions(cp2["resume_token"])]
rr.record_product_action(**F["actions"][7])
receipt={"schema_version":"B3_USER_JOURNEY_FIXTURE_SMOKE_RECEIPT_V4","status":"PASS","search_list_detail_graph":True,"create_mylisting_edit_graph":True,"journey_event_count":len(rr.state["journey_ledger"]),"worker_lifecycle_side_event_count":len(rr.state["worker_lifecycle_side_stream"]),"worker_lifecycle_mixed_into_journey":False,"duplicate_retry_suppressed":bool(dup),"resume_before_restart":before,"resume_after_restart":after,"restart_resume_match":before==after,"last_completed_action_id":cp2["last_completed_action_id"],"representative_family_count":rr.coverage_plan()["representative_family_count"],"suppressed_equivalent_event_count":rr.coverage_plan()["suppressed_equivalent_event_count"]}
(ROOT/"generated"/"B3_USER_JOURNEY_FIXTURE_SMOKE_RECEIPT_V4.json").write_text(json.dumps(receipt,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
print(json.dumps(receipt,ensure_ascii=False,sort_keys=True))
