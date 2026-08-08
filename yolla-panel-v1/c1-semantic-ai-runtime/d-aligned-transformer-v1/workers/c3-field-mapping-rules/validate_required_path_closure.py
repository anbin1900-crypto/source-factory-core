from __future__ import annotations
import hashlib, json, sys
from pathlib import Path

ALLOWED_CLASSES={"B1_PACKAGE_FIELD_MISSING","D1_MAPPING_CONTRACT_PATH_MISMATCH","C4_EVIDENCE_OR_CANDIDATE_DEPENDENCY","UNRESOLVED_EXTERNAL_AUTHORITY"}
REQUIRED_FIELDS=["RULE_ID","REQUIRED_SOURCE_PATH","TARGET_ENTITY","TARGET_FIELD","TARGET_TYPE","CURRENT_SOURCE_OBJECT","RESOLUTION_CLASS","RESOLUTION_OWNER","MINIMUM_REQUIRED_CHANGE","REJECTION_REASON","C4_PACKAGE_BEHAVIOR","RETRY_TRIGGER"]

def load(path:Path):
    return json.loads(path.read_text(encoding="utf-8"))

def sha_bytes(path:Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def canonical_sha(obj):
    return hashlib.sha256(json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()

def load_shards(root:Path,index:dict):
    entries=[]
    for ref in index["entry_shards"]:
        path=root/ref["path"]
        assert path.exists(), f"MISSING_SHARD:{path}"
        assert sha_bytes(path)==ref["sha256"], f"SHARD_SHA_MISMATCH:{path}"
        shard=load(path)
        assert shard["entry_count"]==ref["entry_count"]==len(shard["entries"])
        entries.extend(shard["entries"])
    assert len(entries)==index["entry_count"]
    return entries

def validate(root:Path):
    matrix=load(root/"PR188_REQUIRED_SOURCE_PATH_CLOSURE_MATRIX_V1.json")
    upstream=load(root/"C3_UPSTREAM_CHANGE_REQUEST_BUNDLE_V1.json")
    rejection=load(root/"C3_C4_REJECTION_INPUT_V1.json")
    rows=load_shards(root,matrix)
    rejects=load_shards(root,rejection)
    checks=[]
    def check(name,cond):
        if not cond: raise AssertionError(name)
        checks.append(name)
    check("required_count_22",len(rows)==22==matrix["required_path_count"]==matrix["entry_count"])
    check("rule_ids_unique",len({r["RULE_ID"] for r in rows})==22)
    check("required_fields_present",all(all(k in r for k in REQUIRED_FIELDS) for r in rows))
    check("exactly_one_class",all(r["RESOLUTION_CLASS"] in ALLOWED_CLASSES for r in rows))
    check("exactly_one_owner",all(isinstance(r["RESOLUTION_OWNER"],str) and r["RESOLUTION_OWNER"] for r in rows))
    check("minimum_change_defined",all(isinstance(r["MINIMUM_REQUIRED_CHANGE"],str) and r["MINIMUM_REQUIRED_CHANGE"] for r in rows))
    check("c4_behavior_defined",all(isinstance(r["C4_PACKAGE_BEHAVIOR"],str) and r["C4_PACKAGE_BEHAVIOR"] for r in rows))
    check("retry_defined",all(isinstance(r["RETRY_TRIGGER"],str) and r["RETRY_TRIGGER"] for r in rows))
    covered=[rid for req in upstream["requests"] for rid in req["AFFECTED_RULE_IDS"]]
    check("upstream_request_count_7",upstream["request_count"]==7)
    check("upstream_coverage_22",len(covered)==22 and set(covered)=={r["RULE_ID"] for r in rows})
    check("upstream_no_duplicates",len(set(covered))==22)
    check("rejection_count_22",len(rejects)==22==rejection["entry_count"])
    check("rejection_coverage_22",{x["RULE_ID"] for x in rejects}=={r["RULE_ID"] for r in rows})
    check("rejection_preserve_22",all(x["PRESERVE_SOURCE"] for x in rejects))
    class_counts={}
    owner_counts={}
    for r in rows:
        class_counts[r["RESOLUTION_CLASS"]]=class_counts.get(r["RESOLUTION_CLASS"],0)+1
        owner_counts[r["RESOLUTION_OWNER"]]=owner_counts.get(r["RESOLUTION_OWNER"],0)+1
    check("class_accounting",class_counts=={"B1_PACKAGE_FIELD_MISSING":6,"D1_MAPPING_CONTRACT_PATH_MISMATCH":1,"C4_EVIDENCE_OR_CANDIDATE_DEPENDENCY":15})
    check("owner_accounting",owner_counts=={"B-1_COLLECTION_DB_MATERIALIZATION_COMMANDER":6,"D-1_DOMAIN_KNOWLEDGE_DATABASE_COMMANDER":1,"C-4_EVIDENCE_AND_KNOWLEDGE_CANDIDATE":15})
    check("actual_resolution_zero",matrix["actual_path_resolution_count"]==0)
    check("unresolved_22",matrix["external_resolution_required_count"]==22)
    check("package_reject_4",rejection["package_reject_count"]==4)
    check("partial_eligible_18",rejection["partial_eligible_count"]==18)
    check("no_alias",matrix["accounting"]["alias_inference_count"]==0)
    check("no_invention",matrix["accounting"]["source_value_invention_count"]==0)
    check("no_silent_drop",matrix["accounting"]["silent_drop_count"]==0)
    check("first_blocker_b001",matrix["first_blocker"]["rule_id"]=="B001")
    check("production_false",not matrix["production"] and not rejection["production"] and not upstream["constraints"]["production"])
    check("ready_false",not matrix["ready"] and not rejection["ready"] and not upstream["constraints"]["ready"])
    check("merge_false",not matrix["merge"] and not rejection["merge"] and not upstream["constraints"]["merge"])
    check("matrix_shards_3",len(matrix["entry_shards"])==3)
    check("rejection_shards_3",len(rejection["entry_shards"])==3)
    return {"status":"PASS","check_count":len(checks),"checks":checks,"class_counts":class_counts,"owner_counts":owner_counts,
            "matrix_index_sha256":sha_bytes(root/"PR188_REQUIRED_SOURCE_PATH_CLOSURE_MATRIX_V1.json"),
            "upstream_sha256":sha_bytes(root/"C3_UPSTREAM_CHANGE_REQUEST_BUNDLE_V1.json"),
            "rejection_index_sha256":sha_bytes(root/"C3_C4_REJECTION_INPUT_V1.json"),
            "deterministic_bundle_sha256":canonical_sha({"rows":rows,"upstream":upstream,"rejects":rejects})}

if __name__=="__main__":
    base=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parent
    print(json.dumps(validate(base),ensure_ascii=False,indent=2))
