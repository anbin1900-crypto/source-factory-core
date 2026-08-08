import importlib.util,json,tempfile,unittest,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("m",ROOT/"src/listing_lifecycle_state_coverage_v1.py");m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
FIX=json.loads((ROOT/"fixtures/listing_lifecycle_fixture_v1.json").read_text())
class T(unittest.TestCase):
 def engine(self):return m.ListingLifecycleCoverage()
 def ev(self,i=0):return copy.deepcopy(FIX["events"][i])
 def test_01_states(self):self.assertEqual(len(m.CANONICAL_STATES),8)
 def test_02_caps(self):self.assertEqual(len(m.CAPABILITIES),5)
 def test_03_transitions(self):self.assertEqual(len(m.TRANSITIONS),23)
 def test_04_required_states(self):self.assertEqual(set(m.CANONICAL_STATES),{"DRAFT","VALIDATION_ERROR","SUBMITTED","PUBLISHED","REJECTED","PAUSED","CLOSED","DELETED"})
 def test_05_create_no_ownership(self):self.assertTrue(self.engine().ownership_decision(self.ev(0))["authorized"])
 def test_06_edit_ownership(self):self.assertTrue(self.engine().ownership_decision(self.ev(5))["authorized"])
 def test_07_edit_auth_block(self):
  e=self.ev(5);e["authenticated_session"]=False;self.assertEqual(self.engine().apply(e)["reason"],"AUTH_REQUIRED")
 def test_08_ownership_mismatch(self):
  e=self.ev(5);e["ownership_evidence"]["owner_ref_hash"]="other";self.assertEqual(self.engine().apply(e)["reason"],"OWNERSHIP_MISMATCH")
 def test_09_listing_mismatch(self):
  e=self.ev(5);e["ownership_evidence"]["listing_ref_hash"]="other";self.assertEqual(self.engine().apply(e)["reason"],"LISTING_EVIDENCE_MISMATCH")
 def test_10_public_noauth(self):self.assertEqual(self.engine().apply({"capability":"PUBLIC_READ","action":"VIEW_PUBLIC","from_state":"PUBLISHED","to_state":"PUBLISHED","listing_ref_hash":"lst","command_id":"c","page_id":"p","action_id":"a","authenticated_session":False})["status"],"APPLIED")
 def test_11_final_submit_block(self):
  e=self.ev(0);e["final_submit"]=True;self.assertEqual(self.engine().apply(e)["reason"],"FINAL_SUBMIT_PROHIBITED_THIS_CYCLE")
 def test_12_duplicate(self):
  e=self.ev(0);x=self.engine();self.assertEqual(x.apply(e)["status"],"APPLIED");self.assertEqual(x.apply(e)["status"],"DUPLICATE_SUPPRESSED")
 def test_13_idem(self):self.assertEqual(m.ListingLifecycleCoverage.idempotency_key(self.ev()),m.ListingLifecycleCoverage.idempotency_key(self.ev()))
 def test_14_variant(self):x=self.engine();x.apply(self.ev(1));self.assertEqual(x.state["raw_site_variants"][0]["raw_after"],"FORM_ERROR")
 def test_15_replay(self):self.assertEqual(self.engine().replay(FIX["events"])["applied_count"],10)
 def test_16_checkpoint(self):x=self.engine();x.replay(FIX["events"][:3]);self.assertEqual(x.state["resume_checkpoint"]["last_action_id"],"act-03")
 def test_17_save_load(self):
  x=self.engine();x.replay(FIX["events"][:3]);
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/"s.json";x.save(p);self.assertEqual(m.ListingLifecycleCoverage.load(p).state["resume_checkpoint"]["last_action_id"],"act-03")
 def test_18_restart_dedupe(self):
  x=self.engine();x.replay(FIX["events"][:2]);
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/"s.json";x.save(p);y=m.ListingLifecycleCoverage.load(p);self.assertEqual(y.apply(self.ev(1))["status"],"DUPLICATE_SUPPRESSED")
 def test_19_gap_count(self):self.assertEqual(self.engine().gap_receipt()["waiting_or_unknown_count"],5)
 def test_20_no_guess(self):self.assertFalse(self.engine().gap_receipt()["target_value_guessing"])
 def test_21_no_final(self):self.assertFalse(self.engine().gap_receipt()["final_write_or_edit_submit"])
 def test_22_bad_transition(self):
  e=self.ev();e["to_state"]="PUBLISHED";
  with self.assertRaises(ValueError):self.engine().apply(e)
 def test_23_bad_state(self):
  e=self.ev();e["from_state"]="BOGUS";
  with self.assertRaises(ValueError):self.engine().apply(e)
 def test_24_no_pii(self):
  t=(ROOT/"fixtures/listing_lifecycle_fixture_v1.json").read_text();self.assertNotIn("@",t);self.assertNotIn("password",t.lower())
if __name__=="__main__":unittest.main()
