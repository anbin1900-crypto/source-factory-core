from __future__ import annotations
from pathlib import Path
from typing import Any
import json, re

HEX40=re.compile(r"^[0-9a-f]{40}$")
HEX64=re.compile(r"^[0-9a-f]{64}$")

class AcceptanceError(ValueError):
    pass

def load_json(path: Path)->dict[str,Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))

def require(condition: bool,message: str)->None:
    if not condition:
        raise AcceptanceError(message)

def validate_hex40(value: str,label: str)->None:
    require(bool(HEX40.fullmatch(value)),f"{label} must be 40 lowercase hex")

def validate_hex64(value: str,label: str)->None:
    require(bool(HEX64.fullmatch(value)),f"{label} must be 64 lowercase hex")

def validate_bundle(root: Path)->dict[str,Any]:
    root=Path(root)
    exact=load_json(root/"B6_EXACT_HEAD_BLOB_MATRIX_V1.json")
    outputs=load_json(root/"B6_REQUIRED_OUTPUT_ACCEPTANCE_MATRIX_V1.json")
    report=load_json(root/"B6_EXTRACTION_ACCEPTANCE_REPORT_V1.json")
    audit=load_json(root/"B6_C1_HANDOFF_AUDIT_RECEIPT_V1.json")
    candidate=load_json(root/"B1_TO_C1_HANDOFF_CANDIDATE_V1.json")
    require(exact["entry_condition_met"] is True,"entry condition not met")
    require(exact["accepted"]==exact["required"]==4,"worker gate not 4/4")
    for worker,item in exact["workers"].items():
        validate_hex40(item["head"],f"{worker}.head")
        validate_hex40(item["pointer_blob"],f"{worker}.pointer_blob")
        require(item["decision"]=="PASS_ACCEPTED",f"{worker} not accepted")
    require(outputs["status"]=="PASS_5_OF_5","required outputs not 5/5")
    require(outputs["present_output_count"]==outputs["required_output_count"]==5,"output count mismatch")
    for name,item in outputs["required_outputs"].items():
        require(item["present"] is True,f"{name} missing")
        validate_hex40(item["blob"],f"{name}.blob")
    manifest=outputs["required_outputs"]["RAW_ARTIFACT_MANIFEST_V1"]
    envelope=outputs["required_outputs"]["SOURCE_RECORD_ENVELOPE_V1"]
    dataset=outputs["required_outputs"]["NORMALIZED_DATASET_V1"]
    receipt=outputs["required_outputs"]["EXTRACTION_RECEIPT_V1"]
    sqlite=outputs["required_outputs"]["FIXTURE_SQLITE_BASE64"]
    for label,item in [("manifest",manifest),("envelope",envelope),("dataset",dataset),("receipt",receipt)]:
        validate_hex64(item["sha256"],f"{label}.sha256")
    validate_hex64(sqlite["decoded_sha256"],"sqlite.decoded_sha256")
    require(manifest["record_count"]==envelope["record_count"]==dataset["input_record_count"]==4,"input count mismatch")
    require(dataset["duplicate_count"]==1,"duplicate count mismatch")
    require(dataset["output_record_count"]==sqlite["row_count"]==3,"output/sqlite row mismatch")
    require(dataset["source_field_loss_count"]==0,"source field loss detected")
    require(receipt["raw_manifest_sha256_match"] is True,"raw manifest SHA mismatch")
    require(receipt["source_envelope_sha256_match"] is True,"source envelope SHA mismatch")
    require(sqlite["decoded_size_bytes"]==12288,"sqlite decoded size mismatch")
    require(sqlite["decoded_sha256"]=="f03e20844e805af3105791934352f8bc3dcbeb1a165ad5c80e5d6ae5739ea14d","sqlite SHA mismatch")
    b3=exact["workers"]["B-3"]
    require(b3["retry_resume_deterministic"] is True,"retry/resume not deterministic")
    require(b3["second_run_execution_delta"]==0,"duplicate execution delta nonzero")
    require(b3["second_run_ledger_delta"]==0,"duplicate ledger delta nonzero")
    v=report["pipeline_validation"]
    require(v["record_accounting"]=="PASS_4_EQUALS_3_PLUS_1","record accounting failure")
    require(v["source_field_loss_count"]==0,"report source field loss")
    require(v["unverified_adapter_actual_mode_rejected"] is True,"unverified adapter not rejected")
    require(v["actual_site_extraction_count"]==0,"actual site extraction occurred")
    require(v["network_call_count"]==0,"network call occurred")
    require(v["semantic_transformation_count"]==0,"semantic transformation occurred")
    require(v["c_semantic_decision_count"]==0,"C semantic decision occurred")
    require(v["d_canonical_db_write_count"]==0,"D canonical DB write occurred")
    require(audit["audit"]["source_evidence_only"] is True,"handoff not source evidence only")
    require(audit["audit"]["semantic_decision_count"]==0,"handoff semantic decision nonzero")
    require(audit["audit"]["actual_site_data_claimed"] is False,"actual site data claimed")
    require(candidate["classification"]=="FIXTURE_ONLY_INDEPENDENTLY_ACCEPTED_SOURCE_EVIDENCE","candidate classification mismatch")
    require(candidate["consumer_rules"]["c1_owns_semantic_transformation"] is True,"C1 ownership missing")
    require(candidate["actual_site_extraction"] is False,"candidate actual site extraction true")
    for doc in (report,audit,candidate):
        require(doc["production"] is False,"production must be false")
        require(doc["ready"] is False,"ready must be false")
        require(doc["merge"] is False,"merge must be false")
    return {"worker_gate":"PASS_4_OF_4","required_outputs":"PASS_5_OF_5","record_accounting":"PASS_4_EQUALS_3_PLUS_1","source_field_loss_count":0,"sqlite_row_count":3,"sqlite_decoded_size_bytes":12288,"sqlite_decoded_sha256":sqlite["decoded_sha256"],"retry_resume_deterministic":True,"duplicate_execution_delta":0,"actual_site_extraction":False,"network_call_count":0,"semantic_transformation_count":0,"d_canonical_db_write_count":0,"handoff_boundary":"PASS_SOURCE_EVIDENCE_ONLY"}
