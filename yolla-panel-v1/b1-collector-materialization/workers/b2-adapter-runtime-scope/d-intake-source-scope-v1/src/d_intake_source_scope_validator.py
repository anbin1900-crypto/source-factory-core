from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse

SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA64 = re.compile(r"^[0-9a-f]{64}$")
ACTIVE_PROFILES = ["EP-001", "EP-002", "EP-003", "EP-004", "EP-005", "EP-010", "EP-012"]
ROUTE_TEMPLATE_MAP = {
    "EP-001": "/map",
    "EP-002": "/articles/{articleNo}",
    "EP-003": "/articles/{articleNo}",
    "EP-004": "/map",
    "EP-005": "/map",
    "EP-010": "/map",
    "EP-012": "/search",
}
D_BLOBS = {
    "D_schema_blob": "710f1de7860f62143f81f36bd3eb4fbe2b613ff1",
    "D_mapping_blob": "fcd879221b8d2b2c8f988a76e4045877ced9336b",
    "D_ruleset_blob": "7bc601dd16a84f44b95c7e5757a1a796cb5fd793",
    "D_receipt_contract_blob": "c5b2d0087c52fb1af4b9c0a31f7181aedebfd410",
}
SECRET_FRAGMENTS = (
    "api_key", "apikey", "access_token", "refresh_token", "authorization",
    "password", "secret", "cookie", "token",
)


class SourceScopeContractError(ValueError):
    pass


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def contract_sha256(contract: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_json_bytes(contract)).hexdigest()


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise SourceScopeContractError(code)


