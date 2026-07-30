#!/usr/bin/env python3
"""Source Factory 022 one-flow local claim store verifier and pusher.

This script intentionally replaces PowerShell wrappers for this gate. It performs:
- git pull
- latest 021B PASS intake
- local claim store import/static validation
- first-claim accept and duplicate-claim reject validation
- report generation
- git add/commit/push for reports only

Forbidden effects remain zero: no GPT call, browser launch, PC Agent service,
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

STATUS_PASS = "PASS_ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_READY_FOR_023"
TASK_ID = "022_ONEFLOW_LOCAL_CLAIM_STORE_VERIFY"


def now_kst_compact() -> str:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y%m%d_%H%M%S")
    except Exception:
        return datetime.now().strftime("%Y%m%d_%H%M%S")


def now_kst_iso() -> str:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Seoul")).replace(microsecond=0).isoformat()
    except Exception:
        return datetime.now().replace(microsecond=0).isoformat()


def run_git(root: Path, args: List[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(["git", *args], cwd=str(root), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed:\n{result.stdout}")
    if result.stdout.strip():
        print(result.stdout.strip())
    return result


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


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
        raise FileNotFoundError(f"No report dir found for prefix: {prefix}")
    return sorted(candidates, key=lambda p: p.name)[-1]


def import_claim_store_module(module_path: Path):
    module_name = "source_factory_local_claim_store"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module spec: {module_path}")
    module = importlib.util.module_from_spec(spec)
    # Required for Python 3.13 dataclass processing when dynamically importing.
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)  # type: ignore[union-attr]
    except Exception:
        sys.modules.pop(module_name, None)
        raise
    return module


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--no-push", action="store_true")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not (root / ".git").exists():
        raise RuntimeError(f"Not a git repository root: {root}")

    print(f"[022-PY] Repository root: {root}")
    print("[022-PY] Git pull")
    run_git(root, ["pull"])

    timestamp = now_kst_compact()
    report_dir = root / "reports" / f"oneflow_local_claim_store_verify_{timestamp}"
    report_dir.mkdir(parents=True, exist_ok=True)

    latest_021b_dir = find_latest_report_dir(root, "oneflow_local_exactly_once_simulator_v2_")
    latest_021b_decision_path = latest_021b_dir / "ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_DECISION_V2.json"
    latest_021b_decision = load_json(latest_021b_decision_path)
    latest_021b_status = latest_021b_decision.get("status")

    module_path = root / "src" / "queue" / "local_claim_store.py"
    missing_required_files: List[str] = []
    for path in [latest_021b_decision_path, module_path]:
        if not path.exists():
            missing_required_files.append(str(path.relative_to(root)))

    compile_status = "NOT_RUN"
    import_status = "NOT_RUN"
    first_attempt_status = "NOT_RUN"
    second_attempt_status = "NOT_RUN"
    store_claim_count = 0
    duplicate_policy_status = "NOT_RUN"

    if not missing_required_files:
        try:
            py_compile.compile(str(module_path), doraise=True)
            compile_status = "PASS_PY_COMPILE"
        except Exception as exc:
            compile_status = f"FAIL_PY_COMPILE: {exc}"

        if compile_status == "PASS_PY_COMPILE":
            module = import_claim_store_module(module_path)
            import_status = "PASS_IMPORT_LOCAL_CLAIM_STORE"
            store_path = report_dir / "LOCAL_CLAIM_STORE_FIXTURE.json"
            store = module.LocalClaimStore(store_path)

            queue_id = "GAS_STATION_PORTAL_016_PIPELINE_SMOKE_QUEUE_EXAMPLE"
            assignment_id = "DRYRUN-c0f6a24baf539e56"
            worker_id = "SOURCE_FACTORY_DRY_RUN_WORKER_001"

            first = store.try_claim(queue_id=queue_id, assignment_id=assignment_id, worker_id=worker_id)
            second = store.try_claim(queue_id=queue_id, assignment_id=assignment_id, worker_id=worker_id)
            first_attempt_status = first.status
            second_attempt_status = second.status
            store_claim_count = len(store.list_claims())
            duplicate_policy_status = "PASS_DUPLICATE_REJECTED" if first.status == "ACCEPTED_FIRST_CLAIM" and second.status == "REJECTED_DUPLICATE_CLAIM" and store_claim_count == 1 else "FAIL_DUPLICATE_POLICY"

            simulation = {
                "schema_version": "SOURCE_FACTORY_LOCAL_CLAIM_STORE_VERIFY_SIMULATION_V1",
                "status": duplicate_policy_status,
                "first_attempt": getattr(first, "__dict__", str(first)),
                "second_attempt": getattr(second, "__dict__", str(second)),
                "store_claim_count": store_claim_count,
            }
            write_json(report_dir / "ONEFLOW_LOCAL_CLAIM_STORE_SIMULATION.json", simulation)

    file_rows = []
    for p in [latest_021b_decision_path, module_path]:
        exists = p.exists()
        file_rows.append({
            "path": str(p.relative_to(root)) if exists else str(p),
            "exists": exists,
            "sha256": sha256_file(p) if exists else "",
            "size_bytes": p.stat().st_size if exists else 0,
        })

    status = STATUS_PASS if (
        latest_021b_status == "PASS_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_READY_FOR_022"
        and not missing_required_files
        and compile_status == "PASS_PY_COMPILE"
        and import_status == "PASS_IMPORT_LOCAL_CLAIM_STORE"
        and duplicate_policy_status == "PASS_DUPLICATE_REJECTED"
    ) else "FAIL_ONEFLOW_LOCAL_CLAIM_STORE_VERIFY"

    decision = {
        "worker_id": "SOURCE_FACTORY_022_ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_WORKER",
        "task_id": TASK_ID,
        "status": status,
        "generated_at": now_kst_iso(),
        "repository_root": str(root),
        "latest_021b_decision_path": str(latest_021b_decision_path.relative_to(root)),
        "latest_021b_status": latest_021b_status,
        "local_claim_store_module": str(module_path.relative_to(root)),
        "compile_status": compile_status,
        "import_status": import_status,
        "first_claim_attempt": first_attempt_status,
        "second_claim_attempt": second_attempt_status,
        "store_claim_count": store_claim_count,
        "duplicate_policy_status": duplicate_policy_status,
        "missing_required_files": missing_required_files,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
        "report_dir": str(report_dir.relative_to(root)),
    }

    write_json(report_dir / "ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_DECISION.json", decision)
    write_csv(report_dir / "ONEFLOW_LOCAL_CLAIM_STORE_FILE_LEDGER.csv", file_rows)

    summary = f"""# Source Factory One-flow Local Claim Store Verify

