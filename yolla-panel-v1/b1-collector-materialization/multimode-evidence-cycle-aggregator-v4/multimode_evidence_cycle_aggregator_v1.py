#!/usr/bin/env python3
import json,sys
REQ=["DATA","PRODUCT","WRITE","MY_LISTING","EDIT"]
def aggregate(d):
    lin=d["lineage"]; seen=set(); unique=[]; dup=stale=0
    for r in d["mode_results"]:
        if any(r.get(k)!=lin[k] for k in ("command_id","session_id","page_id","evidence_lineage_id")):
            stale+=1; continue
        key=(r["command_id"],r["mode"],r["result_id"])
        if key in seen:
            dup+=1; continue
        seen.add(key); unique.append(r)
    idx={r["mode"]:r for r in unique}
    missing=[m for m in REQ if m not in idx]
    cycle_terminal=not missing and all(idx[m]["terminal"] in ("COMPLETE","BLOCKED") for m in REQ)
    return {"lineage":lin,"mode_index":idx,"duplicate_suppressed":dup,"stale_suppressed":stale,"missing_modes":missing,"cycle_terminal":cycle_terminal}
if __name__=="__main__":
    print(json.dumps(aggregate(json.load(open(sys.argv[1],encoding="utf-8"))),ensure_ascii=False,sort_keys=True))
