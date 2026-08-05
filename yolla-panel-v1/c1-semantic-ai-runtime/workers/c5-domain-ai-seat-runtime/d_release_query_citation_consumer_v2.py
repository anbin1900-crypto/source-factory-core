from __future__ import annotations

from dataclasses import dataclass, asdict
import copy
from typing import Any, Mapping

EXPECTED_D1_AUTHORITY = {
    "repository": "anbin1900-crypto/yolla-real-estate-data-engine",
    "control_pr": 188,
    "head": "327547fd74f615a4c709c6da8473b1bf63fd5d6a",
    "receipt_contract_blob": "c5b2d0087c52fb1af4b9c0a31f7181aedebfd410",
    "fixture_acceptance_pointer_blob": "3a912e745954a318b25ba4987c5a4ed9bfe26271",
    "version_policy_blob": "318ba9eed622d7f9a0164662eb85c8bbd20d06f0",
    "query_contract_blob": "536e0cd95df6613fcf6306413870b09658d76d35",
    "citation_contract_blob": "615a3b25781851cc2502ceee6f5f6a356eea0675",
    "evidence_contract_blob": "615a3b25781851cc2502ceee6f5f6a356eea0675",
}

D1_ISSUER = "D-1_DOMAIN_KNOWLEDGE_DATABASE_COMMANDER"
ALLOWED_RECEIPT_DECISIONS = {"ACCEPTED", "PARTIALLY_ACCEPTED"}


@dataclass(frozen=True)
class ActivationResult:
    activation_status: str
    first_blocker: str | None
    reason_codes: tuple[str, ...]
    released_record_ids: tuple[str, ...]
    knowledge_version: str | None
    fixture_as_authority: bool
    d_authority_receipt_consumed: bool
    d_knowledge_release_consumed: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _get(mapping: Mapping[str, Any] | None, key: str, default: Any = None) -> Any:
    if mapping is None:
        return default
    return mapping.get(key, default)


def _ref_blob(release: Mapping[str, Any], key: str) -> str | None:
    ref = release.get(key)
    return ref.get("blob") if isinstance(ref, Mapping) else None


def evaluate_runtime_activation(
    receipt: Mapping[str, Any] | None,
    release: Mapping[str, Any] | None,
    *,
    expected_authority: Mapping[str, Any] = EXPECTED_D1_AUTHORITY,
) -> ActivationResult:
    reasons: list[str] = []
    fixture_as_authority = False

    if receipt is None:
        reasons.append("D1_ACTUAL_ACCEPTANCE_RECEIPT_NOT_PUBLISHED")
    else:
        if receipt.get("issuer") != D1_ISSUER:
            reasons.append("RECEIPT_ISSUER_NOT_D1")
        if receipt.get("decision_authority") != "D-1_ONLY":
            reasons.append("RECEIPT_DECISION_AUTHORITY_MISMATCH")
        if receipt.get("actual_db_authority") != "D-1_ONLY":
            reasons.append("RECEIPT_ACTUAL_DB_AUTHORITY_MISMATCH")
        if receipt.get("fixture_only") is not False:
            reasons.append("FIXTURE_RECEIPT_NOT_AUTHORITY")
            fixture_as_authority = True
        if receipt.get("decision") not in ALLOWED_RECEIPT_DECISIONS:
            reasons.append("RECEIPT_DECISION_NOT_RUNTIME_ELIGIBLE")
        accepted = receipt.get("accepted_record_ids")
        if not isinstance(accepted, list) or not accepted:
            reasons.append("RECEIPT_ACCEPTED_RECORD_SET_EMPTY")
        if not receipt.get("receipt_id"):
            reasons.append("RECEIPT_ID_MISSING")
        if not receipt.get("receipt_sha256"):
            reasons.append("RECEIPT_SHA256_MISSING")

    if release is None:
        reasons.append("D1_KNOWLEDGE_RELEASE_V1_NOT_PUBLISHED")
    else:
        if release.get("issuer") != D1_ISSUER:
            reasons.append("RELEASE_ISSUER_NOT_D1")
        if release.get("release_type") != "KNOWLEDGE_RELEASE_V1":
            reasons.append("KNOWLEDGE_RELEASE_TYPE_MISMATCH")
        if release.get("release_status") != "D1_KNOWLEDGE_RELEASE_ISSUED":
            reasons.append("KNOWLEDGE_RELEASE_STATUS_NOT_ISSUED")
        if release.get("fixture_only") is not False:
            reasons.append("FIXTURE_RELEASE_NOT_AUTHORITY")
            fixture_as_authority = True
        if not release.get("knowledge_release_id"):
            reasons.append("KNOWLEDGE_RELEASE_ID_MISSING")
        if not release.get("knowledge_version"):
            reasons.append("KNOWLEDGE_VERSION_NOT_BOUND")
        if not release.get("source_snapshot_sha256"):
            reasons.append("SOURCE_SNAPSHOT_SHA256_MISSING")

        expected_refs = {
            "version_policy_ref": expected_authority["version_policy_blob"],
            "query_contract_ref": expected_authority["query_contract_blob"],
            "citation_contract_ref": expected_authority["citation_contract_blob"],
            "evidence_contract_ref": expected_authority["evidence_contract_blob"],
        }
        missing_codes = {
            "version_policy_ref": "KNOWLEDGE_VERSION_CONTRACT_NOT_BOUND",
            "query_contract_ref": "QUERY_CONTRACT_NOT_BOUND",
            "citation_contract_ref": "CITATION_CONTRACT_NOT_BOUND",
            "evidence_contract_ref": "EVIDENCE_CONTRACT_NOT_BOUND",
        }
        mismatch_codes = {
            "version_policy_ref": "KNOWLEDGE_VERSION_CONTRACT_BLOB_MISMATCH",
            "query_contract_ref": "QUERY_CONTRACT_BLOB_MISMATCH",
            "citation_contract_ref": "CITATION_CONTRACT_BLOB_MISMATCH",
            "evidence_contract_ref": "EVIDENCE_CONTRACT_BLOB_MISMATCH",
        }
        for key, expected_blob in expected_refs.items():
            actual_blob = _ref_blob(release, key)
            if not actual_blob:
                reasons.append(missing_codes[key])
            elif actual_blob != expected_blob:
                reasons.append(mismatch_codes[key])

    if receipt is not None and release is not None:
        receipt_ref = release.get("acceptance_receipt_ref")
        if not isinstance(receipt_ref, Mapping):
            reasons.append("ACCEPTANCE_RECEIPT_REF_NOT_BOUND")
        else:
            if receipt_ref.get("receipt_id") != receipt.get("receipt_id"):
                reasons.append("ACCEPTANCE_RECEIPT_ID_MISMATCH")
            if receipt_ref.get("receipt_sha256") != receipt.get("receipt_sha256"):
                reasons.append("ACCEPTANCE_RECEIPT_SHA256_MISMATCH")

        if release.get("package_id") != receipt.get("package_id"):
            reasons.append("PACKAGE_ID_MISMATCH")
        if release.get("package_sha256") != receipt.get("package_sha256"):
            reasons.append("PACKAGE_SHA256_MISMATCH")

        accepted_ids = set(receipt.get("accepted_record_ids") or [])
        rejected_ids = {
            item.get("source_record_id")
            for item in (receipt.get("rejected_records") or [])
            if isinstance(item, Mapping) and item.get("source_record_id")
        }
        released_ids = release.get("released_record_ids")
        if not isinstance(released_ids, list) or not released_ids:
            reasons.append("RELEASED_RECORD_SET_EMPTY")
        else:
            released_set = set(released_ids)
            if not released_set.issubset(accepted_ids):
                reasons.append("RELEASED_RECORD_NOT_ACCEPTED_BY_RECEIPT")
            if released_set & rejected_ids:
                reasons.append("REJECTED_RECORD_INCLUDED_IN_RELEASE")

        if receipt.get("knowledge_release_created") is not True:
            reasons.append("RECEIPT_KNOWLEDGE_RELEASE_CREATED_FALSE")

    unique_reasons = tuple(dict.fromkeys(reasons))
    if unique_reasons:
        return ActivationResult(
            activation_status="BLOCKED_FAIL_CLOSED",
            first_blocker=unique_reasons[0],
            reason_codes=unique_reasons,
            released_record_ids=tuple(_get(release, "released_record_ids", []) or []),
            knowledge_version=_get(release, "knowledge_version"),
            fixture_as_authority=fixture_as_authority,
            d_authority_receipt_consumed=False,
            d_knowledge_release_consumed=False,
        )

    return ActivationResult(
        activation_status="ACTIVATED_BY_D1_RELEASE",
        first_blocker=None,
        reason_codes=(),
        released_record_ids=tuple(release.get("released_record_ids") or []),
        knowledge_version=release.get("knowledge_version"),
        fixture_as_authority=False,
        d_authority_receipt_consumed=True,
        d_knowledge_release_consumed=True,
    )


