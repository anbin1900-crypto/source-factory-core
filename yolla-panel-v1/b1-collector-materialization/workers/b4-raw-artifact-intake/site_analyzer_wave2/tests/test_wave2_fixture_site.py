from __future__ import annotations

import json
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fixture_site.adapter import FixtureAdapter  # noqa: E402
from fixture_site.server import ITEMS, start_in_thread  # noqa: E402


class Wave2FixtureSiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server, cls.thread, cls.base_url = start_in_thread()
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.workdir = Path(cls.tempdir.name)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        cls.tempdir.cleanup()

    def new_adapter(self, name: str) -> FixtureAdapter:
        return FixtureAdapter(self.base_url, self.workdir / name)

    def test_01_health_and_record_count(self) -> None:
        with urllib.request.urlopen(self.base_url + "/health") as response:
            payload = json.load(response)
        self.assertEqual(payload, {"record_count": 10, "status": "ok"})
        self.assertEqual(len(ITEMS), 10)

    def test_02_list_page_pagination(self) -> None:
        adapter = self.new_adapter("list")
        records = adapter.extract_list_records()
        self.assertEqual(len(records), 10)
        self.assertEqual([r.id for r in records], list(range(1, 11)))

    def test_03_failure_then_resume(self) -> None:
        adapter = self.new_adapter("resume")
        with self.assertRaisesRegex(RuntimeError, "INJECTED_FAILURE_AFTER_PAGE_1"):
            adapter.extract_list_records(inject_failure_after_page_1=True)
        resumed = adapter.extract_list_records(inject_failure_after_page_1=False)
        self.assertEqual(len(resumed), 10)
        state = json.loads(adapter.state_path.read_text(encoding="utf-8"))
        self.assertTrue(state["completed"])

    def test_04_detail_route(self) -> None:
        result = self.new_adapter("detail").exercise_detail()
        self.assertEqual(result, {"id": 3, "name": "Fixture Item 03", "category": "odd", "value": 300})

    def test_05_api_retry(self) -> None:
        result = self.new_adapter("api").exercise_api_retry("test-api")
        self.assertEqual(len(result["records"]), 10)
        self.assertEqual(result["attempts"], 3)

    def test_06_load_more(self) -> None:
        self.assertEqual(self.new_adapter("load-more").exercise_load_more(), 10)

    def test_07_infinite_scroll(self) -> None:
        self.assertEqual(self.new_adapter("infinite").exercise_infinite_scroll(), 10)

    def test_08_iframe(self) -> None:
        self.assertEqual(self.new_adapter("frame").exercise_frame(), {"id": 7, "text": "Fixture Item 07"})

    def test_09_popup(self) -> None:
        self.assertEqual(self.new_adapter("popup").exercise_popup(), {"id": 8, "text": "Fixture Item 08"})

    def test_10_download(self) -> None:
        result = self.new_adapter("download").exercise_download()
        self.assertEqual(result["row_count"], 10)
        self.assertEqual(len(result["sha256"]), 64)
        self.assertTrue(Path(result["path"]).exists())

    def test_11_schema_drift(self) -> None:
        result = self.new_adapter("drift").exercise_schema_drift()
        self.assertTrue(result["drift_detected"])
        self.assertEqual(result["keys_v1"], ["id", "name", "value"])
        self.assertEqual(result["keys_v2"], ["amount", "extra", "recordId", "title"])

    def test_12_full_run_exactly_ten(self) -> None:
        receipt = self.new_adapter("full").run_all(inject_failure=True)
        self.assertEqual(receipt["record_count"], 10)
        self.assertEqual(receipt["resume_after_failure"], "PASS")
        self.assertEqual(receipt["load_more_count"], 10)
        self.assertEqual(receipt["infinite_scroll_count"], 10)
        self.assertEqual(receipt["download"]["row_count"], 10)
        self.assertTrue(receipt["schema_drift"]["drift_detected"])
        self.assertGreaterEqual(receipt["network_event_count"], 20)

    def test_13_stable_ids_unique(self) -> None:
        self.assertEqual(len({item.id for item in ITEMS}), 10)

    def test_14_recipe_contract(self) -> None:
        recipe = json.loads((ROOT / "recipes" / "B4_COMMON_FIXTURE_EDGE_RECIPE_V1.json").read_text(encoding="utf-8"))
        self.assertEqual(recipe["expected"]["record_count"], 10)
        self.assertEqual(len(recipe["steps"]), 12)


if __name__ == "__main__":
    unittest.main(verbosity=2)
