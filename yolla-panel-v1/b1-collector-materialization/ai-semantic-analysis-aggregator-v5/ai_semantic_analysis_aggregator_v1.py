import json, sys
from pathlib import Path

MODES=["DATA","PRODUCT","WRITE","MY_LISTING","EDIT"]

def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def aggregate(snapshot, fixture):
    modes=list(fixture["lanes"].keys())
    if modes != MODES:
        raise ValueError("LANE_SET_OR_ORDER_MISMATCH")
    identity=fixture["common_evidence_identity"]
    if not all(identity.get(k) for k in ["cycle_id","command_id","session_id","page_id","evidence_lineage_id"]):
        raise ValueError("COMMON_EVIDENCE_IDENTITY_INCOMPLETE")
    lanes={}
    for mode in MODES:
        lane=fixture["lanes"][mode]
        if lane["mode"] != mode:
            raise ValueError("LANE_MODE_MISMATCH")
        if lane.get("actual_result") != "PENDING_EXACT_WORKER_RESULT":
            raise ValueError("FIXTURE_PROMOTED_TO_ACTUAL")
        lanes[mode]={"mode":mode,"common_evidence_identity":identity,"fixture_projection":lane["fixture_projection"],"actual_result_status":"PENDING_EXACT_WORKER_RESULT","payload_isolated":True}
    return {"schema_version":"AI_ANALYSIS_RESULT_BUNDLE_V1_FIXTURE_INSTANCE","cycle_id":snapshot["cycle_id"],"common_evidence_identity":identity,"worker_authority_snapshot":"CYCLE5_WORKER_AUTHORITY_SNAPSHOT_V1.json","lanes":lanes,"actual_worker_cycle5_terminal_count":snapshot["actual_cycle5_terminal_count"],"actual_worker_cycle5_result_count":snapshot["actual_cycle5_result_count"],"context_independent":True,"fixture_projection_only":True}

if __name__=="__main__":
    if len(sys.argv)!=4:
        raise SystemExit("usage: aggregator SNAPSHOT FIXTURE OUTPUT")
    snapshot=load(sys.argv[1]); fixture=load(sys.argv[2])
    out=aggregate(snapshot,fixture)
    Path(sys.argv[3]).write_text(json.dumps(out,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("PASS",len(out["lanes"]),out["actual_worker_cycle5_result_count"])
