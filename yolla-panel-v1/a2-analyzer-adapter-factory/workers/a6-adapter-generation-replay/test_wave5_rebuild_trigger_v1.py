import copy
import unittest

from validate_wave5_rebuild_trigger_v1 import evaluate_trigger


BASE = {
    "a3": {
        "head": "a3-current",
        "pointer_blob": "a3-blob",
        "handoff_ready": True,
        "response_fixture_binding_count": 8,
        "placeholder": False,
    },
    "a5": {
        "head": "a5-current",
        "pointer_blob": "a5-blob",
        "handoff_ready": True,
        "terminal": "A5_FINAL_AUTHORITY_REBIND_AND_EXECUTION_CONTRACT_READY",
        "placeholder": False,
    },
    "a4": {
        "head": "a4-current",
        "pointer_blob": "a4-blob",
        "pagination_binding_audit": "PASS",
        "placeholder": False,
    },
}


class TriggerTests(unittest.TestCase):
    def test_positive_control(self):
        result = evaluate_trigger(copy.deepcopy(BASE), copy.deepcopy(BASE))
        self.assertTrue(result.allowed)
        self.assertEqual([], result.errors)

    def test_stale_a3_head_rejected(self):
        observed = copy.deepcopy(BASE)
        observed["a3"]["head"] = "a3-stale"
        result = evaluate_trigger(BASE, observed)
        self.assertFalse(result.allowed)
        self.assertIn("STALE_A3_HEAD", result.errors)

    def test_stale_a5_head_rejected(self):
        observed = copy.deepcopy(BASE)
        observed["a5"]["head"] = "a5-stale"
        result = evaluate_trigger(BASE, observed)
        self.assertFalse(result.allowed)
        self.assertIn("STALE_A5_HEAD", result.errors)

    def test_handoff_false_rejected(self):
        observed = copy.deepcopy(BASE)
        observed["a5"]["handoff_ready"] = False
        result = evaluate_trigger(BASE, observed)
        self.assertFalse(result.allowed)
        self.assertIn("A5_HANDOFF_NOT_READY", result.errors)

    def test_placeholder_rejected(self):
        observed = copy.deepcopy(BASE)
        observed["a5"]["authority_state"] = "SUPERSEDED_NON_AUTHORITY_FIXTURE_ONLY"
        result = evaluate_trigger(BASE, observed)
        self.assertFalse(result.allowed)
        self.assertIn("A5_PLACEHOLDER_AUTHORITY", result.errors)

    def test_binding_count_rejected(self):
        observed = copy.deepcopy(BASE)
        observed["a3"]["response_fixture_binding_count"] = 7
        result = evaluate_trigger(BASE, observed)
        self.assertFalse(result.allowed)
        self.assertIn("RESPONSE_BODY_FIXTURE_BINDING_LT_8", result.errors)

    def test_a4_audit_rejected(self):
        observed = copy.deepcopy(BASE)
        observed["a4"]["pagination_binding_audit"] = "NOT_PUBLISHED"
        result = evaluate_trigger(BASE, observed)
        self.assertFalse(result.allowed)
        self.assertIn("A4_PAGINATION_BINDING_AUDIT_NOT_PASS", result.errors)


if __name__ == "__main__":
    unittest.main()
