from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


@dataclass(frozen=True)
class TriggerResult:
    allowed: bool
    errors: List[str]


def evaluate_trigger(
    declared: Dict[str, Dict[str, Any]],
    observed: Dict[str, Dict[str, Any]],
) -> TriggerResult:
    errors: List[str] = []

    for worker in ("a3", "a5", "a4"):
        if declared[worker]["head"] != observed[worker]["head"]:
            errors.append(f"STALE_{worker.upper()}_HEAD")
        if declared[worker]["pointer_blob"] != observed[worker]["pointer_blob"]:
            errors.append(f"{worker.upper()}_POINTER_BLOB_MISMATCH")

    if observed["a3"].get("handoff_ready") is not True:
        errors.append("A3_HANDOFF_NOT_READY")
    if observed["a5"].get("handoff_ready") is not True:
        errors.append("A5_HANDOFF_NOT_READY")
    if observed["a4"].get("pagination_binding_audit") != "PASS":
        errors.append("A4_PAGINATION_BINDING_AUDIT_NOT_PASS")

    if observed["a3"].get("response_fixture_binding_count") != 8:
        errors.append("RESPONSE_BODY_FIXTURE_BINDING_LT_8")

    if observed["a5"].get("terminal") != "A5_FINAL_AUTHORITY_REBIND_AND_EXECUTION_CONTRACT_READY":
        errors.append("A5_FINAL_AUTHORITY_NOT_READY")

    for worker in ("a3", "a5", "a4"):
        state = str(observed[worker].get("authority_state", ""))
        if observed[worker].get("placeholder") is True or state in {
            "PLACEHOLDER",
            "SUPERSEDED_NON_AUTHORITY_FIXTURE_ONLY",
        }:
            errors.append(f"{worker.upper()}_PLACEHOLDER_AUTHORITY")

    return TriggerResult(allowed=not errors, errors=errors)
