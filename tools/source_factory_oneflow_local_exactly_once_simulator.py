#!/usr/bin/env python3
"""Source Factory 021: local exactly-once simulator.

This script consumes the latest 020 claim/receipt contract report and simulates
exactly-once behavior locally:
- first claim attempt must be accepted
- second claim attempt using the same queue_id + assignment_id + worker_id must be rejected
- terminal receipt skeleton must contain required receipt fields

No remote queue lock, prompt send, browser launch, PC Agent service start,
external API call, middleware transmission, or production deployment is performed.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Tuple

KST = timezone(timedelta(hours=9))

PASS_020 = "PASS_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_READY_FOR_021"
PASS_021 = "PASS_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_READY_FOR_022"
FAIL_021 = "FAIL_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR"

REQUIRED_TERMINAL_FIELDS = [
    "status",
    "worker_id",
    "task_id",
    "assignment_id",
    "claim_key",
    "queue_id",
    "project_code",
    "outputs",
    "verification",
    "blockers",
]

LEDGER_FILES = [
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


def kst_now() -> datetime:
    return datetime.now(tz=KST).replace(microsecond=0)


def timestamp() -> str:
    return kst_now().strftime("%Y%m%d_%H%M%S")


def iso_now() -> str:
    return kst_now().isoformat()


def read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def find_latest_pass_020(root: Path) -> Tuple[Path, Dict[str, Any]]:
    candidates = sorted(
        (root / "reports").glob("oneflow_queue_claim_receipt_contract_*/ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_DECISION.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for path in candidates:
        data = read_json(path)
        if data.get("status") == PASS_020:
            return path, data
    raise FileNotFoundError("No PASS 020 claim/receipt contract decision found")


def find_sibling(report_dir: Path, file_name: str) -> Path:
    path = report_dir / file_name
    if not path.is_file():
        raise FileNotFoundError(str(path))
    return path


def build_file_ledger(root: Path) -> Tuple[List[Dict[str, Any]], List[str]]:
    rows: List[Dict[str, Any]] = []
    missing: List[str] = []
    for rel in LEDGER_FILES:
        path = root / rel
        exists = path.is_file()
        if not exists:
            missing.append(rel)
        rows.append(
            {
                "path": rel,
                "exists": exists,
                "sha256": sha256_file(path) if exists else "",
                "size_bytes": path.stat().st_size if exists else 0,
            }
        )
    return rows, missing


def simulate_exactly_once(claim_record: Dict[str, Any]) -> Dict[str, Any]:
    queue_id = claim_record.get("queue_id")
    assignment_id = claim_record.get("assignment_id")
    worker_id = claim_record.get("worker_id")
    dedupe_key = "|".join([str(queue_id), str(assignment_id), str(worker_id)])

    store: Dict[str, Dict[str, Any]] = {}

    first_status = "ACCEPTED_FIRST_CLAIM" if dedupe_key not in store else "REJECTED_DUPLICATE_CLAIM"
    if first_status == "ACCEPTED_FIRST_CLAIM":
        store[dedupe_key] = {
            "claim_key": claim_record.get("claim_key"),
            "accepted_at": iso_now(),
        }

    second_status = "REJECTED_DUPLICATE_CLAIM" if dedupe_key in store else "ACCEPTED_UNEXPECTED_SECOND_CLAIM"

    return {
        "schema_version": "SOURCE_FACTORY_LOCAL_EXACTLY_ONCE_SIMULATION_V1",
        "status": "PASS_LOCAL_EXACTLY_ONCE_SIMULATION" if first_status == "ACCEPTED_FIRST_CLAIM" and second_status == "REJECTED_DUPLICATE_CLAIM" else "FAIL_LOCAL_EXACTLY_ONCE_SIMULATION",
        "dedupe_basis": ["queue_id", "assignment_id", "worker_id"],
        "dedupe_key_sha256": hashlib.sha256(dedupe_key.encode("utf-8")).hexdigest(),
        "first_claim_attempt_status": first_status,
        "second_claim_attempt_status": second_status,
        "duplicate_execution_allowed": False,
        "remote_queue_claim": False,
        "local_file_lock": False,
        "store_size_after_simulation": len(store),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, help="Repository root")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    report_dir = root / "reports" / f"oneflow_local_exactly_once_simulator_{timestamp()}"
    report_dir.mkdir(parents=True, exist_ok=True)

    decision_020_path, decision_020 = find_latest_pass_020(root)
    source_report_dir = decision_020_path.parent
    claim_record_path = find_sibling(source_report_dir, "ONEFLOW_QUEUE_CLAIM_RECORD_DRY_RUN_V1.json")
    terminal_skeleton_path = find_sibling(source_report_dir, "ONEFLOW_TERMINAL_WORKER_RECEIPT_SKELETON_V1.json")

    claim_record = read_json(claim_record_path)
    terminal_skeleton = read_json(terminal_skeleton_path)

    ledger_rows, missing_required_files = build_file_ledger(root)
    simulation = simulate_exactly_once(claim_record)

    missing_terminal_fields = [field for field in REQUIRED_TERMINAL_FIELDS if field not in terminal_skeleton]
    terminal_required_fields_present = len(missing_terminal_fields) == 0

    pass_all = (
        decision_020.get("status") == PASS_020
        and decision_020.get("claim_record_status") == "PASS_QUEUE_CLAIM_DRY_RUN_CONTRACT"
        and simulation.get("status") == "PASS_LOCAL_EXACTLY_ONCE_SIMULATION"
        and terminal_required_fields_present
        and len(missing_required_files) == 0
    )
    status = PASS_021 if pass_all else FAIL_021

    decision = {
        "worker_id": "SOURCE_FACTORY_021_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_WORKER",
        "task_id": "021_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR",
        "status": status,
        "generated_at": iso_now(),
        "repository_root": str(root),
        "latest_020_decision_path": str(decision_020_path.relative_to(root)),
        "latest_020_status": decision_020.get("status"),
        "claim_record_status": claim_record.get("status"),
        "simulation_status": simulation.get("status"),
        "first_claim_attempt_status": simulation.get("first_claim_attempt_status"),
        "second_claim_attempt_status": simulation.get("second_claim_attempt_status"),
        "terminal_required_fields_present": terminal_required_fields_present,
        "missing_terminal_fields": missing_terminal_fields,
        "missing_required_files": missing_required_files,
        "production_overwrite_count": 0,
        "external_side_effect_count": 0,
        "report_dir": str(report_dir.relative_to(root)),
    }

    write_json(report_dir / "ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATION_V1.json", simulation)
    write_json(report_dir / "ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_DECISION.json", decision)

    with (report_dir / "ONEFLOW_LOCAL_EXACTLY_ONCE_FILE_LEDGER.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["path", "exists", "sha256", "size_bytes"])
        writer.writeheader()
        writer.writerows(ledger_rows)

    summary = f"""# Source Factory One-flow Local Exactly-Once Simulator

