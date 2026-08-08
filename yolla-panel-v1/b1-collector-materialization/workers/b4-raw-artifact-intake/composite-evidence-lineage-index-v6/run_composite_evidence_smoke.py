from __future__ import annotations
import json, sys, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/"src"))
from composite_evidence_lineage import CompositeEvidenceLineageIndex
SEM=json.loads((ROOT/"artifacts/UPSTREAM_SEMANTIC_FIXTURE_MINIMAL_V1.json").read_text())
RAW=set(json.loads((ROOT/"artifacts/UPSTREAM_CYCLE4_RAW_EVIDENCE_IDS_V1.json").read_text()))
def run(root:Path):
    s=CompositeEvidenceLineageIndex(root,SEM,RAW)
    specs=[
      ("composite:data:listing","NODE","DATA","B5-DATA",{"kind":"listing-record"},["semantic://000001/1b159296e1d7a0e2"]),
      ("composite:product:page","NODE","PRODUCT","A5-BLUEPRINT",{"kind":"product-page"},["semantic://000002/638acd2802e0181e"]),
      ("composite:write:submit","EDGE","WRITE","A6-WRITE",{"relation":"SUBMITS"},["semantic://000003/bfe032df074f89e6"]),
      ("composite:my-listing:editor","NODE","MY_LISTING","A5-BLUEPRINT",{"kind":"owned-editor"},["semantic://000001/1b159296e1d7a0e2","semantic://000002/638acd2802e0181e"]),
      ("composite:edit:save","EDGE","EDIT","A6-EDIT",{"relation":"SAVES"},["semantic://000002/638acd2802e0181e","semantic://000003/bfe032df074f89e6"]),
    ]
    out=[]
    for i,(cid,typ,mode,pid,assertion,ptrs) in enumerate(specs,1):
        out.append(s.append(composite_id=cid,composite_entity_type=typ,mode=mode,producer_id=pid,producer_assertion=assertion,semantic_evidence_pointers=ptrs,created_at=f"2026-08-08T03:0{i}:00+09:00"))
    dup=s.append(composite_id=specs[0][0],composite_entity_type=specs[0][1],mode=specs[0][2],producer_id=specs[0][3],producer_assertion=specs[0][4],semantic_evidence_pointers=specs[0][5],created_at="2026-08-08T03:09:00+09:00")
    traces=[s.reverse_trace(x["entry"]["composite_pointer"]) for x in out]
    s.verify()
    result={"schema_version":"B4_COMPOSITE_EVIDENCE_LINEAGE_SMOKE_RESULT_V1","status":"PASS","entry_count":len(out),"mode_count":len({x["entry"]["mode"] for x in out}),"modes":sorted({x["entry"]["mode"] for x in out}),"node_count":sum(x["entry"]["composite_entity_type"]=="NODE" for x in out),"edge_count":sum(x["entry"]["composite_entity_type"]=="EDGE" for x in out),"duplicate_disposition":dup["disposition"],"reverse_trace_count":len(traces),"reverse_trace_raw_total":sum(len(t["raw_evidence_pointers"]) for t in traces),"reverse_trace_derived_total":sum(len(t["derived_evidence_pointers"]) for t in traces),"raw_artifact_materialization_count":0,"raw_artifact_overwrite":False,"semantic_decision_by_b4":False}
    assert result["entry_count"]==5 and result["mode_count"]==5 and result["duplicate_disposition"]=="DUPLICATE_IDENTICAL_SUPPRESSED"
    return result,s.rebuild_projection(),traces
if __name__=="__main__":
    with tempfile.TemporaryDirectory() as td:
        r,p,t=run(Path(td)); print(json.dumps(r,indent=2,sort_keys=True))
