from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from browser_edge_runtime import (
    AtomicCheckpointStore,
    BrowserEdgeRuntime,
    DownloadReceipt,
    InjectedInterruption,
    NonRetryableExtractionError,
    RetryableExtractionError,
    hash_file,
)


class FakeDriver:
    def __init__(self):
        self.events = []
        self.current_page = 1
        self.load_more_round = 0
        self.scroll_round = 0
        self.retry_failures = {}
        self.page_records = {
            1: [{"id": "p1-1", "value": "a"}, {"id": "p1-2", "value": "b"}],
            2: [{"id": "p1-2", "value": "b"}, {"id": "p2-1", "value": "c"}],
        }
        self.cursor_pages = {
            None: ([{"id": "c1"}], "next"),
            "next": ([{"id": "c2"}], None),
        }

    def _maybe_fail(self, label):
        remaining = self.retry_failures.get(label, 0)
        if remaining:
            self.retry_failures[label] = remaining - 1
            raise RetryableExtractionError(label)

    def navigate(self, url):
        self._maybe_fail("navigate")
        self.events.append(("navigate", url))

    def open_popup(self, selector): self.events.append(("popup", selector))
    def open_new_tab(self, selector): self.events.append(("new_tab", selector))
    def enter_frame(self, selector): self.events.append(("frame", selector))

    def capture_download(self, selector, destination_dir):
        destination_dir.mkdir(parents=True, exist_ok=True)
        path = destination_dir / "sample.csv"
        path.write_bytes(b"id,name\n1,alpha\n")
        return DownloadReceipt(str(path), sha256(path.read_bytes()).hexdigest(), path.stat().st_size, "sample.csv")

    def extract_records(self, extraction):
        mode = extraction.get("mode")
        if mode == "load_more":
            return [[{"id": "l1"}], [{"id": "l1"}, {"id": "l2"}], [{"id": "l1"}, {"id": "l2"}]][min(self.load_more_round, 2)]
        if mode == "scroll":
            return [[{"id": "s1"}], [{"id": "s1"}, {"id": "s2"}], [{"id": "s1"}, {"id": "s2"}]][min(self.scroll_round, 2)]
        if mode == "page":
            return self.page_records.get(self.current_page, [])
        if mode == "missing_id":
            return [{"value": "bad"}]
        return extraction.get("records", [{"id": "e1"}])

    def click_load_more(self, selector):
        self.load_more_round += 1
        return self.load_more_round < 3

    def scroll_once(self):
        self.scroll_round += 1
        return self.scroll_round < 3

    def goto_page(self, page_number, step):
        if page_number not in self.page_records:
            return False
        self.current_page = page_number
        return True

    def fetch_cursor(self, cursor, step): return self.cursor_pages[cursor]

    def restore(self, step_state):
        if "page" in step_state:
            self.current_page = int(step_state["page"])


class RuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.driver = FakeDriver()
        self.store = AtomicCheckpointStore(self.root / "checkpoint.json")
        self.runtime = BrowserEdgeRuntime(self.driver, self.store, self.root / "downloads")

    def tearDown(self): self.temp.cleanup()

    def run_recipe(self, steps, **kwargs):
        return self.runtime.run({"recipe_id": "test", "steps": steps}, **kwargs)

    def test_01_popup(self):
        self.run_recipe([{"type": "popup", "selector": "#open"}])
        self.assertIn(("popup", "#open"), self.driver.events)

    def test_02_new_tab(self):
        self.run_recipe([{"type": "new_tab", "selector": "#tab"}])
        self.assertIn(("new_tab", "#tab"), self.driver.events)

    def test_03_frame(self):
        self.run_recipe([{"type": "frame", "selector": "iframe"}])
        self.assertIn(("frame", "iframe"), self.driver.events)

    def test_04_download_capture_and_hash(self):
        receipt = self.run_recipe([{"type": "download", "selector": "#csv"}])
        self.assertEqual(1, len(receipt.downloads))
        self.assertEqual(receipt.downloads[0]["sha256"], hash_file(receipt.downloads[0]["path"]))

    def test_05_load_more(self):
        receipt = self.run_recipe([{"type": "load_more", "selector": "#more", "mode": "load_more"}])
        self.assertEqual(["l1", "l2"], [r["id"] for r in receipt.records])

    def test_06_infinite_scroll_stable_stop(self):
        receipt = self.run_recipe([{"type": "infinite_scroll", "mode": "scroll", "stable_rounds": 1}])
        self.assertEqual(["s1", "s2"], [r["id"] for r in receipt.records])

    def test_07_page_pagination_and_dedup(self):
        receipt = self.run_recipe([{"type": "page_pagination", "mode": "page", "max_pages": 4}])
        self.assertEqual(["p1-1", "p1-2", "p2-1"], [r["id"] for r in receipt.records])

    def test_08_cursor_pagination(self):
        receipt = self.run_recipe([{"type": "cursor_pagination", "max_pages": 3}])
        self.assertEqual(["c1", "c2"], [r["id"] for r in receipt.records])

    def test_09_retry_success(self):
        self.driver.retry_failures["navigate"] = 1
        receipt = self.run_recipe([{"type": "navigate", "url": "https://example.test"}])
        self.assertEqual(1, receipt.retry_count)

    def test_10_retry_exhaustion(self):
        self.driver.retry_failures["navigate"] = 4
        with self.assertRaises(RetryableExtractionError):
            self.run_recipe([{"type": "navigate", "url": "https://example.test"}])

    def test_11_resume_after_interruption(self):
        recipe = {"recipe_id": "resume", "steps": [{"type": "page_pagination", "mode": "page", "max_pages": 4}]}
        with self.assertRaises(InjectedInterruption):
            self.runtime.run(recipe, interrupt_after_records=2)
        receipt = self.runtime.run(recipe)
        self.assertTrue(receipt.resume_used)
        self.assertEqual(["p1-1", "p1-2", "p2-1"], [r["id"] for r in receipt.records])

    def test_12_checkpoint_is_valid_json(self):
        self.run_recipe([{"type": "extract", "records": [{"id": "x"}]}])
        self.assertEqual("PASS", json.loads(self.store.path.read_text())["status"])
        self.assertFalse(self.store.path.with_suffix(".json.tmp").exists())

    def test_13_max_records_cap(self):
        receipt = self.run_recipe([{"type": "page_pagination", "mode": "page", "max_pages": 4}], max_records=2)
        self.assertEqual(2, receipt.record_count)

    def test_14_invalid_max_records_rejected(self):
        with self.assertRaises(ValueError):
            self.run_recipe([{"type": "extract", "records": [{"id": "x"}]}], max_records=21)

    def test_15_missing_identity_fails_closed(self):
        with self.assertRaises(NonRetryableExtractionError):
            self.run_recipe([{"type": "extract", "mode": "missing_id"}])

    def test_16_unsupported_step_rejected(self):
        with self.assertRaises(ValueError):
            self.run_recipe([{"type": "unknown"}])

    def test_17_empty_recipe_rejected(self):
        with self.assertRaises(ValueError):
            self.runtime.run({"recipe_id": "empty", "steps": []})

    def test_18_trace_contains_accept_and_complete(self):
        receipt = self.run_recipe([{"type": "extract", "records": [{"id": "x"}]}])
        events = [entry["event"] for entry in receipt.trace]
        self.assertIn("RECORD_ACCEPTED", events)
        self.assertIn("STEP_COMPLETE", events)

    def test_19_download_receipt_size_nonzero(self):
        receipt = self.run_recipe([{"type": "download", "selector": "#csv"}])
        self.assertGreater(receipt.downloads[0]["size_bytes"], 0)

    def test_20_record_limit_contract_is_one_to_twenty(self):
        receipt = self.run_recipe([{"type": "extract", "records": [{"id": str(i)} for i in range(25)]}], max_records=20)
        self.assertEqual(20, receipt.record_count)


class FixtureContractTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1]

    def test_21_real_sample_count(self):
        data = json.loads((self.root / "fixtures" / "real_sample_quotes_page1.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(data["records"]), 1)
        self.assertLessEqual(len(data["records"]), 20)
        self.assertEqual(3, len({item["id"] for item in data["records"]}))

    def test_22_recipe_has_required_edge_steps(self):
        recipe = json.loads((self.root / "recipes" / "browser-edge-workflow-recipe.json").read_text(encoding="utf-8"))
        step_types = {step["type"] for step in recipe["steps"]}
        required = {"popup", "new_tab", "frame", "download", "load_more", "infinite_scroll", "page_pagination", "cursor_pagination"}
        self.assertTrue(required.issubset(step_types))

    def test_23_actual_recipe_uses_page_pagination(self):
        recipe = json.loads((self.root / "recipes" / "quotes-real-sample-recipe.json").read_text(encoding="utf-8"))
        self.assertEqual("page_pagination", recipe["steps"][1]["type"])
        self.assertEqual(3, recipe["max_records"])


if __name__ == "__main__":
    unittest.main()
