import copy, json, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ai_yolla_pc_environment_wave3_e2e import (
    Wave3E2E, GateError, compute_duplicate_key, validate_input_matrix,
    validate_authority, simulate_rollback, sha256_text
)
MATRIX=json.loads((ROOT/"AI_YOLLA_WAVE3_EXACT_INPUT_MATRIX.json").read_text(encoding="utf-8"))
FIXTURE=json.loads((ROOT/"fixtures"/"THREE_SERVICE_PC_ENVIRONMENT_E2E_FIXTURE.json").read_text(encoding="utf-8"))

class Wave3Tests(unittest.TestCase):
    def new(self):
        obj=Wave3E2E(copy.deepcopy(MATRIX),copy.deepcopy(FIXTURE))
        obj.bind_services()
        return obj
    def assertCode(self, code, fn):
        with self.assertRaises(GateError) as cm: fn()
        self.assertTrue(cm.exception.code.startswith(code), cm.exception.code)
    def test_01_exact_input_matrix(self): validate_input_matrix(copy.deepcopy(MATRIX))
    def test_02_exact_input_count(self): self.assertEqual(MATRIX["accepted_input_count"],4)
    def test_03_duplicate_key_authority(self):
        self.assertEqual(MATRIX["duplicate_prompt_key"], compute_duplicate_key("C-6",MATRIX["directive_id"],"WAVE_3",MATRIX["directive_registered_at_kst"]))
    def test_04_authority_fresh(self): validate_authority(copy.deepcopy(FIXTURE["runtime_authority"]),MATRIX["directive_registered_at_kst"])
    def test_05_three_services(self): self.assertEqual(len(self.new().sessions),3)
    def test_06_unique_service_sessions(self):
        x=self.new(); self.assertEqual(len({s.workspace_service_session_id for s in x.sessions.values()}),3)
    def test_07_same_context_snapshot(self):
        x=self.new(); self.assertEqual({s.context_snapshot_id for s in x.sessions.values()},{"20260802100335Z"})
    def test_08_common_runtime(self):
        x=self.new(); self.assertEqual({s.browser_session_id for s in x.sessions.values()},{"browser-c6-existing-runtime"})
    def test_09_three_service_e2e(self):
        x=self.new(); receipts=[]
        for sid in x.sessions:
            receipts.append(x.run_service(sid, unique_prompt_key=sha256_text(MATRIX["duplicate_prompt_key"]+"|"+sid)))
        self.assertEqual(len(receipts),3); self.assertEqual(sum(r["actual_pc_dispatch_count"] for r in receipts),0)
    def test_10_cross_service_leak_reject(self):
        x=self.new(); sid=list(x.sessions)[0]; other=list(x.sessions)[1]
        self.assertCode("CROSS_SERVICE_RESULT_REJECT",lambda:x.record_foreign_result(sid,{"service_id":other,"context_snapshot_id":x.sessions[sid].context_snapshot_id}))
    def test_11_cross_context_leak_reject(self):
        x=self.new(); sid=list(x.sessions)[0]
        self.assertCode("CROSS_CONTEXT_RESULT_REJECT",lambda:x.record_foreign_result(sid,{"service_id":sid,"context_snapshot_id":"wrong"}))
    def test_12_stale_context_reject(self):
        x=self.new(); sid=list(x.sessions)[0]; self.assertCode("REJECT_STALE_PC_CONTEXT",lambda:x.admit(sid,{},context_fresh=False))
    def test_13_missing_runtime_acceptance_reject(self):
        x=self.new(); sid=list(x.sessions)[0]; self.assertCode("REJECT_RUNTIME_UNVERIFIED",lambda:x.admit(sid,{},target_pc_accepted=False))
    def test_14_runtime_mismatch_reject(self):
        x=self.new(); sid=list(x.sessions)[0]; self.assertCode("REJECT_RUNTIME_VERSION_MISMATCH",lambda:x.admit(sid,{},runtime_version="bad"))
    def test_15_stale_wave_reject(self):
        x=self.new(); sid=list(x.sessions)[0]; self.assertCode("REJECT_STALE_WAVE",lambda:x.admit(sid,{},wave_id="WAVE_2"))
    def test_16_sensitive_value_reject(self):
        x=self.new(); sid=list(x.sessions)[0]; self.assertCode("SENSITIVE_VALUE_REJECT",lambda:x.admit(sid,{"token":"secret"}))
    def test_17_runtime_health_reject(self):
        x=self.new(); sid=list(x.sessions)[0]; self.assertCode("REJECT_RUNTIME_HEALTH_BLOCKED",lambda:x.admit(sid,{},runtime_health="BLOCKED"))
    def test_18_bad_prompt_key_reject(self):
        x=self.new(); sid=list(x.sessions)[0]; self.assertCode("DUPLICATE_PROMPT_KEY_MISMATCH",lambda:x.admit(sid,{},prompt_key="0"*64))
    def test_19_duplicate_reject(self):
        x=self.new(); sid=list(x.sessions)[0]; self.assertEqual(x.admit(sid,{}),"ADMIT_CONTRACT_FIXTURE_ONLY"); self.assertCode("REJECT_DUPLICATE",lambda:x.admit(sid,{}))
    def test_20_accepted_replay_reject(self):
        x=self.new(); sid=list(x.sessions)[0]; self.assertCode("REJECT_ALREADY_ACCEPTED",lambda:x.admit(sid,{},accepted_replay=True))
    def test_21_restart_recovery(self):
        x=self.new(); sid=list(x.sessions)[0]; x.run_service(sid,unique_prompt_key=sha256_text(MATRIX["duplicate_prompt_key"]+"|"+sid))
        state=x.snapshot(); restored=Wave3E2E.restore(copy.deepcopy(MATRIX),copy.deepcopy(FIXTURE),state); self.assertEqual(restored.snapshot(),state)
    def test_22_rollback_blob_parity(self):
        pre={"safe_panel.html":"a"*40,"safe_panel_renderer.js":"b"*40,"safe_panel.css":"c"*40}; changed={k:"d"*40 for k in pre}
        self.assertEqual(simulate_rollback(pre,changed)["rollback_blob_parity"],"PASS")
    def test_23_c4_unverified_preserved(self):
        self.assertEqual(FIXTURE["c4_safe_display"]["overall_state"],"RUNTIME_UNVERIFIED"); self.assertTrue(FIXTURE["c6_context_reconciliation"]["does_not_mutate_c4_card"])
    def test_24_zero_side_effects(self):
        s=FIXTURE["safety"]; self.assertEqual(s["actual_pc_dispatch_count"],0); self.assertEqual(s["actual_panel_apply_count"],0)
    def test_25_zero_clones(self):
        s=FIXTURE["safety"]; self.assertEqual(s["common_core_source_clone_count"],0); self.assertEqual(s["service_browser_runtime_clone_count"],0); self.assertEqual(s["service_prompt_transport_clone_count"],0)
    def test_26_head_drift_reject(self):
        data=copy.deepcopy(MATRIX); data["inputs"]["C-3"]["head"]="bad"; self.assertCode("C-3_HEAD_INVALID",lambda:validate_input_matrix(data))
    def test_27_terminal_drift_reject(self):
        data=copy.deepcopy(MATRIX); data["inputs"]["C-5"]["terminal"]="FAIL"; self.assertCode("C-5_TERMINAL_MISMATCH",lambda:validate_input_matrix(data))

if __name__=="__main__": unittest.main()
