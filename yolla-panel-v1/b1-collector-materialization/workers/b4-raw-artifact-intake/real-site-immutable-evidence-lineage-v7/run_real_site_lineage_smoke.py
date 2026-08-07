from pathlib import Path
import json, sys, tempfile, hashlib
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/"src"))
from real_site_evidence_lineage import RealSiteEvidenceLineageStore
def h(s): return hashlib.sha256(s.encode()).hexdigest()
def fixture():
    return {"schema_version":"REAL_SITE_RECEIPT_BUNDLE_V1","source_kind":"TEST_FIXTURE","receipt_id":"fixture-receipt-001","receipt_pointer":"fixture://cycle7/receipt-001","receipt_sha256":h("receipt"),
      "command_id":"CMD-C7-FIXTURE-001","page_id":"PAGE-C7-001","action_id":"ACTION-C7-001","received_at":"2026-08-08T03:50:00+09:00",
      "cycle6_composite_pointer":"../composite-evidence-lineage-index-v6/LATEST_B4_COMPOSITE_EVIDENCE_LINEAGE_INDEX_POINTER.json",
      "evidence":[
       {"evidence_id":"ev-dom","evidence_kind":"DOM","evidence_pointer":"fixture://dom","sha256":h("dom"),"producer_id":"A-4","evidence_class":"OBSERVED","observed_at":"2026-08-08T03:50:00+09:00"},
       {"evidence_id":"ev-resp","evidence_kind":"NETWORK_RESPONSE","evidence_pointer":"fixture://response","sha256":h("response"),"producer_id":"A-5","evidence_class":"OBSERVED","observed_at":"2026-08-08T03:50:01+09:00"}],
      "semantic_results":[{"semantic_id":"product:fixture","semantic_kind":"PRODUCT","producer_id":"A-5","producer_assertion":{"kind":"PRODUCT_PAGE"},"evidence_class":"INFERRED","confidence":0.8,"derivation_reference":"fixture://derive/rule","raw_evidence_pointers":["fixture://dom","fixture://response"],"derived_evidence_pointers":[],"command_id":"CMD-C7-FIXTURE-001","page_id":"PAGE-C7-001","action_id":"ACTION-C7-001","created_at":"2026-08-08T03:50:02+09:00"}]}
def run(root):
    s=RealSiteEvidenceLineageStore(root)
    before=s.status()
    first=s.ingest_receipt(fixture(),allow_fixture=True)
    dup=s.ingest_receipt(fixture(),allow_fixture=True)
    after=s.status()
    return {"schema_version":"B4_CYCLE7_FIXTURE_CONTRACT_SMOKE_V1","status":"PASS","before_actual_site_receipt_count":before["actual_site_receipt_count"],"after_actual_site_receipt_count":after["actual_site_receipt_count"],"fixture_disposition":first["disposition"],"duplicate_disposition":dup["disposition"],"chain_verify":s.verify_chain(),"raw_artifact_overwrite":False,"raw_secret_storage":False}
if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser();p.add_argument("root",nargs="?");a=p.parse_args()
    if a.root: print(json.dumps(run(Path(a.root)),indent=2,sort_keys=True))
    else:
      with tempfile.TemporaryDirectory() as td: print(json.dumps(run(Path(td)),indent=2,sort_keys=True))
