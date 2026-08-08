from __future__ import annotations
import hashlib, json
from pathlib import Path
CLASSES={"DIRECT_MATCH","DECLARED_RULE_DERIVABLE","MISSING_REQUIRED_SOURCE_PATH","OPTIONAL_MISSING"}
EXPECTED_COUNTS={"DIRECT_MATCH":4,"DECLARED_RULE_DERIVABLE":13,"MISSING_REQUIRED_SOURCE_PATH":22,"OPTIONAL_MISSING":4}
EXPECTED_PREFIX_COUNTS={"B":18,"T":6,"C":19}
EXPECTED_D_BLOBS={"schema_profile_blob":"710f1de7860f62143f81f36bd3eb4fbe2b613ff1","mapping_contract_blob":"fcd879221b8d2b2c8f988a76e4045877ced9336b","validation_ruleset_blob":"7bc601dd16a84f44b95c7e5757a1a796cb5fd793"}
EXPECTED_B_BLOBS={"NORMALIZED_DATASET_V1":"1429d3081c7323d058b6effd3129c83cfc3120b9","RAW_ARTIFACT_MANIFEST_V1":"bca1029b2587b4c78f6fdd78df6c9b95031addb1","SOURCE_RECORD_ENVELOPE_V1":"0148a841344ce5a0df03e55df532871106dd7333","EXTRACTION_RECEIPT_V1":"a4b4f7504c0a2b552fe165176f51833b78e0fd09","MATERIALIZED_DATABASE_PACKAGE_V1":"1561bdf34694fb2e692ae60c045c759a23383f41","B1_SOURCE_EVIDENCE_HANDOFF_V1":"20dadfc3e58ac817031f14ef58ac64b691619b6f"}
def load(path: Path): return json.loads(path.read_text(encoding="utf-8"))
def load_rules(root: Path, crosswalk: dict) -> list[dict]:
    rules=[]
    for shard in crosswalk["trace_shards"]:
        path=root/shard["path"]; raw=path.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=shard["sha256"]: raise AssertionError("shard_sha256_"+shard["path"])
        obj=json.loads(raw)
        if obj["rule_count"]!=shard["rule_count"]: raise AssertionError("shard_rule_count_"+shard["path"])
        rules.extend(obj["rules"])
    return rules
def validate(root: Path, crosswalk: dict, report: dict) -> list[str]:
    checks=[]
    def ok(name, condition):
        if not condition: raise AssertionError(name)
        checks.append(name)
    rules=load_rules(root,crosswalk)
    ok("schema_version",crosswalk["schema_version"]=="PR188_B1_SOURCE_PATH_CROSSWALK_V2")
    ok("directive_reused",crosswalk["duplicate_prompt_key"]=="ed293d3858fa97ae0eb9ed8739f633b9166b46121c5495970e7f6d304ae6f50b")
    ok("d_head",crosswalk["authority"]["d1"]["head"]=="1bb475c440983aae761b897a3b58a8f4dab880cc")
    for key,value in EXPECTED_D_BLOBS.items(): ok("d_blob_"+key,crosswalk["authority"]["d1"][key]==value)
    ok("b_head",crosswalk["authority"]["b1"]["head"]=="fb20d1df329150388889ad13ff0507b0fb3060be")
    for key,value in EXPECTED_B_BLOBS.items(): ok("b_blob_"+key,crosswalk["authority"]["b1"]["blobs"][key]==value)
    ok("trace_storage",crosswalk["trace_storage"]=="SHA256_BOUND_JSON_SHARDS"); ok("shard_count",len(crosswalk["trace_shards"])==6)
    ok("rule_count",len(rules)==43==crosswalk["rule_count"]); ok("unique_rule_ids",len({r["rule_id"] for r in rules})==43); ok("class_catalog",{r["classification"] for r in rules}<=CLASSES)
    for cls,count in EXPECTED_COUNTS.items(): ok("count_"+cls,sum(r["classification"]==cls for r in rules)==count)
    for prefix,count in EXPECTED_PREFIX_COUNTS.items(): ok("prefix_"+prefix,sum(r["rule_id"].startswith(prefix) for r in rules)==count)
    ok("required_not_optional",all(not(r["required"] and r["classification"]=="OPTIONAL_MISSING") for r in rules)); ok("missing_required_is_required",all(r["required"] for r in rules if r["classification"]=="MISSING_REQUIRED_SOURCE_PATH"))
    ok("derivations_declared",all(r["declared_derivation"] for r in rules if r["classification"]=="DECLARED_RULE_DERIVABLE")); ok("direct_no_derivation",all(r["declared_derivation"] is None for r in rules if r["classification"]=="DIRECT_MATCH"))
    ok("derivation_whitelist",all(r["declared_derivation"]["rule_id"] in crosswalk["derivation_rules"] for r in rules if r["declared_derivation"])); ok("no_value_invention",all(not r["declared_derivation"].get("value_invention",False) for r in rules if r["declared_derivation"]))
    ok("first_blocker",crosswalk["first_blocker"]["rule_id"]=="B001"); ok("silent_drop_zero",crosswalk["summary"]["silent_drop_count"]==0); ok("schema_mutation_zero",crosswalk["summary"]["d_schema_mutation_count"]==0); ok("db_write_zero",crosswalk["summary"]["d_canonical_db_write_count"]==0)
    ok("report_rule_count",report["summary"]["rule_count"]==43); ok("report_mapped_count",report["summary"]["mapped_rule_count"]==17); ok("report_rejected_count",report["summary"]["rejected_required_rule_count"]==22); ok("report_optional_count",report["summary"]["optional_not_applied_rule_count"]==4); ok("report_actual_b_values",report["summary"]["actual_b_mapping_value_count"]==19); ok("report_silent_drop_zero",report["summary"]["silent_drop_count"]==0)
    ok("report_unresolved_count",len(report["unresolved_required_paths"])==22); ok("report_optional_paths",len(report["optional_missing_paths"])==4); ok("report_crosswalk_ref",report["entries_storage"]["crosswalk_index"]=="PR188_B1_SOURCE_PATH_CROSSWALK_V2.json"); ok("report_shard_match",report["entries_storage"]["trace_shards"]==crosswalk["trace_shards"]); ok("report_classification_ids",sum(len(v) for v in report["rule_ids_by_classification"].values())==43)
    ok("decision_exact_blocker",crosswalk["decision"]=="EXACT_BLOCKER_FOR_FULL_PR188_SUBMISSION"); ok("fixture_not_accepted",crosswalk["fixture_claimed_as_d_accepted_data"] is False)
    return checks
def main():
    root=Path(__file__).resolve().parent
    checks=validate(root,load(root/"PR188_B1_SOURCE_PATH_CROSSWALK_V2.json"),load(root/"FIELD_MAPPING_REPORT_V1.json"))
    print(json.dumps({"status":"PASS","check_count":len(checks),"checks":checks},ensure_ascii=False,indent=2))
if __name__=="__main__": main()
