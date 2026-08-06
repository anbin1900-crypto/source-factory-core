from __future__ import annotations
import hashlib, json, re
from datetime import datetime
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]

def canonical_json_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def sha256_without(value, field):
    return hashlib.sha256(canonical_json_bytes({k:v for k,v in value.items() if k != field})).hexdigest()

def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))

def validate_all():
    schema = load("D_INTAKE_REQUEST_V1.schema.json")
    request = load("D_INTAKE_REQUEST_V1.json")
    bundle = load("B5_D_READY_FIXTURE_PACKAGE_V2.json")
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(request)
    assert sha256_without(request, "request_sha256") == request["request_sha256"]
    assert sha256_without(bundle, "bundle_sha256") == bundle["bundle_sha256"]
    exact = ["producer_head","package_blob_or_storage_pointer","record_count","submitted_at"]
    assert all(k in request for k in exact)
    assert request["producer_head"] == bundle["producer_package_ref"]["producer_head"]
    assert request["package_blob_or_storage_pointer"] == bundle["producer_package_ref"]["blob"]
    assert request["record_count"] == bundle["producer_package_ref"]["record_count"] == bundle["producer_package_ref"]["sqlite_row_count"]
    datetime.fromisoformat(request["submitted_at"])
    assert request["preservation"]["source_field_loss_count"] == 0
    assert request["preservation"]["silent_drop_count"] == 0
    assert request["producer_generated_canonical_id"] is False
    assert request["producer_acceptance_claim"] is False
    assert request["safety"]["canonical_db_write"] is False
    return {
        "result": "PASS",
        "submission_fields": "PASS_4_OF_4",
        "request_sha256": request["request_sha256"],
        "bundle_sha256": bundle["bundle_sha256"],
        "terminal": "B5_D_READY_PACKAGE_V2_EXACT_SUBMISSION_FIELDS_READY",
        "next_event": "B6_D_SOURCE_DOCUMENT_HANDOFF_REPREFLIGHT"
    }

if __name__ == "__main__":
    print(json.dumps(validate_all(), ensure_ascii=False, sort_keys=True, indent=2))
