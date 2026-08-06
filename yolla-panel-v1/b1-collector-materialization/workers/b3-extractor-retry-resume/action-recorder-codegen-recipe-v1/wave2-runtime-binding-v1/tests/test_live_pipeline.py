from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from live_recorder_pipeline import LiveActionRecorder, hash_json


class LivePipelineContractTests(unittest.TestCase):
    def test_01_test_id_locator_priority(self):
        locator = LiveActionRecorder.locator_for({'test_id':'x','id':'y'})
        self.assertEqual((locator.strategy, locator.value), ('test_id','x'))

    def test_02_aria_label_fallback(self):
        locator = LiveActionRecorder.locator_for({'aria_label':'Search'})
        self.assertEqual((locator.strategy, locator.value), ('aria_label','Search'))

    def test_03_css_id_fallback(self):
        locator = LiveActionRecorder.locator_for({'id':'search'})
        self.assertEqual((locator.strategy, locator.value), ('css','#search'))

    def test_04_empty_target_rejected(self):
        with self.assertRaises(ValueError): LiveActionRecorder.locator_for({})

    def test_05_result_exists(self):
        self.assertTrue((ROOT/'generated/B3_WAVE2_LIVE_EXECUTION_RESULT_V1.json').exists())

    def test_06_http_transport_blocker_proven(self):
        result=json.loads((ROOT/'generated/B3_WAVE2_LIVE_EXECUTION_RESULT_V1.json').read_text())
        self.assertFalse(result['actual_http_runtime'])
        self.assertEqual(result['http_transport_blocker']['status'],'PROVEN_ENVIRONMENT_BLOCKER')

    def test_07_actual_browser_actions(self):
        result=json.loads((ROOT/'generated/B3_WAVE2_LIVE_EXECUTION_RESULT_V1.json').read_text())
        self.assertTrue(result['actual_browser_actions'])

    def test_08_actual_chromium_runtime(self):
        result=json.loads((ROOT/'generated/B3_WAVE2_LIVE_EXECUTION_RESULT_V1.json').read_text())
        self.assertTrue(result['actual_chromium_runtime'])

    def test_09_five_or_more_actions(self):
        result=json.loads((ROOT/'generated/B3_WAVE2_LIVE_EXECUTION_RESULT_V1.json').read_text())
        self.assertGreaterEqual(result['compiled_action_count'],5)

    def test_10_replay_pass(self):
        result=json.loads((ROOT/'generated/B3_WAVE2_LIVE_EXECUTION_RESULT_V1.json').read_text())
        self.assertEqual(result['replay']['status'],'PASS')

    def test_11_search_assertion(self):
        result=json.loads((ROOT/'generated/B3_WAVE2_LIVE_EXECUTION_RESULT_V1.json').read_text())
        self.assertEqual(result['replay']['assertions']['search_status'],'searched:apartment')

    def test_12_popup_assertion(self):
        result=json.loads((ROOT/'generated/B3_WAVE2_LIVE_EXECUTION_RESULT_V1.json').read_text())
        self.assertTrue(result['replay']['assertions']['popup_opened'])

    def test_13_frame_assertion(self):
        result=json.loads((ROOT/'generated/B3_WAVE2_LIVE_EXECUTION_RESULT_V1.json').read_text())
        self.assertEqual(result['replay']['assertions']['frame_status'],'loaded')

    def test_14_recipe_hash_exact(self):
        recipe=json.loads((ROOT/'generated/B3_LIVE_EXTRACTION_RECIPE_V2.json').read_text())
        value=dict(recipe); digest=value.pop('recipe_hash')
        self.assertEqual(digest,hash_json(value))

    def test_15_a6_handoff(self):
        handoff=json.loads((ROOT/'handoffs/B3_TO_A6_LIVE_RECIPE_HANDOFF_V1.json').read_text())
        self.assertEqual(handoff['consumer_pr'],25)
        self.assertEqual(handoff['replay_status'],'PASS')

    def test_16_production_false(self):
        handoff=json.loads((ROOT/'handoffs/B3_TO_A6_LIVE_RECIPE_HANDOFF_V1.json').read_text())
        self.assertFalse(handoff['production'])


if __name__ == '__main__': unittest.main(verbosity=2)
