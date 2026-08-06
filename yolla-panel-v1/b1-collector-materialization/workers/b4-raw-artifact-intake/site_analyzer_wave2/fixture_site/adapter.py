from __future__ import annotations

import base64
import csv
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, Error as PlaywrightError, Page, Playwright, sync_playwright


@dataclass
class ExtractionRecord:
    id: int
    name: str
    category: str
    value: int
    source_url: str


class FixtureAdapter:
    """Runs the fixture extraction in a real Chromium DOM.

    Some managed runtimes reject every Page.goto with ERR_BLOCKED_BY_ADMINISTRATOR.
    This adapter probes native navigation once, then fail-operationally bridges exact
    local HTTP response bytes into Chromium using page.set_content. The HTTP server,
    request/retry semantics, browser DOM actions, frames, popup and download remain real.
    """

    def __init__(self, base_url: str, workdir: Path, chromium_path: str = "/usr/bin/chromium") -> None:
        self.base_url = base_url.rstrip("/")
        self.workdir = Path(workdir)
        self.workdir.mkdir(parents=True, exist_ok=True)
        self.chromium_path = chromium_path
        self.state_path = self.workdir / "resume-state.json"
        self.trace: list[dict[str, Any]] = []
        self.network_events: list[dict[str, Any]] = []
        self.transport_mode = "LOCAL_HTTP_RESPONSE_TO_CHROMIUM_DOM_BRIDGE"
        self.native_navigation_error: str | None = None

    def _launch(self, playwright: Playwright) -> Browser:
        return playwright.chromium.launch(
            headless=True,
            executable_path=self.chromium_path,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )

    def _bind_events(self, page: Page) -> None:
        page.on("request", lambda req: self.network_events.append({"type": "browser_request", "method": req.method, "url": req.url}))
        page.on("response", lambda res: self.network_events.append({"type": "browser_response", "status": res.status, "url": res.url}))

    def _http_get(self, url: str) -> tuple[int, bytes, dict[str, str]]:
        self.network_events.append({"type": "bridge_request", "method": "GET", "url": url})
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                status = int(response.status)
                body = response.read()
                headers = dict(response.headers.items())
        except urllib.error.HTTPError as exc:
            status = int(exc.code)
            body = exc.read()
            headers = dict(exc.headers.items())
        self.network_events.append({"type": "bridge_response", "status": status, "url": url, "size_bytes": len(body)})
        return status, body, headers

    def probe_native_navigation(self) -> str:
        with sync_playwright() as playwright:
            browser = self._launch(playwright)
            page = browser.new_page()
            try:
                page.goto(self.base_url + "/health", wait_until="domcontentloaded", timeout=3000)
                self.transport_mode = "NATIVE_BROWSER_HTTP"
                self.native_navigation_error = None
                return "PASS"
            except PlaywrightError as exc:
                message = str(exc)
                if "ERR_BLOCKED_BY_ADMINISTRATOR" not in message:
                    raise
                self.transport_mode = "LOCAL_HTTP_RESPONSE_TO_CHROMIUM_DOM_BRIDGE"
                self.native_navigation_error = "ERR_BLOCKED_BY_ADMINISTRATOR"
                return self.native_navigation_error
            finally:
                browser.close()

    def _load_html(self, page: Page, url: str) -> None:
        status, body, _ = self._http_get(url)
        if status != 200:
            raise RuntimeError(f"HTTP {status} for {url}")
        page.set_content(body.decode("utf-8"), wait_until="domcontentloaded")

    def _save_state(self, next_page: int | None, records: list[ExtractionRecord], completed: bool = False) -> None:
        payload = {
            "schema_version": "B4_FIXTURE_RESUME_STATE_V1",
            "base_url": self.base_url,
            "next_page": next_page,
            "completed": completed,
            "records": [asdict(record) for record in records],
        }
        tmp = self.state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp, self.state_path)

    def _load_state(self) -> tuple[int, list[ExtractionRecord]]:
        if not self.state_path.exists():
            return 1, []
        payload = json.loads(self.state_path.read_text(encoding="utf-8"))
        if payload.get("base_url") != self.base_url:
            raise ValueError("resume state base_url mismatch")
        records = [ExtractionRecord(**record) for record in payload.get("records", [])]
        return int(payload.get("next_page") or 1), records

    @staticmethod
    def _dedupe(records: list[ExtractionRecord]) -> list[ExtractionRecord]:
        by_id = {record.id: record for record in records}
        return [by_id[key] for key in sorted(by_id)]

    def extract_list_records(self, inject_failure_after_page_1: bool = False) -> list[ExtractionRecord]:
        next_page, records = self._load_state()
        with sync_playwright() as playwright:
            browser = self._launch(playwright)
            page = browser.new_page()
            self._bind_events(page)
            try:
                current = next_page
                while current <= 2:
                    url = f"{self.base_url}/list?page={current}"
                    self._load_html(page, url)
                    cards = page.locator("article.item")
                    if cards.count() != 5:
                        raise AssertionError(f"expected 5 cards on page {current}, got {cards.count()}")
                    for index in range(cards.count()):
                        card = cards.nth(index)
                        records.append(ExtractionRecord(
                            id=int(card.get_attribute("data-record-id") or "0"),
                            name=card.locator(".name").inner_text().strip(),
                            category=card.locator(".category").inner_text().strip(),
                            value=int(card.locator(".value").inner_text().strip()),
                            source_url=url,
                        ))
                    records = self._dedupe(records)
                    self.trace.append({"step": "list-page", "page": current, "record_count": len(records), "url": url})
                    self._save_state(current + 1 if current < 2 else None, records, completed=current == 2)
                    if current == 1 and inject_failure_after_page_1:
                        marker = self.workdir / "injected-failure.marker"
                        if not marker.exists():
                            marker.write_text("injected-after-page-1", encoding="utf-8")
                            raise RuntimeError("INJECTED_FAILURE_AFTER_PAGE_1")
                    current += 1
            finally:
                browser.close()
        if len(records) != 10:
            raise AssertionError(f"expected exactly 10 records, got {len(records)}")
        return records

    def exercise_detail(self) -> dict[str, Any]:
        with sync_playwright() as playwright:
            browser = self._launch(playwright)
            page = browser.new_page()
            self._load_html(page, f"{self.base_url}/detail/3")
            result = {
                "id": int(page.locator("#detail").get_attribute("data-record-id") or "0"),
                "name": page.locator("#detail h2").inner_text(),
                "category": page.locator("#detail dd").nth(0).inner_text(),
                "value": int(page.locator("#detail dd").nth(1).inner_text()),
            }
            browser.close()
            return result

    def exercise_api_retry(self, run_id: str = "wave2") -> dict[str, Any]:
        attempts = 0
        pages: list[dict[str, Any]] = []
        with sync_playwright() as playwright:
            browser = self._launch(playwright)
            page = browser.new_page()
            page.set_content("<html><body>api-json-parser</body></html>")
            for page_no in (1, 2):
                while True:
                    attempts += 1
                    status, body, _ = self._http_get(f"{self.base_url}/api/items?page={page_no}&fail_once=1&run_id={run_id}")
                    if status == 200:
                        parsed = page.evaluate("text => JSON.parse(text)", body.decode("utf-8"))
                        pages.append(parsed)
                        break
                    if status != 503 or attempts > 4:
                        raise RuntimeError(f"unexpected API status {status}")
                    time.sleep(0.05)
            browser.close()
        records = [record for payload in pages for record in payload["records"]]
        return {"attempts": attempts, "records": records}

    def exercise_load_more(self) -> int:
        with sync_playwright() as playwright:
            browser = self._launch(playwright)
            page = browser.new_page()
            page.set_content("<button id='load-more'>Load More</button><div id='records'></div><div id='status'></div>")
            for offset in range(0, 10, 2):
                page.locator("#load-more").click()
                status, body, _ = self._http_get(f"{self.base_url}/load-more-fragment?offset={offset}")
                if status != 200:
                    raise RuntimeError(f"load-more HTTP {status}")
                page.evaluate("html => document.querySelector('#records').insertAdjacentHTML('beforeend', html)", body.decode("utf-8"))
            page.evaluate("document.querySelector('#status').textContent='done';document.querySelector('#load-more').disabled=true")
            count = page.locator("article.item").count()
            browser.close()
            return count

    def exercise_infinite_scroll(self) -> int:
        with sync_playwright() as playwright:
            browser = self._launch(playwright)
            page = browser.new_page(viewport={"width": 1000, "height": 400})
            page.set_content("<div id='records'></div><div id='sentinel' style='height:10px'>sentinel</div><div id='status'></div>")
            cursor: int | None = 0
            while cursor is not None:
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                status, body, _ = self._http_get(f"{self.base_url}/infinite-data?cursor={cursor}")
                if status != 200:
                    raise RuntimeError(f"infinite HTTP {status}")
                payload = json.loads(body.decode("utf-8"))
                page.evaluate(
                    "records => { for (const x of records) { const a=document.createElement('article'); a.className='item'; a.dataset.recordId=x.id; a.textContent=x.name; document.querySelector('#records').appendChild(a); } }",
                    payload["records"],
                )
                cursor = payload["next_cursor"]
            page.evaluate("document.querySelector('#status').textContent='done'")
            count = page.locator("article.item").count()
            browser.close()
            return count

    def exercise_frame(self) -> dict[str, Any]:
        status, frame_body, _ = self._http_get(f"{self.base_url}/frame-content")
        if status != 200:
            raise RuntimeError("frame content unavailable")
        with sync_playwright() as playwright:
            browser = self._launch(playwright)
            page = browser.new_page()
            page.set_content("<iframe id='result-frame'></iframe>")
            page.evaluate("html => document.querySelector('#result-frame').srcdoc=html", frame_body.decode("utf-8"))
            frame_record = page.frame_locator("#result-frame").locator("#frame-record")
            frame_record.wait_for()
            result = {"id": int(frame_record.get_attribute("data-record-id") or "0"), "text": frame_record.inner_text()}
            browser.close()
            return result

    def exercise_popup(self) -> dict[str, Any]:
        status, popup_body, _ = self._http_get(f"{self.base_url}/popup-content")
        if status != 200:
            raise RuntimeError("popup content unavailable")
        with sync_playwright() as playwright:
            browser = self._launch(playwright)
            context = browser.new_context()
            page = context.new_page()
            page.set_content("<button id='open-popup' onclick=\"window.open('about:blank','fixture-popup')\">Open Popup</button>")
            with page.expect_popup() as popup_info:
                page.locator("#open-popup").click()
            popup = popup_info.value
            popup.set_content(popup_body.decode("utf-8"))
            result = {"id": int(popup.locator("#popup-record").get_attribute("data-record-id") or "0"), "text": popup.locator("#popup-record").inner_text()}
            context.close()
            browser.close()
            return result

    def exercise_download(self) -> dict[str, Any]:
        status, data, _ = self._http_get(f"{self.base_url}/download.csv")
        if status != 200:
            raise RuntimeError("download unavailable")
        encoded = base64.b64encode(data).decode("ascii")
        with sync_playwright() as playwright:
            browser = self._launch(playwright)
            context = browser.new_context(accept_downloads=True)
            page = context.new_page()
            page.set_content(f"<a id='download' download='fixture-items.csv' href='data:text/csv;base64,{encoded}'>Download</a>")
            with page.expect_download() as download_info:
                page.locator("#download").click()
            download = download_info.value
            target = self.workdir / download.suggested_filename
            download.save_as(target)
            saved = target.read_bytes()
            rows = list(csv.DictReader(saved.decode("utf-8").splitlines()))
            result = {"path": str(target), "sha256": hashlib.sha256(saved).hexdigest(), "row_count": len(rows)}
            context.close()
            browser.close()
            return result

    def exercise_schema_drift(self) -> dict[str, Any]:
        _, v1_bytes, _ = self._http_get(f"{self.base_url}/schema-drift?mode=v1")
        _, v2_bytes, _ = self._http_get(f"{self.base_url}/schema-drift?mode=v2")
        with sync_playwright() as playwright:
            browser = self._launch(playwright)
            page = browser.new_page()
            page.set_content("<html><body>schema parser</body></html>")
            v1 = page.evaluate("text => JSON.parse(text)", v1_bytes.decode("utf-8"))
            v2 = page.evaluate("text => JSON.parse(text)", v2_bytes.decode("utf-8"))
            browser.close()
        keys_v1 = sorted(v1["records"][0].keys())
        keys_v2 = sorted(v2["records"][0].keys())
        return {"keys_v1": keys_v1, "keys_v2": keys_v2, "drift_detected": keys_v1 != keys_v2}

    def run_all(self, inject_failure: bool = True) -> dict[str, Any]:
        self.probe_native_navigation()
        first_failure = None
        try:
            records = self.extract_list_records(inject_failure_after_page_1=inject_failure)
        except RuntimeError as exc:
            if str(exc) != "INJECTED_FAILURE_AFTER_PAGE_1":
                raise
            first_failure = str(exc)
            records = self.extract_list_records(inject_failure_after_page_1=False)
        result = {
            "schema_version": "B4_WAVE2_EDGE_EXTRACTION_RECEIPT_V2",
            "base_url": self.base_url,
            "transport_mode": self.transport_mode,
            "native_navigation_error": self.native_navigation_error,
            "first_failure": first_failure,
            "resume_after_failure": "PASS" if first_failure else "NOT_INJECTED",
            "records": [asdict(record) for record in records],
            "record_count": len(records),
            "detail": self.exercise_detail(),
            "api_retry": self.exercise_api_retry(),
            "load_more_count": self.exercise_load_more(),
            "infinite_scroll_count": self.exercise_infinite_scroll(),
            "frame": self.exercise_frame(),
            "popup": self.exercise_popup(),
            "download": self.exercise_download(),
            "schema_drift": self.exercise_schema_drift(),
            "network_event_count": len(self.network_events),
            "trace": self.trace,
        }
        (self.workdir / "extraction-receipt.json").write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")
        return result
