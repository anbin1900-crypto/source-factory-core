#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


REQUIRED_FILES = {
    "contract": "PC_AGENT_RUNTIME_CONTRACT_V1.json",
    "supervisor": "pc_agent_runtime_supervisor.py",
    "worker": "pc_agent_bridge_worker.py",
    "installer": "Install-PcAgentRuntime.ps1",
    "manager": "Manage-PcAgentRuntime.ps1",
}


def validate(root: Path) -> dict[str, Any]:
    findings: list[dict[str, str]] = []
    paths = {name: root / relative for name, relative in REQUIRED_FILES.items()}
    for name, path in paths.items():
        if not path.is_file():
            findings.append({"code": "MISSING_FILE", "path": f"{name}:{path}"})
    if findings:
        return {
            "schema_version": "YOLLA_PC_AGENT_WINDOWS_RUNTIME_VALIDATION_V1",
            "accepted": False,
            "finding_count": len(findings),
            "findings": findings,
        }

    contract = json.loads(paths["contract"].read_text(encoding="utf-8"))
    supervisor = paths["supervisor"].read_text(encoding="utf-8")
    worker = paths["worker"].read_text(encoding="utf-8")
    installer = paths["installer"].read_text(encoding="utf-8")
    manager = paths["manager"].read_text(encoding="utf-8")

    if contract.get("schema_version") != "YOLLA_PC_AGENT_WINDOWS_RUNTIME_CONTRACT_V1":
        findings.append({"code": "CONTRACT_SCHEMA_INVALID", "path": "contract.schema_version"})
    if contract.get("runtime_id") != "YOLLA-PC-AGENT-RUNTIME-V1":
        findings.append({"code": "RUNTIME_ID_INVALID", "path": "contract.runtime_id"})
    if contract.get("terminal") != "A1_PC_AGENT_WINDOWS_RUNTIME_V1_PACKAGE_READY":
        findings.append({"code": "TERMINAL_INVALID", "path": "contract.terminal"})

    supervisor_markers = [
        "class SingleInstanceLock",
        "WORKER_HEARTBEAT_STALE",
        "WORKER_HEARTBEAT_START_TIMEOUT",
        "RESTART_BURST_LIMIT",
        "supervisor-heartbeat.json",
        "runtime-events.jsonl",
        "shutdown-",
        "worker_stop_request",
        "DUPLICATE_SUPERVISOR_INSTANCE",
        "PYTHONUTF8",
        "YOLLA_PRODUCTION",
    ]
    for marker in supervisor_markers:
        if marker not in supervisor:
            findings.append({"code": "SUPERVISOR_MARKER_MISSING", "path": marker})

    worker_markers = [
        "DUPLICATE_WORKER_INSTANCE",
        "SingletonFileLock",
        "recover_processing",
        "REQUEUED_FROM_PROCESSING",
        "heartbeat.json",
        "stop.request",
        "DUPLICATE_SUPPRESSION_RECEIPT",
        '"production": False',
    ]
    for marker in worker_markers:
        if marker not in worker:
            findings.append({"code": "WORKER_MARKER_MISSING", "path": marker})

    installer_markers = [
        "Register-ScheduledTask",
        "New-ScheduledTaskPrincipal",
        "UserId 'SYSTEM'",
        "New-ScheduledTaskTrigger -AtStartup",
        "current.json",
        ".staging-",
        "PC_AGENT_RUNTIME_PACKAGE_MANIFEST.json",
        "PC_AGENT_RUNTIME_INSTALL=PASS",
        "previous_version",
    ]
    for marker in installer_markers:
        if marker not in installer:
            findings.append({"code": "INSTALLER_MARKER_MISSING", "path": marker})

    manager_markers = [
        "ValidateSet('start','stop','restart','status','validate','logs','uninstall')",
        "Find-RuntimeProcesses",
        "Wait-RuntimeRunning",
        "Stop-Runtime",
        "PC_AGENT_RUNTIME_START=PASS",
        "PC_AGENT_RUNTIME_STOP=PASS",
        "PC_AGENT_RUNTIME_RESTART=PASS",
        "PC_AGENT_RUNTIME_VALIDATE=PASS",
        "PC_AGENT_RUNTIME_UNINSTALL=PASS",
        "PurgeState",
        "PurgeBridge",
    ]
    for marker in manager_markers:
        if marker not in manager:
            findings.append({"code": "MANAGER_MARKER_MISSING", "path": marker})

    commands = contract.get("management_commands", [])
    for command in ("install", "start", "stop", "restart", "status", "validate", "logs", "uninstall"):
        if command not in commands:
            findings.append({"code": "MANAGEMENT_COMMAND_MISSING", "path": command})

    acceptance = contract.get("acceptance", {})
    required_true = [
        "install_receipt",
        "scheduled_task_registered",
        "supervisor_heartbeat",
        "worker_heartbeat",
        "worker_restart_after_exit",
        "worker_restart_after_stale_heartbeat",
        "controlled_request_execution",
        "clean_stop",
        "status_json",
        "uninstall_state_preservation",
    ]
    for key in required_true:
        if acceptance.get(key) is not True:
            findings.append({"code": "ACCEPTANCE_TRUE_REQUIRED", "path": key})
    if acceptance.get("duplicate_execution_count") != 0:
        findings.append({"code": "DUPLICATE_EXECUTION_ZERO_REQUIRED", "path": "duplicate_execution_count"})
    if acceptance.get("orphan_process_count") != 0:
        findings.append({"code": "ORPHAN_PROCESS_ZERO_REQUIRED", "path": "orphan_process_count"})

    safety = contract.get("safety_boundary", {})
    for key in ("real_api_call_count", "postgresql_apply_count", "production_connection_count"):
        if safety.get(key) != 0:
            findings.append({"code": "SAFETY_ZERO_REQUIRED", "path": key})
    for key in ("production_credential_use", "production", "ready", "merge"):
        if safety.get(key) is not False:
            findings.append({"code": "SAFETY_FALSE_REQUIRED", "path": key})

    forbidden_patterns = {
        "supervisor": [
            r"requests\.(get|post|put|delete)",
            r"shell\s*=\s*True",
            r"YOLLA_PRODUCTION[\"']?\s*[:=]\s*[\"']?1",
        ],
        "worker": [
            r"requests\.(get|post|put|delete)",
            r"shell\s*=\s*True",
            r"production[\"']?\s*:\s*True",
        ],
        "installer": [r"ProductionCredential"],
    }
    sources = {"supervisor": supervisor, "worker": worker, "installer": installer}
    for source_name, patterns in forbidden_patterns.items():
        for pattern in patterns:
            if re.search(pattern, sources[source_name], re.I):
                findings.append({"code": "FORBIDDEN_PATTERN", "path": f"{source_name}:{pattern}"})

    return {
        "schema_version": "YOLLA_PC_AGENT_WINDOWS_RUNTIME_VALIDATION_V1",
        "accepted": not findings,
        "finding_count": len(findings),
        "findings": findings,
        "required_file_count": len(REQUIRED_FILES),
        "management_command_count": len(commands),
        "supervisor_watchdog": "BOUND",
        "scheduled_task_runtime": "BOUND",
        "versioned_release_model": "BOUND",
        "state_preserving_uninstall": "BOUND",
        "production": False,
        "ready": False,
        "merge": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-root", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()
    result = validate(Path(args.package_root).resolve())
    text = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
    print(text, end="")
    return 0 if result["accepted"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
