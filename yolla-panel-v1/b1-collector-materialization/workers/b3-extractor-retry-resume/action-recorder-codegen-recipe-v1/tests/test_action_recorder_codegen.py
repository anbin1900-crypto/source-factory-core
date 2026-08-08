from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from core import (
    ActionValidationError,
    LocatorGenerationError,
    LocatorGenerator,
    stable_hash,
    validate_recipe,
)
from recorder_codegen import ActionRecorder, PlaywrightCodegen
from replay import RecipeReplayer, SyntheticBrowser


class ActionRecorderCodegenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((ROOT / "fixtures/action_recording_fixture_v1.json").read_text(encoding="utf-8"))

    def build_recorder(self):
        f = self.fixture
        recorder = ActionRecorder(session_id=f["session_id"], start_url=f["start_url"])
        recorder.record("input", target=f["recording_targets"]["keyword"], value="apartment")
        recorder.record("select", target=f["recording_targets"]["region"], value="seoul")
        recorder.record("click", target=f["recording_targets"]["search_button_stale"])
        recorder.record("scroll", value={"x": 0, "y": 850})
        recorder.record("popup", target=f["recording_targets"]["details"], metadata={"popup_alias": "detailPage"})
        recorder.record("frame", target=f["recording_targets"]["frame"], metadata={"operation":"enter", "frame_alias":"resultFrame"})
        recorder.record("navigation", url="https://fixture.local/details/1")
        recorder.record("frame", target=f["recording_targets"]["frame"], metadata={"operation":"exit", "frame_alias":"resultFrame"})
        return recorder

    def recipe(self):
        return self.build_recorder().compile_recipe(
            recipe_id="fixture-recipe-001",
            extraction={"mode":"DOM", "fields":[{"name":"title","locator":{"strategy":"css","value":"h1","score":40,"metadata":{}}}]},
            variables={"keyword":"apartment"},
        )

    def test_01_test_id_priority(self):
        self.assertEqual(LocatorGenerator.best(self.fixture["recording_targets"]["keyword"])["strategy"], "test_id")

    def test_02_role_candidate_present(self):
        self.assertIn("role", [c.strategy for c in LocatorGenerator.candidates(self.fixture["recording_targets"]["keyword"])])

    def test_03_label_candidate_present(self):
        self.assertIn("label", [c.strategy for c in LocatorGenerator.candidates(self.fixture["recording_targets"]["keyword"])])

    def test_04_placeholder_candidate_present(self):
        self.assertIn("placeholder", [c.strategy for c in LocatorGenerator.candidates(self.fixture["recording_targets"]["keyword"])])

    def test_05_id_candidate_present(self):
        self.assertIn("id", [c.strategy for c in LocatorGenerator.candidates(self.fixture["recording_targets"]["keyword"])])

    def test_06_css_candidate_present(self):
        self.assertIn("css", [c.strategy for c in LocatorGenerator.candidates(self.fixture["recording_targets"]["keyword"])])

    def test_07_no_locator_rejected(self):
        with self.assertRaises(LocatorGenerationError): LocatorGenerator.best({"tag":"div"})

    def test_08_playwright_test_id_expression(self):
        self.assertEqual(LocatorGenerator.playwright_expression({"strategy":"test_id","value":"x","metadata":{}}), 'page.getByTestId("x")')

    def test_09_playwright_role_expression(self):
        expr = LocatorGenerator.playwright_expression({"strategy":"role","value":"button","metadata":{"name":"Go","exact":True}})
        self.assertIn('getByRole("button"', expr); self.assertIn('name: "Go"', expr)

    def test_10_record_all_required_action_types(self):
        self.assertEqual({s["action_type"] for s in self.build_recorder().steps}, ActionRecorder.ACTION_TYPES)

    def test_11_step_ids_deterministic(self):
        self.assertEqual([s["step_id"] for s in self.build_recorder().steps], [f"step-{i:04d}" for i in range(1,9)])

    def test_12_input_requires_value(self):
        with self.assertRaises(ActionValidationError): ActionRecorder(session_id="s", start_url="u").record("input", target=self.fixture["recording_targets"]["keyword"])

    def test_13_scroll_requires_xy(self):
        with self.assertRaises(ActionValidationError): ActionRecorder(session_id="s", start_url="u").record("scroll", value="bad")

    def test_14_navigation_requires_url(self):
        with self.assertRaises(ActionValidationError): ActionRecorder(session_id="s", start_url="u").record("navigation")

    def test_15_exit_empty_frame_rejected(self):
        with self.assertRaises(ActionValidationError): ActionRecorder(session_id="s", start_url="u").record("frame", target=self.fixture["recording_targets"]["frame"], metadata={"operation":"exit"})

    def test_16_popup_changes_page_alias(self):
        steps = self.build_recorder().steps
        self.assertEqual(steps[4]["metadata"]["popup_alias"], "detailPage")
        self.assertEqual(steps[5]["page_alias"], "detailPage")

    def test_17_frame_path_bound_to_navigation(self):
        steps = self.build_recorder().steps
        self.assertEqual(steps[6]["frame_path"], ["resultFrame"])

    def test_18_update_step_value(self):
        recorder = self.build_recorder(); recorder.update_step("step-0001", {"value":"office"})
        self.assertEqual(recorder.steps[0]["value"], "office")

    def test_19_identity_patch_rejected(self):
        with self.assertRaises(ActionValidationError): self.build_recorder().update_step("step-0001", {"sequence":99})

    def test_20_move_step_renumbers(self):
        recorder = self.build_recorder(); recorder.move_step("step-0004", 0)
        self.assertEqual([s["sequence"] for s in recorder.steps], list(range(1,9)))
        self.assertEqual(recorder.steps[0]["step_id"], "step-0004")

    def test_21_remove_step(self):
        recorder = self.build_recorder(); removed = recorder.remove_step("step-0004")
        self.assertEqual(removed["action_type"], "scroll"); self.assertEqual(len(recorder.steps), 7)

    def test_22_disabled_step_excluded(self):
        recorder = self.build_recorder(); recorder.update_step("step-0004", {"enabled":False})
        self.assertEqual(len(recorder.compile_recipe(recipe_id="x")["steps"]), 7)

    def test_23_recipe_hash_valid(self):
        self.assertTrue(validate_recipe(self.recipe(), ActionRecorder.ACTION_TYPES, ActionRecorder.TARGET_REQUIRED))

    def test_24_recipe_hash_tamper_rejected(self):
        recipe = self.recipe(); recipe["steps"][0]["value"] = "tampered"
        with self.assertRaises(ActionValidationError): validate_recipe(recipe, ActionRecorder.ACTION_TYPES, ActionRecorder.TARGET_REQUIRED)

    def test_25_recipe_is_deterministic(self):
        self.assertEqual(self.recipe()["recipe_hash"], self.recipe()["recipe_hash"])

    def test_26_codegen_contains_input(self):
        self.assertIn('.fill("apartment")', PlaywrightCodegen.generate_typescript(self.recipe()))

    def test_27_codegen_contains_select(self):
        self.assertIn('.selectOption("seoul")', PlaywrightCodegen.generate_typescript(self.recipe()))

    def test_28_codegen_contains_scroll(self):
        self.assertIn('window.scrollTo(0, 850)', PlaywrightCodegen.generate_typescript(self.recipe()))

    def test_29_codegen_contains_popup_wait(self):
        code = PlaywrightCodegen.generate_typescript(self.recipe())
        self.assertIn("context.waitForEvent('page')", code); self.assertIn('const [detailPage]', code)

    def test_30_codegen_contains_navigation(self):
        self.assertIn('goto("https://fixture.local/details/1"', PlaywrightCodegen.generate_typescript(self.recipe()))

    def test_31_replay_without_repair_fails_on_stale_locator(self):
        result = RecipeReplayer(auto_repair=False).replay(self.recipe(), SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"]))
        self.assertEqual(result["status"], "FAILED"); self.assertEqual(result["failed_step_id"], "step-0003")

    def test_32_replay_auto_repairs_stale_locator(self):
        result = RecipeReplayer(auto_repair=True).replay(self.recipe(), SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"]))
        self.assertEqual(result["status"], "PASS"); self.assertEqual(result["repair_count"], 1)

    def test_33_repair_chooses_new_test_id(self):
        result = RecipeReplayer(auto_repair=True).replay(self.recipe(), SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"]))
        self.assertEqual(result["repairs"][0]["new_locator"]["value"], "search-submit-new")

    def test_34_replay_trace_has_all_steps(self):
        result = RecipeReplayer(auto_repair=True).replay(self.recipe(), SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"]))
        self.assertEqual(len(result["trace"]), 8)

    def test_35_replay_values_applied(self):
        browser = SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"])
        RecipeReplayer(auto_repair=True).replay(self.recipe(), browser)
        self.assertEqual(browser.values["keyword"], "apartment"); self.assertEqual(browser.values["region"], "seoul")

    def test_36_replay_scroll_applied(self):
        browser = SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"])
        RecipeReplayer(auto_repair=True).replay(self.recipe(), browser)
        self.assertEqual(browser.scroll, {"x":0,"y":850})

    def test_37_popup_page_registered(self):
        browser = SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"])
        RecipeReplayer(auto_repair=True).replay(self.recipe(), browser)
        self.assertIn("detailPage", browser.pages)

    def test_38_frame_stack_balanced(self):
        browser = SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"])
        RecipeReplayer(auto_repair=True).replay(self.recipe(), browser)
        self.assertEqual(browser.frames, [])

    def test_39_repaired_recipe_hash_valid(self):
        result = RecipeReplayer(auto_repair=True).replay(self.recipe(), SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"]))
        self.assertTrue(validate_recipe(result["recipe"], ActionRecorder.ACTION_TYPES, ActionRecorder.TARGET_REQUIRED))

    def test_40_replay_deterministic(self):
        first = RecipeReplayer(auto_repair=True).replay(self.recipe(), SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"]))
        second = RecipeReplayer(auto_repair=True).replay(self.recipe(), SyntheticBrowser(elements=self.fixture["elements"], start_url=self.fixture["start_url"]))
        self.assertEqual(first["repaired_recipe_hash"], second["repaired_recipe_hash"]); self.assertEqual(first["trace"], second["trace"])

    def test_41_unknown_step_rejected(self):
        with self.assertRaises(ActionValidationError): self.build_recorder().update_step("missing", {"value":"x"})

    def test_42_empty_recipe_rejected(self):
        with self.assertRaises(ActionValidationError): ActionRecorder(session_id="s", start_url="u").compile_recipe(recipe_id="x")

    def test_43_target_signature_stable(self):
        self.assertEqual(self.build_recorder().steps[0]["target_signature"], self.build_recorder().steps[0]["target_signature"])

    def test_44_stable_hash_key_order(self):
        self.assertEqual(stable_hash({"a":1,"b":2}), stable_hash({"b":2,"a":1}))


if __name__ == "__main__":
    unittest.main(verbosity=2)
