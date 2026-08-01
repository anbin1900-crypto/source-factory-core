#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REQUIRED_FILES = {
    "contract": "integrations/pc_agent_v1/SOURCE_FACTORY_PC_AGENT_INTEGRATION_CONTRACT_V1.json",
    "adapter": "releases/SF_REUSABLE_CORE_20260801_175708/src/shared/stage4/pcAgentBridgeAdapter.js",
    "patcher": "releases/SF_REUSABLE_CORE_20260801_175708/tools/stage4/applyPcAgentBridgePatch.js",
    "test": "releases/SF_REUSABLE_CORE_20260801_175708/tools/stage4/testPcAgentBridgeE2E.js",
    "worker": "integrations/pc_agent_v1/pc_agent_bridge_worker.py",
    "target_handler_helper": "integrations/pc_agent_v1/Invoke-TargetStage4HandlerE2E.ps1",
    "request_fixture": "integrations/pc_agent_v1/fixtures/WORK_REQUEST_FIXTURE_V1.json",
    "result_fixture": "integrations/pc_agent_v1/fixtures/WORK_RESULT_FIXTURE_V1.json",
}


def validate(root: Path) -> dict:
    findings: list[dict[str, str]] = []
    paths = {name: root / relative for name, relative in REQUIRED_FILES.items()}
    for name, path in paths.items():
        if not path.is_file():
            findings.append({"code": "MISSING_FILE", "path": f"{name}:{path}"})
    if findings:
        return {"accepted": False, "finding_count": len(findings), "findings": findings}

    contract = json.loads(paths["contract"].read_text(encoding="utf-8"))
    request_fixture = json.loads(paths["request_fixture"].read_text(encoding="utf-8"))
    result_fixture = json.loads(paths["result_fixture"].read_text(encoding="utf-8"))
    adapter = paths["adapter"].read_text(encoding="utf-8")
    patcher = paths["patcher"].read_text(encoding="utf-8")
    test = paths["test"].read_text(encoding="utf-8")
    worker = paths["worker"].read_text(encoding="utf-8")
    target_handler_helper = paths["target_handler_helper"].read_text(encoding="utf-8")

    required_adapter_markers = [
        "WORK_REQUEST", "WORK_RESULT",
        "dispatchWorkRequest", "readWorkResult", "toCollectorPayload", "toStoragePayload",
        "IDEMPOTENCY_KEY_ALREADY_PRESENT", "FILE_QUEUE_V1", "production: false",
        "YOLLA_PC_AGENT_BRIDGE_ENABLED", "YOLLA_PC_AGENT_BRIDGE_ROOT",
    ]
    for marker in required_adapter_markers:
        if marker not in adapter:
            findings.append({"code": "ADAPTER_MARKER_MISSING", "path": marker})

    required_patcher_markers = [
        "YOLLA_PC_AGENT_STAGE4_BRIDGE_V1_START",
        "handleStage4DispatchNextPrompt__PC_AGENT_ORIGINAL",
        "handleStage4RunCheck__PC_AGENT_ORIGINAL",
        "handleStage4AppendStationRecords",
        "PC_AGENT_DISPATCH_ADAPTER_ERROR",
        "PC_AGENT_RESULT_STORAGE_FAILED",
        "path.dirname(output)",
        ".sf-pc-agent-patch-",
        "written_sha256",
        "write_strategy",
        "SAME_DIRECTORY_ATOMIC_RENAME",
        "VERIFIED_COPY_FALLBACK_",
        "PATCHED_OUTPUT_SHA256_MISMATCH",
        "PATCHED_OUTPUT_NODE_CHECK_FAILED",
    ]
    for marker in required_patcher_markers:
        if marker not in patcher:
            findings.append({"code": "PATCHER_MARKER_MISSING", "path": marker})

    required_helper_markers = [
        "Start-Process",
        "RedirectStandardOutput",
        "RedirectStandardError",
        "TARGET_HANDLER_E2E_STDERR_NONFATAL",
        "helper_stderr_nonfatal",
        "SFPADB2_TARGET_HANDLER_E2E_FAILED",
        "SFPADB2_TARGET_HANDLER_E2E_RECEIPT_MISSING",
    ]
    for marker in required_helper_markers:
        if marker not in target_handler_helper:
            findings.append({"code": "TARGET_HANDLER_HELPER_MARKER_MISSING", "path": marker})

    required_worker_markers = [
        "ALLOWED_BASENAMES", "subprocess.run", "shell=False",
        "INLINE_SECRET_ENV_KEY_FORBIDDEN", "DUPLICATE_RESULT_ALREADY_EXISTS",
        "WORK_RESULT", "WORK_ATTEMPT", '"production": False',
    ]
    for marker in required_worker_markers:
        if marker not in worker:
            findings.append({"code": "WORKER_MARKER_MISSING", "path": marker})

    forbidden_patterns = {
        "adapter": [r"child_process\.exec\(", r"shell\s*:\s*true", r"production\s*:\s*true"],
        "worker": [r"shell\s*=\s*True", r"requests\.(get|post|put|delete)", r"production[\"']?\s*:\s*True"],
        "patcher": [r"package\.json", r"safe_panel_preload", r"IPC.*rename", r"path\.join\(os\.tmpdir"],
        "target_handler_helper": [r"&\s*\$nodeExe[\s\S]{0,500}2>&1"],
    }
    sources = {
        "adapter": adapter,
        "worker": worker,
        "patcher": patcher,
        "target_handler_helper": target_handler_helper,
    }
    for name, patterns in forbidden_patterns.items():
        for pattern in patterns:
            if re.search(pattern, sources[name], re.I):
                findings.append({"code": "FORBIDDEN_PATTERN", "path": f"{name}:{pattern}"})

    expected_identity = [
        "work_id", "project_id", "cycle_id", "worker_slot_uid", "assignment_id",
        "directive_id", "execution_id", "attempt_id", "source_github_ref",
    ]
    for field in expected_identity:
        if field not in request_fixture or field not in result_fixture:
            findings.append({"code": "IDENTITY_FIELD_MISSING", "path": field})
    if request_fixture.get("object_type") != "WORK_REQUEST":
        findings.append({"code": "REQUEST_FIXTURE_TYPE", "path": str(request_fixture.get("object_type"))})
    if result_fixture.get("object_type") != "WORK_RESULT":
        findings.append({"code": "RESULT_FIXTURE_TYPE", "path": str(result_fixture.get("object_type"))})
    if request_fixture.get("production") is not False or result_fixture.get("production") is not False:
        findings.append({"code": "FIXTURE_PRODUCTION_TRUE", "path": "fixtures"})

    preservation = contract.get("preservation", {})
    required_false = [
        "sequentialPromptSender_deleted", "executionResultCollector_deleted",
        "preload_api_renamed", "ipc_channel_renamed", "project_panel_identity_deleted",
        "source_not_found_fallback_deleted", "package_json_modified", "lao_detect_queue_modified",
    ]
    for key in required_false:
        if preservation.get(key) is not False:
            findings.append({"code": "PRESERVATION_FALSE_REQUIRED", "path": key})
    prohibitions = contract.get("prohibitions", {})
    for key in ("production_connection", "production_credential_use", "production_deploy", "ready_transition", "merge"):
        if prohibitions.get(key) is not False:
            findings.append({"code": "PROHIBITION_FALSE_REQUIRED", "path": key})

    test_markers = [
        "duplicate_suppression", "worker_execution", "result_collection",
        "storage_mapping", "fallback_disabled", "patch_generation", "node_check",
    ]
    for marker in test_markers:
        if marker not in test:
            findings.append({"code": "TEST_COVERAGE_MARKER_MISSING", "path": marker})

    return {
        "schema_version": "YOLLA_SOURCE_FACTORY_PC_AGENT_INTEGRATION_VALIDATION_V1",
        "accepted": not findings,
        "finding_count": len(findings),
        "findings": findings,
        "required_file_count": len(REQUIRED_FILES),
        "identity_field_count": len(expected_identity),
        "target_handler_stderr_capture_required": True,
        "production_execution_claimed": False,
        "target_pc_apply_claimed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root")
    parser.add_argument("--output")
    args = parser.parse_args()
    result = validate(Path(args.root))
    text = json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0 if result["accepted"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
