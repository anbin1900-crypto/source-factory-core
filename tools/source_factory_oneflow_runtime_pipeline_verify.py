#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Source Factory One-flow Runtime Pipeline Verify

Purpose:
- Replace the fragmented PowerShell/Node dry-run chain for 016~019 pre-runtime validation.
- Verify the stable runtime core, runtime pipeline contract, and gas station portal queue example.
- Generate a dry-run receipt without launching GPT, browser automation, PC Agent, external API, middleware, or production deployment.

Exit code:
- 0 when PASS_ONEFLOW_RUNTIME_PIPELINE_VERIFY_READY_FOR_019
- 1 otherwise
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import py_compile
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple


STABLE_RUNTIME_SOURCES = [
    {"group": "queue", "role": "daily_queue_reader", "path": "src/queue/dailyQueueReader.js", "language": "javascript"},
    {"group": "queue", "role": "python_process_runner", "path": "src/queue/pythonProcessRunner.js", "language": "javascript"},
    {"group": "gpt_browser_bridge", "role": "button_handlers", "path": "src/gpt_browser_bridge/buttonHandlers.js", "language": "javascript"},
    {"group": "gpt_browser_bridge", "role": "diagnostics", "path": "src/gpt_browser_bridge/diagnostics.js", "language": "javascript"},
    {"group": "gpt_browser_bridge", "role": "file_name_safe", "path": "src/gpt_browser_bridge/fileNameSafe.js", "language": "javascript"},
    {"group": "gpt_browser_bridge", "role": "stage1_self_check", "path": "src/gpt_browser_bridge/stage1SelfCheck.js", "language": "javascript"},
    {"group": "pc_agent_routing", "role": "b2_w12_prefinal_validator", "path": "src/pc_agent_routing/B2_W12_PREFINAL_VALIDATOR.py", "language": "python"},
    {"group": "pc_agent_routing", "role": "event_consumption_store", "path": "src/pc_agent_routing/event_consumption_store.py", "language": "python"},
    {"group": "pc_agent_routing", "role": "resource_doctor", "path": "src/pc_agent_routing/resource_doctor.py", "language": "python"},
]

CONTRACT_PATH = "src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json"
REGISTRY_PATH = "src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js"
DRY_RUN_EXECUTOR_PATH = "src/runtime_pipeline/sourceFactoryRuntimeDryRunExecutor.js"
QUEUE_EXAMPLE_PATH = "examples/gas_station_portal_pipeline/GAS_STATION_PORTAL_QUEUE_EXAMPLE.json"
EXPECTED_CONTRACT_STATUS = "PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017"
EXPECTED_PASS_STATUS = "PASS_ONEFLOW_RUNTIME_PIPELINE_VERIFY_READY_FOR_019"
FAIL_STATUS = "FAIL_ONEFLOW_RUNTIME_PIPELINE_VERIFY"


def now_local_iso() -> str:
    return datetime.now().astimezone().isoformat()


def timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_json(path: Path) -> Tuple[bool, Any, str]:
    try:
        with path.open("r", encoding="utf-8-sig") as f:
            return True, json.load(f), "PASS_JSON_PARSE"
    except Exception as exc:  # noqa: BLE001 - report exact failure text
        return False, None, f"FAIL_JSON_PARSE: {exc}"


