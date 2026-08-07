import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "representative_state_coverage_plan_v6.py"
INPUT = ROOT.parent / "user-journey-state-machine-v5" / "generated" / "USER_JOURNEY_STATE_MACHINE_V1.json"
SPEC = importlib.util.spec_from_file_location("planner", SOURCE)
MOD = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MOD)

class CoveragePlanV6Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads(INPUT.read_text(encoding="utf-8"))

    def planner(self):
        return MOD.RepresentativeCoveragePlanner(self.fixture)

    def test_flow_coverage_four(self):
        p = self.planner().materialize_coverage_plan()
        self.assertEqual([s["flow"] for s in p["scenarios"]], ["PUBLIC_READ","CREATE","MY_LISTING","EDIT"])

    def test_representative_transition_count_seven(self):
        p = self.planner().materialize_coverage_plan()
        self.assertEqual(sum(len(s["steps"]) for s in p["scenarios"]), 7)

    def test_filter_equivalence_is_deduped(self):
        p = self.planner().materialize_coverage_plan()
        self.assertEqual(p["suppressed_equivalent_action_count"], 1)
        self.assertEqual(p["scenarios"][0]["steps"][0]["action_id"], "act-search-filter-seoul")

    def test_unknown_paths_preserved(self):
        p = self.planner().materialize_coverage_plan()
        self.assertEqual(len(p["unknown_unobserved_paths"]), 2)
        self.assertTrue(all(x["status"] == "UNKNOWN_UNOBSERVED" for x in p["unknown_unobserved_paths"]))

    def test_expected_evidence_has_state_api_entity(self):
        p = self.planner().materialize_coverage_plan()
        for s in p["scenarios"]:
            for step in s["steps"]:
                self.assertEqual(set(step["expected_evidence"]), {"state","api","entity"})
                self.assertEqual(step["expected_evidence"]["api"]["status"], "UNKNOWN_UNOBSERVED")
                self.assertEqual(step["expected_evidence"]["entity"]["status"], "UNKNOWN_UNOBSERVED")

    def test_public_read_path(self):
        s = self.planner().materialize_live_scenario_set()["scenarios"][0]
        self.assertEqual([x["postcondition"]["ui_state"] for x in s["steps"]], ["SEARCH_FILTERED","LIST_VISIBLE","DETAIL_VISIBLE"])

    def test_create_path(self):
        s = self.planner().materialize_live_scenario_set()["scenarios"][1]
        self.assertEqual([x["postcondition"]["ui_state"] for x in s["steps"]], ["CREATE_FILLED","MYLISTING_VISIBLE"])

    def test_my_listing_depends_on_create(self):
        s = self.planner().materialize_live_scenario_set()["scenarios"][2]
        self.assertEqual(s["depends_on_flows"], ["CREATE"])
        self.assertEqual(s["precondition"]["ui_state"], "MYLISTING_VISIBLE")

    def test_edit_depends_on_my_listing(self):
        s = self.planner().materialize_live_scenario_set()["scenarios"][3]
        self.assertEqual(s["depends_on_flows"], ["MY_LISTING"])
        self.assertEqual(s["precondition"]["ui_state"], "EDIT_VISIBLE")

    def test_execution_is_not_authorized_this_cycle(self):
        self.assertFalse(self.planner().materialize_live_scenario_set()["execution_authorized_this_cycle"])

    def test_invalid_unknown_path_fails_closed(self):
        fixture = copy.deepcopy(self.fixture)
        fixture["unobserved_paths"][0]["status"] = "OBSERVED"
        with self.assertRaises(MOD.CoveragePlanError):
            MOD.RepresentativeCoveragePlanner(fixture)

    def test_done_when_passes(self):
        result = self.planner().validate_done_when()
        self.assertTrue(result["pass"])
        self.assertEqual(result["scenario_count"], 4)
        self.assertEqual(result["unique_representative_transition_count"], 7)
        self.assertFalse(result["live_site_execution_authorized"])

if __name__ == "__main__":
    unittest.main(verbosity=2)
