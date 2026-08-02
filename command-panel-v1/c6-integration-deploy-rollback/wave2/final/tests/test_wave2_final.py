import copy
import json
import unittest
from pathlib import Path

from ai_yolla_wave2_integration import (
    AiYollaCommonCore, FixtureRuntimeAdapter, digest, duplicate_key, validate_input_matrix
)

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((ROOT / "fixtures/THREE_SERVICE_E2E_FIXTURE.json").read_text(encoding="utf-8"))
MATRIX = json.loads((ROOT / "AI_YOLLA_WAVE2_EXACT_INPUT_MATRIX.json").read_text(encoding="utf-8"))


def make_directive(service, wave="WAVE_2", registered="2026-08-02 18:03 KST", directive_id=None):
    did = directive_id or service["directive_id"]
    return {
        "role_id": service["role_id"],
        "directive_id": did,
        "wave_id": wave,
        "directive_registered_at_kst": registered,
        "duplicate_prompt_key": duplicate_key(service["role_id"], did, wave, registered)
    }


class Wave2FinalTests(unittest.TestCase):
    def setUp(self):
        self.runtime = FixtureRuntimeAdapter(FIXTURE["runtime_version"])
        self.core = AiYollaCommonCore(copy.deepcopy(FIXTURE), self.runtime)

    def test_exact_input_matrix_4_of_4(self):
        self.assertTrue(validate_input_matrix(MATRIX)["pass"])

    def test_common_core_count_one(self):
        self.assertEqual(FIXTURE["common_core_id"], "AI_YOLLA_COMMON_CORE")

    def test_three_service_e2e(self):
        for service in FIXTURE["services"]:
            out = self.core.execute_service(service["service_id"], make_directive(service))
            self.assertTrue(out["dispatched"])
        self.assertEqual(self.runtime.dispatch_count, 3)
        self.assertEqual(len(self.core.sessions), 3)

    def test_duplicate_prompt_block(self):
        service = FIXTURE["services"][0]
        directive = make_directive(service)
        self.core.execute_service(service["service_id"], directive)
        self.assertEqual(self.core.execute_service(service["service_id"], directive)["decision"], "REJECT_ALREADY_ACCEPTED")

    def test_duplicate_before_completion_block(self):
        service = FIXTURE["services"][0]
        directive = make_directive(service)
        self.assertEqual(self.core.admit(directive), "ACCEPT")
        self.assertEqual(self.core.admit(directive), "REJECT_DUPLICATE")

    def test_stale_wave_block(self):
        service = FIXTURE["services"][0]
        self.core.execute_service(service["service_id"], make_directive(service, wave="WAVE_2"))
        stale = make_directive(service, wave="WAVE_1", directive_id="STALE")
        self.assertEqual(self.core.admit(stale), "REJECT_STALE_WAVE")

    def test_missing_wave_fail_closed(self):
        directive = make_directive(FIXTURE["services"][0]); directive["wave_id"] = ""
        with self.assertRaisesRegex(ValueError, "FAIL_CLOSED_MISSING_METADATA"):
            self.core.admit(directive)

    def test_missing_time_fail_closed(self):
        directive = make_directive(FIXTURE["services"][0]); directive["directive_registered_at_kst"] = ""
        with self.assertRaisesRegex(ValueError, "FAIL_CLOSED_MISSING_METADATA"):
            self.core.admit(directive)

    def test_same_wave_different_time_requires_supersession(self):
        service = FIXTURE["services"][0]
        self.core.execute_service(service["service_id"], make_directive(service))
        changed = make_directive(service, registered="2026-08-02 18:04 KST", directive_id="CHANGED")
        self.assertEqual(self.core.admit(changed), "REQUIRE_SUPERSESSION_POINTER")

    def test_cross_service_session_isolation(self):
        for service in FIXTURE["services"]:
            self.core.execute_service(service["service_id"], make_directive(service))
        sessions = [item["workspace_service_session_id"] for item in self.core.sessions.values()]
        self.assertEqual(len(sessions), len(set(sessions)))

    def test_cross_service_result_leak_zero(self):
        services = FIXTURE["services"]
        self.core.execute_service(services[0]["service_id"], make_directive(services[0]))
        self.assertEqual(len(self.core.get_service_results(services[1]["service_id"])), 0)

    def test_restart_recovery(self):
        service = FIXTURE["services"][1]
        self.core.execute_service(service["service_id"], make_directive(service))
        before = self.core.snapshot()
        restored = AiYollaCommonCore.restore(FIXTURE, FIXTURE["runtime_version"], before)
        self.assertEqual(restored.selected_service_id, service["service_id"])
        self.assertEqual(restored.sessions[service["service_id"]]["domain_pack_id"], service["domain_pack_id"])
        self.assertEqual(digest(restored.snapshot()), digest(before))

    def test_rollback_blob_parity(self):
        service = FIXTURE["services"][2]
        baseline = self.core.snapshot()
        baseline_hash = digest(baseline)
        self.core.execute_service(service["service_id"], make_directive(service))
        restored = AiYollaCommonCore.restore(FIXTURE, FIXTURE["runtime_version"], baseline)
        self.assertEqual(digest(restored.snapshot()), baseline_hash)

    def test_unknown_service_reject(self):
        with self.assertRaisesRegex(ValueError, "UNKNOWN_SERVICE"):
            self.core.execute_service("UNKNOWN", make_directive(FIXTURE["services"][0]))

    def test_bad_duplicate_key_reject(self):
        directive = make_directive(FIXTURE["services"][0]); directive["duplicate_prompt_key"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "DUPLICATE_PROMPT_KEY_MISMATCH"):
            self.core.admit(directive)

    def test_no_actual_pc_dispatch(self):
        self.assertEqual(MATRIX["a1_pc_runtime_authority"]["consumption_mode"], "READ_ONLY_NO_PC_DISPATCH")


if __name__ == "__main__":
    unittest.main()
