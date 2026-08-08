import importlib.util, json, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("mod", ROOT/"src"/"real_site_state_run_v7.py")
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
PLAN = json.loads((ROOT/"REAL_SITE_STATE_RUN_PLAN_V1.json").read_text(encoding="utf-8"))
FIX = json.loads((ROOT/"fixtures"/"successor_receipts_v7.json").read_text(encoding="utf-8"))

class T(unittest.TestCase):
    def new(self): return mod.RealSiteStateRunConsumer(PLAN)
    def test_plan_has_four_flows(self): self.assertEqual({x["flow"] for x in PLAN["scenarios"]},{"PUBLIC_READ","CREATE","MY_LISTING","EDIT"})
    def test_plan_has_seven_selected(self): self.assertEqual(sum(len(x["steps"]) for x in PLAN["scenarios"]),7)
    def test_initial_result_waits(self):
        r=self.new().result(); self.assertEqual(r["status"],"AWAITING_SUCCESSOR_RECEIPTS"); self.assertEqual(r["real_observed_transition_count"],0)
    def test_initial_unknown_seven_plus_two_latent(self):
        u=self.new().unknown_coverage(); self.assertEqual(u["selected_unknown_count"],7); self.assertEqual(u["latent_unknown_count"],2)
    def test_all_success_observes_all(self):
        c=self.new()
        for r in FIX["all_success"]: self.assertEqual(c.consume_receipt(r)["result"],"OBSERVED")
        self.assertEqual(c.observed_coverage()["observed_transition_count"],7)
        self.assertTrue(all(x["coverage_complete"] for x in c.observed_coverage()["flows"].values()))
    def test_duplicate_receipt_suppressed(self):
        c=self.new(); r=FIX["all_success"][0]; c.consume_receipt(r); self.assertEqual(c.consume_receipt(r)["result"],"DUPLICATE_RECEIPT_SUPPRESSED")
    def test_idempotent_new_receipt_id_suppressed(self):
        c=self.new(); r=dict(FIX["all_success"][0]); c.consume_receipt(r); r["receipt_id"]="rcpt-other"; self.assertEqual(c.consume_receipt(r)["result"],"IDEMPOTENT_RECEIPT_SUPPRESSED")
    def test_auth_blocked_not_observed(self):
        c=self.new(); out=c.consume_receipt(FIX["auth_blocked"]); self.assertEqual(out["result"],"NOT_OBSERVED"); self.assertEqual(c.observed_coverage()["observed_transition_count"],0)
    def test_auth_bypass_rejected(self):
        self.assertEqual(self.new().consume_receipt(FIX["auth_bypass_attempt"])["reason"],"AUTH_BYPASS_PROHIBITED")
    def test_state_mismatch_unknown(self):
        c=self.new(); out=c.consume_receipt(FIX["state_mismatch"]); self.assertEqual(out["reason"],"STATE_EVIDENCE_MISMATCH")
    def test_correlation_mismatch_rejected(self):
        c=self.new(); r=dict(FIX["all_success"][0]); r["page_id"]="wrong"; self.assertTrue(c.consume_receipt(r)["reason"].startswith("CORRELATION_MISMATCH"))
    def test_restart_state_preserves_observed_and_resume(self):
        c=self.new()
        for r in FIX["all_success"][:4]: c.consume_receipt(r)
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/"s.json"; c.save_state(p); d=mod.RealSiteStateRunConsumer.load_state(PLAN,p)
            self.assertEqual(d.observed_coverage()["observed_transition_count"],4)
            self.assertEqual(d.observed_coverage()["flows"]["CREATE"]["resume_after_action_id"],"act-create-fill")

if __name__=="__main__":
    unittest.main()
