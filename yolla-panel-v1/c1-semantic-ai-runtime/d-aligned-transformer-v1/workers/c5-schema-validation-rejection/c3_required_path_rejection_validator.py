from __future__ import annotations
from collections import Counter
from typing import Any, Mapping

ALLOWED_DECISIONS = ("ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED")
EXPECTED_PR188_BLOBS = {
    "schema_profile_blob": "710f1de7860f62143f81f36bd3eb4fbe2b613ff1",
    "mapping_contract_blob": "fcd879221b8d2b2c8f988a76e4045877ced9336b",
    "validation_ruleset_blob": "7bc601dd16a84f44b95c7e5757a1a796cb5fd793",
    "acceptance_receipt_contract_blob": "c5b2d0087c52fb1af4b9c0a31f7181aedebfd410",
}
EXPECTED_C4_BLOBS = {
    "transformation_package_blob":"b763db81fee8a4b43566f1e13e9c23b72659458a",
    "field_mapping_report_blob":"d6e8eb45532ba6b4e290593b35924c3fb3e06aa1",
    "rejected_bundle_blob":"c17f85fd86deb6812ec327da2d89e6b129dfae69",
    "candidate_bundle_blob":"9a6fd20c6228fc641167fbd7667e77abf2b53ecf",
    "test_result_blob":"292d08984d5ad6f3c9ad29d281b74248da1ce41b",
    "final_report_blob":"660c2113defb92d80157afec2598943144d138a5",
}
REJECTED_REQUIRED_FIELDS = (
    "source_record_id", "source_field", "source_value", "source_value_status",
    "current_source_object", "target_entity", "target_field", "reason_codes",
    "rejection_scope", "change_request_id", "retryable",
    "source_value_preserved", "source_value_invented",
)
class FailClosedError(ValueError): pass

def validate_consumer(consumer: Mapping[str, Any]) -> dict[str, Any]:
    findings=[]
    if consumer.get("cycle_id") != "A-LOOP-GROUP-03-GROUP03-W05-CYCLE-0002": findings.append("CYCLE_ID_MISMATCH")
    if consumer.get("directive_comment_id") != 5184572293: findings.append("DIRECTIVE_COMMENT_MISMATCH")
    authority=consumer.get("source_authority",{}); c3=authority.get("c3",{})
    expected_c3={"latest_pointer":"64cdf3632837a9e867b32d82557640c9ff35453c","closure_matrix":"38080751c429d0ffe445ff9831126c984c458f0c","rejection_input":"73b49771eab3f00e27705aca5e124f02762e1c5f","upstream_request_bundle":"9b33d6903847d7537c558ed1720e9747a83fab46","test_result":"539c61e13439b1c73f5acd8ffaf0b08394e2bf76","final_report_v3":"deddc17561df452e7ff90951cdb1e80683bba730"}
    for k,v in expected_c3.items():
        if c3.get(k,{}).get("blob") != v: findings.append(f"C3_{k.upper()}_BLOB_MISMATCH")
    if [s.get("entry_count") for s in c3.get("rejection_shards",[])] != [7,5,10]: findings.append("C3_REJECTION_SHARD_COUNTS_MISMATCH")
    c4=authority.get("c4",{})
    if c4.get("latest_pointer",{}).get("blob") != "1779b1f6fbfcba913859850fec0c69f533154da3": findings.append("C4_POINTER_BLOB_MISMATCH")
    if c4.get("c4_v2_final_report_present") is not True: findings.append("C4_V2_FINAL_REPORT_MISSING")
    if c4.get("c4_v2_package_files_present") is not True: findings.append("C4_V2_PACKAGE_MISSING")
    if c4.get("final_binding_ready") is not False: findings.append("C4_FALSE_READY")
    for k,v in EXPECTED_C4_BLOBS.items():
        if c4.get("outputs",{}).get(k) != v: findings.append(f"C4_{k.upper()}_MISMATCH")
    pr188=consumer.get("pr188_authority",{})
    if pr188.get("head") != "1bb475c440983aae761b897a3b58a8f4dab880cc": findings.append("PR188_HEAD_MISMATCH")
    for k,v in EXPECTED_PR188_BLOBS.items():
        if pr188.get(k) != v: findings.append(f"PR188_{k.upper()}_MISMATCH")
    if consumer.get("entry_gate",{}).get("open") is not True: findings.append("ENTRY_GATE_NOT_OPEN")
    if findings: raise FailClosedError(",".join(findings))
    return {"decision":"PASS","finding_count":0}

