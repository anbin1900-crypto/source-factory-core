#!/usr/bin/env python3
"""Source Factory local exactly-once simulator V2.

V2 fixes 021 V1's strict filename assumption. 020 emits:
- ONEFLOW_QUEUE_CLAIM_RECORD_DRY_RUN.json
- ONEFLOW_TERMINAL_RECEIPT_SKELETON.json

This simulator validates local exactly-once semantics without mutating a remote queue,
without sending prompts, without launching browsers, and without starting PC Agent.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

KST = timezone(timedelta(hours=9))

EXPECTED_020_STATUS = "PASS_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_READY_FOR_021"
FINAL_STATUS = "PASS_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_READY_FOR_022"
FAIL_STATUS = "FAIL_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR"

REQUIRED_TERMINAL_FIELDS = ["status", "worker_id", "task_id", "outputs", "verification", "blockers"]


def now_kst() -> str:
    return datetime.now(KST).replace(microsecond=0).isoformat()


def read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def latest_report_dir(root: Path, pattern: str, decision_name: str, expected_status: str) -> Tuple[Path, Path, Dict[str, Any]]:
    candidates: List[Tuple[Path, Path, Dict[str, Any]]] = []
    reports_root = root / "reports"
    for report_dir in sorted(reports_root.glob(pattern)):
        decision_path = report_dir / decision_name
        if not decision_path.is_file():
            continue
        try:
            decision = read_json(decision_path)
        except Exception:
            continue
        if decision.get("status") == expected_status:
            candidates.append((report_dir, decision_path, decision))
    if not candidates:
        raise FileNotFoundError(f"No passing report found: {pattern}/{decision_name} status={expected_status}")
    return candidates[-1]


def find_required_file(report_dir: Path, exact_names: Iterable[str], glob_patterns: Iterable[str]) -> Path:
    for name in exact_names:
        p = report_dir / name
        if p.is_file():
            return p
    for pattern in glob_patterns:
        matches = sorted(report_dir.glob(pattern))
        if matches:
            return matches[-1]
    expected = list(exact_names) + list(glob_patterns)
    raise FileNotFoundError(f"Required sibling not found in {report_dir}: {expected}")


def make_file_ledger(root: Path, paths: List[Path], out_csv: Path) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["path", "exists", "sha256", "size_bytes"])
        writer.writeheader()
        for p in paths:
            exists = p.is_file()
            try:
                rel = p.relative_to(root).as_posix()
            except ValueError:
                rel = str(p)
            writer.writerow({
                "path": rel,
                "exists": exists,
                "sha256": sha256_file(p) if exists else "",
                "size_bytes": p.stat().st_size if exists else 0,
            })


def simulate_exactly_once(claim_record: Dict[str, Any]) -> Dict[str, Any]:
    queue_id = claim_record.get("queue_id")
    assignment_id = claim_record.get("assignment_id")
    worker_id = claim_record.get("worker_id")
    dedupe_key = "|".join([str(queue_id), str(assignment_id), str(worker_id)])

    local_store: Dict[str, Dict[str, Any]] = {}

    def attempt(order: int) -> Dict[str, Any]:
        if dedupe_key in local_store:
            return {
                "attempt_order": order,
                "dedupe_key": dedupe_key,
                "result": "REJECTED_DUPLICATE_CLAIM",
                "accepted": False,
                "reason": "dedupe_key_already_claimed",
            }
        local_store[dedupe_key] = {
            "claim_key": claim_record.get("claim_key"),
            "queue_id": queue_id,
            "assignment_id": assignment_id,
            "worker_id": worker_id,
            "claimed_at": now_kst(),
        }
        return {
            "attempt_order": order,
            "dedupe_key": dedupe_key,
            "result": "ACCEPTED_FIRST_CLAIM",
            "accepted": True,
            "reason": "dedupe_key_was_empty",
        }

    first = attempt(1)
    second = attempt(2)
    status = (
        "PASS_LOCAL_EXACTLY_ONCE_SIMULATION"
        if first["result"] == "ACCEPTED_FIRST_CLAIM" and second["result"] == "REJECTED_DUPLICATE_CLAIM"
        else "FAIL_LOCAL_EXACTLY_ONCE_SIMULATION"
    )
    return {
        "schema_version": "SOURCE_FACTORY_LOCAL_EXACTLY_ONCE_SIMULATION_V2",
        "status": status,
        "dedupe_basis": ["queue_id", "assignment_id", "worker_id"],
        "dedupe_key": dedupe_key,
        "attempts": [first, second],
        "local_store_size": len(local_store),
        "remote_queue_claim": False,
        "local_file_lock": False,
        "external_side_effect_count": 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="Repository root")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    timestamp = datetime.now(KST).strftime("%Y%m%d_%H%M%S")
    report_dir = root / "reports" / f"oneflow_local_exactly_once_simulator_v2_{timestamp}"
    report_dir.mkdir(parents=True, exist_ok=True)

    source_report_dir, decision_path, latest_020 = latest_report_dir(
        root,
        "oneflow_queue_claim_receipt_contract_*",
        "ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_DECISION.json",
        EXPECTED_020_STATUS,
    )

    claim_record_path = find_required_file(
        source_report_dir,
        exact_names=[
            "ONEFLOW_QUEUE_CLAIM_RECORD_DRY_RUN.json",
            "ONEFLOW_QUEUE_CLAIM_RECORD_DRY_RUN_V1.json",
        ],
        glob_patterns=["*CLAIM_RECORD*DRY_RUN*.json"],
    )
    terminal_receipt_path = find_required_file(
        source_report_dir,
        exact_names=[
            "ONEFLOW_TERMINAL_RECEIPT_SKELETON.json",
            "ONEFLOW_TERMINAL_RECEIPT_SKELETON_V1.json",
        ],
        glob_patterns=["*TERMINAL*RECEIPT*SKELETON*.json"],
    )

    claim_record = read_json(claim_record_path)
    terminal_receipt = read_json(terminal_receipt_path)

    missing_terminal_fields = [field for field in REQUIRED_TERMINAL_FIELDS if field not in terminal_receipt]
    terminal_required_fields_present = len(missing_terminal_fields) == 0

    simulation = simulate_exactly_once(claim_record)

    missing_required_files = [
        str(p) for p in [decision_path, claim_record_path, terminal_receipt_path] if not p.is_file()
    ]

    pass_status = (
        latest_020.get("status") == EXPECTED_020_STATUS
        and claim_record.get("status") == "PASS_QUEUE_CLAIM_DRY_RUN_CONTRACT"
        and terminal_required_fields_present
        and simulation.get("status") == "PASS_LOCAL_EXACTLY_ONCE_SIMULATION"
        and len(missing_required_files) == 0
    )
    status = FINAL_STATUS if pass_status else FAIL_STATUS

    simulation_path = report_dir / "ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATION_V2.json"
    decision_out = report_dir / "ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_DECISION_V2.json"
    summary_out = report_dir / "ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_SUMMARY_V2.md"
    worker_report = report_dir / "WORKER_REPORT_021B.md"
    ledger_out = report_dir / "ONEFLOW_LOCAL_EXACTLY_ONCE_FILE_LEDGER_V2.csv"

    write_json(simulation_path, simulation)

    decision = {
        "worker_id": "SOURCE_FACTORY_021B_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_WORKER",
        "task_id": "021B_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR",
        "status": status,
        "generated_at": now_kst(),
        "repository_root": str(root),
        "source_report_dir": str(source_report_dir.relative_to(root)),
        "latest_020_status": latest_020.get("status"),
        "claim_record_path": str(claim_record_path.relative_to(root)),
        "claim_record_status": claim_record.get("status"),
        "terminal_receipt_path": str(terminal_receipt_path.relative_to(root)),
        "terminal_required_fields_present": terminal_required_fields_present,
        "missing_terminal_fields": missing_terminal_fields,
        "simulation_status": simulation.get("status"),
        "first_claim_attempt": simulation["attempts"][0]["result"],
        "second_claim_attempt": simulation["attempts"][1]["result"],
        "missing_required_files": missing_required_files,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
        "report_dir": str(report_dir.relative_to(root)),
    }
    write_json(decision_out, decision)

    make_file_ledger(root, [decision_path, claim_record_path, terminal_receipt_path, simulation_path], ledger_out)

    summary = f"""# Source Factory One-flow Local Exactly-Once Simulator V2

