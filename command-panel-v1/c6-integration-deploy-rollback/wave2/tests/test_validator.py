import copy
import json
import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from validator import validate, EXPECTED_FINAL, EXPECTED_PARTIAL
BASE = json.loads((ROOT / "C2_TO_C5_WAVE2_INTAKE_MATRIX.json").read_text(encoding="utf-8"))

class TestValidator(unittest.TestCase):
    def test_current_zero_of_four_is_partial(self):
        out = validate(copy.deepcopy(BASE))
        self.assertEqual(out["terminal"], EXPECTED_PARTIAL)
        self.assertEqual(out["published_terminal_count"], 0)
    def test_blocker_lists_all_workers(self):
        out = validate(copy.deepcopy(BASE))
        for worker in ("C-2", "C-3", "C-4", "C-5"):
            self.assertIn(worker, out["blocker"])
    def test_virtual_pass_is_rejected(self):
        data = copy.deepcopy(BASE)
        data["inputs"]["C-2"]["terminal_status"] = "PUBLISHED_PASS"
        data["published_terminal_count"] = 1
        out = validate(data)
        self.assertEqual(out["terminal"], EXPECTED_PARTIAL)
        self.assertLess(out["check_pass_count"], out["check_count"])
    def test_all_four_exact_pass_allows_final(self):
        data = copy.deepcopy(BASE)
        for i, item in enumerate(data["inputs"].values(), 1):
            item["terminal_status"] = "PUBLISHED_PASS"
            item["result_comment_id"] = 9000 + i
            item["remote_head"] = f"{i}" * 40
        data["published_terminal_count"] = 4
        self.assertEqual(validate(data)["terminal"], EXPECTED_FINAL)
    def test_bad_wave_fails_closed(self):
        data = copy.deepcopy(BASE); data["wave_id"] = "WAVE_1"
        self.assertEqual(validate(data)["terminal"], EXPECTED_PARTIAL)
    def test_bad_registered_time_fails_closed(self):
        data = copy.deepcopy(BASE); data["directive_registered_at_kst"] = ""
        self.assertEqual(validate(data)["terminal"], EXPECTED_PARTIAL)
    def test_bad_start_head_fails_closed(self):
        data = copy.deepcopy(BASE); data["inputs"]["C-3"]["start_head"] = "bad"
        self.assertEqual(validate(data)["terminal"], EXPECTED_PARTIAL)
    def test_missing_worker_fails_closed(self):
        data = copy.deepcopy(BASE); del data["inputs"]["C-5"]
        self.assertEqual(validate(data)["terminal"], EXPECTED_PARTIAL)
    def test_source_change_never_authorized_by_partial(self):
        self.assertFalse(validate(copy.deepcopy(BASE))["source_change_authorized"])
    def test_runtime_dispatch_closed(self):
        self.assertFalse(validate(copy.deepcopy(BASE))["runtime_dispatch_authorized"])

if __name__ == "__main__":
    unittest.main()
