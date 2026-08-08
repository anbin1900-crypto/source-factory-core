from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List

SOURCE_TYPE = "D_SOURCE_DOCUMENT_ACCEPTANCE_RECEIPT_V1"
KNOWLEDGE_TYPE = "D_KNOWLEDGE_CANDIDATE_ACCEPTANCE_RECEIPT_V1"
D_ISSUER = "D-1_DOMAIN_KNOWLEDGE_DATABASE_COMMANDER"


def _is_sha256(value: Any) -> bool:
    if not isinstance(value, str) or len(value) != 64:
        return False
    try:
        int(value, 16)
    except ValueError:
        return False
    return value.lower() == value


def _required(obj: Dict[str, Any], fields: List[str], code: str, errors: List[str]) -> None:
    for field in fields:
        if field not in obj or obj[field] in ("", None):
            errors.append(f"{code}:{field}")


def _validate_rejections(receipt: Dict[str, Any], errors: List[str]) -> None:
    rejected = receipt.get("rejected_records")
    if not isinstance(rejected, list):
        errors.append("REJECTED_RECORDS_NOT_LIST")
        return
    for idx, record in enumerate(rejected):
        if not isinstance(record, dict):
            errors.append(f"REJECTED_RECORD_NOT_OBJECT:{idx}")
            continue
        for field in ("source_record_id", "source_field", "source_value", "reason_codes", "retryable", "source_value_preserved"):
            if field not in record:
                errors.append(f"REJECTED_RECORD_FIELD_MISSING:{idx}:{field}")
        if record.get("source_value_preserved") is not True:
            errors.append("REJECTED_VALUE_NOT_PRESERVED")
        if not isinstance(record.get("reason_codes"), list) or not record.get("reason_codes"):
            errors.append(f"REJECTION_REASON_MISSING:{idx}")


def validate_fixture(fixture: Dict[str, Any]) -> Dict[str, Any]:
    errors: List[str] = []
    source = fixture.get("source_document_receipt", {})
    knowledge = fixture.get("knowledge_candidate_receipt", {})
    release = fixture.get("knowledge_release", {})
    runtime = fixture.get("c_ai_runtime_receipt", {})

    source_required = [
        "receipt_id", "receipt_type", "receipt_scope", "issuer", "source_package_ref",
        "source_package_sha256", "decision", "accepted_record_count", "rejected_records",
        "authoritative_db_write_performed", "fixture_only"
    ]
    knowledge_required = [
        "receipt_id", "receipt_type", "receipt_scope", "issuer", "source_receipt_ref",
        "knowledge_candidate_package_ref", "knowledge_candidate_package_sha256", "decision",
        "accepted_record_count", "rejected_records", "authoritative_db_write_performed", "fixture_only"
    ]
    release_required = [
        "knowledge_release_id", "issuer", "source_receipt_ref", "knowledge_receipt_ref",
        "knowledge_version", "query_contract_ref", "citation_contract_ref", "evidence_contract_ref",
        "release_status", "fixture_only"
    ]
    _required(source, source_required, "SOURCE_REQUIRED_FIELD_MISSING", errors)
    _required(knowledge, knowledge_required, "KNOWLEDGE_REQUIRED_FIELD_MISSING", errors)
    _required(release, release_required, "KNOWLEDGE_RELEASE_CONTRACT_BINDING_MISSING", errors)

    if source.get("receipt_type") != SOURCE_TYPE or source.get("receipt_scope") != "SOURCE_DOCUMENT":
        errors.append("SOURCE_RECEIPT_TYPE_OR_SCOPE_INVALID")
    if knowledge.get("receipt_type") != KNOWLEDGE_TYPE or knowledge.get("receipt_scope") != "KNOWLEDGE_CANDIDATE":
        errors.append("KNOWLEDGE_RECEIPT_TYPE_OR_SCOPE_INVALID")
    if source.get("receipt_id") == knowledge.get("receipt_id"):
        errors.append("RECEIPT_ID_COLLISION")
    if source.get("receipt_type") == knowledge.get("receipt_type"):
        errors.append("RECEIPT_TYPE_COLLISION")
    if "knowledge_candidate_package_ref" in source or "knowledge_release_id" in source:
        errors.append("SOURCE_RECEIPT_SCOPE_CONTAMINATION")
    if "source_package_ref" in knowledge or "source_package_sha256" in knowledge:
        errors.append("KNOWLEDGE_RECEIPT_SCOPE_CONTAMINATION")
    if knowledge.get("source_receipt_ref") != source.get("receipt_id"):
        errors.append("SOURCE_RECEIPT_LINK_MISMATCH")
    if release.get("source_receipt_ref") != source.get("receipt_id") or release.get("knowledge_receipt_ref") != knowledge.get("receipt_id"):
        errors.append("KNOWLEDGE_RELEASE_RECEIPT_LINK_MISMATCH")
    if source.get("issuer") != D_ISSUER or knowledge.get("issuer") != D_ISSUER or release.get("issuer") != D_ISSUER:
        errors.append("D_ISSUER_REQUIRED")
    if source.get("authoritative_db_write_performed") is not False or knowledge.get("authoritative_db_write_performed") is not False or runtime.get("authoritative_db_write_performed") is not False:
        errors.append("AUTHORITATIVE_DB_WRITE_FORBIDDEN")
    if not _is_sha256(source.get("source_package_sha256")):
        errors.append("SOURCE_PACKAGE_SHA256_INVALID")
    if not _is_sha256(knowledge.get("knowledge_candidate_package_sha256")):
        errors.append("KNOWLEDGE_PACKAGE_SHA256_INVALID")

    _validate_rejections(source, errors)
    _validate_rejections(knowledge, errors)

    if release.get("fixture_only") is True and runtime.get("activated") is not False:
        errors.append("FIXTURE_RUNTIME_ACTIVATION_FORBIDDEN")
    if runtime.get("knowledge_release_ref") != release.get("knowledge_release_id"):
        errors.append("RUNTIME_RELEASE_LINK_MISMATCH")

    release_contracts_complete = all(
        isinstance(release.get(field), str) and bool(release.get(field))
        for field in ("knowledge_version", "query_contract_ref", "citation_contract_ref", "evidence_contract_ref")
    )
    if not release_contracts_complete:
        errors.append("KNOWLEDGE_RELEASE_CONTRACT_BINDING_MISSING")

    runtime_activation_eligible = (
        not errors
        and release.get("fixture_only") is False
        and release.get("release_status") == "RELEASED"
        and source.get("decision") in {"ACCEPTED", "PARTIALLY_ACCEPTED"}
        and knowledge.get("decision") in {"ACCEPTED", "PARTIALLY_ACCEPTED"}
        and release_contracts_complete
    )

    canonical = json.dumps(fixture, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "valid": not errors,
        "errors": sorted(set(errors)),
        "runtime_activation_eligible": runtime_activation_eligible,
        "fixture_runtime_activated": bool(runtime.get("activated")),
        "canonical_sha256": hashlib.sha256(canonical).hexdigest(),
        "receipt_separation": "PASS" if source.get("receipt_id") != knowledge.get("receipt_id") else "FAIL",
        "authoritative_db_write_performed": False if "AUTHORITATIVE_DB_WRITE_FORBIDDEN" not in errors else None
    }


