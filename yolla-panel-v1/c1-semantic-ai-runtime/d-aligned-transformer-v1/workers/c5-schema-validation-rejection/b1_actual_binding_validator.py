from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
from typing import Any, Mapping, Sequence


REQUIRED_REASONS = (
    "MISSING_REQUIRED_VALUE",
    "TYPE_ERROR",
    "RANGE_ERROR",
    "UNMAPPED_FIELD",
    "INVALID_CODE",
    "FORMAT_ERROR",
    "UNIT_CONVERSION_ERROR",
    "IDENTIFIER_NORMALIZATION_ERROR",
    "RELATION_TARGET_MISSING",
    "PROVENANCE_REF_MISSING",
    "EVIDENCE_REF_MISSING",
)


class FailClosedError(ValueError):
    pass


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def canonical_sha256(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()


def validate_contract_binding(
    schema_profile: Mapping[str, Any],
    mapping_contract: Mapping[str, Any],
    ruleset: Mapping[str, Any],
) -> dict[str, Any]:
    findings: list[str] = []
    if schema_profile.get("schema_profile_id") != "D_CANONICAL_SCHEMA_PROFILE_V1":
        findings.append("SCHEMA_PROFILE_ID_MISMATCH")
    if schema_profile.get("schema_version") != "1.0.0":
        findings.append("SCHEMA_PROFILE_VERSION_MISMATCH")
    if mapping_contract.get("mapping_contract_id") != "D-INBOUND-FIELD-MAPPING-CONTRACT-V1":
        findings.append("MAPPING_CONTRACT_ID_MISMATCH")
    if mapping_contract.get("mapping_version") != "1.0.0":
        findings.append("MAPPING_VERSION_MISMATCH")
    if ruleset.get("ruleset_id") != "D-INTAKE-VALIDATION-RULESET-V1":
        findings.append("RULESET_ID_MISMATCH")
    if ruleset.get("ruleset_version") != "1.0.0":
        findings.append("RULESET_VERSION_MISMATCH")

    profile_sha = schema_profile.get("profile_sha256")
    mapping_sha = mapping_contract.get("contract_sha256")
    if mapping_contract.get("schema_profile_ref", {}).get("profile_sha256") != profile_sha:
        findings.append("MAPPING_PROFILE_HASH_MISMATCH")
    if ruleset.get("schema_profile_ref") != profile_sha:
        findings.append("RULESET_PROFILE_HASH_MISMATCH")
    if ruleset.get("mapping_contract_ref") != mapping_sha:
        findings.append("RULESET_MAPPING_HASH_MISMATCH")
    if ruleset.get("fail_closed") is not True:
        findings.append("RULESET_NOT_FAIL_CLOSED")
    if ruleset.get("silent_drop") is not False:
        findings.append("RULESET_SILENT_DROP_ENABLED")
    catalog = set(ruleset.get("reason_code_catalog", []))
    if not set(REQUIRED_REASONS).issubset(catalog):
        findings.append("REQUIRED_REJECTION_REASON_MISSING")

    if findings:
        raise FailClosedError(",".join(findings))
    return {
        "decision": "PASS",
        "profile_sha256": profile_sha,
        "mapping_contract_sha256": mapping_sha,
        "ruleset_sha256": ruleset.get("ruleset_sha256"),
    }


def validate_b1_receipt(
    normalized_dataset: Mapping[str, Any],
    raw_manifest: Mapping[str, Any],
    source_envelope: Mapping[str, Any],
    receipt: Mapping[str, Any],
) -> dict[str, Any]:
    findings: list[str] = []
    actual_hashes = {
        "normalized_dataset_sha256": canonical_sha256(normalized_dataset),
        "raw_artifact_manifest_sha256": canonical_sha256(raw_manifest),
        "source_record_envelope_sha256": canonical_sha256(source_envelope),
    }
    for key, actual in actual_hashes.items():
        if receipt.get(key) != actual:
            findings.append(f"{key.upper()}_MISMATCH")

    if raw_manifest.get("total_record_count") != source_envelope.get("record_count"):
        findings.append("RAW_ENVELOPE_RECORD_COUNT_MISMATCH")
    if receipt.get("input_record_count") != normalized_dataset.get("input_record_count"):
        findings.append("RECEIPT_NORMALIZED_INPUT_COUNT_MISMATCH")
    if receipt.get("output_record_count") != normalized_dataset.get("output_record_count"):
        findings.append("RECEIPT_NORMALIZED_OUTPUT_COUNT_MISMATCH")
    if receipt.get("duplicate_count") != normalized_dataset.get("duplicate_count"):
        findings.append("RECEIPT_DUPLICATE_COUNT_MISMATCH")
    if normalized_dataset.get("input_record_count") != (
        normalized_dataset.get("output_record_count", 0)
        + normalized_dataset.get("duplicate_count", 0)
    ):
        findings.append("NORMALIZED_COUNT_EQUATION_MISMATCH")
    if len(normalized_dataset.get("records", [])) != normalized_dataset.get("output_record_count"):
        findings.append("NORMALIZED_RECORD_ARRAY_COUNT_MISMATCH")
    if receipt.get("mode") != "FIXTURE":
        findings.append("NON_FIXTURE_MODE_NOT_AUTHORIZED")
    if receipt.get("actual_site_extraction") is not False:
        findings.append("ACTUAL_SITE_EXTRACTION_NOT_ALLOWED")
    if receipt.get("network_call_count") != 0:
        findings.append("NETWORK_CALL_COUNT_NONZERO")
    if normalized_dataset.get("source_field_loss_count") != 0:
        findings.append("SOURCE_FIELD_LOSS_NONZERO")

    if findings:
        raise FailClosedError(",".join(findings))
    return {"decision": "PASS", "hashes": actual_hashes, "findings": []}


def classify_normalized_dataset(
    normalized_dataset: Mapping[str, Any],
    mapping_contract: Mapping[str, Any],
    *,
    b1_head: str,
    d1_head: str,
) -> dict[str, Any]:
    mapping_rows = mapping_contract.get("mapping_rows", [])
    normalized_rules = [
        row for row in mapping_rows
        if isinstance(row, Sequence) and len(row) >= 2 and row[1] == "NORMALIZED_DATASET_V1"
    ]

    rejected: list[dict[str, Any]] = []
    valid: list[dict[str, Any]] = []
    counts = {reason: 0 for reason in REQUIRED_REASONS}

    for record in normalized_dataset.get("records", []):
        source_copy = deepcopy(record)
        reasons: list[str] = []
        findings: list[str] = []

        if not normalized_rules:
            reasons.append("UNMAPPED_FIELD")
            findings.append("D_MAPPING_RULE_COUNT_FOR_NORMALIZED_DATASET_V1=0")

        provenance = record.get("provenance")
        provenance_present = (
            isinstance(provenance, Mapping)
            and bool(provenance.get("raw_artifact_ids"))
            and bool(provenance.get("source_record_ids"))
            and bool(provenance.get("source_urls"))
        )
        if not provenance_present:
            reasons.append("PROVENANCE_REF_MISSING")
            findings.append("PROVENANCE_CHAIN_INCOMPLETE")

        # B-1 preserves source evidence lineage but does not emit the D evidence
        # link fields required for a D-aligned semantic record.
        evidence_ref_present = bool(record.get("evidence_ref"))
        if not evidence_ref_present:
            reasons.append("EVIDENCE_REF_MISSING")
            findings.append("D_EVIDENCE_REF_NOT_EMITTED_BY_B1_SOURCE_PACKAGE")

        reasons = list(dict.fromkeys(reasons))
        if reasons:
            for reason in reasons:
                counts[reason] += 1
            rejected.append(
                {
                    "record_id": record.get("record_id"),
                    "source_record_sha256": canonical_sha256(source_copy),
                    "reasons": reasons,
                    "findings": findings,
                    "source_record": source_copy,
                    "source_record_preserved": True,
                    "provenance_ref_present": provenance_present,
                    "evidence_ref_present": evidence_ref_present,
                }
            )
        else:
            valid.append(source_copy)

    input_count = len(normalized_dataset.get("records", []))
    silent_drop = input_count - len(valid) - len(rejected)
    if silent_drop != 0:
        raise FailClosedError("SILENT_DROP_DETECTED")

    return {
        "schema_version": "REJECTED_RECORD_BUNDLE_V1",
        "bundle_id": "C5-B1-NORMALIZED-DATASET-REJECTED-BUNDLE-20260804-001",
        "classification_mode": "B1_AUTHORITY_FIXTURE_SOURCE_PACKAGE",
        "source_authority": {
            "repository": "anbin1900-crypto/source-factory-core",
            "pull_request": 19,
            "head": b1_head,
            "dataset_id": normalized_dataset.get("dataset_id"),
        },
        "d_authority": {
            "repository": "anbin1900-crypto/source-factory-core",
            "pull_request": 21,
            "head": d1_head,
            "mapping_contract_id": mapping_contract.get("mapping_contract_id"),
            "mapping_version": mapping_contract.get("mapping_version"),
        },
        "mapping_rule_count_for_normalized_dataset_v1": len(normalized_rules),
        "input_record_count": input_count,
        "valid_count": len(valid),
        "rejected_count": len(rejected),
        "pending_count": 0,
        "silent_drop_count": silent_drop,
        "rejection_reason_counts": counts,
        "valid_records": valid,
        "rejected_records": rejected,
        "actual_site_data": False,
        "d_accepted_data": False,
        "d_canonical_db_write": False,
        "decision": (
            "REJECTED_NO_D_MAPPING_ROWS_AND_EVIDENCE_REFS"
            if rejected and not valid
            else "PARTIAL_OR_ACCEPTED"
        ),
        "first_blocker": (
            "NO_D_MAPPING_ROWS_FOR_NORMALIZED_DATASET_V1"
            if not normalized_rules else None
        ),
        "next_gate": (
            "C3_C4_PUBLISH_ACTUAL_D_ALIGNED_MAPPING_PACKAGE_AND_EVIDENCE_REFS"
            if not normalized_rules else None
        ),
    }