def validate_fixture(fixture: Mapping[str, Any]) -> dict[str, Any]:
    entries=fixture.get("entries",[]); requests=fixture.get("requests",[]); findings=[]
    if len(entries)!=22: findings.append("ENTRY_COUNT_MISMATCH")
    rule_ids=[e.get("RULE_ID") for e in entries]
    if len(set(rule_ids))!=22: findings.append("RULE_ID_NOT_UNIQUE")
    if any(e.get("PRESERVE_SOURCE") is not True for e in entries): findings.append("PRESERVE_SOURCE_FALSE")
    if any(e.get("SOURCE_VALUE_STATUS")!="MISSING_AT_REQUIRED_PATH" for e in entries): findings.append("SOURCE_VALUE_STATUS_MISMATCH")
    if any(not e.get("REJECTION_REASON") for e in entries): findings.append("REJECTION_REASON_MISSING")
    if any(not e.get("CURRENT_SOURCE_OBJECT") for e in entries): findings.append("CURRENT_SOURCE_OBJECT_MISSING")
    covered=[rid for req in requests for rid in req.get("AFFECTED_RULE_IDS",[])]
    if Counter(covered)!=Counter(rule_ids): findings.append("UPSTREAM_REQUEST_COVERAGE_MISMATCH")
    if len(requests)!=7: findings.append("UPSTREAM_REQUEST_COUNT_MISMATCH")
    owner_counts=Counter()
    for req in requests: owner_counts[req.get("RESOLUTION_OWNER")]+=len(req.get("AFFECTED_RULE_IDS",[]))
    if dict(owner_counts)!=fixture.get("expected",{}).get("owner_counts"): findings.append("OWNER_COUNTS_MISMATCH")
    exp=fixture.get("expected",{})
    if exp.get("c4_v2_package_present") is not True or exp.get("total_rejected_count")!=28 or exp.get("pending_count")!=44: findings.append("FINAL_EXPECTATION_MISMATCH")
    if sum(1 for e in entries if e.get("REJECTION_SCOPE")=="PACKAGE")!=4: findings.append("PACKAGE_REJECT_COUNT_MISMATCH")
    if findings: raise FailClosedError(",".join(findings))
    return {"decision":"PASS","entry_count":22,"silent_drop_count":0}

def validate_rejected_bundle(bundle: Mapping[str, Any]) -> dict[str, Any]:
    records=bundle.get("rejected_records",[]); findings=[]
    for idx,r in enumerate(records):
        if [f for f in REJECTED_REQUIRED_FIELDS if f not in r]: findings.append(f"RECORD_{idx}_MISSING_FIELDS")
        if r.get("source_value_preserved") is not True: findings.append(f"RECORD_{idx}_SOURCE_NOT_PRESERVED")
        if r.get("source_value_invented") is not False: findings.append(f"RECORD_{idx}_SOURCE_INVENTED")
        if not r.get("reason_codes"): findings.append(f"RECORD_{idx}_REASON_MISSING")
    if bundle.get("input_count")!=28 or bundle.get("rejected_count")!=28: findings.append("BUNDLE_COUNT_MISMATCH")
    if bundle.get("valid_count")!=0 or bundle.get("pending_count")!=44: findings.append("BUNDLE_ACCOUNTING_MISMATCH")
    if bundle.get("silent_drop_count")!=0 or bundle.get("source_value_preservation_count")!=28: findings.append("PRESERVATION_MISMATCH")
    if bundle.get("c4_v2_package_consumed") is not True: findings.append("C4_V2_PACKAGE_NOT_CONSUMED")
    if dict(Counter(code for r in records for code in r.get("reason_codes",[])))!=bundle.get("reason_code_counts"): findings.append("REASON_COUNTS_MISMATCH")
    if findings: raise FailClosedError(",".join(findings))
    return {"decision":"PASS","rejected_count":28,"pending_count":44,"silent_drop_count":0}

