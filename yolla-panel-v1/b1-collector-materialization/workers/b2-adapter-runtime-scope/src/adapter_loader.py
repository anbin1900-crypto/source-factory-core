"""Fail-closed consumer for VERIFIED_ADAPTER_PACKAGE_V1.

This module deliberately performs no network I/O. It validates already supplied
adapter-package bytes and emits a deterministic load receipt for downstream
workers.
"""
from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Mapping

PACKAGE_SCHEMA = "VERIFIED_ADAPTER_PACKAGE_V1"
REQUIRED_FIELDS = {
    "schema_version", "package_id", "adapter_id", "site_id", "source_url",
    "verified", "fixture", "verification", "credential_reference",
    "request_policy", "scope", "quota", "schedule",
}
ALLOWED_FIELDS = REQUIRED_FIELDS | {"metadata"}
FORBIDDEN_SECRET_FRAGMENTS = {
    "api_key", "apikey", "access_token", "refresh_token", "authorization",
    "password", "secret", "cookie",
}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class AdapterPackageError(ValueError):
    """Raised when an adapter package violates the consumer contract."""


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _walk_for_raw_secrets(value: Any, path: str = "$") -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            normalized = str(key).lower().replace("-", "_")
            if any(fragment in normalized for fragment in FORBIDDEN_SECRET_FRAGMENTS):
                if normalized == "credential_reference":
                    continue
                raise AdapterPackageError(f"RAW_SECRET_FIELD_REJECTED:{path}.{key}")
            _walk_for_raw_secrets(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk_for_raw_secrets(child, f"{path}[{index}]")


def _require_mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise AdapterPackageError(f"FIELD_NOT_OBJECT:{name}")
    return value


def validate_adapter_package(package: Mapping[str, Any], mode: str = "fixture") -> dict[str, Any]:
    if mode not in {"fixture", "actual"}:
        raise AdapterPackageError(f"UNSUPPORTED_MODE:{mode}")
    if not isinstance(package, Mapping):
        raise AdapterPackageError("PACKAGE_NOT_OBJECT")

    missing = sorted(REQUIRED_FIELDS - set(package))
    if missing:
        raise AdapterPackageError("MISSING_REQUIRED_FIELD:" + ",".join(missing))
    unknown = sorted(set(package) - ALLOWED_FIELDS)
    if unknown:
        raise AdapterPackageError("UNKNOWN_CRITICAL_FIELD:" + ",".join(unknown))
    if package["schema_version"] != PACKAGE_SCHEMA:
        raise AdapterPackageError("INCOMPATIBLE_SCHEMA_VERSION")
    if not all(isinstance(package[field], str) and package[field].strip()
               for field in ("package_id", "adapter_id", "site_id", "source_url")):
        raise AdapterPackageError("INVALID_ID_OR_SOURCE_URL")
    if not str(package["source_url"]).startswith("https://"):
        raise AdapterPackageError("SOURCE_URL_MUST_BE_HTTPS")

    credential_reference = package["credential_reference"]
    if not isinstance(credential_reference, str) or not credential_reference.startswith(
        ("secretref://", "envref://", "vaultref://", "none://")
    ):
        raise AdapterPackageError("INVALID_CREDENTIAL_REFERENCE")

    _walk_for_raw_secrets(package)

    verification = _require_mapping(package["verification"], "verification")
    request_policy = _require_mapping(package["request_policy"], "request_policy")
    pagination = _require_mapping(request_policy.get("pagination"), "request_policy.pagination")
    scope = _require_mapping(package["scope"], "scope")
    quota = _require_mapping(package["quota"], "quota")
    schedule = _require_mapping(package["schedule"], "schedule")

    if request_policy.get("method") not in {"GET", "POST"}:
        raise AdapterPackageError("UNSUPPORTED_HTTP_METHOD")
    if not isinstance(request_policy.get("timeout_seconds"), int) or request_policy["timeout_seconds"] <= 0:
        raise AdapterPackageError("INVALID_TIMEOUT")
    if pagination.get("strategy") not in {"page_number", "cursor", "offset"}:
        raise AdapterPackageError("INVALID_PAGINATION_STRATEGY")

    for list_field in ("resource_types", "allowed_paths", "excluded_paths"):
        if not isinstance(scope.get(list_field), list) or not all(isinstance(x, str) for x in scope[list_field]):
            raise AdapterPackageError(f"INVALID_SCOPE_LIST:{list_field}")
    for int_field in ("max_pages", "max_records"):
        if not isinstance(scope.get(int_field), int) or scope[int_field] <= 0:
            raise AdapterPackageError(f"INVALID_SCOPE_LIMIT:{int_field}")
    for int_field in ("requests_per_minute", "requests_per_day", "minimum_interval_seconds"):
        if not isinstance(quota.get(int_field), int) or quota[int_field] <= 0:
            raise AdapterPackageError(f"INVALID_QUOTA:{int_field}")
    if not isinstance(schedule.get("cadence_minutes"), int) or schedule["cadence_minutes"] <= 0:
        raise AdapterPackageError("INVALID_SCHEDULE_CADENCE")
    if not isinstance(schedule.get("jitter_seconds"), int) or schedule["jitter_seconds"] != 0:
        raise AdapterPackageError("NONDETERMINISTIC_JITTER_REJECTED")

    if mode == "actual":
        if package["verified"] is not True or package["fixture"] is not False:
            raise AdapterPackageError("UNVERIFIED_PACKAGE_REJECTED_FOR_ACTUAL_MODE")
        if verification.get("status") != "VERIFIED":
            raise AdapterPackageError("VERIFICATION_STATUS_NOT_VERIFIED")
        if not SHA256_RE.fullmatch(str(verification.get("content_sha256", ""))):
            raise AdapterPackageError("INVALID_VERIFICATION_SHA256")
    else:
        if package["fixture"] is not True:
            raise AdapterPackageError("NON_FIXTURE_PACKAGE_REJECTED_FOR_FIXTURE_MODE")

    normalized = deepcopy(dict(package))
    normalized["scope"]["resource_types"] = sorted(set(scope["resource_types"]))
    normalized["scope"]["allowed_paths"] = sorted(set(scope["allowed_paths"]))
    normalized["scope"]["excluded_paths"] = sorted(set(scope["excluded_paths"]))
    return normalized


def load_adapter_package(source: str | Path | Mapping[str, Any], mode: str = "fixture") -> dict[str, Any]:
    if isinstance(source, Mapping):
        raw = deepcopy(dict(source))
    else:
        raw = json.loads(Path(source).read_text(encoding="utf-8"))
    package = validate_adapter_package(raw, mode=mode)
    canonical = _canonical_json(package)
    return {
        "schema_version": "ADAPTER_LOAD_RECEIPT_V1",
        "package_id": package["package_id"],
        "adapter_id": package["adapter_id"],
        "site_id": package["site_id"],
        "mode": mode,
        "package_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "credential_reference": package["credential_reference"],
        "pagination_handoff": deepcopy(package["request_policy"]["pagination"]),
        "network_call_count": 0,
        "accepted": True,
        "package": package,
    }
