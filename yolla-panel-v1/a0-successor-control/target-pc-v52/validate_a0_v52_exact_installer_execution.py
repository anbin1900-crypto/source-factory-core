from __future__ import annotations

import argparse
import json
from pathlib import Path

EXPECTED_INSTALLER = "INSTALL_YOLLA_WORKSPACE_V52_SESSION_ANALYZER.bat"
EXPECTED_SHA256 = "96731d281a138048d96d8f2a99900805d2ee15711666a2f3f4d33d994ac8d544"
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
    authority_path = root / "A0_V52_EXACT_INSTALLER_AUTHORITY_RESOLUTION_V1.json"
    runner_path = root / "Invoke-A0V52ExactInstallerExecution.ps1"
    observation_path = root / "A0_V52_OPERATOR_OBSERVATION_TEMPLATE_V1.json"

    for path in (authority_path, runner_path, observation_path):
        if not path.is_file():
            findings.append(f"MISSING:{path.name}")
    if findings:
        return {"status": "FAIL", "finding_count": len(findings), "findings": findings}

    authority = load_json(authority_path)
    observation = load_json(observation_path)
    runner = runner_path.read_text(encoding="utf-8-sig")

    if authority.get("schema_version") != "A0_V52_EXACT_INSTALLER_AUTHORITY_RESOLUTION_V1":
        findings.append("AUTHORITY_SCHEMA_INVALID")
    if authority.get("terminal") != "A0_V52_EXACT_INSTALLER_AUTHORITY_RESOLVED":
        findings.append("AUTHORITY_TERMINAL_INVALID")
    installer = authority.get("resolved_installer", {})
    if installer.get("file_name") != EXPECTED_INSTALLER:
        findings.append("INSTALLER_NAME_INVALID")
    if installer.get("documented_expected_sha256") != EXPECTED_SHA256:
        findings.append("INSTALLER_EXPECTED_SHA_INVALID")
    if installer.get("target_pc_executed") is not False:
        findings.append("AUTHORITY_PREMATURE_EXECUTION_CLAIM")
    if installer.get("sha256_recomputed_from_exact_bytes") is not False:
        findings.append("AUTHORITY_PREMATURE_SHA_READBACK_CLAIM")
    if any(authority.get(key) is not False for key in ("production", "ready", "merge")):
        findings.append("AUTHORITY_SAFETY_BOUNDARY_INVALID")

    checks = observation.get("checks", {})
    if set(checks) != REQUIRED_UI_CHECKS:
        findings.append("OBSERVATION_CHECK_SET_INVALID")
    if any(value is not False for value in checks.values()):
        findings.append("OBSERVATION_TEMPLATE_NOT_FAIL_CLOSED")

    required_markers = (
        "Set-StrictMode -Version Latest",
        "$ErrorActionPreference = 'Stop'",
        "A0V52X003_ADMINISTRATOR_REQUIRED",
        "A0V52X009_INSTALLER_SHA256_MISMATCH",
        EXPECTED_INSTALLER,
        EXPECTED_SHA256,
        "SESSION_PROFILE_MIGRATION_RECEIPT.json",
        "LATEST_SMOKE_TEST.json",
        "RUN_YOLLA_WORKSPACE_V5.bat",
        "RUN_YOLLA_WORKSPACE_V5_2.bat",
        "V52_TARGET_PC_SESSION_AND_DUAL_BROWSER_PASS",
        "V52_TARGET_PC_INSTALL_AND_RECEIPT_PASS_WAITING_UI_SESSION_EVIDENCE",
        "target_pc_pass_claimed_without_evidence = 0",
        "rollback.performed",
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
        "schema_version": "A0_V52_EXACT_INSTALLER_PACKAGE_VALIDATION_V1",
        "status": "PASS" if not findings else "FAIL",
        "finding_count": len(findings),
        "findings": findings,
        "required_ui_check_count": len(REQUIRED_UI_CHECKS),
        "expected_installer": EXPECTED_INSTALLER,
        "expected_sha256": EXPECTED_SHA256,
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
