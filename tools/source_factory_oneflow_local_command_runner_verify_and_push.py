#!/usr/bin/env python3
"""Source Factory 025 one-flow local command runner verifier and pusher.

This stage validates the smallest PC Agent execution unit:
- latest 024B lifecycle PASS intake
- local allowlisted command runner module compile/import
- one safe local command execution: Python version check
- stdout/stderr/exit_code capture
- terminal-style command receipt generation
- report generation and git add/commit/push for report directory only

Forbidden effects remain zero: no GPT call, browser launch, PC Agent service start,
external API call, middleware transmission, or production deployment.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import py_compile
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List

STATUS_PASS = "PASS_ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY_READY_FOR_026"
TASK_ID = "025_ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY"


def now_compact() -> str:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y%m%d_%H%M%S")
    except Exception:
        return datetime.now().strftime("%Y%m%d_%H%M%S")


def now_iso() -> str:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Seoul")).replace(microsecond=0).isoformat()
    except Exception:
        return datetime.now().replace(microsecond=0).isoformat()


def run_git(root: Path, args: List[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(["git", *args], cwd=str(root), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.stdout.strip():
        print(result.stdout.strip())
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed:\n{result.stdout}")
    return result


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv(path: Path, rows: Iterable[Dict[str, Any]]) -> None:
    rows = list(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        if not rows:
            f.write("path,exists,sha256,size_bytes\n")
            return
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def find_latest_report_dir(root: Path, prefix: str) -> Path:
    reports = root / "reports"
    candidates = [p for p in reports.glob(prefix + "*") if p.is_dir()]
    if not candidates:
        raise FileNotFoundError(f"No report directory found for prefix: {prefix}")
    return sorted(candidates, key=lambda p: p.name)[-1]


def import_module_from_file(module_name: str, module_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module spec: {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def compile_module(path: Path) -> str:
    try:
        py_compile.compile(str(path), doraise=True)
        return "PASS_PY_COMPILE"
    except Exception as exc:
        return f"FAIL_PY_COMPILE: {exc}"


def forbidden_counters_zero(counters: Dict[str, Any]) -> bool:
    return all(int(value or 0) == 0 for value in counters.values())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--no-push", action="store_true")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not (root / ".git").exists():
        raise RuntimeError(f"Not a git repository root: {root}")

    print(f"[025-PY] Repository root: {root}")
    print("[025-PY] Git pull")
    run_git(root, ["pull"])

    timestamp = now_compact()
    report_dir = root / "reports" / f"oneflow_local_command_runner_verify_{timestamp}"
    report_dir.mkdir(parents=True, exist_ok=True)

    latest_024b_dir = find_latest_report_dir(root, "oneflow_local_worker_lifecycle_verify_v2_")
    latest_024b_decision_path = latest_024b_dir / "ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_DECISION_V2.json"
    command_runner_path = root / "src" / "pc_agent" / "local_command_runner.py"

    required_paths = [latest_024b_decision_path, command_runner_path]
    missing_required_files = [str(p.relative_to(root)) for p in required_paths if not p.exists()]

    latest_024b_status = "NOT_RUN"
    compile_status = "NOT_RUN"
    import_status = "NOT_RUN"
    command_status = "NOT_RUN"
    command_exit_code = None
    stdout_capture_status = "NOT_RUN"
    stderr_capture_status = "NOT_RUN"
    forbidden_counter_status = "NOT_RUN"
    command_result_payload: Dict[str, Any] = {}

    if not missing_required_files:
        latest_024b_status = load_json(latest_024b_decision_path).get("status", "MISSING_STATUS")
        compile_status = compile_module(command_runner_path)
        if compile_status == "PASS_PY_COMPILE":
            module = import_module_from_file("source_factory_local_command_runner", command_runner_path)
            import_status = "PASS_IMPORT_LOCAL_COMMAND_RUNNER"
            runner = module.LocalCommandRunner(["LOCAL_PYTHON_VERSION_CHECK"])
            command_spec = module.build_python_version_command()
            command_result = runner.execute(command_spec)
            command_result_payload = module.command_result_to_dict(command_result)
            command_status = str(command_result_payload.get("status", ""))
            command_exit_code = command_result_payload.get("exit_code")
            stdout_capture_status = "PASS_STDOUT_CAPTURED" if isinstance(command_result_payload.get("stdout"), str) and len(command_result_payload.get("stdout", "")) > 0 else "FAIL_STDOUT_EMPTY"
            stderr_capture_status = "PASS_STDERR_CAPTURED_OR_EMPTY" if isinstance(command_result_payload.get("stderr"), str) else "FAIL_STDERR_NOT_STRING"
            forbidden_counter_status = "PASS_FORBIDDEN_COUNTERS_ZERO" if forbidden_counters_zero(command_result_payload.get("forbidden_effect_counters", {})) else "FAIL_FORBIDDEN_COUNTER_NONZERO"

            receipt = {
                "schema_version": "SOURCE_FACTORY_LOCAL_COMMAND_RUNNER_RECEIPT_V1",
                "status": "PASS_LOCAL_COMMAND_RUNNER_RECEIPT" if command_status == "PASS_LOCAL_COMMAND_EXECUTION" else "FAIL_LOCAL_COMMAND_RUNNER_RECEIPT",
                "generated_at": now_iso(),
                "latest_024b_status": latest_024b_status,
                "command_result": command_result_payload,
                "production_overwrite_count": 0,
                "external_side_effect_count": 0,
            }
            write_json(report_dir / "ONEFLOW_LOCAL_COMMAND_RUNNER_RECEIPT.json", receipt)

    file_rows = []
    for p in required_paths:
        exists = p.exists()
        file_rows.append({
            "path": str(p.relative_to(root)) if exists else str(p),
            "exists": exists,
            "sha256": sha256_file(p) if exists else "",
            "size_bytes": p.stat().st_size if exists else 0,
        })

    status = STATUS_PASS if (
        latest_024b_status == "PASS_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_READY_FOR_025"
        and not missing_required_files
        and compile_status == "PASS_PY_COMPILE"
        and import_status == "PASS_IMPORT_LOCAL_COMMAND_RUNNER"
        and command_status == "PASS_LOCAL_COMMAND_EXECUTION"
        and command_exit_code == 0
        and stdout_capture_status == "PASS_STDOUT_CAPTURED"
        and stderr_capture_status == "PASS_STDERR_CAPTURED_OR_EMPTY"
        and forbidden_counter_status == "PASS_FORBIDDEN_COUNTERS_ZERO"
    ) else "FAIL_ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY"

    decision = {
        "worker_id": "SOURCE_FACTORY_025_ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY_WORKER",
        "task_id": TASK_ID,
        "status": status,
        "generated_at": now_iso(),
        "repository_root": str(root),
        "latest_024b_decision_path": str(latest_024b_decision_path.relative_to(root)) if latest_024b_decision_path.exists() else str(latest_024b_decision_path),
        "latest_024b_status": latest_024b_status,
        "command_runner_module": str(command_runner_path.relative_to(root)),
        "compile_status": compile_status,
        "import_status": import_status,
        "command_status": command_status,
        "command_exit_code": command_exit_code,
        "stdout_capture_status": stdout_capture_status,
        "stderr_capture_status": stderr_capture_status,
        "forbidden_counter_status": forbidden_counter_status,
        "missing_required_files": missing_required_files,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
        "report_dir": str(report_dir.relative_to(root)),
    }
    write_json(report_dir / "ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY_DECISION.json", decision)
    write_csv(report_dir / "ONEFLOW_LOCAL_COMMAND_RUNNER_FILE_LEDGER.csv", file_rows)

    summary = f"""# Source Factory One-flow Local Command Runner Verify

