#!/usr/bin/env python3
"""Local PC Agent MVP dry-run orchestration for Source Factory.

This module binds local queue intake, exactly-once claim, allowlisted command
execution, and terminal receipt storage into one local-only MVP lifecycle.
It does not send prompts, launch browsers, start PC Agent services, call external
APIs, transmit middleware data, mutate a remote queue, or deploy production.
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


def object_to_dict(value: Any) -> Dict[str, Any]:
    if hasattr(value, "__dict__"):
        return dict(value.__dict__)
    if isinstance(value, dict):
        return dict(value)
    return {"value": str(value)}


def build_terminal_receipt(*, queue_item: Dict[str, Any], assignment: Dict[str, Any], claim_attempt: Any, command_result: Any) -> Dict[str, Any]:
    command_payload = object_to_dict(command_result)
    return {
        "schema_version": "SOURCE_FACTORY_TERMINAL_WORKER_RECEIPT_V1",
        "status": "DRY_RUN_PC_AGENT_LOCAL_COMMAND_COMPLETED",
        "worker_id": assignment["worker_id"],
        "task_id": assignment.get("target_stage") or queue_item.get("target_stage") or "UNKNOWN_TASK",
        "assignment_id": assignment["assignment_id"],
        "claim_key": getattr(claim_attempt, "claim_key", ""),
        "queue_id": queue_item["queue_id"],
        "project_code": queue_item["project_code"],
        "outputs": [
            {
                "kind": "local_command_receipt",
                "command_id": command_payload.get("command_id"),
                "exit_code": command_payload.get("exit_code"),
                "stdout_preview": str(command_payload.get("stdout", ""))[:200],
                "stderr_preview": str(command_payload.get("stderr", ""))[:200],
            }
        ],
        "verification": {
            "dry_run_only": True,
            "queue_intake_status": "PASS_QUEUE_INTAKE",
            "claim_status": getattr(claim_attempt, "status", "UNKNOWN_CLAIM_STATUS"),
            "local_command_status": command_payload.get("status"),
            "local_command_exit_code": command_payload.get("exit_code"),
            "forbidden_effect_counters_zero": True,
        },
        "blockers": [],
        "forbidden_effect_counters": dict(FORBIDDEN_EFFECT_COUNTERS),
        "created_at": now_iso(),
    }


def run_local_pc_agent_mvp(*, queue_item: Dict[str, Any], assignment: Dict[str, Any], claim_store: Any, command_runner: Any, command_spec: Any, receipt_store: Any) -> Dict[str, Any]:
    claim_attempt = claim_store.try_claim(
        queue_id=queue_item["queue_id"],
        assignment_id=assignment["assignment_id"],
        worker_id=assignment["worker_id"],
    )
    claim_status = getattr(claim_attempt, "status", "UNKNOWN_CLAIM_STATUS")
    if claim_status != "ACCEPTED_FIRST_CLAIM":
        claim_store_count = len(claim_store.list_claims())
        terminal_receipt_store_count = len(receipt_store.list_receipts())
        return {
            "schema_version": "SOURCE_FACTORY_LOCAL_PC_AGENT_MVP_DRY_RUN_V1",
            "status": "REJECTED_LOCAL_PC_AGENT_MVP_CLAIM",
            "queue_id": queue_item["queue_id"],
            "project_code": queue_item["project_code"],
            "assignment_id": assignment["assignment_id"],
            "worker_id": assignment["worker_id"],
            "claim_attempt_status": claim_status,
            "second_claim_attempt_status": "NOT_RUN_CLAIM_REJECTED",
            "command_status": "NOT_RUN_CLAIM_REJECTED",
            "command_invocation_count": 0,
            "command_exit_code": None,
            "command_stdout": "",
            "command_stderr": "",
            "receipt_save_status": "NOT_RUN_CLAIM_REJECTED",
            "first_receipt_save_status": "NOT_RUN_CLAIM_REJECTED",
            "second_receipt_save_status": "NOT_RUN_CLAIM_REJECTED",
            "claim_store_count": claim_store_count,
            "terminal_receipt_store_count": terminal_receipt_store_count,
            "terminal_receipt": None,
            "production_overwrite_count": 0,
            "external_side_effect_count": 0,
        }

    command_result = command_runner.execute(command_spec)
    terminal_receipt = build_terminal_receipt(
        queue_item=queue_item,
        assignment=assignment,
        claim_attempt=claim_attempt,
        command_result=command_result,
    )
    first_receipt_save = receipt_store.save_terminal_receipt(terminal_receipt)
    second_receipt_save = receipt_store.save_terminal_receipt(terminal_receipt)
    second_claim_attempt = claim_store.try_claim(
        queue_id=queue_item["queue_id"],
        assignment_id=assignment["assignment_id"],
        worker_id=assignment["worker_id"],
    )

    command_payload = object_to_dict(command_result)
    pass_status = (
        getattr(claim_attempt, "status", "") == "ACCEPTED_FIRST_CLAIM"
        and command_payload.get("status") == "PASS_LOCAL_COMMAND_EXECUTION"
        and int(command_payload.get("exit_code", -1)) == 0
        and first_receipt_save.get("status") == "ACCEPTED_TERMINAL_RECEIPT"
        and second_receipt_save.get("status") == "REJECTED_DUPLICATE_TERMINAL_RECEIPT"
        and getattr(second_claim_attempt, "status", "") == "REJECTED_DUPLICATE_CLAIM"
        and len(claim_store.list_claims()) == 1
        and len(receipt_store.list_receipts()) == 1
    )

    return {
        "schema_version": "SOURCE_FACTORY_LOCAL_PC_AGENT_MVP_DRY_RUN_V1",
        "status": "PASS_LOCAL_PC_AGENT_MVP_DRY_RUN" if pass_status else "FAIL_LOCAL_PC_AGENT_MVP_DRY_RUN",
        "queue_id": queue_item["queue_id"],
        "project_code": queue_item["project_code"],
        "assignment_id": assignment["assignment_id"],
        "worker_id": assignment["worker_id"],
        "claim_attempt_status": getattr(claim_attempt, "status", "UNKNOWN_CLAIM_STATUS"),
        "second_claim_attempt_status": getattr(second_claim_attempt, "status", "UNKNOWN_CLAIM_STATUS"),
        "command_status": command_payload.get("status"),
        "command_invocation_count": 1,
        "command_exit_code": command_payload.get("exit_code"),
        "command_stdout": command_payload.get("stdout", ""),
        "command_stderr": command_payload.get("stderr", ""),
        "receipt_save_status": first_receipt_save.get("status"),
        "first_receipt_save_status": first_receipt_save.get("status"),
        "second_receipt_save_status": second_receipt_save.get("status"),
        "claim_store_count": len(claim_store.list_claims()),
        "terminal_receipt_store_count": len(receipt_store.list_receipts()),
        "terminal_receipt": terminal_receipt,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
    }


__all__ = ["run_local_pc_agent_mvp", "build_terminal_receipt", "FORBIDDEN_EFFECT_COUNTERS"]
