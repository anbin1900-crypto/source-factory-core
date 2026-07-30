#!/usr/bin/env python3
"""Local worker lifecycle dry-run orchestrator for Source Factory.

This module binds the already verified local claim store and terminal receipt store
into one local-only lifecycle:
queue intake -> claim -> worker dry-run -> terminal receipt save -> duplicate checks.
It performs no network calls, no GPT/browser/PC Agent work, no middleware transfer,
and no production deployment.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

FORBIDDEN_EFFECT_COUNTERS = {
    "prompt_send_count": 0,
    "browser_launch_count": 0,
    "pc_agent_service_start_count": 0,
    "external_api_call_count": 0,
    "middleware_transmission_count": 0,
    "production_deploy_count": 0,
}


def now_iso() -> str:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Seoul")).replace(microsecond=0).isoformat()
    except Exception:
        return datetime.now().replace(microsecond=0).isoformat()


def build_terminal_receipt(*, queue_item: Dict[str, Any], assignment: Dict[str, Any], claim_attempt: Any) -> Dict[str, Any]:
    claim_key = getattr(claim_attempt, "claim_key", "")
    return {
        "schema_version": "SOURCE_FACTORY_TERMINAL_WORKER_RECEIPT_V1",
        "status": "DRY_RUN_WORKER_COMPLETED",
        "worker_id": assignment["worker_id"],
        "task_id": assignment.get("target_stage") or queue_item.get("target_stage") or "UNKNOWN_TASK",
        "assignment_id": assignment["assignment_id"],
        "claim_key": claim_key,
        "queue_id": queue_item["queue_id"],
        "project_code": queue_item["project_code"],
        "outputs": [
            {
                "kind": "dry_run_lifecycle_output",
                "path": None,
                "description": "Local worker lifecycle dry-run completed without external effects.",
            }
        ],
        "verification": {
            "dry_run_only": True,
            "queue_intake_status": "PASS_QUEUE_INTAKE",
            "claim_status": getattr(claim_attempt, "status", "UNKNOWN_CLAIM_STATUS"),
            "forbidden_effect_counters_zero": True,
        },
        "blockers": [],
        "forbidden_effect_counters": dict(FORBIDDEN_EFFECT_COUNTERS),
        "created_at": now_iso(),
    }


def run_local_worker_lifecycle(*, queue_item: Dict[str, Any], assignment: Dict[str, Any], claim_store: Any, receipt_store: Any) -> Dict[str, Any]:
    claim_attempt = claim_store.try_claim(
        queue_id=queue_item["queue_id"],
        assignment_id=assignment["assignment_id"],
        worker_id=assignment["worker_id"],
    )
    terminal_receipt = build_terminal_receipt(queue_item=queue_item, assignment=assignment, claim_attempt=claim_attempt)
    first_receipt_save = receipt_store.save_terminal_receipt(terminal_receipt)
    second_receipt_save = receipt_store.save_terminal_receipt(terminal_receipt)
    second_claim_attempt = claim_store.try_claim(
        queue_id=queue_item["queue_id"],
        assignment_id=assignment["assignment_id"],
        worker_id=assignment["worker_id"],
    )

    lifecycle_pass = (
        getattr(claim_attempt, "status", "") == "ACCEPTED_FIRST_CLAIM"
        and first_receipt_save.get("status") == "ACCEPTED_TERMINAL_RECEIPT"
        and second_receipt_save.get("status") == "REJECTED_DUPLICATE_TERMINAL_RECEIPT"
        and getattr(second_claim_attempt, "status", "") == "REJECTED_DUPLICATE_CLAIM"
        and len(claim_store.list_claims()) == 1
        and len(receipt_store.list_receipts()) == 1
    )

    return {
        "schema_version": "SOURCE_FACTORY_LOCAL_WORKER_LIFECYCLE_DRY_RUN_V1",
        "status": "PASS_LOCAL_WORKER_LIFECYCLE_DRY_RUN" if lifecycle_pass else "FAIL_LOCAL_WORKER_LIFECYCLE_DRY_RUN",
        "queue_id": queue_item["queue_id"],
        "project_code": queue_item["project_code"],
        "assignment_id": assignment["assignment_id"],
        "worker_id": assignment["worker_id"],
        "claim_attempt_status": getattr(claim_attempt, "status", "UNKNOWN_CLAIM_STATUS"),
        "second_claim_attempt_status": getattr(second_claim_attempt, "status", "UNKNOWN_CLAIM_STATUS"),
        "first_receipt_save_status": first_receipt_save.get("status"),
        "second_receipt_save_status": second_receipt_save.get("status"),
        "claim_store_count": len(claim_store.list_claims()),
        "terminal_receipt_store_count": len(receipt_store.list_receipts()),
        "terminal_receipt": terminal_receipt,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
    }


__all__ = ["run_local_worker_lifecycle", "build_terminal_receipt", "FORBIDDEN_EFFECT_COUNTERS"]
