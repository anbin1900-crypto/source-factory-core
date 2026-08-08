"""Deterministic collection-scope planning for validated adapter packages."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Iterable, Mapping


def _stable_id(payload: Mapping[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def plan_collection_scope(
    package: Mapping[str, Any],
    requested_resources: Iterable[str] | None = None,
    requested_paths: Iterable[str] | None = None,
) -> dict[str, Any]:
    scope = package["scope"]
    allowed_resources = set(scope["resource_types"])
    resources = allowed_resources if requested_resources is None else allowed_resources & set(requested_resources)
    if not resources:
        raise ValueError("EMPTY_RESOURCE_SCOPE")

    allowed_paths = set(scope["allowed_paths"])
    excluded_paths = set(scope["excluded_paths"])
    requested = allowed_paths if requested_paths is None else set(requested_paths)
    paths = sorted((requested & allowed_paths) - excluded_paths)
    if not paths:
        raise ValueError("EMPTY_PATH_SCOPE")

    plan = {
        "schema_version": "COLLECTION_SCOPE_PLAN_V1",
        "package_id": package["package_id"],
        "adapter_id": package["adapter_id"],
        "site_id": package["site_id"],
        "resource_types": sorted(resources),
        "paths": paths,
        "max_pages": int(scope["max_pages"]),
        "max_records": int(scope["max_records"]),
        "actual_site_call": False,
    }
    plan["plan_sha256"] = _stable_id(plan)
    return plan