def run_command(cmd: List[str], cwd: Path) -> Tuple[int, str]:
    try:
        result = subprocess.run(
            cmd,
            cwd=str(cwd),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        return int(result.returncode), (result.stdout or "").strip()
    except FileNotFoundError as exc:
        return 127, f"COMMAND_NOT_FOUND: {exc}"
    except Exception as exc:  # noqa: BLE001
        return 126, f"COMMAND_FAILED: {exc}"


def node_check(path: Path, root: Path) -> Tuple[str, int, str]:
    node = shutil.which("node")
    if not node:
        return "FAIL_NODE_NOT_FOUND", 127, "node executable not found in PATH"
    code, output = run_command([node, "--check", str(path)], root)
    if code == 0:
        return "PASS_NODE_CHECK", code, output
    return "FAIL_NODE_CHECK", code, output


def python_compile_check(path: Path) -> Tuple[str, str]:
    try:
        py_compile.compile(str(path), doraise=True)
        return "PASS_PY_COMPILE", ""
    except Exception as exc:  # noqa: BLE001
        return "FAIL_PY_COMPILE", str(exc)


def safe_rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return str(path)


def build_dry_run_receipt(root: Path, contract: Dict[str, Any], queue_item: Dict[str, Any], ledger_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    missing_runtime_sources = [row for row in ledger_rows if row.get("kind") == "stable_runtime_source" and not row.get("exists")]
    planned_steps = [
        {"step": "daily_queue_intake", "status": "DRY_RUN_PASS", "effect": "read_queue_example_only"},
        {"step": "worker_prompt_dispatch_plan", "status": "DRY_RUN_PASS", "effect": "plan_only_no_prompt_send"},
        {"step": "gpt_browser_bridge_check", "status": "DRY_RUN_PASS", "effect": "no_browser_launch_no_gpt_call"},
        {"step": "pc_agent_receipt_gate", "status": "DRY_RUN_PASS", "effect": "no_pc_agent_service_start"},
        {"step": "commander_gate_decision", "status": "DRY_RUN_READY" if not missing_runtime_sources else "DRY_RUN_BLOCKED", "effect": "receipt_only"},
    ]

    receipt_status = (
        "PASS_RUNTIME_PIPELINE_DRY_RUN_READY_FOR_019"
        if contract.get("status") == EXPECTED_CONTRACT_STATUS
        and queue_item.get("project_code") == "GAS_STATION_PORTAL"
        and queue_item.get("mode") == "PROMPT_QUEUE_EXAMPLE_ONLY"
        and len(missing_runtime_sources) == 0
        else "FAIL_RUNTIME_PIPELINE_DRY_RUN"
    )

    return {
        "schema_version": "SOURCE_FACTORY_RUNTIME_DRY_RUN_RECEIPT_V2_PYTHON_ONEFLOW",
        "generated_at": now_local_iso(),
        "mode": "DRY_RUN_ONLY_NO_EXTERNAL_EFFECTS",
        "repository_root": str(root),
        "queue_path": str(root / QUEUE_EXAMPLE_PATH),
        "contract_status": contract.get("status"),
        "queue_project_code": queue_item.get("project_code"),
        "queue_id": queue_item.get("queue_id"),
        "queue_mode": queue_item.get("mode"),
        "target_stage": queue_item.get("target_stage"),
        "runtime_source_count": len(STABLE_RUNTIME_SOURCES),
        "missing_runtime_source_count": len(missing_runtime_sources),
        "execution_flow": contract.get("execution_flow") or contract.get("executionFlow") or [],
        "planned_steps": planned_steps,
        "missing_runtime_sources": missing_runtime_sources,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
        "status": receipt_status,
    }


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields: List[str] = []
    for row in rows:
        for key in row.keys():
            if key not in fields:
                fields.append(key)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="Source Factory one-flow runtime pipeline verifier")
    parser.add_argument("--root", default=os.getcwd(), help="Repository root. Default: current working directory")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    report_dir = root / "reports" / f"oneflow_runtime_pipeline_verify_{timestamp()}"
    report_dir.mkdir(parents=True, exist_ok=True)

    package_path = root / "package.json"
    contract_path = root / CONTRACT_PATH
    registry_path = root / REGISTRY_PATH
    executor_path = root / DRY_RUN_EXECUTOR_PATH
    queue_path = root / QUEUE_EXAMPLE_PATH

    ledger_rows: List[Dict[str, Any]] = []
    missing: List[str] = []

    required_files = [contract_path, registry_path, executor_path, queue_path]
    for item in STABLE_RUNTIME_SOURCES:
        required_files.append(root / item["path"])

    for p in required_files:
        if not p.is_file():
            missing.append(safe_rel(p, root))

    package_ok, package_json, package_parse_status = read_json(package_path) if package_path.is_file() else (False, None, "FAIL_PACKAGE_JSON_MISSING")
    contract_ok, contract_json, contract_parse_status = read_json(contract_path) if contract_path.is_file() else (False, None, "FAIL_CONTRACT_JSON_MISSING")
    queue_ok, queue_json, queue_parse_status = read_json(queue_path) if queue_path.is_file() else (False, None, "FAIL_QUEUE_JSON_MISSING")

    package_type = package_json.get("type") if isinstance(package_json, dict) else None
    contract_status = contract_json.get("status") if isinstance(contract_json, dict) else None
    queue_project_code = queue_json.get("project_code") if isinstance(queue_json, dict) else None
    queue_mode = queue_json.get("mode") if isinstance(queue_json, dict) else None

    check_failures = 0
    node_check_count = 0
    py_check_count = 0

    for item in STABLE_RUNTIME_SOURCES:
        p = root / item["path"]
        row: Dict[str, Any] = {
            "kind": "stable_runtime_source",
            "group": item["group"],
            "role": item["role"],
            "path": item["path"],
            "language": item["language"],
            "exists": p.is_file(),
            "sha256": sha256_file(p) if p.is_file() else "",
            "size_bytes": p.stat().st_size if p.is_file() else 0,
            "static_status": "NOT_RUN",
            "static_exit_code": "",
            "static_output": "",
        }
        if p.is_file() and item["language"] == "javascript":
            node_check_count += 1
            status, code, output = node_check(p, root)
            row["static_status"] = status
            row["static_exit_code"] = code
            row["static_output"] = output
            if status != "PASS_NODE_CHECK":
                check_failures += 1
        elif p.is_file() and item["language"] == "python":
            py_check_count += 1
            status, output = python_compile_check(p)
            row["static_status"] = status
            row["static_output"] = output
            if status != "PASS_PY_COMPILE":
                check_failures += 1
        elif not p.is_file():
            row["static_status"] = "FAIL_MISSING"
            check_failures += 1
        ledger_rows.append(row)

    for kind, rel in [
        ("contract_json", CONTRACT_PATH),
        ("registry_js", REGISTRY_PATH),
        ("dry_run_executor_js", DRY_RUN_EXECUTOR_PATH),
        ("queue_example_json", QUEUE_EXAMPLE_PATH),
    ]:
        p = root / rel
        ledger_rows.append({
            "kind": kind,
            "path": rel,
            "exists": p.is_file(),
            "sha256": sha256_file(p) if p.is_file() else "",
            "size_bytes": p.stat().st_size if p.is_file() else 0,
        })

    registry_syntax_status = "NOT_RUN"
    registry_syntax_code: Any = ""
    registry_syntax_output = ""
    if registry_path.is_file():
        registry_syntax_status, registry_syntax_code, registry_syntax_output = node_check(registry_path, root)
        if registry_syntax_status != "PASS_NODE_CHECK":
            check_failures += 1

    executor_syntax_status = "NOT_RUN"
    executor_syntax_code: Any = ""
    executor_syntax_output = ""
    if executor_path.is_file():
        executor_syntax_status, executor_syntax_code, executor_syntax_output = node_check(executor_path, root)
        if executor_syntax_status != "PASS_NODE_CHECK":
            check_failures += 1

    receipt = build_dry_run_receipt(root, contract_json if isinstance(contract_json, dict) else {}, queue_json if isinstance(queue_json, dict) else {}, ledger_rows)

    pass_conditions = {
        "missing_count_zero": len(missing) == 0,
        "package_json_parse": package_parse_status == "PASS_JSON_PARSE",
        "package_type_module": package_type == "module",
        "contract_json_parse": contract_parse_status == "PASS_JSON_PARSE",
        "contract_status": contract_status == EXPECTED_CONTRACT_STATUS,
        "queue_json_parse": queue_parse_status == "PASS_JSON_PARSE",
        "queue_project_code": queue_project_code == "GAS_STATION_PORTAL",
        "queue_mode": queue_mode == "PROMPT_QUEUE_EXAMPLE_ONLY",
        "static_checks_zero_failures": check_failures == 0,
        "dry_run_receipt_status": receipt.get("status") == "PASS_RUNTIME_PIPELINE_DRY_RUN_READY_FOR_019",
    }

    final_status = EXPECTED_PASS_STATUS if all(pass_conditions.values()) else FAIL_STATUS

    decision = {
        "worker_id": "SOURCE_FACTORY_018B_ONEFLOW_RUNTIME_PIPELINE_VERIFY_WORKER",
        "task_id": "018B_ONEFLOW_RUNTIME_PIPELINE_VERIFY",
        "status": final_status,
        "generated_at": now_local_iso(),
        "repository_root": str(root),
        "missing_count": len(missing),
        "missing": missing,
        "package_parse_status": package_parse_status,
        "package_type": package_type,
        "contract_parse_status": contract_parse_status,
        "contract_status": contract_status,
        "queue_parse_status": queue_parse_status,
        "queue_project_code": queue_project_code,
        "queue_mode": queue_mode,
        "node_checked_javascript_files": node_check_count,
        "python_compile_checked_files": py_check_count,
        "registry_syntax_status": registry_syntax_status,
        "registry_syntax_exit_code": registry_syntax_code,
        "registry_syntax_output": registry_syntax_output,
        "executor_syntax_status": executor_syntax_status,
        "executor_syntax_exit_code": executor_syntax_code,
        "executor_syntax_output": executor_syntax_output,
        "check_failures": check_failures,
        "dry_run_receipt_status": receipt.get("status"),
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
        "pass_conditions": pass_conditions,
        "report_dir": safe_rel(report_dir, root),
    }

    write_csv(report_dir / "ONEFLOW_RUNTIME_PIPELINE_FILE_LEDGER.csv", ledger_rows)
    write_json(report_dir / "ONEFLOW_RUNTIME_PIPELINE_DRY_RUN_RECEIPT.json", receipt)
    write_json(report_dir / "ONEFLOW_RUNTIME_PIPELINE_VERIFY_DECISION.json", decision)

    summary = f"""# Source Factory One-flow Runtime Pipeline Verify

generated_at: {decision['generated_at']}
repository_root: {root}

## Summary

| Item | Count / Status |
|---|---:|
| Stable runtime sources checked | {len(STABLE_RUNTIME_SOURCES)} |
| Missing required files | {len(missing)} |
| package.json parse status | {package_parse_status} |
| package.json type | {package_type} |
| Contract parse status | {contract_parse_status} |
| Contract status | {contract_status} |
| Queue parse status | {queue_parse_status} |
| Queue project code | {queue_project_code} |
| Queue mode | {queue_mode} |
| JavaScript node checks | {node_check_count} |
| Python compile checks | {py_check_count} |
| Registry syntax status | {registry_syntax_status} |
| Executor syntax status | {executor_syntax_status} |
| Static check failures | {check_failures} |
| Dry-run receipt status | {receipt.get('status')} |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

{final_status}

## Policy

- This is a Python one-flow verifier for runtime pipeline readiness.
- It does not run GPT, browser automation, PC Agent service, external API, middleware transmission, or production deployment.
- It replaces the fragmented PowerShell/Node dry-run checks for this gate.
- 019 may proceed only when status is {EXPECTED_PASS_STATUS}.
"""
    write_text(report_dir / "ONEFLOW_RUNTIME_PIPELINE_VERIFY_SUMMARY.md", summary)
    write_text(report_dir / "WORKER_REPORT_018B.md", summary)

    print("SOURCE_FACTORY_ONEFLOW_RUNTIME_PIPELINE_VERIFY_COMPLETE")
    print(f"Status={final_status}")
    print(f"Missing={len(missing)}")
    print(f"PackageType={package_type}")
    print(f"ContractStatus={contract_status}")
    print(f"QueueProjectCode={queue_project_code}")
    print(f"QueueMode={queue_mode}")
    print(f"JavaScriptNodeChecks={node_check_count}")
    print(f"PythonCompileChecks={py_check_count}")
    print(f"StaticCheckFailures={check_failures}")
    print(f"DryRunReceiptStatus={receipt.get('status')}")
    print(f"ReportDir={report_dir}")

    return 0 if final_status == EXPECTED_PASS_STATUS else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
