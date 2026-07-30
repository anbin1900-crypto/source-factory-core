#!/usr/bin/env python3
"""Source Factory 023 one-flow terminal receipt store verifier and pusher."""
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

STATUS_PASS = "PASS_ONEFLOW_TERMINAL_RECEIPT_STORE_VERIFY_READY_FOR_024"
TASK_ID = "023_ONEFLOW_TERMINAL_RECEIPT_STORE_VERIFY"


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


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


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


def find_latest_report_dir(root: Path, prefix: str) -> Path:
    candidates = [p for p in (root / "reports").glob(prefix + "*") if p.is_dir()]
    if not candidates:
        raise FileNotFoundError(f"No report dir found for prefix: {prefix}")
    return sorted(candidates, key=lambda p: p.name)[-1]


def import_module_from_path(module_name: str, module_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module spec: {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--no-push", action="store_true")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not (root / ".git").exists():
        raise RuntimeError(f"Not a git repository root: {root}")

    print(f"[023-PY] Repository root: {root}")
    print("[023-PY] Git pull")
    run_git(root, ["pull"])

    timestamp = now_compact()
    report_dir = root / "reports" / f"oneflow_terminal_receipt_store_verify_{timestamp}"
    report_dir.mkdir(parents=True, exist_ok=True)

    latest_022_dir = find_latest_report_dir(root, "oneflow_local_claim_store_verify_")
    latest_022_decision_path = latest_022_dir / "ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_DECISION.json"
    latest_022_decision = load_json(latest_022_decision_path)
    latest_022_status = latest_022_decision.get("status")

    module_path = root / "src" / "queue" / "terminal_receipt_store.py"
    missing_required_files: List[str] = []
    for p in [latest_022_decision_path, module_path]:
        if not p.exists():
            missing_required_files.append(str(p.relative_to(root) if p.is_relative_to(root) else p))

    compile_status = "NOT_RUN"
    import_status = "NOT_RUN"
    required_field_status = "NOT_RUN"
    first_receipt_status = "NOT_RUN"
    second_receipt_status = "NOT_RUN"
    duplicate_policy_status = "NOT_RUN"
    receipt_count = 0
    missing_terminal_fields: List[str] = []

    if not missing_required_files:
        try:
            py_compile.compile(str(module_path), doraise=True)
            compile_status = "PASS_PY_COMPILE"
        except Exception as exc:
            compile_status = f"FAIL_PY_COMPILE: {exc}"

        if compile_status == "PASS_PY_COMPILE":
            module = import_module_from_path("source_factory_terminal_receipt_store", module_path)
            import_status = "PASS_IMPORT_TERMINAL_RECEIPT_STORE"
            receipt = {
                "schema_version": "SOURCE_FACTORY_TERMINAL_WORKER_RECEIPT_V1",
                "status": "PASS_DRY_RUN_TERMINAL_RECEIPT",
                "worker_id": "SOURCE_FACTORY_DRY_RUN_WORKER_001",
                "task_id": "PORTAL_PHASE_1_OPINET_DATA_REPROCESSING",
                "assignment_id": "DRYRUN-c0f6a24baf539e56",
                "claim_key": "CLAIM-DRYRUN-47abd7a72fec3a0b0676",
                "queue_id": "GAS_STATION_PORTAL_016_PIPELINE_SMOKE_QUEUE_EXAMPLE",
                "project_code": "GAS_STATION_PORTAL",
                "outputs": [],
                "verification": {"dry_run_only": True, "source_factory_terminal_store_check": "PASS"},
                "blockers": [],
                "forbidden_effect_counters": {
                    "prompt_send_count": 0,
                    "browser_launch_count": 0,
                    "pc_agent_service_start_count": 0,
                    "external_api_call_count": 0,
                    "middleware_transmission_count": 0,
                    "production_deploy_count": 0,
                },
                "created_at": now_iso(),
            }
            valid, missing_terminal_fields = module.validate_terminal_receipt(receipt)
            required_field_status = "PASS_TERMINAL_REQUIRED_FIELDS" if valid else "FAIL_TERMINAL_REQUIRED_FIELDS"
            store = module.TerminalReceiptStore(report_dir / "TERMINAL_RECEIPT_STORE_FIXTURE.json")
            first = store.save_terminal_receipt(receipt)
            second = store.save_terminal_receipt(receipt)
            first_receipt_status = first.get("status")
            second_receipt_status = second.get("status")
            receipt_count = len(store.list_receipts())
            duplicate_policy_status = "PASS_DUPLICATE_TERMINAL_RECEIPT_REJECTED" if first_receipt_status == "ACCEPTED_TERMINAL_RECEIPT" and second_receipt_status == "REJECTED_DUPLICATE_TERMINAL_RECEIPT" and receipt_count == 1 else "FAIL_TERMINAL_RECEIPT_DUPLICATE_POLICY"
            write_json(report_dir / "ONEFLOW_TERMINAL_RECEIPT_STORE_SIMULATION.json", {
                "schema_version": "SOURCE_FACTORY_TERMINAL_RECEIPT_STORE_VERIFY_SIMULATION_V1",
                "required_field_status": required_field_status,
                "missing_terminal_fields": missing_terminal_fields,
                "first_receipt_result": first,
                "second_receipt_result": second,
                "receipt_count": receipt_count,
                "duplicate_policy_status": duplicate_policy_status,
            })

    file_rows = []
    for p in [latest_022_decision_path, module_path]:
        exists = p.exists()
        file_rows.append({
            "path": str(p.relative_to(root)) if exists else str(p),
            "exists": exists,
            "sha256": sha256_file(p) if exists else "",
            "size_bytes": p.stat().st_size if exists else 0,
        })

    status = STATUS_PASS if (
        latest_022_status == "PASS_ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_READY_FOR_023"
        and not missing_required_files
        and compile_status == "PASS_PY_COMPILE"
        and import_status == "PASS_IMPORT_TERMINAL_RECEIPT_STORE"
        and required_field_status == "PASS_TERMINAL_REQUIRED_FIELDS"
        and duplicate_policy_status == "PASS_DUPLICATE_TERMINAL_RECEIPT_REJECTED"
    ) else "FAIL_ONEFLOW_TERMINAL_RECEIPT_STORE_VERIFY"

    decision = {
        "worker_id": "SOURCE_FACTORY_023_ONEFLOW_TERMINAL_RECEIPT_STORE_VERIFY_WORKER",
        "task_id": TASK_ID,
        "status": status,
        "generated_at": now_iso(),
        "repository_root": str(root),
        "latest_022_status": latest_022_status,
        "terminal_receipt_store_module": str(module_path.relative_to(root)),
        "compile_status": compile_status,
        "import_status": import_status,
        "required_field_status": required_field_status,
        "missing_terminal_fields": missing_terminal_fields,
        "first_receipt_status": first_receipt_status,
        "second_receipt_status": second_receipt_status,
        "receipt_count": receipt_count,
        "duplicate_policy_status": duplicate_policy_status,
        "missing_required_files": missing_required_files,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
        "report_dir": str(report_dir.relative_to(root)),
    }
    write_json(report_dir / "ONEFLOW_TERMINAL_RECEIPT_STORE_VERIFY_DECISION.json", decision)
    write_csv(report_dir / "ONEFLOW_TERMINAL_RECEIPT_STORE_FILE_LEDGER.csv", file_rows)

    summary = f"""# Source Factory One-flow Terminal Receipt Store Verify

generated_at: {decision['generated_at']}
repository_root: {root}

## Summary

| Item | Count / Status |
|---|---:|
| Latest 022 status | {latest_022_status} |
| Missing required files | {len(missing_required_files)} |
| Terminal receipt store compile status | {compile_status} |
| Terminal receipt store import status | {import_status} |
| Required field status | {required_field_status} |
| Missing terminal fields | {len(missing_terminal_fields)} |
| First terminal receipt save | {first_receipt_status} |
| Second terminal receipt save | {second_receipt_status} |
| Stored receipt count | {receipt_count} |
| Duplicate policy status | {duplicate_policy_status} |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

{status}

## Policy

- This stage validates a stable local terminal receipt store module.
- It does not reserve or mutate a remote queue item.
- It does not send prompts, launch browsers, start PC Agent, call external APIs, transmit middleware data, or deploy production.
- 024 may proceed only when status is {STATUS_PASS}.
"""
    (report_dir / "ONEFLOW_TERMINAL_RECEIPT_STORE_VERIFY_SUMMARY.md").write_text(summary, encoding="utf-8")
    (report_dir / "WORKER_REPORT_023.md").write_text(summary, encoding="utf-8")

    print("SOURCE_FACTORY_ONEFLOW_TERMINAL_RECEIPT_STORE_VERIFY_COMPLETE")
    print(f"Status={status}")
    print(f"Latest022Status={latest_022_status}")
    print(f"CompileStatus={compile_status}")
    print(f"ImportStatus={import_status}")
    print(f"RequiredFieldStatus={required_field_status}")
    print(f"FirstReceiptStatus={first_receipt_status}")
    print(f"SecondReceiptStatus={second_receipt_status}")
    print(f"DuplicatePolicyStatus={duplicate_policy_status}")
    print(f"MissingRequiredFiles={len(missing_required_files)}")
    print(f"ReportDir={report_dir}")

    if status != STATUS_PASS:
        return 1

    if not args.no_push:
        print("[023-PY] Git add reports")
        run_git(root, ["add", str(report_dir.relative_to(root))])
        porcelain = run_git(root, ["status", "--porcelain", "--", str(report_dir.relative_to(root))], check=False).stdout.strip()
        if porcelain:
            print("[023-PY] Git commit")
            run_git(root, ["commit", "-m", "add oneflow terminal receipt store verify result"])
            print("[023-PY] Git push")
            run_git(root, ["push"])
        else:
            print("[023-PY] No report changes to commit")

    print("SOURCE_FACTORY_ONEFLOW_TERMINAL_RECEIPT_STORE_VERIFY_AND_PUSH_COMPLETE")
    print("Status=PASS_TERMINAL_RECEIPT_STORE_VERIFY_AND_PUSH_DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
