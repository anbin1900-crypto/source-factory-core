#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

ULID_RE = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
CODE_RE = re.compile(r"^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$")
NORM_TYPES = {
    "OBLIGATION","PROHIBITION","PERMISSION","EXCEPTION","DEFINITION","PROCEDURE",
    "QUALIFICATION","DEADLINE","PENALTY","ADMINISTRATIVE_DISPOSITION",
    "TECHNICAL_STANDARD","FORM_REQUIREMENT","AUTHORITY_ASSIGNMENT",
    "INFORMATION_ONLY","UNKNOWN"
}
EXPECTED_RULES = [f"C{i:03d}" for i in range(2, 17)]

class ValidationError(ValueError):
    pass

def _fail(code: str, path: str, detail: str = "") -> None:
    suffix = f": {detail}" if detail else ""
    raise ValidationError(f"{code}@{path}{suffix}")

def _text(value, path: str) -> str:
    if not isinstance(value, str) or not value:
        _fail("MISSING_REQUIRED_VALUE", path)
    if value != value.strip():
        _fail("TEXT_NOT_TRIMMED", path)
    if unicodedata.normalize("NFC", value) != value:
        _fail("TEXT_NOT_NFC", path)
    return value

def _ulid(value, path: str) -> str:
    value = _text(value, path)
    if not ULID_RE.fullmatch(value):
        _fail("TYPE_ERROR_ULID", path)
    return value

def _sha(value, path: str) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        _fail("TYPE_ERROR_SHA256", path)
    return value

def _absolute_uri(value, path: str) -> str:
    value = _text(value, path)
    parsed = urlparse(value)
    if parsed.scheme not in {"http","https"} or not parsed.netloc:
        _fail("TYPE_ERROR_URI", path)
    return value

def _array_text(value, path: str) -> list[str]:
    if not isinstance(value, list):
        _fail("TYPE_ERROR_ARRAY_TEXT", path)
    return [_text(item, f"{path}[{i}]") for i, item in enumerate(value)]

