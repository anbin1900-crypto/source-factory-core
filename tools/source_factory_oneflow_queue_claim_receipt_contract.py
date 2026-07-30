#!/usr/bin/env python3
"""Source Factory 020 - one-flow queue claim and terminal receipt contract dry-run.

This stage consumes the latest 019 queue dispatch dry-run result and creates a
claim/terminal-receipt contract. It does not claim a remote queue item, send GPT
prompts, launch a browser, start a PC Agent service, call external APIs, transmit
middleware data, or deploy production.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List

KST = timezone(timedelta(hours=9))

PASS_019 = "PASS_ONEFLOW_QUEUE_DISPATCH_DRY_RUN_READY_FOR_020"
PASS_020 = "PASS_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_READY_FOR_021"

REQUIRED_TERMINAL_RECEIPT_FIELDS = [
    "status",
    "worker_id",
    "task_id",
    "outputs",
    "verification",
    "blockers",
]

RUNTIME_FILES = [
    "src/queue/dailyQueueReader.js",
    "src/queue/pythonProcessRunner.js",
    "src/gpt_browser_bridge/buttonHandlers.js",
    "src/gpt_browser_bridge/diagnostics.js",
    "src/gpt_browser_bridge/fileNameSafe.js",
    "src/gpt_browser_bridge/stage1SelfCheck.js",
    "src/pc_agent_routing/B2_W12_PREFINAL_VALIDATOR.py",
    "src/pc_agent_routing/event_consumption_store.py",
    "src/pc_agent_routing/resource_doctor.py",
    "src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json",
    "src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js",
    "src/runtime_pipeline/sourceFactoryRuntimeDryRunExecutor.js",
    "examples/gas_station_portal_pipeline/GAS_STATION_PORTAL_QUEUE_EXAMPLE.json",
]


def now_kst() -> datetime:
    return datetime.now(KST).replace(microsecond=0)


def read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def repo_rel(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def find_latest_019(root: Path) -> Dict[str, Path]:
    candidates = sorted(
        root.glob("reports/oneflow_queue_dispatch_dry_run_*/ONEFLOW_QUEUE_DISPATCH_DRY_RUN_DECISION.json")
    )
    if not candidates:
        raise FileNotFoundError("No 019 decision file found under reports/oneflow_queue_dispatch_dry_run_*.")
    decision = candidates[-1]
    report_dir = decision.parent
    return {
        "decision": decision,
        "assignment": report_dir / "ONEFLOW_WORKER_ASSIGNMENT_DRY_RUN.json",
        "dispatch_receipt": report_dir / "ONEFLOW_QUEUE_DISPATCH_DRY_RUN_RECEIPT.json",
        "summary": report_dir / "ONEFLOW_QUEUE_DISPATCH_DRY_RUN_SUMMARY.md",
        "report_dir": report_dir,
    }


def build_file_ledger(root: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for rel in RUNTIME_FILES:
        path = root / rel
        exists = path.is_file()
        rows.append(
            {
                "path": rel,
                "exists": exists,
                "sha256": sha256_file(path) if exists else "",
                "size_bytes": path.stat().st_size if exists else 0,
            }
        )
    return rows


def write_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["path", "exists", "sha256", "size_bytes"])
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, help="Repository root path")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        raise SystemExit(f"Repository root does not exist: {root}")

    stamp = now_kst().strftime("%Y%m%d_%H%M%S")
    generated_at = now_kst().isoformat()
    report_dir = root / "reports" / f"oneflow_queue_claim_receipt_contract_{stamp}"
    report_dir.mkdir(parents=True, exist_ok=True)

    latest_019_paths = find_latest_019(root)
    decision_019 = read_json(latest_019_paths["decision"])
    assignment_019 = read_json(latest_019_paths["assignment"])
    dispatch_receipt_019 = read_json(latest_019_paths["dispatch_receipt"])

    queue_path = Path(decision_019.get("queue_path", ""))
    if not queue_path.is_absolute():
        queue_path = root / str(queue_path)
    queue_item = read_json(queue_path)

    expected_receipt = queue_item.get("expected_receipt", {})
    expected_fields = expected_receipt.get("required_fields", REQUIRED_TERMINAL_RECEIPT_FIELDS)
    missing_expected_fields = [f for f in REQUIRED_TERMINAL_RECEIPT_FIELDS if f not in expected_fields]

    missing_files = [row["path"] for row in build_file_ledger(root) if not row["exists"]]

    assignment_id = assignment_019.get("assignment_id", "")
    queue_id = assignment_019.get("queue_id", queue_item.get("queue_id", ""))
    worker_id = assignment_019.get("worker_id", "SOURCE_FACTORY_DRY_RUN_WORKER_001")
    claim_material = "|".join([str(queue_id), str(assignment_id), str(worker_id), str(generated_at)])
    claim_key = "CLAIM-DRYRUN-" + hashlib.sha256(claim_material.encode("utf-8")).hexdigest()[:20]

    claim_record = {
        "schema_version": "SOURCE_FACTORY_QUEUE_CLAIM_RECORD_DRY_RUN_V1",
        "status": "PASS_QUEUE_CLAIM_DRY_RUN_CONTRACT",
        "claim_key": claim_key,
        "claim_mode": "DRY_RUN_NO_REMOTE_LOCK_NO_MUTATION",
        "created_at": generated_at,
        "project_code": queue_item.get("project_code"),
        "queue_id": queue_id,
        "assignment_id": assignment_id,
        "worker_id": worker_id,
        "claim_scope": {
            "remote_queue_claim": False,
            "local_file_lock": False,
            "prompt_send": False,
            "browser_launch": False,
            "pc_agent_service_start": False,
            "external_api_call": False,
            "production_deploy": False,
        },
        "exactly_once_policy": {
            "dedupe_basis": ["queue_id", "assignment_id", "worker_id"],
            "terminal_receipt_required": True,
            "duplicate_execution_allowed": False,
            "dry_run_note": "This record validates the claim contract only; it does not reserve a remote queue item.",
        },
    }

    terminal_receipt_skeleton = {
        "schema_version": "SOURCE_FACTORY_TERMINAL_WORKER_RECEIPT_V1",
        "status": "PENDING_NOT_EXECUTED_DRY_RUN_SKELETON",
        "worker_id": worker_id,
        "task_id": assignment_019.get("target_stage", "UNKNOWN_TASK"),
        "assignment_id": assignment_id,
        "claim_key": claim_key,
        "queue_id": queue_id,
        "project_code": queue_item.get("project_code"),
        "outputs": [],
        "verification": {
            "expected_required_fields_present": True,
            "source_factory_claim_contract_status": "PASS_QUEUE_CLAIM_DRY_RUN_CONTRACT",
            "dry_run_only": True,
        },
        "blockers": [],
        "forbidden_effect_counters": {
            "prompt_send_count": 0,
            "browser_launch_count": 0,
            "pc_agent_service_start_count": 0,
            "external_api_call_count": 0,
            "middleware_transmission_count": 0,
            "production_deploy_count": 0,
        },
        "created_at": generated_at,
    }

    terminal_fields_present = all(field in terminal_receipt_skeleton for field in REQUIRED_TERMINAL_RECEIPT_FIELDS)
    latest_019_status_ok = decision_019.get("status") == PASS_019
    dispatch_receipt_ok = dispatch_receipt_019.get("status") == "PASS_QUEUE_DISPATCH_DRY_RUN_RECEIPT"
    assignment_ok = assignment_019.get("schema_version") == "SOURCE_FACTORY_WORKER_ASSIGNMENT_DRY_RUN_V1"
    queue_ok = queue_item.get("project_code") == "GAS_STATION_PORTAL" and queue_item.get("mode") == "PROMPT_QUEUE_EXAMPLE_ONLY"

    pass_all = all(
        [
            latest_019_status_ok,
            dispatch_receipt_ok,
            assignment_ok,
            queue_ok,
            terminal_fields_present,
            not missing_expected_fields,
            not missing_files,
        ]
    )
    status = PASS_020 if pass_all else "FAIL_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT"

    file_ledger = build_file_ledger(root)

    decision = {
        "worker_id": "SOURCE_FACTORY_020_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_WORKER",
        "task_id": "020_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT",
        "status": status,
        "generated_at": generated_at,
        "repository_root": str(root),
        "latest_019_decision_path": repo_rel(latest_019_paths["decision"], root),
        "latest_019_status": decision_019.get("status"),
        "dispatch_receipt_status": dispatch_receipt_019.get("status"),
        "assignment_status": "PASS_ASSIGNMENT_CONSUMED" if assignment_ok else "FAIL_ASSIGNMENT_CONSUMPTION",
        "claim_record_status": claim_record["status"],
        "terminal_receipt_skeleton_status": terminal_receipt_skeleton["status"],
        "terminal_required_fields_present": terminal_fields_present,
        "missing_expected_receipt_fields": missing_expected_fields,
        "queue_project_code": queue_item.get("project_code"),
        "queue_mode": queue_item.get("mode"),
        "missing_required_files": missing_files,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
        "report_dir": repo_rel(report_dir, root),
    }

    write_json(report_dir / "ONEFLOW_QUEUE_CLAIM_RECORD_DRY_RUN.json", claim_record)
    write_json(report_dir / "ONEFLOW_TERMINAL_RECEIPT_SKELETON.json", terminal_receipt_skeleton)
    write_json(report_dir / "ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_DECISION.json", decision)
    write_csv(report_dir / "ONEFLOW_QUEUE_CLAIM_RECEIPT_FILE_LEDGER.csv", file_ledger)

    summary = f"""# Source Factory One-flow Queue Claim Receipt Contract