generated_at: {decision['generated_at']}
repository_root: {root}

## Summary

| Item | Count / Status |
|---|---:|
| Latest 021B status | {latest_021b_status} |
| Missing required files | {len(missing_required_files)} |
| Local claim store compile status | {compile_status} |
| Local claim store import status | {import_status} |
| First claim attempt | {first_attempt_status} |
| Second claim attempt | {second_attempt_status} |
| Store claim count | {store_claim_count} |
| Duplicate policy status | {duplicate_policy_status} |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

{status}

## Policy

- This stage validates a stable local exactly-once claim store module.
- It does not reserve or mutate a remote queue item.
- It does not send prompts, launch browsers, start PC Agent, call external APIs, transmit middleware data, or deploy production.
- 023 may proceed only when status is {STATUS_PASS}.
"""
    (report_dir / "ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_SUMMARY.md").write_text(summary, encoding="utf-8")
    (report_dir / "WORKER_REPORT_022.md").write_text(summary, encoding="utf-8")

    print("SOURCE_FACTORY_ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_COMPLETE")
    print(f"Status={status}")
    print(f"Latest021BStatus={latest_021b_status}")
    print(f"CompileStatus={compile_status}")
    print(f"ImportStatus={import_status}")
    print(f"FirstClaimAttempt={first_attempt_status}")
    print(f"SecondClaimAttempt={second_attempt_status}")
    print(f"DuplicatePolicyStatus={duplicate_policy_status}")
    print(f"MissingRequiredFiles={len(missing_required_files)}")
    print(f"ReportDir={report_dir}")

    if status != STATUS_PASS:
        return 1

    if not args.no_push:
        print("[022-PY] Git add reports")
        run_git(root, ["add", str(report_dir.relative_to(root))])
        porcelain = run_git(root, ["status", "--porcelain", "--", str(report_dir.relative_to(root))], check=False).stdout.strip()
        if porcelain:
            print("[022-PY] Git commit")
            run_git(root, ["commit", "-m", "add oneflow local claim store verify result"])
            print("[022-PY] Git push")
            run_git(root, ["push"])
        else:
            print("[022-PY] No report changes to commit")

    print("SOURCE_FACTORY_ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_AND_PUSH_COMPLETE")
    print("Status=PASS_LOCAL_CLAIM_STORE_VERIFY_AND_PUSH_DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())