def validate_bundle(bundle: dict) -> dict:
    if not isinstance(bundle, dict):
        _fail("TYPE_ERROR_OBJECT", "$")
    required_root = {
        "schema_version","bundle_id","batch_id","task_id","producer","domain_scope",
        "mapping_authority","candidate_count","assertion_count","evidence_count",
        "knowledge_objects","evidence_refs","rejected_records","validation_summary",
        "candidate_only","fixture_only","d_acceptance_claim","d_authority_receipt_issued",
        "knowledge_release_created","authoritative_db_write_performed","production","ready","merge"
    }
    missing = sorted(required_root - bundle.keys())
    if missing:
        _fail("MISSING_REQUIRED_VALUE", "$", ",".join(missing))
    if bundle["schema_version"] != "KNOWLEDGE_CANDIDATE_BUNDLE_V2":
        _fail("SCHEMA_VERSION_MISMATCH", "$.schema_version")
    if bundle["producer"] != "C-4_EVIDENCE_AND_KNOWLEDGE_CANDIDATE":
        _fail("INVALID_PRODUCER", "$.producer")
    for key in ("candidate_only","fixture_only"):
        if bundle[key] is not True:
            _fail("BOUNDARY_VIOLATION", f"$.{key}")
    for key in ("d_acceptance_claim","d_authority_receipt_issued","knowledge_release_created",
                "authoritative_db_write_performed","production","ready","merge"):
        if bundle[key] is not False:
            _fail("BOUNDARY_VIOLATION", f"$.{key}")
    _text(bundle["bundle_id"], "$.bundle_id")
    _text(bundle["batch_id"], "$.batch_id")
    _text(bundle["task_id"], "$.task_id")
    _text(bundle["domain_scope"], "$.domain_scope")

    authority = bundle["mapping_authority"]
    if not isinstance(authority, dict):
        _fail("TYPE_ERROR_OBJECT", "$.mapping_authority")
    if authority.get("mapping_contract_blob") != "fcd879221b8d2b2c8f988a76e4045877ced9336b":
        _fail("MAPPING_VERSION_MISMATCH", "$.mapping_authority.mapping_contract_blob")
    if authority.get("mapping_version") != "1.0.0":
        _fail("MAPPING_VERSION_MISMATCH", "$.mapping_authority.mapping_version")
    if authority.get("rule_ids") != EXPECTED_RULES:
        _fail("MAPPING_RULE_COVERAGE_ERROR", "$.mapping_authority.rule_ids")

    objects = bundle["knowledge_objects"]
    evidence = bundle["evidence_refs"]
    rejected = bundle["rejected_records"]
    if not all(isinstance(v, list) for v in (objects, evidence, rejected)):
        _fail("TYPE_ERROR_ARRAY", "$.knowledge_objects/evidence_refs/rejected_records")

    candidate_ids, assertion_ids, evidence_ids = set(), set(), set()
    assertion_to_fragment = {}
    assertion_count = 0

    for i, obj in enumerate(objects):
        p = f"$.knowledge_objects[{i}]"
        for field in ("candidate_id","knowledge_type","canonical_key","canonical_label","fragment_id","assertions"):
            if field not in obj:
                _fail("MISSING_REQUIRED_VALUE", f"{p}.{field}")
        cid = _text(obj["candidate_id"], f"{p}.candidate_id")
        if cid in candidate_ids:
            _fail("DUPLICATE_ID", f"{p}.candidate_id")
        candidate_ids.add(cid)
        ktype = _text(obj["knowledge_type"], f"{p}.knowledge_type")
        if not CODE_RE.fullmatch(ktype):
            _fail("INVALID_CODE", f"{p}.knowledge_type")
        _text(obj["canonical_key"], f"{p}.canonical_key")
        _text(obj["canonical_label"], f"{p}.canonical_label")
        fragment_id = _ulid(obj["fragment_id"], f"{p}.fragment_id")
        assertions = obj["assertions"]
        if not isinstance(assertions, list) or not assertions:
            _fail("MISSING_REQUIRED_VALUE", f"{p}.assertions")
        for j, assertion in enumerate(assertions):
            ap = f"{p}.assertions[{j}]"
            for field in ("assertion_id","norm_type","conditions","exceptions","confidence"):
                if field not in assertion:
                    _fail("MISSING_REQUIRED_VALUE", f"{ap}.{field}")
            aid = _ulid(assertion["assertion_id"], f"{ap}.assertion_id")
            if aid in assertion_ids:
                _fail("DUPLICATE_ID", f"{ap}.assertion_id")
            assertion_ids.add(aid)
            assertion_to_fragment[aid] = fragment_id
            if assertion["norm_type"] not in NORM_TYPES:
                _fail("INVALID_CODE", f"{ap}.norm_type")
            _array_text(assertion["conditions"], f"{ap}.conditions")
            _array_text(assertion["exceptions"], f"{ap}.exceptions")
            confidence = assertion["confidence"]
            if isinstance(confidence, bool) or not isinstance(confidence, (int,float)):
                _fail("TYPE_ERROR_DECIMAL", f"{ap}.confidence")
            if not 0 <= confidence <= 1:
                _fail("RANGE_ERROR", f"{ap}.confidence")
            assertion_count += 1

    evidence_by_assertion = {aid:0 for aid in assertion_ids}
    for i, ev in enumerate(evidence):
        p = f"$.evidence_refs[{i}]"
        for field in ("evidence_id","assertion_id","fragment_id","quote","quote_hash","official_source_url","source_sha256"):
            if field not in ev:
                _fail("MISSING_REQUIRED_VALUE", f"{p}.{field}")
        eid = _text(ev["evidence_id"], f"{p}.evidence_id")
        if eid in evidence_ids:
            _fail("DUPLICATE_ID", f"{p}.evidence_id")
        evidence_ids.add(eid)
        aid = _ulid(ev["assertion_id"], f"{p}.assertion_id")
        fragment_id = _ulid(ev["fragment_id"], f"{p}.fragment_id")
        if aid not in assertion_ids:
            _fail("FOREIGN_REFERENCE_MISSING", f"{p}.assertion_id")
        if assertion_to_fragment[aid] != fragment_id:
            _fail("FOREIGN_REFERENCE_MISMATCH", f"{p}.fragment_id")
        quote = _text(ev["quote"], f"{p}.quote")
        expected_quote_hash = hashlib.sha256(quote.encode("utf-8")).hexdigest()
        if _sha(ev["quote_hash"], f"{p}.quote_hash") != expected_quote_hash:
            _fail("QUOTE_HASH_MISMATCH", f"{p}.quote_hash")
        _absolute_uri(ev["official_source_url"], f"{p}.official_source_url")
        _sha(ev["source_sha256"], f"{p}.source_sha256")
        evidence_by_assertion[aid] += 1

    missing_evidence = sorted(aid for aid, count in evidence_by_assertion.items() if count == 0)
    if missing_evidence:
        _fail("ASSERTION_WITHOUT_EVIDENCE", "$.evidence_refs", ",".join(missing_evidence))

    rejection_ids = set()
    for i, rec in enumerate(rejected):
        p = f"$.rejected_records[{i}]"
        required = {
            "rejection_id","rule_id","source_path","target_entity","target_field",
            "reason_code","source_value_present","source_value","source_value_preserved",
            "retryable","required_next_input"
        }
        missing = required - rec.keys()
        if missing:
            _fail("MISSING_REQUIRED_VALUE", p, ",".join(sorted(missing)))
        rid = _text(rec["rejection_id"], f"{p}.rejection_id")
        if rid in rejection_ids:
            _fail("DUPLICATE_ID", f"{p}.rejection_id")
        rejection_ids.add(rid)
        if rec["rule_id"] not in EXPECTED_RULES:
            _fail("MAPPING_RULE_NOT_FOUND", f"{p}.rule_id")
        if rec["source_value_preserved"] is not True:
            _fail("SILENT_DROP_DETECTED", f"{p}.source_value_preserved")
        if rec["source_value_present"] is False and rec["source_value"] is not None:
            _fail("SOURCE_VALUE_INVENTION", f"{p}.source_value")
        _text(rec["required_next_input"], f"{p}.required_next_input")

    counts = {
        "candidate_count": len(objects),
        "assertion_count": assertion_count,
        "evidence_count": len(evidence)
    }
    for key, value in counts.items():
        if bundle[key] != value:
            _fail("COUNT_MISMATCH", f"$.{key}", f"{bundle[key]} != {value}")

    summary = bundle["validation_summary"]
    if not isinstance(summary, dict):
        _fail("TYPE_ERROR_OBJECT", "$.validation_summary")
    expected_summary = {
        "mapping_rule_count":15,
        "mapping_rule_coverage":"PASS_15_OF_15",
        "candidate_count":len(objects),
        "assertion_count":assertion_count,
        "evidence_count":len(evidence),
        "rejected_record_count":len(rejected),
        "fabricated_candidate_count":0,
        "assertion_without_evidence_count":0,
        "silent_drop_count":0,
        "source_value_invention_count":0,
        "d_acceptance_claim_count":0
    }
    for key, value in expected_summary.items():
        if summary.get(key) != value:
            _fail("SUMMARY_MISMATCH", f"$.validation_summary.{key}", f"{summary.get(key)} != {value}")

    return {
        "status":"PASS",
        "candidate_count":len(objects),
        "assertion_count":assertion_count,
        "evidence_count":len(evidence),
        "rejected_record_count":len(rejected),
        "mapping_rule_coverage":"PASS_15_OF_15",
        "fabricated_candidate_count":0,
        "assertion_without_evidence_count":0,
        "silent_drop_count":0
    }

def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_knowledge_candidate_bundle_v2.py <bundle.json>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    try:
        result = validate_bundle(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        print(json.dumps({"status":"FAIL","error":str(exc)}, ensure_ascii=False, sort_keys=True))
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