generated_at: {generated_at}
repository_root: {root}

## Summary

| Item | Count / Status |
|---|---:|
| Latest 019 status | {decision_019.get('status')} |
| Dispatch receipt status | {dispatch_receipt_019.get('status')} |
| Assignment consumption status | {decision['assignment_status']} |
| Queue project code | {queue_item.get('project_code')} |
| Queue mode | {queue_item.get('mode')} |
| Claim record status | {claim_record['status']} |
| Terminal required fields present | {terminal_fields_present} |
| Missing expected receipt fields | {len(missing_expected_fields)} |
| Missing required files | {len(missing_files)} |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

{status}

## Policy

- This stage validates exactly-once claim and terminal receipt contracts only.
- It does not reserve or mutate a remote queue item.
- It does not send prompts, launch browsers, start PC Agent, call external APIs, transmit middleware data, or deploy production.
- 021 may proceed only when status is {PASS_020}.
"""
    (report_dir / "ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_SUMMARY.md").write_text(summary, encoding="utf-8")
    (report_dir / "WORKER_REPORT_020.md").write_text(summary, encoding="utf-8")

    print("SOURCE_FACTORY_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_COMPLETE")
    print(f"Status={status}")
    print(f"Latest019Status={decision_019.get('status')}")
    print(f"DispatchReceiptStatus={dispatch_receipt_019.get('status')}")
    print(f"AssignmentStatus={decision['assignment_status']}")
    print(f"ClaimRecordStatus={claim_record['status']}")
    print(f"TerminalRequiredFieldsPresent={terminal_fields_present}")
    print(f"MissingExpectedReceiptFields={len(missing_expected_fields)}")
    print(f"MissingRequiredFiles={len(missing_files)}")
    print(f"ReportDir={report_dir}")

    return 0 if status == PASS_020 else 1


if __name__ == "__main__":
    raise SystemExit(main())
