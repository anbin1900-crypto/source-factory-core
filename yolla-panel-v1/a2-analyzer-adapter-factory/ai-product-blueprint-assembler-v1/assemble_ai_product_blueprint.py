#!/usr/bin/env python3
import argparse, json, hashlib
from pathlib import Path

GRAPH_KEYS = [
    "PAGE_GRAPH","COMPONENT_GRAPH","FEATURE_GRAPH","USER_ACTION_GRAPH",
    "STATE_MACHINE","API_UI_BINDING_GRAPH","DATA_ENTITY_GRAPH","DEPENDENCY_GRAPH"
]
STATE_FACTOR = {"OBSERVED":1.0,"INFERRED":0.6,"UNKNOWN":0.0}
ALLOWED_STATES = set(STATE_FACTOR)

TYPE_TARGETS = {
    "PAGE_ROLE": ["PAGE_GRAPH"],
    "DOM_FIELD": ["COMPONENT_GRAPH","DATA_ENTITY_GRAPH"],
    "FORM_FIELD": ["COMPONENT_GRAPH","FEATURE_GRAPH"],
    "ACTION_NETWORK_BINDING": ["USER_ACTION_GRAPH","API_UI_BINDING_GRAPH","DEPENDENCY_GRAPH"],
    "MY_LISTING_ROW": ["FEATURE_GRAPH","DATA_ENTITY_GRAPH"],
    "EDIT_FLOW": ["USER_ACTION_GRAPH","STATE_MACHINE","DEPENDENCY_GRAPH"],
    "UI_STATE": ["STATE_MACHINE"],
    "DATA_ENTITY": ["DATA_ENTITY_GRAPH"],
    "FEATURE_DEPENDENCY": ["FEATURE_GRAPH","DEPENDENCY_GRAPH"],
}

def stable_digest(obj):
    data = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",",":")).encode()
    return hashlib.sha256(data).hexdigest()

def assertion_meta(e):
    return {
        "assertion_state": e["assertion_state"],
        "confidence": float(e["confidence"]),
        "evidence_pointer": e.get("evidence_pointer"),
        "evidence_id": e["evidence_id"],
    }

def validate(evidence):
    required = ["evidence_id","evidence_type","assertion_state","confidence","consumer_modes"]
    errors=[]
    for e in evidence:
        for k in required:
            if k not in e: errors.append(f"{e.get('evidence_id','?')}:missing:{k}")
        st=e.get("assertion_state")
        if st not in ALLOWED_STATES: errors.append(f"{e.get('evidence_id','?')}:bad_state:{st}")
        c=e.get("confidence")
        if not isinstance(c,(int,float)) or not 0 <= c <= 1: errors.append(f"{e.get('evidence_id','?')}:bad_confidence")
        if st in {"OBSERVED","INFERRED"} and not e.get("evidence_pointer"):
            errors.append(f"{e.get('evidence_id','?')}:missing_evidence_pointer")
        if st=="UNKNOWN" and e.get("payload") not in (None,{},[]):
            errors.append(f"{e.get('evidence_id','?')}:unknown_payload_fabrication")
    if errors:
        raise ValueError(";".join(errors))

def make_node(graph, e):
    payload=e.get("payload") or {}
    node={
        "node_id": payload.get("node_id") or e["evidence_id"],
        "kind": payload.get("kind") or e["evidence_type"],
        **assertion_meta(e),
    }
    for k in ("label","role","entity_type","state","action","api_ref","component_ref","page_ref"):
        if k in payload: node[k]=payload[k]
    graph["nodes"].append(node)

def make_edge(graph, e):
    payload=e.get("payload") or {}
    if payload.get("from") and payload.get("to"):
        graph["edges"].append({
            "edge_id": payload.get("edge_id") or f"{e['evidence_id']}::edge",
            "from": payload["from"],
            "to": payload["to"],
            "relation": payload.get("relation","RELATED"),
            **assertion_meta(e),
        })

def assemble(doc):
    evidence=doc["shared_evidence"]
    validate(evidence)
    graphs={k:{"nodes":[],"edges":[]} for k in GRAPH_KEYS}
    unknown=[]
    for e in evidence:
        if e["assertion_state"]=="UNKNOWN":
            unknown.append({
                "evidence_id":e["evidence_id"],
                "evidence_type":e["evidence_type"],
                "reason":e.get("unknown_reason","UNOBSERVED_OR_UNRESOLVED"),
                "consumer_modes":e["consumer_modes"],
                "confidence":e["confidence"],
                "evidence_pointer":e.get("evidence_pointer"),
            })
            continue
        targets=e.get("graph_targets") or TYPE_TARGETS.get(e["evidence_type"],["FEATURE_GRAPH"])
        for t in targets:
            if t not in graphs:
                continue
            make_node(graphs[t],e)
            make_edge(graphs[t],e)

    priorities=[]
    for e in evidence:
        if e["assertion_state"]=="UNKNOWN":
            continue
        dep = 1 + len(e.get("consumer_modes",[]))
        score=round(float(e["confidence"])*STATE_FACTOR[e["assertion_state"]]*dep,4)
        priorities.append({
            "evidence_id":e["evidence_id"],
            "priority_score":score,
            "priority_band":"P0" if score>=3.0 else ("P1" if score>=1.5 else "P2"),
            **assertion_meta(e),
        })
    priorities.sort(key=lambda x:(-x["priority_score"],x["evidence_id"]))

    coverage_items=doc.get("coverage_items",[])
    denom=sum(float(x["weight"]) for x in coverage_items) or 1.0
    numer=0.0
    breakdown=[]
    for x in coverage_items:
        factor=STATE_FACTOR[x["assertion_state"]]
        contribution=float(x["weight"])*factor*float(x["confidence"])
        numer += contribution
        breakdown.append({**x,"state_factor":factor,"contribution":round(contribution,4)})
    coverage=round(numer/denom*100,2)

    result={
        "schema_version":"AI_PRODUCT_BLUEPRINT_V1",
        "site_id":doc["site_id"],
        "source_model":"COMMON_SITE_EVIDENCE_MODEL_V2",
        **graphs,
        "UNKNOWN_INDEX":unknown,
        "IMPLEMENTATION_PRIORITY":priorities,
        "CRITICAL_PRODUCT_STRUCTURE_COVERAGE":{
            "score":coverage,
            "purpose":"AI_IMPLEMENTATION_DIRECTION_REDUCTION",
            "pixel_clone_accuracy":False,
            "breakdown":breakdown,
        },
        "legacy_data_projection":doc.get("legacy_data_projection",[]),
        "external_exact_bindings":doc.get("external_exact_bindings",{}),
        "boundaries":{
            "target_pc_execution":False,
            "live_site_call":False,
            "production":False,
            "ready":False,
            "merge":False
        },
    }
    result["blueprint_digest_sha256"]=stable_digest(result)
    return result

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--input",required=True)
    p.add_argument("--output",required=True)
    a=p.parse_args()
    src=json.loads(Path(a.input).read_text(encoding="utf-8"))
    out=assemble(src)
    Path(a.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({
        "status":"PASS",
        "schema":out["schema_version"],
        "coverage":out["CRITICAL_PRODUCT_STRUCTURE_COVERAGE"]["score"],
        "unknown_count":len(out["UNKNOWN_INDEX"]),
        "priority_count":len(out["IMPLEMENTATION_PRIORITY"]),
        "digest":out["blueprint_digest_sha256"]
    },ensure_ascii=False))

if __name__=="__main__":
    main()
