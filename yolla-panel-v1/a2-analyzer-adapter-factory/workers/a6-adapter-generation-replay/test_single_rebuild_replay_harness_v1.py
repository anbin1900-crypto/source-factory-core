from __future__ import annotations

import json
import unittest
from pathlib import Path

from single_rebuild_replay_harness_v1 import PrebuildError, build_verified_package_once, validate_final_inputs

HERE = Path(__file__).resolve().parent
MANIFEST = json.loads((HERE / "A6_SINGLE_REBUILD_PREBUILD_MANIFEST_V1.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((HERE / "VERIFIED_ADAPTER_PACKAGE_V1" / "fixture_bundle.json").read_text(encoding="utf-8"))


def valid_inputs():
    return {
        "a5_final_schema": {
            "declared": {"head": "a" * 40, "pointer_blob": "b" * 40, "handoff_blob": "c" * 40},
            "observed": {
                "head": "a" * 40,
                "pointer_blob": "b" * 40,
                "handoff_blob": "c" * 40,
                "terminal": "A5_FINAL_RESPONSE_SCHEMA_AND_EXECUTION_CONTRACT_READY",
                "handoff_ready": True,
                "final_response_schema_complete": True,
                "authority_state": "FINAL",
                "placeholder": False,
            },
        },
        "a4_delta_audit": {
            "declared": {"head": "d" * 40, "pointer_blob": "e" * 40, "handoff_blob": "f" * 40},
            "observed": {
                "head": "d" * 40,
                "pointer_blob": "e" * 40,
                "handoff_blob": "f" * 40,
                "pagination_binding_audit": "PASS",
                "delta_ready": True,
                "authority_state": "FINAL",
                "placeholder": False,
            },
        },
    }


class SingleRebuildPreparationTest(unittest.TestCase):
    def test_manifest_targets_one_build_two_replays(self):
        contract = MANIFEST["execution_contract"]
        self.assertEqual(contract["final_build_count_target"], 1)
        self.assertEqual(contract["final_replay_count"], 2)
        self.assertEqual(contract["mid_process_audit_count"], 0)

    def test_missing_a5_slot_rejected(self):
        data = valid_inputs()
        del data["a5_final_schema"]
        with self.assertRaisesRegex(PrebuildError, "a5_final_schema_MUST_BE_OBJECT"):
            validate_final_inputs(MANIFEST, data)

    def test_stale_a5_head_rejected(self):
        data = valid_inputs()
        data["a5_final_schema"]["observed"]["head"] = "9" * 40
        with self.assertRaisesRegex(PrebuildError, "A5_FINAL_SCHEMA_HEAD_MISMATCH"):
            validate_final_inputs(MANIFEST, data)

    def test_a5_terminal_not_ready_rejected(self):
        data = valid_inputs()
        data["a5_final_schema"]["observed"]["terminal"] = "BLOCKED"
        with self.assertRaisesRegex(PrebuildError, "A5_FINAL_SCHEMA_TERMINAL_NOT_READY"):
            validate_final_inputs(MANIFEST, data)

    def test_a5_handoff_false_rejected(self):
        data = valid_inputs()
        data["a5_final_schema"]["observed"]["handoff_ready"] = False
        with self.assertRaisesRegex(PrebuildError, "A5_FINAL_SCHEMA_HANDOFF_NOT_READY"):
            validate_final_inputs(MANIFEST, data)

    def test_stale_a4_pointer_rejected(self):
        data = valid_inputs()
        data["a4_delta_audit"]["observed"]["pointer_blob"] = "0" * 40
        with self.assertRaisesRegex(PrebuildError, "A4_DELTA_AUDIT_POINTER_BLOB_MISMATCH"):
            validate_final_inputs(MANIFEST, data)

    def test_a4_audit_not_pass_rejected(self):
        data = valid_inputs()
        data["a4_delta_audit"]["observed"]["pagination_binding_audit"] = "PENDING"
        with self.assertRaisesRegex(PrebuildError, "A4_DELTA_PAGINATION_AUDIT_NOT_PASS"):
            validate_final_inputs(MANIFEST, data)

    def test_placeholder_authority_rejected(self):
        data = valid_inputs()
        data["a5_final_schema"]["observed"]["placeholder"] = True
        with self.assertRaisesRegex(PrebuildError, "A5_FINAL_SCHEMA_NON_AUTHORITY_REJECTED"):
            validate_final_inputs(MANIFEST, data)

    def test_positive_build_once_replay_twice(self):
        result = build_verified_package_once(MANIFEST, valid_inputs(), FIXTURE)
        self.assertEqual(result.build_count, 1)
        self.assertEqual(result.replay_count, 2)
        self.assertEqual(result.replay_digests[0], result.replay_digests[1])
        self.assertEqual(len(result.package["components"]), 9)
        self.assertEqual(result.package["network_call_count"], 0)

    def test_second_build_rejected(self):
        with self.assertRaisesRegex(PrebuildError, "FINAL_BUILD_ALREADY_CONSUMED"):
            build_verified_package_once(MANIFEST, valid_inputs(), FIXTURE, build_count_before=1)


if __name__ == "__main__":
    unittest.main()
