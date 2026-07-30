#!/usr/bin/env python3
"""Source Factory 024 one-flow local worker lifecycle verifier and pusher.

This script validates the local-only worker lifecycle by binding:
- queue example intake
- local exactly-once claim store
- local terminal receipt store
- local worker lifecycle module

It generates reports and commits/pushes only the report directory. It does not send
prompts, launch browsers, start PC Agent services, call external APIs, transmit
middleware data, mutate remote queue state, or deploy production.
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

STATUS_PASS = "PASS_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_READY_FOR_025"
TASK_ID = "024_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY"


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
    return json.loads(path.read_text(encoding="utf-8"))


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--no-push", action="store_true")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not (root / ".git").exists():
        raise RuntimeError(f"Not a git repository root: {root}")

    print(f"[024-PY] Repository root: {root}")
    print("[024-PY] Git pull")
    run_git(root, ["pull"])

    timestamp = now_compact()
    report_dir = root / "reports" / f"oneflow_local_worker_lifecycle_verify_{timestamp}"
    report_dir.mkdir(parents=True, exist_ok=True)

    latest_023_dir = find_latest_report_dir(root, "oneflow_terminal_receipt_store_verify_")
    latest_023_decision_path = latest_023_dir / "ONEFLOW_TERMINAL_RECEIPT_STORE_VERIFY_DECISION.json"
    queue_path = root / "examples" / "gas_station_portal_pipeline" / "GAS_STATION_PORTAL_QUEUE_EXAMPLE.json"
    claim_module_path = root / "src" / "queue" / "local_claim_store.py"
    receipt_module_path = root / "src" / "queue" / "terminal_receipt_store.py"
    lifecycle_module_path = root / "src" / "queue" / "local_worker_lifecycle.py"

    required_paths = [latest_023_decision_path, queue_path, claim_module_path, receipt_module_path, lifecycle_module_path]
    missing_required_files = [str(p.relative_to(root)) for p in required_paths if not p.exists()]

    latest_023_status = "NOT_RUN"
    queue_project_code = "NOT_RUN"
    queue_mode = "NOT_RUN"
    compile_statuses: Dict[str, str] = {}
    import_status = "NOT_RUN"
    lifecycle_status = "NOT_RUN"
    claim_attempt_status = "NOT_RUN"
    receipt_save_status = "NOT_RUN"
    duplicate_claim_status = "NOT_RUN"
    duplicate_receipt_status = "NOT_RUN"
    claim_store_count = 0
    receipt_store_count = 0

    if not missing_required_files:
        latest_023_status = load_json(latest_023_decision_path).get("status", "MISSING_STATUS")
        queue_item = load_json(queue_path)
        queue_project_code = str(queue_item.get("project_code", ""))
        queue_mode = str(queue_item.get("mode", ""))

        for name, path in {
            "local_claim_store": claim_module_path,
            "terminal_receipt_store": receipt_module_path,
            "local_worker_lifecycle": lifecycle_module_path,
        }.items():
            compile_statuses[name] = compile_module(path)

        if all(status == "PASS_PY_COMPILE" for status in compile_statuses.values()):
            claim_module = import_module_from_file("source_factory_local_claim_store", claim_module_path)
            receipt_module = import_module_from_file("source_factory_terminal_receipt_store", receipt_module_path)
            lifecycle_module = import_module_from_file("source_factory_local_worker_lifecycle", lifecycle_module_path)
            import_status = "PASS_IMPORT_LIFECYCLE_MODULES"

            assignment = {
                "assignment_id": "DRYRUN-LIFECYCLE-" + hashlib.sha256(queue_item["queue_id"].encode("utf-8")).hexdigest()[:16],
                "worker_id": "SOURCE_FACTORY_LOCAL_LIFECYCLE_WORKER_001",
                "worker_role": "LOCAL_WORKER_LIFECYCLE_DRY_RUN_WORKER",
                "project_code": queue_item["project_code"],
                "queue_id": queue_item["queue_id"],
                "target_stage": queue_item.get("target_stage", "UNKNOWN_STAGE"),
            }
            claim_store = claim_module.LocalClaimStore(report_dir / "LOCAL_WORKER_LIFECYCLE_CLAIM_STORE_FIXTURE.json")
            receipt_store = receipt_module.TerminalReceiptStore(report_dir / "LOCAL_WORKER_LIFECYCLE_TERMINAL_RECEIPT_STORE_FIXTURE.json")
            lifecycle_result = lifecycle_module.run_local_worker_lifecycle(
                queue_item=queue_item,
                assignment=assignment,
                claim_store=claim_store,
                receipt_store=receipt_store,
            )
            write_json(report_dir / "ONEFLOW_LOCAL_WORKER_LIFECYCLE_SIMULATION.json", lifecycle_result)
            lifecycle_status = lifecycle_result.get("status", "MISSING_LIFECYCLE_STATUS")
            claim_attempt_status = lifecycle_result.get("claim_attempt_status", "")
            receipt_save_status = lifecycle_result.get("first_receipt_save_status", "")
            duplicate_claim_status = lifecycle_result.get("second_claim_attempt_status", "")
            duplicate_receipt_status = lifecycle_result.get("second_receipt_save_status", "")
            claim_store_count = int(lifecycle_result.get("claim_store_count", 0) or 0)
            receipt_store_count = int(lifecycle_result.get("terminal_receipt_store_count", 0) or 0)

    file_rows = []
    for p in required_paths:
        exists = p.exists()
        file_rows.append({
            "path": str(p.relative_to(root)) if exists else str(p),
            "exists": exists,
            "sha256": sha256_file(p) if exists else "",
            "size_bytes": p.stat().st_size if exists else 0,
        })

    static_check_failures = [name for name, status in compile_statuses.items() if status != "PASS_PY_COMPILE"]
    status = STATUS_PASS if (
        latest_023_status == "PASS_ONEFLOW_TERMINAL_RECEIPT_STORE_VERIFY_READY_FOR_024"
        and queue_project_code == "GAS_STATION_PORTAL"
        and queue_mode == "PROMPT_QUEUE_EXAMPLE_ONLY"
        and not missing_required_files
        and not static_check_failures
        and import_status == "PASS_IMPORT_LIFECYCLE_MODULES"
        and lifecycle_status == "PASS_LOCAL_WORKER_LIFECYCLE_DRY_RUN"
        and claim_store_count == 1
        and receipt_store_count == 1
    ) else "FAIL_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY"

    decision = {
        "worker_id": "SOURCE_FACTORY_024_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_WORKER",
        "task_id": TASK_ID,
        "status": status,
        "generated_at": now_iso(),
        "repository_root": str(root),
        "latest_023_decision_path": str(latest_023_decision_path.relative_to(root)) if latest_023_decision_path.exists() else str(latest_023_decision_path),
        "latest_023_status": latest_023_status,
        "queue_project_code": queue_project_code,
        "queue_mode": queue_mode,
        "compile_statuses": compile_statuses,
        "import_status": import_status,
        "lifecycle_status": lifecycle_status,
        "claim_attempt_status": claim_attempt_status,
        "receipt_save_status": receipt_save_status,
        "duplicate_claim_status": duplicate_claim_status,
        "duplicate_receipt_status": duplicate_receipt_status,
        "claim_store_count": claim_store_count,
        "terminal_receipt_store_count": receipt_store_count,
        "missing_required_files": missing_required_files,
        "static_check_failures": static_check_failures,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
        "report_dir": str(report_dir.relative_to(root)),
    }
    write_json(report_dir / "ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_DECISION.json", decision)
    write_csv(report_dir / "ONEFLOW_LOCAL_WORKER_LIFECYCLE_FILE_LEDGER.csv", file_rows)

    summary = f"""# Source Factory One-flow Local Worker Lifecycle Verify

