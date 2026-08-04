from __future__ import annotations
from copy import deepcopy
from typing import Any, Mapping

ALLOWED_DECISIONS = ("ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED")
RECEIPT_REQUIRED_FIELDS = (
    "receipt_id","intake_request_id","producer","package_type","package_id",
    "package_sha256","schema_profile_id","schema_profile_ref",
    "mapping_contract_id","mapping_contract_ref","ruleset_id","ruleset_ref",
    "decision","accepted_record_ids","rejected_records","reason_code_counts",
    "validation_result_refs","actual_db_authority","fixture_only",
    "authoritative_db_write_performed","postgresql_connection_count",
    "migration_apply_count","knowledge_release_created","issued_at",
)
REJECTED_RECORD_FIELDS = (
    "source_record_id","source_field","source_value","target_entity",
    "target_field","reason_codes","retryable","source_value_preserved",
)

class FailClosedError(ValueError):
    pass

def validate_preflight_contract(contract: Mapping[str, Any]) -> dict[str, Any]:
    findings = []
    if contract.get("entry_gate") != "C4_V2_PACKAGE_TERMINAL": findings.append("ENTRY_GATE_MISMATCH")
    if contract.get("entry_gate_open") is not False: findings.append("ENTRY_GATE_MUST_REMAIN_CLOSED")
    authority = contract.get("authority", {})
    if authority.get("repository") != "anbin1900-crypto/yolla-real-estate-data-engine": findings.append("D_AUTHORITY_REPOSITORY_MISMATCH")
    if authority.get("control_pr") != 188: findings.append("D_AUTHORITY_PR_MISMATCH")
    if authority.get("head") != "1bb475c440983aae761b897a3b58a8f4dab880cc": findings.append("D_AUTHORITY_HEAD_MISMATCH")
    contracts = authority.get("contracts", {})
    expected = {
        "schema_profile":"710f1de7860f62143f81f36bd3eb4fbe2b613ff1",
        "mapping_contract":"fcd879221b8d2b2c8f988a76e4045877ced9336b",
        "validation_ruleset":"7bc601dd16a84f44b95c7e5757a1a796cb5fd793",
        "acceptance_receipt_contract":"c5b2d0087c52fb1af4b9c0a31f7181aedebfd410",
    }
    for name, blob in expected.items():
        if contracts.get(name, {}).get("blob") != blob: findings.append(f"{name.upper()}_BLOB_MISMATCH")
    mapping = contracts.get("mapping_contract", {})
    if mapping.get("mapping_rule_count") != 43: findings.append("MAPPING_RULE_COUNT_MISMATCH")
    if mapping.get("required_lineage_field_count") != 12: findings.append("LINEAGE_FIELD_COUNT_MISMATCH")
    if mapping.get("unmapped_field_policy", {}).get("silent_drop") is not False: findings.append("UNMAPPED_SILENT_DROP_ENABLED")
    ruleset = contracts.get("validation_ruleset", {})
    if tuple(ruleset.get("decision_values", ())) != ALLOWED_DECISIONS: findings.append("RULESET_DECISION_VALUES_MISMATCH")
    if ruleset.get("fail_closed") is not True: findings.append("RULESET_NOT_FAIL_CLOSED")
    preservation = ruleset.get("record_preservation", {})
    if preservation.get("silent_drop") is not False: findings.append("RULESET_SILENT_DROP_ENABLED")
    if preservation.get("rejected_source_value_preserved") is not True: findings.append("REJECTED_SOURCE_VALUE_NOT_REQUIRED")
    receipt = contracts.get("acceptance_receipt_contract", {})
    if receipt.get("decision_authority") != "D-1_ONLY": findings.append("RECEIPT_AUTHORITY_MISMATCH")
    if receipt.get("fixture_receipt_is_authoritative_db_acceptance") is not False: findings.append("FIXTURE_AUTHORITY_BOUNDARY_BROKEN")
    boundary = contract.get("receipt_candidate_boundary", {})
    if boundary.get("d_authority_receipt_issued") is not False: findings.append("D_AUTHORITY_RECEIPT_CLAIMED")
    if boundary.get("authoritative_db_write_performed") is not False: findings.append("D_DB_WRITE_CLAIMED")
    if contract.get("final_decision_update_allowed") is not False: findings.append("FINAL_DECISION_UPDATE_PREMATURE")
    if findings: raise FailClosedError(",".join(findings))
    return {"decision":"PASS","finding_count":0}

def decide(package_gate_pass: bool, accepted_count: int, rejected_count: int) -> str:
    if accepted_count < 0 or rejected_count < 0: raise FailClosedError("NEGATIVE_COUNT")
    if not package_gate_pass or accepted_count == 0: return "REJECTED"
    if rejected_count > 0: return "PARTIALLY_ACCEPTED"
    return "ACCEPTED"

def validate_rejected_records(records):
    for index, record in enumerate(records):
        missing = [field for field in REJECTED_RECORD_FIELDS if field not in record]
        if missing: raise FailClosedError(f"REJECTED_RECORD_{index}_MISSING:{','.join(missing)}")
        if record.get("source_value_preserved") is not True: raise FailClosedError(f"REJECTED_RECORD_{index}_SOURCE_VALUE_NOT_PRESERVED")
        if not record.get("reason_codes"): raise FailClosedError(f"REJECTED_RECORD_{index}_REASON_MISSING")
    return {"rejected_count":len(records),"silent_drop_count":0}

def build_receipt_candidate(*, package_gate_pass, accepted_record_ids, rejected_records):
    validate_rejected_records(rejected_records)
    candidate = {field:None for field in RECEIPT_REQUIRED_FIELDS}
    candidate.update({
        "receipt_id":"C1-CANDIDATE-NOT-D-AUTHORITY","producer":"C-1_VALIDATION_CANDIDATE_ONLY",
        "decision":decide(package_gate_pass,len(accepted_record_ids),len(rejected_records)),
        "accepted_record_ids":list(accepted_record_ids),"rejected_records":deepcopy(rejected_records),
        "reason_code_counts":{},"validation_result_refs":[],"actual_db_authority":"D-1_ONLY","fixture_only":True,
        "authoritative_db_write_performed":False,"postgresql_connection_count":0,"migration_apply_count":0,
        "knowledge_release_created":False,"d_authority_acceptance_receipt_issued":False,"d_acceptance_claim":False,
    })
    return candidate
