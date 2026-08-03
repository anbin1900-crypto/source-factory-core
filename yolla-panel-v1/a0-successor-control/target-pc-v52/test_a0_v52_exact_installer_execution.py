from __future__ import annotations

import json
import unittest
from pathlib import Path

from validate_a0_v52_exact_installer_execution import (
    EXPECTED_INSTALLER,
    EXPECTED_SHA256,
    REQUIRED_UI_CHECKS,
    validate,
)

ROOT = Path(__file__).resolve().parent


class A0V52ExactInstallerExecutionTests(unittest.TestCase):
    def test_package_validation_passes(self) -> None:
        result = validate(ROOT)
        self.assertEqual(result["status"], "PASS", result)
        self.assertEqual(result["finding_count"], 0)

    def test_authority_resolves_exact_installer_without_execution_claim(self) -> None:
        authority = json.loads(
            (ROOT / "A0_V52_EXACT_INSTALLER_AUTHORITY_RESOLUTION_V1.json").read_text(encoding="utf-8")
        )
        installer = authority["resolved_installer"]
        self.assertEqual(installer["file_name"], EXPECTED_INSTALLER)
        self.assertEqual(installer["documented_expected_sha256"], EXPECTED_SHA256)
        self.assertFalse(installer["sha256_recomputed_from_exact_bytes"])
        self.assertFalse(installer["target_pc_materialized"])
        self.assertFalse(installer["target_pc_executed"])

    def test_operator_evidence_remains_fail_closed(self) -> None:
        payload = json.loads(
            (ROOT / "A0_V52_OPERATOR_OBSERVATION_TEMPLATE_V1.json").read_text(encoding="utf-8")
        )
        self.assertEqual(set(payload["checks"]), REQUIRED_UI_CHECKS)
        self.assertTrue(all(value is False for value in payload["checks"].values()))
        self.assertEqual(payload["evidence_paths"], [])

    def test_runner_verifies_sha_and_collects_installer_receipts(self) -> None:
        runner = (ROOT / "Invoke-A0V52ExactInstallerExecution.ps1").read_text(encoding="utf-8")
        self.assertIn(EXPECTED_SHA256, runner)
        self.assertIn("Get-FileHash", runner)
        self.assertIn("SESSION_PROFILE_MIGRATION_RECEIPT.json", runner)
        self.assertIn("LATEST_SMOKE_TEST.json", runner)
        self.assertIn("installer_exit_code", runner)

    def test_runner_preserves_profile_state_and_stable_launcher(self) -> None:
        runner = (ROOT / "Invoke-A0V52ExactInstallerExecution.ps1").read_text(encoding="utf-8")
        for forbidden in (
            "Remove-Item -LiteralPath $FixedBrowserProfile",
            "Remove-Item -LiteralPath $V5State",
            "Remove-Item -LiteralPath $V51State",
            "Remove-Item -LiteralPath $V51Cycles",
        ):
            self.assertNotIn(forbidden, runner)
        self.assertIn("stable_v5_launcher_unchanged", runner)
        self.assertIn("fixed_browser_profile_preserved", runner)
        self.assertIn("rollback.performed", runner)

    def test_target_pc_pass_requires_ui_evidence(self) -> None:
        runner = (ROOT / "Invoke-A0V52ExactInstallerExecution.ps1").read_text(encoding="utf-8")
        self.assertIn("$automatedPass -and $operator.valid", runner)
        self.assertIn("TARGET_PC_UI_SESSION_EVIDENCE_REQUIRED", runner)
        self.assertIn("target_pc_pass_claimed = ($status -eq 'PASS')", runner)


if __name__ == "__main__":
    unittest.main()
