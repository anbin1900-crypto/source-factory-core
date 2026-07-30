"""Fail-closed, network-free validator for the W12 runtime pre-final receipt.

This module validates contract shape only. It does not query GitHub, execute a
workflow, connect to PostgreSQL, contact an endpoint, or accept a runtime
receipt on behalf of B-2.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import re
from typing import Any, Mapping

W12_SOURCE_HEAD = "96b37a3bfaaa4980b9dde725106f5da3ac1db8ba"
W12_EVIDENCE_HEAD = "44dd6ebb8700e1d45456f685a6f1fdc4c59d0836"
RUNTIME_SOURCE_HEAD = "64e8a2203bc7f8d5108f6f5dc96529446a953993"
RUNTIME_WORKFLOW_BLOB = "258239428b0386767c52e93386abf224af5a6bfa"
EVENT_NAME = "API_W12_RUNTIME_PREFINAL_PUBLISHED"
EVENT_OWNER = "YOLLA_API_FOLLOWUP_WORKER_03"
EVENT_SOURCE_PR = 180

HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")

REQUIRED_FIELDS = (
    "event_name",
    "event_owner",
    "event_source_pr",
    "w12_source_head",
    "w12_evidence_head",
    "runtime_source_head",
    "runtime_workflow_blob",
    "build_run_id",
    "build_job_id",
    "build_artifact_id",
    "package_lock_sha256",
    "npm_ci_status",
    "typescript_status",
    "next_production_build_status",
    "production_server_health_status",
    "production_server_ready_status",
    "node_playwright_status",
    "shared_process_pass_count",
    "shared_process_required_count",
    "w11_snapshot_status",
    "w11_events_status",
    "w11_sse_status",
    "w09_control_view_status",
    "w10_data_status",
    "cleanup_status",
    "runtime_log_sha256",
    "observed_at",
    "production_used",
    # B-2 fail-closed extensions used to prevent fixture promotion and replay.
    "receipt_classification",
    "fixture",
    "event_id",
    "event_sequence",
)

PASS_FIELDS = (
    "npm_ci_status",
    "typescript_status",
    "next_production_build_status",
    "production_server_health_status",
    "production_server_ready_status",
    "node_playwright_status",
    "w11_snapshot_status",
    "w11_events_status",
    "w11_sse_status",
    "w09_control_view_status",
    "w10_data_status",
    "cleanup_status",
)


class PrefinalValidationError(ValueError):
    """Safe validation failure with a stable machine-readable code."""

    def __init__(self, code: str, field_name: str, message: str) -> None:
        self.code = code
        self.field_name = field_name
        self.safe_message = message
        super().__init__(f"{code}:{field_name}:{message}")


def _require(condition: bool, code: str, field_name: str, message: str) -> None:
    if not condition:
        raise PrefinalValidationError(code, field_name, message)


def _positive_id(value: Any, field_name: str) -> int:
    _require(not isinstance(value, bool), "INVALID_IDENTIFIER", field_name, "boolean is not an identifier")
    if isinstance(value, int):
        number = value
    elif isinstance(value, str) and value.isdigit():
        number = int(value)
    else:
        raise PrefinalValidationError("INVALID_IDENTIFIER", field_name, "positive numeric identifier required")
    _require(number > 0, "INVALID_IDENTIFIER", field_name, "positive numeric identifier required")
    return number


def _sha(value: Any, field_name: str, length: int) -> str:
    pattern = HEX40 if length == 40 else HEX64
    _require(isinstance(value, str) and bool(pattern.fullmatch(value)), "INVALID_HASH", field_name, f"lowercase {length}-hex required")
    _require(set(value) != {"0"}, "INVALID_HASH", field_name, "all-zero hash is forbidden")
    return value


def _timestamp(value: Any) -> str:
    _require(isinstance(value, str) and bool(value), "INVALID_TIMESTAMP", "observed_at", "timezone-aware ISO-8601 required")
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise PrefinalValidationError("INVALID_TIMESTAMP", "observed_at", "timezone-aware ISO-8601 required") from exc
    _require(parsed.tzinfo is not None, "INVALID_TIMESTAMP", "observed_at", "timezone is required")
    return value


def validate_prefinal_receipt(receipt: Mapping[str, Any]) -> dict[str, Any]:
    """Validate one receipt without performing any remote or runtime action."""
    _require(isinstance(receipt, Mapping), "INVALID_RECEIPT", "$", "object required")
    missing = [name for name in REQUIRED_FIELDS if name not in receipt]
    _require(not missing, "MISSING_REQUIRED_FIELD", ",".join(missing), "required field missing")

    _require(receipt["event_name"] == EVENT_NAME, "EVENT_MISMATCH", "event_name", "unexpected event")
    _require(receipt["event_owner"] == EVENT_OWNER, "OWNER_MISMATCH", "event_owner", "unexpected event owner")
    _require(receipt["event_source_pr"] == EVENT_SOURCE_PR, "SOURCE_PR_MISMATCH", "event_source_pr", "unexpected event source PR")

    source_head = _sha(receipt["w12_source_head"], "w12_source_head", 40)
    evidence_head = _sha(receipt["w12_evidence_head"], "w12_evidence_head", 40)
    _require(source_head == W12_SOURCE_HEAD, "SOURCE_HEAD_MISMATCH", "w12_source_head", "exact W12 source head required")
    _require(evidence_head == W12_EVIDENCE_HEAD, "EVIDENCE_HEAD_MISMATCH", "w12_evidence_head", "exact observed W12 evidence head required")
    _require(evidence_head != source_head, "EVIDENCE_AS_SOURCE", "w12_evidence_head", "evidence cannot replace source")

    runtime_head = _sha(receipt["runtime_source_head"], "runtime_source_head", 40)
    workflow_blob = _sha(receipt["runtime_workflow_blob"], "runtime_workflow_blob", 40)
    _require(runtime_head == RUNTIME_SOURCE_HEAD, "RUNTIME_HEAD_MISMATCH", "runtime_source_head", "exact runtime source head required")
    _require(workflow_blob == RUNTIME_WORKFLOW_BLOB, "WORKFLOW_BLOB_MISMATCH", "runtime_workflow_blob", "exact workflow blob required")

    build_run_id = _positive_id(receipt["build_run_id"], "build_run_id")
    build_job_id = _positive_id(receipt["build_job_id"], "build_job_id")
    artifact_id = receipt["build_artifact_id"]
    _require(isinstance(artifact_id, str) and bool(IDENTIFIER.fullmatch(artifact_id)), "INVALID_IDENTIFIER", "build_artifact_id", "non-empty artifact identifier required")
    lowered_artifact = artifact_id.lower()
    _require(not any(token in lowered_artifact for token in ("fixture", "synthetic", "mock")), "FIXTURE_RECEIPT_FORBIDDEN", "build_artifact_id", "fixture-like artifact identifier forbidden")

    package_lock_sha256 = _sha(receipt["package_lock_sha256"], "package_lock_sha256", 64)
    runtime_log_sha256 = _sha(receipt["runtime_log_sha256"], "runtime_log_sha256", 64)

    for field_name in PASS_FIELDS:
        _require(receipt[field_name] == "PASS", "STATUS_NOT_PASS", field_name, "PASS required")

    passed = receipt["shared_process_pass_count"]
    required = receipt["shared_process_required_count"]
    _require(isinstance(passed, int) and not isinstance(passed, bool), "INVALID_PROCESS_COUNT", "shared_process_pass_count", "integer required")
    _require(isinstance(required, int) and not isinstance(required, bool), "INVALID_PROCESS_COUNT", "shared_process_required_count", "integer required")
    _require(required == 10 and passed == required, "SHARED_PROCESS_INCOMPLETE", "shared_process_pass_count", "exactly 10/10 required")

    _timestamp(receipt["observed_at"])
    _require(receipt["production_used"] is False, "PRODUCTION_USED_FORBIDDEN", "production_used", "must be false")
    _require(receipt["receipt_classification"] == "ACTUAL_RUNTIME_RECEIPT", "RECEIPT_CLASSIFICATION_INVALID", "receipt_classification", "actual runtime receipt classification required")
    _require(receipt["fixture"] is False, "FIXTURE_RECEIPT_FORBIDDEN", "fixture", "fixture receipt cannot be accepted")

    event_id = receipt["event_id"]
    _require(isinstance(event_id, str) and bool(IDENTIFIER.fullmatch(event_id)), "INVALID_IDENTIFIER", "event_id", "event identifier required")
    event_sequence = receipt["event_sequence"]
    _require(isinstance(event_sequence, int) and not isinstance(event_sequence, bool) and event_sequence > 0, "INVALID_SEQUENCE", "event_sequence", "positive integer required")

    return {
        "event_name": EVENT_NAME,
        "event_owner": EVENT_OWNER,
        "event_source_pr": EVENT_SOURCE_PR,
        "w12_source_head": source_head,
        "w12_evidence_head": evidence_head,
        "runtime_source_head": runtime_head,
        "runtime_workflow_blob": workflow_blob,
        "build_run_id": build_run_id,
        "build_job_id": build_job_id,
        "build_artifact_id": artifact_id,
        "package_lock_sha256": package_lock_sha256,
        "runtime_log_sha256": runtime_log_sha256,
        "event_id": event_id,
        "event_sequence": event_sequence,
        "shared_process": "PASS_10_OF_10",
        "production_used": False,
        "fixture": False,
    }


@dataclass
class PrefinalEventLedger:
    """In-memory replay/order guard used only by the targeted contract tests."""

    seen_event_ids: set[str] = field(default_factory=set)
    last_sequence: int = 0

    def accept(self, receipt: Mapping[str, Any]) -> dict[str, Any]:
        validated = validate_prefinal_receipt(receipt)
        event_id = validated["event_id"]
        sequence = validated["event_sequence"]
        _require(event_id not in self.seen_event_ids, "DUPLICATE_EVENT", "event_id", "event already accepted")
        _require(sequence > self.last_sequence, "OUT_OF_ORDER_EVENT", "event_sequence", "sequence must increase")
        self.seen_event_ids.add(event_id)
        self.last_sequence = sequence
        return validated


def state_separation(valid_receipt: Mapping[str, Any]) -> dict[str, bool]:
    """Prove that contract conformance is not runtime or final acceptance."""
    validate_prefinal_receipt(valid_receipt)
    return {
        "W12_SOURCE_READY": True,
        "W12_BUILD_READY": True,
        "W12_RUNTIME_PREFINAL_READY": True,
        "B2_W12_RUNTIME_PREFINAL_ACCEPTED": False,
        "W12_FINAL_EVENT_READY": False,
        "B2_ACTUAL_CONTROL_DELTA_ACCEPTED": False,
    }
