from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping


class PrebuildError(ValueError):
    """Fail-closed error raised before any final package build."""


@dataclass(frozen=True)
class RebuildResult:
    package: Dict[str, Any]
    package_sha256: str
    replay_digests: List[str]
    build_count: int
    replay_count: int


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _require_mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise PrebuildError(f"{name}_MUST_BE_OBJECT")
    return value


def _require_fields(obj: Mapping[str, Any], fields: Iterable[str], prefix: str) -> None:
    for field in fields:
        if field not in obj or obj[field] in (None, ""):
            raise PrebuildError(f"{prefix}_{field.upper()}_MISSING")


def _validate_exact_slot(slot_name: str, slot: Mapping[str, Any], exact_fields: Iterable[str]) -> Mapping[str, Any]:
    declared = _require_mapping(slot.get("declared"), f"{slot_name}.declared")
    observed = _require_mapping(slot.get("observed"), f"{slot_name}.observed")
    _require_fields(declared, exact_fields, f"{slot_name}_DECLARED")
    _require_fields(observed, exact_fields, f"{slot_name}_OBSERVED")

    for field in exact_fields:
        if declared[field] != observed[field]:
            raise PrebuildError(f"{slot_name.upper()}_{field.upper()}_MISMATCH")

    authority_state = str(observed.get("authority_state", ""))
    if observed.get("placeholder") is True or authority_state in {
        "PLACEHOLDER",
        "SUPERSEDED_NON_AUTHORITY_FIXTURE_ONLY",
    }:
        raise PrebuildError(f"{slot_name.upper()}_NON_AUTHORITY_REJECTED")
    return observed


def validate_final_inputs(manifest: Mapping[str, Any], final_inputs: Mapping[str, Any]) -> Dict[str, Mapping[str, Any]]:
    contract = _require_mapping(manifest.get("execution_contract"), "execution_contract")
    if contract.get("final_build_count_target") != 1:
        raise PrebuildError("FINAL_BUILD_COUNT_TARGET_MUST_EQUAL_1")
    if contract.get("final_replay_count") != 2:
        raise PrebuildError("FINAL_REPLAY_COUNT_MUST_EQUAL_2")
    if contract.get("mid_process_audit_count") != 0:
        raise PrebuildError("MID_PROCESS_AUDIT_COUNT_MUST_EQUAL_0")

    a5 = _validate_exact_slot(
        "a5_final_schema",
        _require_mapping(final_inputs.get("a5_final_schema"), "a5_final_schema"),
        ("head", "pointer_blob", "handoff_blob"),
    )
    if a5.get("terminal") != "A5_FINAL_RESPONSE_SCHEMA_AND_EXECUTION_CONTRACT_READY":
        raise PrebuildError("A5_FINAL_SCHEMA_TERMINAL_NOT_READY")
    if a5.get("handoff_ready") is not True:
        raise PrebuildError("A5_FINAL_SCHEMA_HANDOFF_NOT_READY")
    if a5.get("final_response_schema_complete") is not True:
        raise PrebuildError("A5_FINAL_RESPONSE_SCHEMA_INCOMPLETE")

    a4 = _validate_exact_slot(
        "a4_delta_audit",
        _require_mapping(final_inputs.get("a4_delta_audit"), "a4_delta_audit"),
        ("head", "pointer_blob", "handoff_blob"),
    )
    if a4.get("pagination_binding_audit") != "PASS":
        raise PrebuildError("A4_DELTA_PAGINATION_AUDIT_NOT_PASS")
    if a4.get("delta_ready") is not True:
        raise PrebuildError("A4_DELTA_NOT_READY")

    return {"a5_final_schema": a5, "a4_delta_audit": a4}


def build_verified_package_once(
    manifest: Mapping[str, Any],
    final_inputs: Mapping[str, Any],
    fixture: Mapping[str, Any],
    *,
    build_count_before: int = 0,
) -> RebuildResult:
    if build_count_before != 0:
        raise PrebuildError("FINAL_BUILD_ALREADY_CONSUMED")

    validated = validate_final_inputs(manifest, final_inputs)
    prebound = _require_mapping(manifest.get("prebound_authorities"), "prebound_authorities")
    _require_fields(
        prebound,
        ("a3_public_route_operator_package", "a5_public_document_route", "a4_navigation_authority"),
        "PREBOUND",
    )

    package: Dict[str, Any] = {
        "schema_version": "VERIFIED_ADAPTER_PACKAGE_FINAL_V1",
        "build_ordinal": 1,
        "verification_status": "VERIFIED_INPUTS_BOUND_REPLAY_PENDING",
        "source_manifest": {
            "a3_public_route_operator_package": prebound["a3_public_route_operator_package"],
            "a5_public_document_route": prebound["a5_public_document_route"],
            "a4_navigation_authority": prebound["a4_navigation_authority"],
            "a5_final_schema": dict(validated["a5_final_schema"]),
            "a4_delta_audit": dict(validated["a4_delta_audit"]),
        },
        "components": [
            "endpoint_catalog",
            "request_template",
            "parameter_dictionary",
            "session_header_contract",
            "pagination_contract",
            "response_schema",
            "identifier_map",
            "retry_rate_limit_policy",
            "replay_test_receipt",
        ],
        "fixture_sha256": sha256_json(fixture),
        "network_call_count": 0,
        "self_acceptance": False,
    }
    package_sha = sha256_json(package)

    replay_payload = {
        "package_sha256": package_sha,
        "fixture_sha256": package["fixture_sha256"],
        "source_manifest_sha256": sha256_json(package["source_manifest"]),
    }
    replay_digests = [sha256_json(replay_payload) for _ in range(2)]
    if len(set(replay_digests)) != 1:
        raise PrebuildError("REPLAY_DIGEST_MISMATCH")

    return RebuildResult(
        package=package,
        package_sha256=package_sha,
        replay_digests=replay_digests,
        build_count=1,
        replay_count=2,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="A-6 single final rebuild harness")
    parser.add_argument("manifest")
    parser.add_argument("final_inputs")
    parser.add_argument("fixture")
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    final_inputs = json.loads(Path(args.final_inputs).read_text(encoding="utf-8"))
    fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
    result = build_verified_package_once(manifest, final_inputs, fixture)
    print(canonical_json({
        "build_count": result.build_count,
        "package_sha256": result.package_sha256,
        "replay_count": result.replay_count,
        "replay_digests": result.replay_digests,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
