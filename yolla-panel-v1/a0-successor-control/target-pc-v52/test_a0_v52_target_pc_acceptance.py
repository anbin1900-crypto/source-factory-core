from __future__ import annotations

import json
import unittest
from pathlib import Path

from validate_a0_v52_target_pc_acceptance import REQUIRED_UI_CHECKS, validate

ROOT = Path(__file__).resolve().parent


class A0V52AcceptancePackageTests(unittest.TestCase):
    def test_package_validation_passes(self) -> None:
        result = validate(ROOT)
        self.assertEqual(result["status"], "PASS", result)
        self.assertEqual(result["finding_count"], 0)

    def test_operator_template_is_fail_closed(self) -> None:
        payload = json.loads((ROOT / "A0_V52_OPERATOR_OBSERVATION_TEMPLATE_V1.json").read_text(encoding="utf-8"))
        self.assertEqual(set(payload["checks"]), REQUIRED_UI_CHECKS)
        self.assertTrue(all(value is False for value in payload["checks"].values()))
        self.assertEqual(payload["evidence_paths"], [])

    def test_work_request_is_non_production_and_idempotent(self) -> None:
        payload = json.loads((ROOT / "A0_V52_TARGET_PC_WORK_REQUEST_TEMPLATE_V1.json").read_text(encoding="utf-8"))
        self.assertFalse(payload["production"])
        self.assertEqual(payload["object_type"], "WORK_REQUEST")
        self.assertTrue(payload["idempotency_key"])
        self.assertEqual(payload["retry_policy"]["max_attempts"], 2)

    def test_contract_preserves_stable_assets(self) -> None:
        payload = json.loads((ROOT / "A0_V52_TARGET_PC_ACCEPTANCE_CONTRACT_V1.json").read_text(encoding="utf-8"))
        self.assertTrue(all(value is False for value in payload["preservation"].values()))
        self.assertEqual(payload["fallback_launcher"], r"E:\SOURCE FACTORY\RUN_YOLLA_WORKSPACE_V5.bat")
        self.assertFalse(payload["production"])
        self.assertFalse(payload["ready"])
        self.assertFalse(payload["merge"])

    def test_runner_has_no_destructive_profile_or_state_delete(self) -> None:
        runner = (ROOT / "Invoke-A0V52TargetPcAcceptance.ps1").read_text(encoding="utf-8")
        forbidden = (
            "Remove-Item -LiteralPath $FixedBrowserProfile",
            "Remove-Item -LiteralPath $V5State",
            "Remove-Item -LiteralPath $V51State",
            "Remove-Item -LiteralPath $V51Cycles",
        )
        for marker in forbidden:
            self.assertNotIn(marker, runner)


if __name__ == "__main__":
    unittest.main()
