#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

REQUIRED_FILES = {
    "contract": "integrations/runtime_acceptance_v1/R11_ACTIVE_RUNTIME_ACCEPTANCE_CONTRACT_V1.json",
    "runner": "integrations/runtime_acceptance_v1/Invoke-R11ActiveRuntimeAcceptance.ps1",
    "runner_common": "integrations/runtime_acceptance_v1/R11RuntimeCommon.ps1",
    "runner_tests": "integrations/runtime_acceptance_v1/R11RuntimeTests.ps1",
    "live_test": "integrations/runtime_acceptance_v1/testLiveActiveCoreStage4HandlerBridgeV1.js",
    "ci_test": "integrations/runtime_acceptance_v1/test_r11_runtime_acceptance.py",
    "worker": "integrations/pc_agent_v1/pc_agent_bridge_worker.py",
    "adapter": "releases/SF_REUSABLE_CORE_20260801_175708/src/shared/stage4/pcAgentBridgeAdapter.js",
}


def validate(package_root: Path) -> dict[str, Any]:
    findings: list[dict[str, str]] = []
    paths = {name: package_root / rel for name, rel in REQUIRED_FILES.items()}
    for name, path in paths.items():
        if not path.is_file():
            findings.append({"code": "MISSING_FILE", "path": f"{name}:{path}"})
    if findings:
        return {
            "schema_version": "YOLLA_R11_RUNTIME_ACCEPTANCE_VALIDATION_V1",
            "accepted": False,
            "finding_count": len(findings),
            "findings": findings,
        }

    contract = json.loads(paths["contract"].read_text(encoding="utf-8"))
    runner = paths["runner"].read_text(encoding="utf-8")
    runner_common = paths["runner_common"].read_text(encoding="utf-8")
    runner_tests = paths["runner_tests"].read_text(encoding="utf-8")
    live_test = paths["live_test"].read_text(encoding="utf-8")
    ci_test = paths["ci_test"].read_text(encoding="utf-8")
    worker = paths["worker"].read_text(encoding="utf-8")
    adapter = paths["adapter"].read_text(encoding="utf-8")

    if contract.get("schema_version") != "YOLLA_A1_R11_ACTIVE_RUNTIME_ACCEPTANCE_CONTRACT_V1":
        findings.append({"code": "CONTRACT_SCHEMA_INVALID", "path": "contract.schema_version"})
    if contract.get("directive_id") != "A1-SF-PCAGENT-R11-ACTIVE-RUNTIME-BOOT-RESTART-RECOVERY-V1-20260802-001":
        findings.append({"code": "DIRECTIVE_ID_INVALID", "path": "contract.directive_id"})

    required_acceptance = contract.get("required_acceptance", {})
    required_true = [
        "cold_boot",
        "exactly_one_pc_agent_worker",
        "electron_runtime_present",
        "live_active_core_handler_dispatch",
        "external_worker_execution",
        "collector_storage_completion",
        "duplicate_result_suppression",
        "singleton_worker_lock",
        "pending_processing_requeue_on_restart",
        "state_hash_persistence_across_restart",
        "graceful_worker_stop_request",
        "backup_authority_present",
    ]
    for key in required_true:
        if required_acceptance.get(key) is not True:
            findings.append({"code": "REQUIRED_ACCEPTANCE_TRUE", "path": key})
    required_zero = [
        "duplicate_execution_count",
        "final_worker_orphan_count",
        "final_electron_orphan_count",
        "forced_electron_stop_count",
    ]
    for key in required_zero:
        if required_acceptance.get(key) != 0:
            findings.append({"code": "REQUIRED_ACCEPTANCE_ZERO", "path": key})
    if required_acceptance.get("destructive_rollback_executed") is not False:
        findings.append({"code": "DESTRUCTIVE_ROLLBACK_FALSE_REQUIRED", "path": "required_acceptance"})

    safety = contract.get("safety_boundary", {})
    for key in (
        "production_connection",
        "production_credential_use",
        "production_deploy",
        "destructive_active_core_rollback",
        "ready",
        "merge",
    ):
        if safety.get(key) is not False:
            findings.append({"code": "SAFETY_FALSE_REQUIRED", "path": key})
    for key in ("real_api_call_count", "postgresql_apply_count"):
        if safety.get(key) != 0:
            findings.append({"code": "SAFETY_ZERO_REQUIRED", "path": key})

    worker_markers = [
        "DUPLICATE_WORKER_INSTANCE",
        "SingletonFileLock",
        "recover_processing",
        "REQUEUED_FROM_PROCESSING",
        "runtime / \"heartbeat.json\"",
        "control / \"stop.request\"",
        "WORKER_STOP_ACK",
        "WORKER_SHUTDOWN_RECEIPT",
        "DUPLICATE_SUPPRESSION_RECEIPT",
    ]
    for marker in worker_markers:
        if marker not in worker:
            findings.append({"code": "WORKER_MARKER_MISSING", "path": marker})

    runner_markers = {
        "runner_common": [
            "Assert-NoExistingRuntime",
            "Start-Runtime",
            "Stop-Runtime",
            "Invoke-CapturedProcess",
        ],
        "runner_tests": [
            "Invoke-LiveHandlerRuntime",
            "Test-DuplicateSuppression",
            "Test-RestartRecovery",
            "Test-SingletonLock",
            "Test-ApplyBackupAuthority",
        ],
        "runner": [
            "R11RuntimeCommon.ps1",
            "R11RuntimeTests.ps1",
            "R11_ACTIVE_RUNTIME_BOOT_RESTART_RECOVERY=PASS",
            "REAL_API_CALL_COUNT=0",
            "POSTGRESQL_APPLY_COUNT=0",
            "PRODUCTION=false",
            "READY=false",
            "MERGE=false",
        ],
    }
    runner_sources = {
        "runner_common": runner_common,
        "runner_tests": runner_tests,
        "runner": runner,
    }
    for source_name, markers in runner_markers.items():
        for marker in markers:
            if marker not in runner_sources[source_name]:
                findings.append({"code": "RUNNER_MARKER_MISSING", "path": f"{source_name}:{marker}"})

    live_markers = [
        "handleStage4DispatchNextPrompt",
        "handleStage4RunCheck",
        "handleStage4AppendStationRecords",
        "external_worker_pid",
        "LIVE_HANDLER_DISPATCH_FAILED",
        "LIVE_HANDLER_STORAGE_FAILED",
        "YOLLA_R11_LIVE_ACTIVE_CORE_HANDLER_RUNTIME_V1",
    ]
    for marker in live_markers:
        if marker not in live_test:
            findings.append({"code": "LIVE_TEST_MARKER_MISSING", "path": marker})

    ci_markers = [
        "singleton_lock",
        "duplicate_suppression",
        "live_handler_external_worker",
        "processing_recovery",
        "graceful_stop",
    ]
    for marker in ci_markers:
        if marker not in ci_test:
            findings.append({"code": "CI_TEST_MARKER_MISSING", "path": marker})

    adapter_markers = [
        "dispatchWorkRequest",
        "readWorkResult",
        "toCollectorPayload",
        "toStoragePayload",
        "IDEMPOTENCY_KEY_ALREADY_PRESENT",
    ]
    for marker in adapter_markers:
        if marker not in adapter:
            findings.append({"code": "ADAPTER_MARKER_MISSING", "path": marker})

    forbidden = {
        "worker": [
            r"shell\s*=\s*True",
            r"requests\.(get|post|put|delete)",
            r"production[\"']?\s*:\s*True",
        ],
        "runner": [
            r"PRODUCTION\s*=\s*\$true",
            r"READY\s*=\s*\$true",
            r"MERGE\s*=\s*\$true",
        ],
        "live_test": [
            r"production\s*:\s*true",
            r"childProcess\.exec\(",
        ],
    }
    sources = {
        "worker": worker,
        "runner": runner + runner_common + runner_tests,
        "live_test": live_test,
    }
    for source_name, patterns in forbidden.items():
        for pattern in patterns:
            if re.search(pattern, sources[source_name], re.I):
                findings.append({"code": "FORBIDDEN_PATTERN", "path": f"{source_name}:{pattern}"})

    return {
        "schema_version": "YOLLA_R11_RUNTIME_ACCEPTANCE_VALIDATION_V1",
        "accepted": not findings,
        "finding_count": len(findings),
        "findings": findings,
        "required_file_count": len(REQUIRED_FILES),
        "worker_runtime_recovery": "BOUND",
        "singleton_lock": "BOUND",
        "live_handler_external_worker": "BOUND",
        "target_pc_execution_claimed": False,
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
