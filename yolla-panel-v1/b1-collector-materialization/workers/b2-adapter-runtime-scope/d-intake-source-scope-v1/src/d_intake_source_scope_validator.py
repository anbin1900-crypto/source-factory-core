from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse

SHA40 = re.compile(r"^[0-9a-f]{40}$")
SECRET_FRAGMENTS = (
    "api_key", "apikey", "access_token", "refresh_token", "authorization",
    "password", "secret", "cookie", "token",
)


class SourceScopeContractError(ValueError):
    pass


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def contract_sha256(contract: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_json_bytes(contract)).hexdigest()


def _walk_keys(value: Any, path: str = "$") -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            lower = str(key).lower()
            if any(fragment in lower for fragment in SECRET_FRAGMENTS):
                if child not in (False, None, 0, "", []):
                    raise SourceScopeContractError(
                        f"RAW_SECRET_FIELD_REJECTED:{path}.{key}"
                    )
            _walk_keys(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk_keys(child, f"{path}[{index}]")


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise SourceScopeContractError(code)


def validate_contract(contract: Mapping[str, Any]) -> dict[str, Any]:
    _require(isinstance(contract, Mapping), "CONTRACT_NOT_OBJECT")
    _walk_keys(contract)

    expected = {
        "schema_version": "B2_D_INTAKE_SOURCE_SCOPE_CONTRACT_V1",
        "batch_id": "V2-TO-ABCD-D-GROUP-INTEGRATION-FOLLOWUP-BATCH-V1-20260806-001",
        "task_id": "B2_D_INTAKE_SOURCE_SCOPE_CONTRACT",
        "source_key": "NAVER_FIN_LAND_PUBLIC_WEB_V1",
        "source_name": "네이버페이 부동산",
        "official_source_url": "https://fin.land.naver.com",
        "method": "GET",
        "response_format": "HTML",
        "authorized_scope": "PUBLIC_NON_LOGIN_READ_ONLY",
        "authority_type_status": "PENDING_D1_DECISION",
        "d_canonical_id_generation_owner": "D-1_ONLY",
    }
    for key, value in expected.items():
        _require(contract.get(key) == value, f"INVALID_{key.upper()}")

    parsed = urlparse(str(contract["official_source_url"]))
    _require(
        parsed.scheme == "https"
        and parsed.netloc == "fin.land.naver.com"
        and parsed.path in ("", "/"),
        "OFFICIAL_SOURCE_URL_INVALID",
    )
    _require(
        contract.get("authority_type") is None,
        "AUTHORITY_TYPE_MUST_REMAIN_UNRESOLVED",
    )
    _require(
        contract.get("d_canonical_source_id") is None,
        "D_CANONICAL_SOURCE_ID_MUST_BE_NULL",
    )

    pointer = contract.get("authority_type_decision_pointer", {})
    _require(
        pointer.get("repository")
        == "anbin1900-crypto/yolla-real-estate-data-engine",
        "D_POINTER_REPOSITORY_MISMATCH",
    )
    _require(pointer.get("control_pr") == 188, "D_POINTER_PR_MISMATCH")
    _require(
        bool(SHA40.fullmatch(str(pointer.get("head", "")))),
        "D_POINTER_HEAD_INVALID",
    )
    _require(
        bool(SHA40.fullmatch(str(pointer.get("pointer_blob", "")))),
        "D_POINTER_BLOB_INVALID",
    )
    _require(pointer.get("decision_owner") == "D-1_ONLY", "D_DECISION_OWNER_INVALID")

    refs = contract.get("d_contract_refs", {})
    exact_refs = {
        "schema_blob": "710f1de7860f62143f81f36bd3eb4fbe2b613ff1",
        "mapping_blob": "fcd879221b8d2b2c8f988a76e4045877ced9336b",
        "ruleset_blob": "7bc601dd16a84f44b95c7e5757a1a796cb5fd793",
        "receipt_contract_blob": "c5b2d0087c52fb1af4b9c0a31f7181aedebfd410",
    }
    _require(
        refs.get("repository") == pointer.get("repository"),
        "D_CONTRACT_REPOSITORY_MISMATCH",
    )
    _require(refs.get("control_pr") == 188, "D_CONTRACT_PR_MISMATCH")
    _require(
        bool(SHA40.fullmatch(str(refs.get("head", "")))),
        "D_CONTRACT_HEAD_INVALID",
    )
    _require(
        bool(SHA40.fullmatch(str(refs.get("control_pointer_blob", "")))),
        "D_CONTROL_POINTER_BLOB_INVALID",
    )
    for key, value in exact_refs.items():
        _require(refs.get(key) == value, f"INVALID_{key.upper()}")

    scope = contract.get("scope_policy", {})
    _require(
        scope.get("allowed_origin") == contract["official_source_url"],
        "SCOPE_ORIGIN_MISMATCH",
    )
    _require(scope.get("allowed_methods") == ["GET"], "SCOPE_METHOD_INVALID")
    _require(
        scope.get("allowed_response_formats") == ["HTML"],
        "SCOPE_RESPONSE_FORMAT_INVALID",
    )
    _require(
        scope.get("access_class") == ["PUBLIC", "NON_LOGIN", "READ_ONLY"],
        "SCOPE_ACCESS_CLASS_INVALID",
    )
    for key in (
        "credential_required",
        "browser_automation_authorized",
        "automated_pagination_authorized",
        "actual_site_extraction_authorized",
        "bulk_collection_authorized",
    ):
        _require(scope.get(key) is False, f"FORBIDDEN_SCOPE_FLAG:{key}")

    handoff = contract.get("handoff", {})
    _require(handoff.get("consumer") == "B-5", "HANDOFF_CONSUMER_INVALID")
    _require(
        handoff.get("next_event") == "B5_RESUME_AFTER_B2_AND_B4",
        "NEXT_EVENT_INVALID",
    )
    _require(
        handoff.get("canonical_id_generation_requested_from") == "D-1",
        "CANONICAL_ID_OWNER_INVALID",
    )
    _require(
        handoff.get("producer_acceptance_claim") is False,
        "PRODUCER_ACCEPTANCE_CLAIM_FORBIDDEN",
    )
    _require(
        handoff.get("producer_canonical_write_claim") is False,
        "PRODUCER_CANONICAL_WRITE_CLAIM_FORBIDDEN",
    )

    safety = contract.get("safety", {})
    for key in (
        "actual_site_extraction",
        "contains_personal_data",
        "contains_secret_value",
        "production",
        "ready",
        "merge",
        "self_merge",
    ):
        _require(safety.get(key) is False, f"FORBIDDEN_SAFETY_FLAG:{key}")
    for key in (
        "d_canonical_id_generation_count",
        "d_canonical_db_write_count",
        "postgresql_connection_count",
    ):
        _require(safety.get(key) == 0, f"FORBIDDEN_COUNTER:{key}")

    return {
        "accepted": True,
        "finding_count": 0,
        "contract_sha256": contract_sha256(contract),
        "terminal": "B2_D_INTAKE_SOURCE_SCOPE_CONTRACT_READY",
        "network_call_count": 0,
        "actual_site_extraction": False,
        "d_canonical_id_generation_count": 0,
    }


def validate_contract_file(path: str | Path) -> dict[str, Any]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    return validate_contract(value)
