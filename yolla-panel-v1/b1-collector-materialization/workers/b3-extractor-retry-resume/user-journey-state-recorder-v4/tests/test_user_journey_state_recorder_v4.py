import json, tempfile, unittest, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from user_journey_state_recorder_v4 import UserJourneyStateRecorder
F=json.loads((ROOT/"fixtures"/"user_journey_fixture_v4.json").read_text(encoding="utf-8"))
def build(actions=None):
    r=UserJourneyStateRecorder(session_id=F["session_id"],mission_id=F["mission_id"])
    for e in F["worker_lifecycle"]: r.record_worker_lifecycle_event(e)
    for a in (actions or F["actions"]): r.record_product_action(**a)
    return r
class T(unittest.TestCase):
    def test_01_separation(self):
        r=build(); self.assertEqual(len(r.user_journey_event_stream()["events"]),8); self.assertEqual(len(r.state["worker_lifecycle_side_stream"]),2)
    def test_02_correlation(self):
        e=build().user_journey_event_stream()["events"][0]
        for k in ["command_id","session_id","page_id","action_id"]: self.assertTrue(e[k])
    def test_03_search_list_detail(self):
        g=build().user_journey_graph()["journeys"]["search-detail"]; self.assertEqual([x["to_state"] for x in g["edges"][:3]],["SEARCH_FILTERED","LIST_VISIBLE","DETAIL_VISIBLE"])
    def test_04_create_mylisting_edit(self):
        g=build().user_journey_graph()["journeys"]["create-edit"]; self.assertEqual([x["feature"] for x in g["edges"]],["Create","Create","MyListing","Edit"])
    def test_05_transition_trace(self):
        t=build().ui_state_transition_trace()["transitions"]; self.assertEqual((t[2]["from_state"],t[2]["to_state"]),("LIST_VISIBLE","DETAIL_VISIBLE"))
    def test_06_feature_sequence(self):
        f=build().feature_action_sequence()["features"]; self.assertEqual(len(f["Search"]),3); self.assertEqual(len(f["Create"]),2)
    def test_07_coverage_group(self):
        p=build().coverage_plan(); fam=next(x for x in p["families"] if x["structure_signature"]=="search-filter-v1"); self.assertEqual(fam["equivalent_event_count"],2); self.assertEqual(len(fam["suppressed_equivalent_event_ids"]),1)
    def test_08_duplicate_retry(self):
        r=build(F["actions"][:7]); before=len(r.state["journey_ledger"]); prior,dup=r.record_product_action(**F["actions"][4]); self.assertTrue(dup); self.assertEqual(len(r.state["journey_ledger"]),before); self.assertEqual(prior["action_id"],"act-create-save")
    def test_09_resume(self):
        r=build(F["actions"][:7]); cp=r.checkpoint(); self.assertEqual(cp["last_completed_action_id"],"act-create-fill"); self.assertEqual([x["action_id"] for x in r.next_resume_actions(cp["resume_token"])],["act-create-save","act-open-edit","act-edit-save"])
    def test_10_restart(self):
        r=build(F["actions"][:7])
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/"s.json"; r.save(p); rr=UserJourneyStateRecorder.load(p); cp=rr.checkpoint(); self.assertEqual(cp["last_completed_action_id"],"act-create-fill"); self.assertEqual(len(rr.next_resume_actions(cp["resume_token"])),3)
    def test_11_tamper(self):
        r=build(); s=r.export_state(); s["journey_ledger"][1]["ui_state_after"]="X"
        with self.assertRaises(ValueError): UserJourneyStateRecorder(session_id=F["session_id"],mission_id=F["mission_id"],state=s)
    def test_12_wrong_token(self):
        r=build(F["actions"][:7])
        with self.assertRaises(ValueError): r.next_resume_actions("wrong")
if __name__=="__main__": unittest.main()
