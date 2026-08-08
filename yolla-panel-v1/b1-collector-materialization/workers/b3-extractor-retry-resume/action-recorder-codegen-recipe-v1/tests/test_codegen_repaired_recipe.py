from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from recorder_codegen import ActionRecorder, PlaywrightCodegen
from replay import RecipeReplayer, SyntheticBrowser


class RepairedRecipeCodegenTest(unittest.TestCase):
    def test_codegen_uses_repaired_locator_after_replay(self):
        fixture = json.loads((ROOT / "fixtures/action_recording_fixture_v1.json").read_text(encoding="utf-8"))
        recorder = ActionRecorder(session_id=fixture["session_id"], start_url=fixture["start_url"])
        recorder.record("input", target=fixture["recording_targets"]["keyword"], value="apartment")
        recorder.record("select", target=fixture["recording_targets"]["region"], value="seoul")
        recorder.record("click", target=fixture["recording_targets"]["search_button_stale"])
        recipe = recorder.compile_recipe(recipe_id="repair-codegen-test")
        repaired = RecipeReplayer(auto_repair=True).replay(
            recipe,
            SyntheticBrowser(elements=fixture["elements"], start_url=fixture["start_url"]),
        )
        code = PlaywrightCodegen.generate_typescript(repaired["recipe"])
        self.assertEqual(repaired["status"], "PASS")
        self.assertIn('getByTestId("search-submit-new")', code)
        self.assertNotIn('getByTestId("search-submit-old")', code)


if __name__ == "__main__":
    unittest.main(verbosity=2)
