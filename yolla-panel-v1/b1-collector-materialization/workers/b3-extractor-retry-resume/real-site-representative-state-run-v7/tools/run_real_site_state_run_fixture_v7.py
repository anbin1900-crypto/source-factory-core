import importlib.util, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("mod", ROOT/"src"/"real_site_state_run_v7.py")
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
plan=json.loads((ROOT/"REAL_SITE_STATE_RUN_PLAN_V1.json").read_text(encoding="utf-8"))
fix=json.loads((ROOT/"fixtures"/"successor_receipts_v7.json").read_text(encoding="utf-8"))
c=mod.RealSiteStateRunConsumer(plan)
for r in fix["all_success"]:
    out=c.consume_receipt(r)
assert c.observed_coverage()["observed_transition_count"]==7
assert c.unknown_coverage()["selected_unknown_count"]==0
assert c.unknown_coverage()["latent_unknown_count"]==2
d=mod.RealSiteStateRunConsumer(plan); d.consume_receipt(fix["all_success"][0]); dup=d.consume_receipt(fix["all_success"][0])
a=mod.RealSiteStateRunConsumer(plan); blocked=a.consume_receipt(fix["auth_blocked"])
b=mod.RealSiteStateRunConsumer(plan); bypass=b.consume_receipt(fix["auth_bypass_attempt"])
receipt={
  "schema_version":"B3_REAL_SITE_STATE_RUN_FIXTURE_RECEIPT_V7",
  "fixture_only":True,
  "all_success_observed_transition_count":c.observed_coverage()["observed_transition_count"],
  "all_success_flow_coverage_complete":all(x["coverage_complete"] for x in c.observed_coverage()["flows"].values()),
  "duplicate_result":dup["result"],
  "auth_blocked_result":blocked["result"],
  "auth_bypass_result":bypass["result"],
  "latent_unknown_preserved":c.unknown_coverage()["latent_unknown_count"],
  "real_site_receipts_claimed":False,
  "auth_bypass":False
}
(ROOT/"generated"/"B3_REAL_SITE_STATE_RUN_FIXTURE_RECEIPT_V7.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(receipt,ensure_ascii=False))