def validate_validation_result(result: Mapping[str, Any]) -> dict[str, Any]:
    findings=[]
    if result.get("package_decision")!="REJECTED" or result.get("package_gate_pass") is not False: findings.append("PACKAGE_DECISION_MISMATCH")
    if result.get("c4_v2_package_consumed") is not True: findings.append("C4_PACKAGE_NOT_CONSUMED")
    expected={"accepted":0,"candidate":0,"package_reject":4,"partial_eligible":18,"pending":44,"rejected":28,"silent_drop":0,"source_unmapped":6}
    if result.get("counts")!=expected: findings.append("VALIDATION_COUNTS_MISMATCH")
    if result.get("first_blocker")!="PR188_REQUIRED_SOURCE_PATHS_MISSING_22": findings.append("FIRST_BLOCKER_MISMATCH")
    if result.get("d_authority_acceptance_receipt_issued") is not False: findings.append("D_RECEIPT_FALSE_CLAIM")
    if findings: raise FailClosedError(",".join(findings))
    return {"decision":"PASS","package_decision":"REJECTED"}

def validate_receipt_candidate(candidate: Mapping[str, Any]) -> dict[str, Any]:
    findings=[]
    if candidate.get("decision")!="REJECTED" or candidate.get("producer")!="C-1_VALIDATION_CANDIDATE_ONLY": findings.append("CANDIDATE_IDENTITY_MISMATCH")
    if candidate.get("actual_db_authority")!="D-1_ONLY": findings.append("DB_AUTHORITY_MISMATCH")
    for f in ("authoritative_db_write_performed","knowledge_release_created","d_authority_acceptance_receipt_issued","d_acceptance_claim"):
        if candidate.get(f) is not False: findings.append(f"{f.upper()}_FALSE_CLAIM")
    if candidate.get("postgresql_connection_count")!=0 or candidate.get("migration_apply_count")!=0: findings.append("RUNTIME_SIDE_EFFECT_NONZERO")
    if candidate.get("package_id")!="C4-WAVE2-D-ALIGNED-PACKAGE-20260805-001" or candidate.get("package_sha256")!="1e37df56f7300f427c3027f5e83bfe332aa98f37464dc82a6fe374c4982ea8fb": findings.append("C4_PACKAGE_IDENTITY_MISMATCH")
    if candidate.get("contract_conformance")!="PASS_C1_CANDIDATE_NOT_D_AUTHORITY": findings.append("CANDIDATE_CONFORMANCE_MISMATCH")
    if candidate.get("rejected_record_count")!=28 or candidate.get("pending_record_count")!=44: findings.append("CANDIDATE_COUNTS_MISMATCH")
    validate_rejected_bundle({"rejected_records":candidate.get("rejected_records",[]),"input_count":28,"rejected_count":28,"valid_count":0,"pending_count":44,"silent_drop_count":0,"source_value_preservation_count":28,"c4_v2_package_consumed":True,"reason_code_counts":candidate.get("reason_code_counts",{})})
    if findings: raise FailClosedError(",".join(findings))
    return {"decision":"PASS","authority":"NON_D_CANDIDATE"}

def validate_all(consumer,fixture,bundle,result,candidate):
    return {"consumer":validate_consumer(consumer),"fixture":validate_fixture(fixture),"bundle":validate_rejected_bundle(bundle),"validation_result":validate_validation_result(result),"receipt_candidate":validate_receipt_candidate(candidate)}
