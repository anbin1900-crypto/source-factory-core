#!/usr/bin/env python3
"""
Source Factory 019 - One-flow Queue Dispatch Dry Run

Purpose:
- Read one GitHub-style queue item.
- Validate the 018B one-flow runtime pipeline gate.
- Create a dry-run worker assignment and dispatch receipt.
- Do not run GPT, browser automation, PC Agent, external APIs, middleware, or production deployment.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple


REQUIRED_STABLE_RUNTIME_SOURCES = [
    "src/queue/dailyQueueReader.js",
    "src/queue/pythonProcessRunner.js",
    "src/gpt_browser_bridge/buttonHandlers.js",
    "src/gpt_browser_bridge/diagnostics.js",
    "src/gpt_browser_bridge/fileNameSafe.js",
    "src/gpt_browser_bridge/stage1SelfCheck.js",
    "src/pc_agent_routing/B2_W12_PREFINAL_VALIDATOR.py",
    "src/pc_agent_routing/event_consumption_store.py",
    "src/pc_agent_routing/resource_doctor.py",
]

REQUIRED_CONTRACT_FILES = [
    "src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json",
    "src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js",
    "src/runtime_pipeline/sourceFactoryRuntimeDryRunExecutor.js",
    "examples/gas_station_portal_pipeline/GAS_STATION_PORTAL_QUEUE_EXAMPLE.json",
]

EXPECTED_018B_STATUS = "PASS_ONEFLOW_RUNTIME_PIPELINE_VERIFY_READY_FOR_019"
PASS_STATUS = "PASS_ONEFLOW_QUEUE_DISPATCH_DRY_RUN_READY_FOR_020"
FAIL_STATUS = "FAIL_ONEFLOW_QUEUE_DISPATCH_DRY_RUN"


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def read_json(path: Path) -> Tuple[str, Any]:
    try:
        return "PASS_JSON_PARSE", json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:  # noqa: BLE001
        return f"FAIL_JSON_PARSE: {exc}", None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def find_latest_018b_decision(root: Path) -> Tuple[Path | None, Dict[str, Any] | None, str]:
    reports = root / "reports"
    if not reports.exists():
        return None, None, "FAIL_NO_REPORTS_DIR"
    candidates = sorted(reports.glob("oneflow_runtime_pipeline_verify_*/ONEFLOW_RUNTIME_PIPELINE_VERIFY_DECISION.json"))
    if not candidates:
        return None, None, "FAIL_018B_DECISION_NOT_FOUND"
    latest = candidates[-1]
    status, data = read_json(latest)
    if status != "PASS_JSON_PARSE":
        return latest, None, status
    return latest, data, str(data.get("status", ""))


def run_cmd(cmd: List[str], cwd: Path) -> Dict[str, Any]:
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(cwd),
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            check=False,
        )
        return {
            "cmd": cmd,
            "exit_code": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    except FileNotFoundError as exc:
        return {"cmd": cmd, "exit_code": 127, "stdout": "", "stderr": str(exc)}


def build_assignment(root: Path, queue_path: Path, queue: Dict[str, Any], contract: Dict[str, Any]) -> Dict[str, Any]:
    seed = f"{queue.get('queue_id','')}|{queue.get('project_code','')}|{queue.get('target_stage','')}|{now_iso()}"
    assignment_hash = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]
    return {
        "schema_version": "SOURCE_FACTORY_WORKER_ASSIGNMENT_DRY_RUN_V1",
        "assignment_id": f"DRYRUN-{assignment_hash}",
        "worker_id": "SOURCE_FACTORY_DRY_RUN_WORKER_001",
        "worker_role": "QUEUE_DISPATCH_DRY_RUN_WORKER",
        "project_code": queue.get("project_code"),
        "queue_id": queue.get("queue_id"),
        "queue_path": str(queue_path),
        "target_stage": queue.get("target_stage"),
        "task_title": (queue.get("task") or {}).get("title"),
        "task_objective": (queue.get("task") or {}).get("objective"),
        "allowed_effects": (queue.get("task") or {}).get("allowed_effects", []),
        "forbidden_effects": (queue.get("task") or {}).get("forbidden_effects", []),
        "expected_receipt": queue.get("expected_receipt"),
        "runtime_contract_status": contract.get("status"),
        "mode": "DRY_RUN_ONLY_NO_PROMPT_SEND_NO_BROWSER_NO_PC_AGENT",
        "created_at": now_iso(),
    }


def build_dispatch_receipt(
    root: Path,
    queue_path: Path,
    queue: Dict[str, Any],
    assignment: Dict[str, Any],
    missing: List[str],
) -> Dict[str, Any]:
    planned_steps = [
        {
            "step_order": 1,
            "step": "queue_intake",
            "status": "DRY_RUN_PASS",
            "effect": "read_queue_json_only",
        },
        {
            "step_order": 2,
            "step": "worker_assignment_create",
            "status": "DRY_RUN_PASS",
            "effect": "assignment_json_only",
        },
        {
            "step_order": 3,
            "step": "prompt_dispatch_plan",
            "status": "DRY_RUN_PASS",
            "effect": "no_prompt_send",
        },
        {
            "step_order": 4,
            "step": "gpt_browser_bridge_gate",
            "status": "DRY_RUN_PASS",
            "effect": "no_browser_launch_no_gpt_call",
        },
        {
            "step_order": 5,
            "step": "pc_agent_receipt_gate",
            "status": "DRY_RUN_PASS",
            "effect": "no_pc_agent_service_start",
        },
        {
            "step_order": 6,
            "step": "commander_gate_decision",
            "status": "DRY_RUN_READY" if not missing else "DRY_RUN_BLOCKED_MISSING_FILES",
            "effect": "receipt_only",
        },
    ]
    return {
        "schema_version": "SOURCE_FACTORY_QUEUE_DISPATCH_DRY_RUN_RECEIPT_V1",
        "status": "PASS_QUEUE_DISPATCH_DRY_RUN_RECEIPT" if not missing else "FAIL_QUEUE_DISPATCH_DRY_RUN_RECEIPT",
        "generated_at": now_iso(),
        "repository_root": str(root),
        "queue_path": str(queue_path),
        "project_code": queue.get("project_code"),
        "queue_id": queue.get("queue_id"),
        "queue_mode": queue.get("mode"),
        "assignment_id": assignment.get("assignment_id"),
        "worker_id": assignment.get("worker_id"),
        "planned_steps": planned_steps,
        "missing_required_files": missing,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, help="Repository root")
    parser.add_argument("--queue", default="", help="Optional queue item path")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"Repository root not found: {root}", file=sys.stderr)
        return 2

    queue_path = Path(args.queue).resolve() if args.queue else root / "examples/gas_station_portal_pipeline/GAS_STATION_PORTAL_QUEUE_EXAMPLE.json"
    report_dir = root / "reports" / f"oneflow_queue_dispatch_dry_run_{timestamp()}"
    report_dir.mkdir(parents=True, exist_ok=True)

    package_status, package_json = read_json(root / "package.json")
    contract_status, contract = read_json(root / "src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json")
    queue_status, queue = read_json(queue_path)
    latest_018b_path, latest_018b, latest_018b_status = find_latest_018b_decision(root)

    required_paths = REQUIRED_STABLE_RUNTIME_SOURCES + REQUIRED_CONTRACT_FILES
    missing = [rel for rel in required_paths if not (root / rel).is_file()]
    if not queue_path.is_file():
        missing.append(str(queue_path))

    js_checks = []
    for rel in [
        "src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js",
        "src/runtime_pipeline/sourceFactoryRuntimeDryRunExecutor.js",
        "src/queue/dailyQueueReader.js",
        "src/queue/pythonProcessRunner.js",
        "src/gpt_browser_bridge/buttonHandlers.js",
        "src/gpt_browser_bridge/diagnostics.js",
        "src/gpt_browser_bridge/fileNameSafe.js",
        "src/gpt_browser_bridge/stage1SelfCheck.js",
    ]:
        p = root / rel
        if p.is_file():
            result = run_cmd(["node", "--check", str(p)], cwd=root)
            js_checks.append({"path": rel, "status": "PASS_NODE_CHECK" if result["exit_code"] == 0 else "FAIL_NODE_CHECK", **result})

    py_checks = []
    for rel in [
        "src/pc_agent_routing/B2_W12_PREFINAL_VALIDATOR.py",
        "src/pc_agent_routing/event_consumption_store.py",
        "src/pc_agent_routing/resource_doctor.py",
    ]:
        p = root / rel
        if p.is_file():
            result = run_cmd([sys.executable, "-m", "py_compile", str(p)], cwd=root)
            py_checks.append({"path": rel, "status": "PASS_PY_COMPILE" if result["exit_code"] == 0 else "FAIL_PY_COMPILE", **result})

    static_failures = [r for r in js_checks + py_checks if not str(r.get("status", "")).startswith("PASS_")]

    queue_ok = bool(
        isinstance(queue, dict)
        and queue.get("project_code") == "GAS_STATION_PORTAL"
        and queue.get("mode") == "PROMPT_QUEUE_EXAMPLE_ONLY"
        and (queue.get("expected_receipt") or {}).get("required") is True
    )
    contract_ok = bool(isinstance(contract, dict) and contract.get("status") == "PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017")
    prior_ok = latest_018b_status == EXPECTED_018B_STATUS

    assignment = build_assignment(root, queue_path, queue or {}, contract or {}) if queue_ok and contract_ok else {}
    dispatch_receipt = build_dispatch_receipt(root, queue_path, queue or {}, assignment, missing) if assignment else {}

    pass_all = (
        not missing
        and package_status == "PASS_JSON_PARSE"
        and contract_status == "PASS_JSON_PARSE"
        and queue_status == "PASS_JSON_PARSE"
        and contract_ok
        and queue_ok
        and prior_ok
        and not static_failures
        and bool(assignment)
        and dispatch_receipt.get("status") == "PASS_QUEUE_DISPATCH_DRY_RUN_RECEIPT"
    )
    final_status = PASS_STATUS if pass_all else FAIL_STATUS

    ledger_rows = []
    for rel in required_paths:
        p = root / rel
        ledger_rows.append({
            "path": rel.replace("\\", "/"),
            "exists": str(p.is_file()),
            "sha256": sha256_file(p) if p.is_file() else "",
            "size_bytes": p.stat().st_size if p.is_file() else 0,
        })

    summary_path = report_dir / "ONEFLOW_QUEUE_DISPATCH_DRY_RUN_SUMMARY.md"
    decision_path = report_dir / "ONEFLOW_QUEUE_DISPATCH_DRY_RUN_DECISION.json"
    assignment_path = report_dir / "ONEFLOW_WORKER_ASSIGNMENT_DRY_RUN.json"
    receipt_path = report_dir / "ONEFLOW_QUEUE_DISPATCH_DRY_RUN_RECEIPT.json"
    ledger_path = report_dir / "ONEFLOW_QUEUE_DISPATCH_DRY_RUN_FILE_LEDGER.csv"
    worker_report_path = report_dir / "WORKER_REPORT_019.md"

    with ledger_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["path", "exists", "sha256", "size_bytes"])
        writer.writeheader()
        writer.writerows(ledger_rows)

    decision = {
        "worker_id": "SOURCE_FACTORY_019_ONEFLOW_QUEUE_DISPATCH_DRY_RUN_WORKER",
        "task_id": "019_ONEFLOW_QUEUE_DISPATCH_DRY_RUN",
        "status": final_status,
        "generated_at": now_iso(),
        "repository_root": str(root),
        "queue_path": str(queue_path),
        "latest_018b_decision_path": str(latest_018b_path) if latest_018b_path else "",
        "latest_018b_status": latest_018b_status,
        "package_json_status": package_status,
        "package_type": (package_json or {}).get("type") if isinstance(package_json, dict) else "",
        "contract_parse_status": contract_status,
        "contract_status": (contract or {}).get("status") if isinstance(contract, dict) else "",
        "queue_parse_status": queue_status,
        "queue_project_code": (queue or {}).get("project_code") if isinstance(queue, dict) else "",
        "queue_mode": (queue or {}).get("mode") if isinstance(queue, dict) else "",
        "missing_count": len(missing),
        "missing": missing,
        "javascript_static_checks": len(js_checks),
        "python_static_checks": len(py_checks),
        "static_check_failures": len(static_failures),
        "assignment_status": "PASS_ASSIGNMENT_CREATED" if assignment else "FAIL_ASSIGNMENT_NOT_CREATED",
        "dispatch_receipt_status": dispatch_receipt.get("status", ""),
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
        "report_dir": str(report_dir.relative_to(root)).replace("\\", "/"),
    }

    assignment_path.write_text(json.dumps(assignment, ensure_ascii=False, indent=2), encoding="utf-8")
    receipt_path.write_text(json.dumps(dispatch_receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    decision_path.write_text(json.dumps(decision, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = f"""# Source Factory One-flow Queue Dispatch Dry Run