def apply_mutation(base: Dict[str, Any], mutation: str) -> Dict[str, Any]:
    obj = copy.deepcopy(base)
    source = obj["source_document_receipt"]
    knowledge = obj["knowledge_candidate_receipt"]
    release = obj["knowledge_release"]
    runtime = obj["c_ai_runtime_receipt"]
    if mutation == "NONE":
        return obj
    if mutation == "DUPLICATE_RECEIPT_ID":
        knowledge["receipt_id"] = source["receipt_id"]
    elif mutation == "SOURCE_RECEIPT_HAS_KNOWLEDGE_PACKAGE_REF":
        source["knowledge_candidate_package_ref"] = "INVALID"
    elif mutation == "KNOWLEDGE_RECEIPT_HAS_SOURCE_PACKAGE_REF":
        knowledge["source_package_ref"] = "INVALID"
    elif mutation == "SOURCE_DB_WRITE_TRUE":
        source["authoritative_db_write_performed"] = True
    elif mutation == "KNOWLEDGE_DB_WRITE_TRUE":
        knowledge["authoritative_db_write_performed"] = True
    elif mutation == "REJECTED_VALUE_NOT_PRESERVED":
        source["rejected_records"][0]["source_value_preserved"] = False
    elif mutation == "KNOWLEDGE_SOURCE_RECEIPT_REF_MISMATCH":
        knowledge["source_receipt_ref"] = "OTHER"
    elif mutation == "RELEASE_RECEIPT_REF_MISMATCH":
        release["knowledge_receipt_ref"] = "OTHER"
    elif mutation == "FIXTURE_RUNTIME_ACTIVATED_TRUE":
        runtime["activated"] = True
    elif mutation == "MISSING_QUERY_CONTRACT":
        release["query_contract_ref"] = ""
    elif mutation == "MISSING_CITATION_CONTRACT":
        release["citation_contract_ref"] = ""
    elif mutation == "MISSING_EVIDENCE_CONTRACT":
        release["evidence_contract_ref"] = ""
    elif mutation == "RECEIPT_TYPE_COLLISION":
        knowledge["receipt_type"] = source["receipt_type"]
    else:
        raise ValueError(f"Unknown mutation: {mutation}")
    return obj


def run_matrix(fixture: Dict[str, Any], matrix: Dict[str, Any]) -> Dict[str, Any]:
    case_results = []
    passed = 0
    for case in matrix["cases"]:
        mutated = apply_mutation(fixture, case["mutation"])
        result = validate_fixture(mutated)
        ok = result["valid"] is case["expected_valid"]
        if "expected_runtime_activated" in case:
            ok = ok and result["fixture_runtime_activated"] is case["expected_runtime_activated"]
        if "expected_error" in case:
            ok = ok and case["expected_error"] in result["errors"]
        passed += int(ok)
        case_results.append({"case_id": case["case_id"], "passed": ok, "validation": result})
    return {
        "status": f"PASS_{passed}_OF_{len(case_results)}" if passed == len(case_results) else f"FAIL_{passed}_OF_{len(case_results)}",
        "passed": passed,
        "total": len(case_results),
        "cases": case_results
    }


def main() -> int:
    root = Path(__file__).resolve().parent
    fixture = json.loads((root / "D_DUAL_RECEIPT_FIXTURE_V1.json").read_text(encoding="utf-8"))
    matrix = json.loads((root / "D_DUAL_RECEIPT_E2E_MATRIX_V1.json").read_text(encoding="utf-8"))
    print(json.dumps(run_matrix(fixture, matrix), ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