def _walk_keys(value: Any, path: str = "$") -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            lower = str(key).lower()
            if any(fragment in lower for fragment in SECRET_FRAGMENTS):
                if child not in (False, None, 0, "", []):
                    raise SourceScopeContractError(f"RAW_SECRET_FIELD_REJECTED:{path}.{key}")
            _walk_keys(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk_keys(child, f"{path}[{index}]")


def validate_contract(contract: Mapping[str, Any]) -> dict[str, Any]:
    _require(isinstance(contract, Mapping), "CONTRACT_NOT_OBJECT")
    _walk_keys(contract)

    exact = {
        "schema_version": "B2_D_INTAKE_SOURCE_SCOPE_CONTRACT_V1",
        "batch_id": "V2-TO-ABCD-D-GROUP-INTEGRATION-FOLLOWUP-BATCH-V1-20260806-001",
        "task_id": "B2_D_INTAKE_SOURCE_SCOPE_CONTRACT",
        "source_key": "NAVER_FIN_LAND_PUBLIC_WEB_V1",
        "source_alias_candidate": "NAVER_FIN_LAND",
        "source_key_alias_decision_owner": "D-1",
        "source_name": "네이버페이 부동산",
        "official_source_url": "https://fin.land.naver.com",
        "method": "GET",
        "response_format": "HTML",
        "authorized_scope": "PUBLIC_NON_LOGIN_READ_ONLY",
        "authority_type_status": "PENDING_D1_DECISION",
        "d_canonical_id_generation_owner": "D-1_ONLY",
    }
    for key, value in exact.items():
        _require(contract.get(key) == value, f"INVALID_{key.upper()}")

    _require(contract.get("SILENT_SOURCE_KEY_RENAME") is False, "SILENT_SOURCE_KEY_RENAME_FORBIDDEN")
    _require(contract.get("authority_type") is None, "AUTHORITY_TYPE_MUST_REMAIN_UNRESOLVED")
    _require(contract.get("d_canonical_source_id") is None, "D_CANONICAL_SOURCE_ID_MUST_BE_NULL")
    for key in ("D_CANONICAL_SOURCE_ID_GENERATION", "D_AUTHORITY_TYPE_FINAL_DECISION", "D_ACCEPTANCE_RECEIPT_ISSUANCE"):
        _require(contract.get(key) is False, f"AUTHORITY_BOUNDARY_VIOLATION:{key}")

    parsed = urlparse(str(contract["official_source_url"]))
    _require(parsed.scheme == "https" and parsed.netloc == "fin.land.naver.com" and parsed.path in ("", "/"), "OFFICIAL_SOURCE_URL_INVALID")

    active = contract.get("active_profiles")
    _require(active == ACTIVE_PROFILES, "ACTIVE_PROFILE_BINDING_MISMATCH")
    excluded = contract.get("excluded_profiles")
    _require(isinstance(excluded, list) and len(excluded) == 1, "EXCLUDED_PROFILE_COUNT_INVALID")
    ep011 = excluded[0]
    _require(ep011.get("profile_id") == "EP-011", "EP011_NOT_EXCLUDED")
    _require(ep011.get("reason") == "EXCLUDED_NO_CREDENTIAL_REFERENCE", "EP011_REASON_INVALID")
    _require(ep011.get("credential_reference") is None, "EP011_CREDENTIAL_REFERENCE_MUST_BE_NULL")
    _require(ep011.get("included") is False, "EP011_INCLUDED_FORBIDDEN")
    _require("EP-011" not in active, "EP011_ACTIVE_FORBIDDEN")

    routes = contract.get("route_templates")
    _require(isinstance(routes, list) and len(routes) == 7, "ROUTE_TEMPLATE_COUNT_INVALID")
    route_map: dict[str, str] = {}
    for item in routes:
        profile_id = item.get("profile_id")
        _require(profile_id in ACTIVE_PROFILES, "ROUTE_PROFILE_INVALID")
        _require(profile_id not in route_map, "ROUTE_PROFILE_DUPLICATE")
        route_map[profile_id] = item.get("route_template")
        _require(item.get("method") == "GET", "METHOD_NOT_GET")
        _require(item.get("response_format") == "HTML", "RESPONSE_FORMAT_NOT_HTML")
        _require(item.get("mime_type") == "text/html", "MIME_TYPE_NOT_TEXT_HTML")
    _require(route_map == ROUTE_TEMPLATE_MAP, "ROUTE_TEMPLATE_BINDING_MISMATCH")

    for key in ("credential_required", "login_required", "pagination_observed"):
        _require(contract.get(key) is False, f"PUBLIC_NON_LOGIN_SCOPE_VIOLATION:{key}")
    for key, value in D_BLOBS.items():
        _require(contract.get(key) == value, f"INVALID_{key.upper()}")

    pointer = contract.get("authority_type_decision_pointer", {})
    _require(pointer.get("repository") == "anbin1900-crypto/yolla-real-estate-data-engine", "D_POINTER_REPOSITORY_MISMATCH")
    _require(pointer.get("control_pr") == 188, "D_POINTER_PR_MISMATCH")
    _require(bool(SHA40.fullmatch(str(pointer.get("head", "")))), "D_POINTER_HEAD_INVALID")
    _require(bool(SHA40.fullmatch(str(pointer.get("pointer_blob", "")))), "D_POINTER_BLOB_INVALID")
    _require(pointer.get("decision_owner") == "D-1_ONLY", "D_DECISION_OWNER_INVALID")

    refs = contract.get("d_contract_refs", {})
    for key, top_key in (("schema_blob", "D_schema_blob"), ("mapping_blob", "D_mapping_blob"), ("ruleset_blob", "D_ruleset_blob"), ("receipt_contract_blob", "D_receipt_contract_blob")):
        _require(refs.get(key) == contract.get(top_key), f"D_BLOB_DUPLICATE_BINDING_MISMATCH:{key}")

    bindings = contract.get("input_bindings", {})
    a2 = bindings.get("A2_VERIFIED_ADAPTER_PACKAGE", {})
    _require(a2.get("control_pr") == 18, "A2_CONTROL_PR_INVALID")
    for key in ("head", "pointer_blob", "a6_head", "a6_pointer_blob", "package_blob"):
        _require(bool(SHA40.fullmatch(str(a2.get(key, "")))), f"A2_{key.upper()}_INVALID")
    _require(bool(SHA64.fullmatch(str(a2.get("package_sha256", "")))), "A2_PACKAGE_SHA256_INVALID")
    _require(a2.get("package_blob") == "d758afef96e76b664f6d8b0383c5a7bc017c731a", "A2_PACKAGE_BLOB_MISMATCH")
    _require(a2.get("active_profiles") == ACTIVE_PROFILES, "A2_ACTIVE_PROFILE_MISMATCH")
    _require(a2.get("excluded_profiles") == ["EP-011"], "A2_EXCLUDED_PROFILE_MISMATCH")
    _require(a2.get("method") == "GET", "A2_METHOD_NOT_GET")
    _require(a2.get("mime_type") == "text/html", "A2_MIME_INVALID")
    _require(a2.get("credential_mode") == "NONE", "A2_CREDENTIAL_MODE_INVALID")
    _require(a2.get("automated_pagination") is False, "A2_PAGINATION_FORBIDDEN")

    a5 = bindings.get("A5_D_SOURCE_ENDPOINT_SCHEMA_HANDOFF", {})
    _require(a5.get("worker_pr") == 24, "A5_WORKER_PR_INVALID")
    for key in ("current_head", "observed_head", "handoff_blob"):
        _require(bool(SHA40.fullmatch(str(a5.get(key, "")))), f"A5_{key.upper()}_INVALID")
    _require(a5.get("handoff_blob") == "0fac8fac5069a013717ea74202d6d1741adfd966", "A5_HANDOFF_BLOB_MISMATCH")
    _require(a5.get("status") == "READY_FOR_D_SOURCE_ENDPOINT_INTAKE", "A5_HANDOFF_NOT_READY")
    _require(a5.get("active_profile_binding") == "PASS_7_OF_7", "A5_PROFILE_BINDING_NOT_PASS")
    _require(a5.get("ep011_excluded") is True, "A5_EP011_NOT_EXCLUDED")

    scope = contract.get("scope_policy", {})
    _require(scope.get("allowed_origin") == contract["official_source_url"], "SCOPE_ORIGIN_MISMATCH")
    _require(scope.get("allowed_methods") == ["GET"], "SCOPE_METHOD_INVALID")
    _require(scope.get("allowed_response_formats") == ["HTML"], "SCOPE_RESPONSE_FORMAT_INVALID")
    _require(scope.get("access_class") == ["PUBLIC", "NON_LOGIN", "READ_ONLY"], "SCOPE_ACCESS_CLASS_INVALID")
    for key in ("credential_required", "login_required", "browser_automation_authorized", "automated_pagination_authorized", "actual_site_extraction_authorized", "bulk_collection_authorized"):
        _require(scope.get(key) is False, f"FORBIDDEN_SCOPE_FLAG:{key}")

    handoff = contract.get("handoff", {})
    _require((handoff.get("consumer"), handoff.get("consumer_pr")) == ("B-5", 41), "B5_HANDOFF_INVALID")
    _require((handoff.get("independent_preflight_consumer"), handoff.get("independent_preflight_pr")) == ("B-6", 42), "B6_HANDOFF_INVALID")
    _require((handoff.get("control_consumer"), handoff.get("control_pr")) == ("B-1", 19), "B1_HANDOFF_INVALID")
    _require(handoff.get("next_event") == "B5_RESUME_AFTER_B2_AND_B4", "NEXT_EVENT_INVALID")
    _require(handoff.get("producer_acceptance_claim") is False, "PRODUCER_ACCEPTANCE_CLAIM_FORBIDDEN")
    _require(handoff.get("producer_canonical_write_claim") is False, "PRODUCER_CANONICAL_WRITE_CLAIM_FORBIDDEN")

    safety = contract.get("safety", {})
    for key in ("actual_site_call_count", "d_canonical_id_generation_count", "d_canonical_db_write_count", "d_acceptance_receipt_issuance_count", "postgresql_connection_count"):
        _require(safety.get(key) == 0, f"FORBIDDEN_COUNTER:{key}")
    for key in ("actual_site_extraction", "contains_personal_data", "contains_secret_value", "production", "ready", "merge", "self_merge"):
        _require(safety.get(key) is False, f"FORBIDDEN_SAFETY_FLAG:{key}")

    return {
        "accepted": True,
        "finding_count": 0,
        "contract_sha256": contract_sha256(contract),
        "terminal": "B2_D_INTAKE_SOURCE_SCOPE_CONTRACT_READY",
        "PUBLIC_NON_LOGIN_SCOPE": "PASS",
        "METHOD_GET_ONLY": "PASS",
        "ACTIVE_PROFILE_BINDING": "PASS_7_OF_7",
        "EP011_EXCLUDED": "PASS",
        "D_CONTRACT_BLOB_BINDING": "PASS_4_OF_4",
        "D_CANONICAL_ID_GENERATION_COUNT": 0,
        "ACTUAL_SITE_CALL_COUNT": 0,
    }


def validate_contract_file(path: str | Path) -> dict[str, Any]:
    return validate_contract(json.loads(Path(path).read_text(encoding="utf-8")))