generated_at: {now_iso()}
repository_root: {root}

## Summary

| Item | Count / Status |
|---|---:|
| Latest 018B status | {latest_018b_status} |
| package.json parse status | {package_status} |
| package.json type | {decision.get('package_type')} |
| Contract parse status | {contract_status} |
| Contract status | {decision.get('contract_status')} |
| Queue parse status | {queue_status} |
| Queue project code | {decision.get('queue_project_code')} |
| Queue mode | {decision.get('queue_mode')} |
| Missing required files | {len(missing)} |
| JavaScript static checks | {len(js_checks)} |
| Python static checks | {len(py_checks)} |
| Static check failures | {len(static_failures)} |
| Assignment status | {decision.get('assignment_status')} |
| Dispatch receipt status | {decision.get('dispatch_receipt_status')} |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

{final_status}

## Policy

- This is queue dispatch dry-run only.
- It does not send prompts, launch browsers, start PC Agent, call external APIs, transmit middleware data, or deploy production.
- 020 may proceed only when status is {PASS_STATUS}.
"""
    summary_path.write_text(summary, encoding="utf-8")
    worker_report_path.write_text(summary, encoding="utf-8")

    print("SOURCE_FACTORY_ONEFLOW_QUEUE_DISPATCH_DRY_RUN_COMPLETE")
    print(f"Status={final_status}")
    print(f"Latest018BStatus={latest_018b_status}")
    print(f"QueueProjectCode={decision.get('queue_project_code')}")
    print(f"QueueMode={decision.get('queue_mode')}")
    print(f"Missing={len(missing)}")
    print(f"StaticCheckFailures={len(static_failures)}")
    print(f"AssignmentStatus={decision.get('assignment_status')}")
    print(f"DispatchReceiptStatus={decision.get('dispatch_receipt_status')}")
    print(f"ReportDir={report_dir}")

    return 0 if pass_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
