from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
HARNESS = ROOT / "fixtures" / "harness" / "inline_harness.html"
sys.path.insert(0, str(SRC))

from browser_edge_runtime import AtomicCheckpointStore, BrowserEdgeRuntime, InjectedInterruption
from playwright_browser_driver import PlaywrightBrowserDriver


class PlaywrightHarnessTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
        cls.content = HARNESS.read_text(encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def setUp(self):
        self.context = self.browser.new_context(accept_downloads=True)
        self.page = self.context.new_page()
        self.page.set_content(self.content, wait_until="domcontentloaded")
        self.temp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.context.close()
        self.temp.cleanup()

    def runtime(self):
        return BrowserEdgeRuntime(
            PlaywrightBrowserDriver(self.page),
            AtomicCheckpointStore(Path(self.temp.name) / "checkpoint.json"),
            Path(self.temp.name) / "downloads",
        )

    def test_24_popup_real_chromium(self):
        receipt = self.runtime().run({"recipe_id":"popup","steps":[{"type":"popup","selector":"#popup"}]})
        self.assertEqual("PASS", receipt.status)
        self.assertEqual(1, receipt.completed_steps)

    def test_25_new_tab_real_chromium(self):
        receipt = self.runtime().run({"recipe_id":"tab","steps":[{"type":"new_tab","selector":"#newtab"}]})
        self.assertEqual("PASS", receipt.status)

    def test_26_frame_extract_real_chromium(self):
        recipe={"recipe_id":"frame","steps":[
            {"type":"frame","selector":"#data-frame"},
            {"type":"extract","item_selector":".frame-record","fields":{"id":{"selector":".id"},"value":".value"}}
        ]}
        receipt=self.runtime().run(recipe)
        self.assertEqual(["frame-1"],[r["id"] for r in receipt.records])

    def test_27_download_real_chromium(self):
        receipt=self.runtime().run({"recipe_id":"download","steps":[{"type":"download","selector":"#download"}]})
        self.assertEqual(1,len(receipt.downloads))
        self.assertGreater(receipt.downloads[0]["size_bytes"],0)

    def test_28_load_more_real_chromium(self):
        recipe={"recipe_id":"load","steps":[{"type":"load_more","selector":"#load-more","item_selector":".record","fields":{"id":{"selector":".id"},"value":".value"},"max_rounds":4}]}
        receipt=self.runtime().run(recipe)
        self.assertEqual(["r1","r2","r3"],[r["id"] for r in receipt.records])

    def test_29_infinite_scroll_real_chromium(self):
        recipe={"recipe_id":"scroll","steps":[{"type":"infinite_scroll","item_selector":".record","fields":{"id":{"selector":".id"},"value":".value"},"max_rounds":5,"stable_rounds":2}]}
        receipt=self.runtime().run(recipe)
        self.assertIn("scroll-1",[r["id"] for r in receipt.records])

    def test_30_page_pagination_real_chromium(self):
        recipe={"recipe_id":"pages","steps":[{"type":"page_pagination","item_selector":".record","fields":{"id":{"selector":".id"},"value":".value"},"next_selector":"#next","start_page":1,"max_pages":3}]}
        receipt=self.runtime().run(recipe)
        self.assertEqual(["r1","r2","r3"],[r["id"] for r in receipt.records])

    def test_31_interruption_resume_real_chromium(self):
        recipe={"recipe_id":"resume-browser","steps":[{"type":"page_pagination","item_selector":".record","fields":{"id":{"selector":".id"},"value":".value"},"next_selector":"#next","start_page":1,"max_pages":3}]}
        runtime=self.runtime()
        with self.assertRaises(InjectedInterruption):
            runtime.run(recipe, interrupt_after_records=1)
        self.page = self.context.new_page()
        self.page.set_content(self.content, wait_until="domcontentloaded")
        resumed=BrowserEdgeRuntime(PlaywrightBrowserDriver(self.page), runtime.checkpoint_store, Path(self.temp.name)/"downloads").run(recipe)
        self.assertTrue(resumed.resume_used)
        self.assertEqual(["r1","r2","r3"],[r["id"] for r in resumed.records])


if __name__ == "__main__":
    unittest.main()
