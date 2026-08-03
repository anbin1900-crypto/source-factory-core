from __future__ import annotations

import argparse
import json
from pathlib import Path

REQUIRED_UI_CHECKS = {
    "chatgpt_login_preserved_after_update",
    "chatgpt_login_preserved_after_app_restart",
    "worker_address_bar_only_visible_on_worker_tab",
    "analyzer_address_bar_only_visible_on_analyzer_tab",
    "site_navigation_does_not_change_chatgpt_context",
    "50_seats_and_7_groups_preserved",
    "project_and_context_bindings_preserved",
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def validate(root: Path) -> dict:
    findings: list[str] = []
    contract_path = root / "A0_V52_TARGET_PC_ACCEPTANCE_CONTRACT_V1.json"
    request_path = root / "A0_V52_TARGET_PC_WORK_REQUEST_TEMPLATE_V1.json"
    observation_path = root / "A0_V52_OPERATOR_OBSERVATION_TEMPLATE_V1.json"
    runner_path = root / "Invoke-A0V52TargetPcAcceptance.ps1"

    for path in (contract_path, request_path, observation_path, runner_path):
        if not path.is_file():
            findings.append(f"MISSING:{path.name}")

    if findings:
        return {"status": "FAIL", "findings": findings}

    contract = load_json(contract_path)
    request = load_json(request_path)
    observation = load_json(observation_path)
    runner = runner_path.read_text(encoding="utf-8-sig")

    if contract.get("schema_version") != "A0_V52_TARGET_PC_ACCEPTANCE_CONTRACT_V1":
        findings.append("CONTRACT_SCHEMA_INVALID")
    if contract.get("directive_id") != "A0-P0-V52-TARGET-PC-ACCEPTANCE":
        findings.append("DIRECTIVE_ID_INVALID")
    if set(contract.get("operator_or_runtime_evidence_checks", [])) != REQUIRED_UI_CHECKS:
        findings.append("CONTRACT_UI_CHECK_SET_INVALID")
    if any(contract.get(key) is not False for key in ("production", "ready", "merge")):
        findings.append("CONTRACT_SAFETY_BOUNDARY_INVALID")
    preservation = contract.get("preservation", {})
    if any(preservation.get(key) is not False for key in preservation):
        findings.append("CONTRACT_PRESERVATION_INVALID")

    if request.get("schema_version") != "YOLLA_SOURCE_FACTORY_PC_AGENT_BRIDGE_V1":
        findings.append("REQUEST_SCHEMA_INVALID")
    if request.get("object_type") != "WORK_REQUEST":
        findings.append("REQUEST_OBJECT_TYPE_INVALID")
    if request.get("directive_id") != contract.get("directive_id"):
        findings.append("REQUEST_DIRECTIVE_MISMATCH")
    if request.get("cycle_id") != contract.get("cycle_id"):
        findings.append("REQUEST_CYCLE_MISMATCH")
    if request.get("production") is not False:
        findings.append("REQUEST_PRODUCTION_INVALID")
    command = request.get("command_spec", {})
    if str(command.get("executable", "")).lower() != "powershell.exe":
        findings.append("REQUEST_EXECUTABLE_INVALID")
    if "-File" not in command.get("args", []):
        findings.append("REQUEST_FILE_ARGUMENT_MISSING")
    if not request.get("idempotency_key"):
        findings.append("REQUEST_IDEMPOTENCY_KEY_MISSING")

    checks = observation.get("checks", {})
    if set(checks) != REQUIRED_UI_CHECKS:
        findings.append("OBSERVATION_UI_CHECK_SET_INVALID")
    if any(value is not False for value in checks.values()):
        findings.append("OBSERVATION_TEMPLATE_MUST_DEFAULT_FALSE")

    required_markers = (
        "Set-StrictMode -Version Latest",
        "$ErrorActionPreference = 'Stop'",
        "V52_TARGET_PC_SESSION_AND_DUAL_BROWSER_PASS",
        "V52_TARGET_PC_AUTOMATED_PREFLIGHT_PASS_WAITING_UI_EVIDENCE",
        "target_pc_pass_claimed_without_evidence = 0",
        "Copy-StateIfPresent",
        "Get-FileHash",
        "RUN_YOLLA_WORKSPACE_V5.bat",
        "yolla-workspace-browser-profile",
    )
    for marker in required_markers:
        if marker not in runner:
            findings.append(f"RUNNER_MARKER_MISSING:{marker}")

    forbidden_markers = (
        "Remove-Item -LiteralPath $FixedBrowserProfile",
        "Remove-Item -LiteralPath $V5State",
        "Remove-Item -LiteralPath $V51State",
        "Remove-Item -LiteralPath $V51Cycles",
        "production = $true",
        "ready = $true",
        "merge = $true",
    )
    for marker in forbidden_markers:
        if marker in runner:
            findings.append(f"RUNNER_FORBIDDEN_MARKER:{marker}")

    return {
        "schema_version": "A0_V52_TARGET_PC_PACKAGE_VALIDATION_V1",
        "status": "PASS" if not findings else "FAIL",
        "finding_count": len(findings),
        "findings": findings,
        "required_ui_check_count": len(REQUIRED_UI_CHECKS),
        "production": False,
        "ready": False,
        "merge": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = validate(args.root)
    text = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    print(text, end="")
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