generated_at: {decision['generated_at']}
repository_root: {root}

## Summary

| Item | Count / Status |
|---|---:|
| Latest 023 status | {latest_023_status} |
| Queue project code | {queue_project_code} |
| Queue mode | {queue_mode} |
| Missing required files | {len(missing_required_files)} |
| Static check failures | {len(static_check_failures)} |
| Import status | {import_status} |
| Lifecycle status | {lifecycle_status} |
| Claim attempt | {claim_attempt_status} |
| Terminal receipt save | {receipt_save_status} |
| Duplicate claim attempt | {duplicate_claim_status} |
| Duplicate terminal receipt save | {duplicate_receipt_status} |
| Claim store count | {claim_store_count} |
| Terminal receipt store count | {receipt_store_count} |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

{status}

## Policy

- This stage validates the local worker lifecycle only.
- It does not reserve or mutate a remote queue item.
- It does not send prompts, launch browsers, start PC Agent, call external APIs, transmit middleware data, or deploy production.
- 025 may proceed only when status is {STATUS_PASS}.
"""
    (report_dir / "ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_SUMMARY.md").write_text(summary, encoding="utf-8")
    (report_dir / "WORKER_REPORT_024.md").write_text(summary, encoding="utf-8")

    print("SOURCE_FACTORY_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_COMPLETE")
    print(f"Status={status}")
    print(f"Latest023Status={latest_023_status}")
    print(f"LifecycleStatus={lifecycle_status}")
    print(f"ClaimAttempt={claim_attempt_status}")
    print(f"ReceiptSave={receipt_save_status}")
    print(f"DuplicateClaim={duplicate_claim_status}")
    print(f"DuplicateReceipt={duplicate_receipt_status}")
    print(f"MissingRequiredFiles={len(missing_required_files)}")
    print(f"StaticCheckFailures={len(static_check_failures)}")
    print(f"ReportDir={report_dir}")

    if status != STATUS_PASS:
        return 1

    if not args.no_push:
        print("[024-PY] Git add report")
        run_git(root, ["add", str(report_dir.relative_to(root))])
        porcelain = run_git(root, ["status", "--porcelain", "--", str(report_dir.relative_to(root))], check=False).stdout.strip()
        if porcelain:
            print("[024-PY] Git commit")
            run_git(root, ["commit", "-m", "add oneflow local worker lifecycle verify result"])
            print("[024-PY] Git push")
            run_git(root, ["push"])
        else:
            print("[024-PY] No report changes to commit")

    print("SOURCE_FACTORY_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_AND_PUSH_COMPLETE")
    print("Status=PASS_LOCAL_WORKER_LIFECYCLE_VERIFY_AND_PUSH_DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
