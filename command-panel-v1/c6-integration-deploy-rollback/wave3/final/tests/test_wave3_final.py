import copy,json,unittest
from pathlib import Path
from ai_yolla_wave3_integration import *
R=Path(__file__).resolve().parents[1]
M=json.loads((R/"AI_YOLLA_WAVE3_EXACT_INPUT_MATRIX.json").read_text(encoding="utf-8"))
F=json.loads((R/"fixtures/AI_YOLLA_WAVE3_PC_ENVIRONMENT_E2E_FIXTURE.json").read_text(encoding="utf-8"))
class T(unittest.TestCase):
 def test_matrix(self):self.assertTrue(matrix_ok(M)["pass"])
 def test_key(self):
  p=F["admission_prompt"];self.assertEqual(p["duplicate_prompt_key"],dkey(p["role_id"],p["directive_id"],p["wave_id"],p["directive_registered_at_kst"]))
 def test_time(self):self.assertEqual(window(F)["captured"],"2026-08-02 19:03 KST")
 def test_fresh(self):self.assertEqual(window(F)["fresh"],"FRESH")
 def test_privacy(self):self.assertTrue(privacy_ok(F["pc_context"]))
 def test_card(self):self.assertEqual(card(F)["overall_state"],"TARGET_PC_ACCEPTED")
 def test_admit(self):
  x=admit(F);self.assertTrue(x["admitted"]);self.assertTrue(x["dispatch_contract"]["plan_only"]);self.assertFalse(x["dispatch_contract"]["actual_dispatch_performed"])
 def test_stale(self):
  c=context(F);c["freshness"]="STALE";self.assertEqual(admit(F,c=c)["decision"],"REJECT_STALE_PC_CONTEXT")
 def test_version(self):
  c=context(F);c["runtime_version"]="0";self.assertEqual(admit(F,c=c)["decision"],"REJECT_RUNTIME_VERSION_MISMATCH")
 def test_identity(self):
  c=context(F);c["service_id"]="X";self.assertEqual(admit(F,c=c)["decision"],"REJECT_ROLE_SERVICE_WAVE_MISMATCH")
 def test_bad_key(self):
  p=copy.deepcopy(F["admission_prompt"]);p["duplicate_prompt_key"]="0"*64;self.assertEqual(admit(F,p=p)["decision"],"REJECT_DUPLICATE")
 def test_duplicate(self):
  p=F["admission_prompt"];l=F["ledger"]+[{"duplicate_prompt_key":p["duplicate_prompt_key"]}];self.assertEqual(admit(F,l=l)["decision"],"REJECT_DUPLICATE")
 def test_replay(self):
  p=F["admission_prompt"];l=F["ledger"]+[{"role_id":p["role_id"],"directive_id":p["directive_id"],"wave_id":"WAVE_3","duplicate_prompt_key":"f"*64,"result_accepted":True}]
  self.assertEqual(admit(F,l=l)["decision"],"REJECT_ALREADY_ACCEPTED")
 def test_stale_wave(self):
  p=copy.deepcopy(F["admission_prompt"]);p["wave_id"]="WAVE_1";p["duplicate_prompt_key"]=dkey(p["role_id"],p["directive_id"],p["wave_id"],p["directive_registered_at_kst"]);c=context(F);c["wave_id"]="WAVE_1"
  self.assertEqual(admit(F,p=p,c=c,l=F["ledger"]+[{"role_id":"C-6","wave_id":"WAVE_4","duplicate_prompt_key":"a"*64}])["decision"],"REJECT_STALE_WAVE")
 def test_health(self):
  a=copy.deepcopy(F["runtime_authority"]);a["runtime_health_status"]="BLOCKED";self.assertEqual(admit(F,a=a)["decision"],"REJECT_RUNTIME_HEALTH_BLOCKED")
 def test_sensitive(self):
  p=copy.deepcopy(F["admission_prompt"]);p["payload"]["api_key"]="x";self.assertEqual(admit(F,p=p)["decision"],"REJECT_SENSITIVE_PAYLOAD")
 def test_scanner(self):self.assertTrue(scan({"password":"x"}))
 def test_e2e(self):
  x=run(F,M);self.assertTrue(x["pass"]);self.assertEqual(x["service_count"],3);self.assertEqual(x["session_count"],3)
 def test_restart(self):self.assertEqual(run(F,M)["restart_recovery"],"PASS")
 def test_rollback(self):self.assertEqual(run(F,M)["rollback_blob_parity"],"PASS")
 def test_zero(self):
  x=run(F,M);self.assertEqual(x["actual_pc_dispatch_count"],0);self.assertEqual(x["actual_panel_apply_count"],0)
if __name__=="__main__":unittest.main()