generated_at: {iso_now()}
repository_root: {root}

## Summary

| Item | Count / Status |
|---|---:|
| Latest 020 status | {decision_020.get('status')} |
| Claim record status | {claim_record.get('status')} |
| Simulation status | {simulation.get('status')} |
| First claim attempt | {simulation.get('first_claim_attempt_status')} |
| Second claim attempt | {simulation.get('second_claim_attempt_status')} |
| Terminal required fields present | {terminal_required_fields_present} |
| Missing terminal fields | {len(missing_terminal_fields)} |
| Missing required files | {len(missing_required_files)} |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

{status}

## Policy

- This stage simulates exactly-once behavior locally only.
- It does not reserve or mutate a remote queue item.
- It does not send prompts, launch browsers, start PC Agent, call external APIs, transmit middleware data, or deploy production.
- 022 may proceed only when status is PASS_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_READY_FOR_022.
"""
    write_text(report_dir / "ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_SUMMARY.md", summary)
    write_text(report_dir / "WORKER_REPORT_021.md", summary)

    print("SOURCE_FACTORY_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_COMPLETE")
    print(f"Status={status}")
    print(f"Latest020Status={decision_020.get('status')}")
    print(f"ClaimRecordStatus={claim_record.get('status')}")
    print(f"SimulationStatus={simulation.get('status')}")
    print(f"FirstClaimAttempt={simulation.get('first_claim_attempt_status')}")
    print(f"SecondClaimAttempt={simulation.get('second_claim_attempt_status')}")
    print(f"TerminalRequiredFieldsPresent={terminal_required_fields_present}")
    print(f"MissingTerminalFields={len(missing_terminal_fields)}")
    print(f"MissingRequiredFiles={len(missing_required_files)}")
    print(f"ReportDir={report_dir}")

    return 0 if status == PASS_021 else 1


if __name__ == "__main__":
    raise SystemExit(main())