generated_at: {decision['generated_at']}
repository_root: {root}

## Summary

| Item | Count / Status |
|---|---:|
| Latest 020 status | {decision['latest_020_status']} |
| Claim record status | {decision['claim_record_status']} |
| Terminal required fields present | {decision['terminal_required_fields_present']} |
| Missing terminal fields | {len(missing_terminal_fields)} |
| Simulation status | {decision['simulation_status']} |
| First claim attempt | {decision['first_claim_attempt']} |
| Second claim attempt | {decision['second_claim_attempt']} |
| Missing required files | {len(missing_required_files)} |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

{status}

## Policy

- This stage is a local exactly-once simulation only.
- It does not reserve or mutate a remote queue item.
- It does not send prompts, launch browsers, start PC Agent, call external APIs, transmit middleware data, or deploy production.
- 022 may proceed only when status is {FINAL_STATUS}.
"""
    write_text(summary_out, summary)
    write_text(worker_report, summary)

    print("SOURCE_FACTORY_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_V2_COMPLETE")
    print(f"Status={status}")
    print(f"Latest020Status={decision['latest_020_status']}")
    print(f"ClaimRecordStatus={decision['claim_record_status']}")
    print(f"SimulationStatus={decision['simulation_status']}")
    print(f"FirstClaimAttempt={decision['first_claim_attempt']}")
    print(f"SecondClaimAttempt={decision['second_claim_attempt']}")
    print(f"TerminalRequiredFieldsPresent={decision['terminal_required_fields_present']}")
    print(f"MissingTerminalFields={len(missing_terminal_fields)}")
    print(f"MissingRequiredFiles={len(missing_required_files)}")
    print(f"ReportDir={report_dir}")

    return 0 if status == FINAL_STATUS else 1


if __name__ == "__main__":
    raise SystemExit(main())
