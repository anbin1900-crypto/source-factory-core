from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from action_recorder_session_replay import ACTION_TYPES, RecorderContinuity


class RecorderContinuityTests(unittest.TestCase):
    def test_action_types(self):
        self.assertEqual(ACTION_TYPES, {"click", "input", "scroll", "navigation", "wait"})

    def test_dedupe_same_command_action(self):
        r = RecorderContinuity("s")
        a1, dup1 = r.record_action(command_id="c", page_id="p", action_type="click", payload={"x":1})
        a2, dup2 = r.record_action(command_id="c", page_id="p", action_type="click", payload={"x":1})
        self.assertFalse(dup1); self.assertTrue(dup2); self.assertEqual(a1["action_id"], a2["action_id"])
        self.assertEqual(len(r.state["actions"]), 1)

    def test_command_action_binding(self):
        r = RecorderContinuity("s")
        a, _ = r.record_action(command_id="cmd", page_id="p", action_type="click", payload={})
        corr = r.command_action_correlation()
        self.assertEqual(corr["command_action_index"]["cmd"], [a["action_id"]])
        self.assertEqual(corr["action_command_index"][a["action_id"]], "cmd")

    def test_cdp_binding_same_action_id(self):
        r = RecorderContinuity("s")
        a, _ = r.record_action(command_id="cmd", page_id="p", action_type="click", payload={})
        r.bind_cdp_evidence(action_id=a["action_id"], evidence=[{"evidence_id":"e1","cdp_method":"Page.frameNavigated"}])
        binding = r.session_replay_binding()["action_binding"][a["action_id"]]
        self.assertEqual(binding["cdp_evidence_ids"], ["e1"])
        self.assertEqual(binding["replay_event_ids"], ["rr-0001"])

    def test_resume_cursor_restores_completed_and_pending(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td)/"state.json"
            r = RecorderContinuity("s")
            a1, _ = r.record_action(command_id="c1", page_id="p", action_type="click", payload={}, status="COMPLETED")
            a2, _ = r.record_action(command_id="c2", page_id="p", action_type="wait", payload={}, status="PENDING")
            r.save(path)
            restored = RecorderContinuity.load(path)
            self.assertEqual(restored.state["last_completed_action_id"], a1["action_id"])
            self.assertEqual(restored.state["pending_action_ids"], [a2["action_id"]])

    def test_replay_candidate_visible_flags(self):
        r = RecorderContinuity("s")
        r.record_action(command_id="c1", page_id="p", action_type="input", payload={})
        r.record_action(command_id="c2", page_id="p", action_type="wait", payload={})
        events = r.session_replay_binding()["events"]
        self.assertTrue(events[0]["visible"])
        self.assertFalse(events[1]["visible"])

    def test_invalid_action_fails_closed(self):
        r = RecorderContinuity("s")
        with self.assertRaises(ValueError):
            r.record_action(command_id="c", page_id="p", action_type="hover", payload={})

    def test_state_session_mismatch_fails_closed(self):
        r = RecorderContinuity("s1")
        with self.assertRaises(ValueError):
            RecorderContinuity("s2", state=r.state)

    def test_smoke_cli_single_command(self):
        with tempfile.TemporaryDirectory() as td:
            state = Path(td)/"state.json"; receipt = Path(td)/"receipt.json"
            cp = subprocess.run([
                sys.executable, str(ROOT/"tools"/"b3_action_recorder_smoke.py"),
                "--fixture", str(ROOT/"fixtures"/"record_replay_smoke_v1.json"),
                "--state", str(state), "--receipt", str(receipt),
            ], text=True, capture_output=True, check=False)
            self.assertEqual(cp.returncode, 0, cp.stderr + cp.stdout)
            data = json.loads(receipt.read_text(encoding="utf-8"))
            self.assertEqual(data["status"], "PASS")
            self.assertEqual(data["restart_restore"], "PASS")
            self.assertTrue(data["contextless_resume"])
            self.assertGreaterEqual(data["duplicate_suppressed_count"], 1)
            self.assertEqual(data["pending_action_ids"], [])
            self.assertTrue({"click","input","scroll","navigation","wait"}.issubset(data["action_types"]))


if __name__ == "__main__":
    unittest.main()