def _set_path(target: dict[str, Any], path: str, value: Any) -> None:
    parts = path.split(".")
    current = target
    for part in parts[:-1]:
        child = current.get(part)
        if not isinstance(child, dict):
            child = {}
            current[part] = child
        current = child
    current[parts[-1]] = value


def _remove_path(target: dict[str, Any], path: str) -> None:
    parts = path.split(".")
    current: Any = target
    for part in parts[:-1]:
        if not isinstance(current, dict) or part not in current:
            return
        current = current[part]
    if isinstance(current, dict):
        current.pop(parts[-1], None)


def build_scenario_inputs(matrix: Mapping[str, Any], scenario: Mapping[str, Any]):
    receipt = None if scenario.get("receipt_mode") == "NONE" else copy.deepcopy(matrix.get("base_authoritative_receipt"))
    release = None if scenario.get("release_mode") == "NONE" else copy.deepcopy(matrix.get("base_authoritative_release"))
    if receipt is not None:
        for path, value in (scenario.get("receipt_overrides") or {}).items():
            _set_path(receipt, path, value)
        for path in scenario.get("receipt_remove_paths") or []:
            _remove_path(receipt, path)
    if release is not None:
        for path, value in (scenario.get("release_overrides") or {}).items():
            _set_path(release, path, value)
        for path in scenario.get("release_remove_paths") or []:
            _remove_path(release, path)
    return receipt, release


def validate_fixture_matrix(matrix: Mapping[str, Any]) -> dict[str, Any]:
    scenarios = matrix.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        raise ValueError("SCENARIO_MATRIX_EMPTY")

    results: list[dict[str, Any]] = []
    for scenario in scenarios:
        receipt, release = build_scenario_inputs(matrix, scenario)
        result = evaluate_runtime_activation(receipt, release)
        expected_status = scenario.get("expected_activation_status")
        expected_blocker = scenario.get("expected_first_blocker")
        passed = result.activation_status == expected_status and result.first_blocker == expected_blocker
        results.append({
            "scenario_id": scenario.get("scenario_id"),
            "passed": passed,
            "actual_activation_status": result.activation_status,
            "actual_first_blocker": result.first_blocker,
        })
    failed = [item for item in results if not item["passed"]]
    return {
        "scenario_count": len(results),
        "passed_count": len(results) - len(failed),
        "failed_count": len(failed),
        "status": "PASS" if not failed else "FAIL",
        "results": results,
    }