generated_at: {decision['generated_at']}
repository_root: {root}

## Summary

| Item | Count / Status |
|---|---:|
| Latest 024B status | {latest_024b_status} |
| Missing required files | {len(missing_required_files)} |
| Local command runner compile status | {compile_status} |
| Local command runner import status | {import_status} |
| Command status | {command_status} |
| Command exit code | {command_exit_code} |
| Stdout capture status | {stdout_capture_status} |
| Stderr capture status | {stderr_capture_status} |
| Forbidden counter status | {forbidden_counter_status} |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

{status}

## Policy

- This stage validates a local allowlisted command runner receipt only.
- It runs only a Python version check with shell=False.
- It does not reserve or mutate a remote queue item.
- It does not send prompts, launch browsers, start PC Agent service, call external APIs, transmit middleware data, or deploy production.
- 026 may proceed only when status is {STATUS_PASS}.
"""
    (report_dir / "ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY_SUMMARY.md").write_text(summary, encoding="utf-8")
    (report_dir / "WORKER_REPORT_025.md").write_text(summary, encoding="utf-8")

    print("SOURCE_FACTORY_ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY_COMPLETE")
    print(f"Status={status}")
    print(f"Latest024BStatus={latest_024b_status}")
    print(f"CompileStatus={compile_status}")
    print(f"ImportStatus={import_status}")
    print(f"CommandStatus={command_status}")
    print(f"CommandExitCode={command_exit_code}")
    print(f"StdoutCaptureStatus={stdout_capture_status}")
    print(f"ForbiddenCounterStatus={forbidden_counter_status}")
    print(f"MissingRequiredFiles={len(missing_required_files)}")
    print(f"ReportDir={report_dir}")

    if status != STATUS_PASS:
        return 1

    if not args.no_push:
        print("[025-PY] Git add report")
        run_git(root, ["add", str(report_dir.relative_to(root))])
        porcelain = run_git(root, ["status", "--porcelain", "--", str(report_dir.relative_to(root))], check=False).stdout.strip()
        if porcelain:
            print("[025-PY] Git commit")
            run_git(root, ["commit", "-m", "add oneflow local command runner verify result"])
            print("[025-PY] Git push")
            run_git(root, ["push"])
        else:
            print("[025-PY] No report changes to commit")

    print("SOURCE_FACTORY_ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY_AND_PUSH_COMPLETE")
    print("Status=PASS_LOCAL_COMMAND_RUNNER_VERIFY_AND_PUSH_DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
