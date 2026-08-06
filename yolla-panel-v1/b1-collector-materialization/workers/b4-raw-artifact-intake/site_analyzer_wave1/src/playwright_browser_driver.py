"""Optional synchronous Playwright adapter for BrowserEdgeRuntime.

Importing this module does not require Playwright. Instantiation fails closed
with an actionable message when the dependency is absent.
"""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from typing import Any, Mapping

from browser_edge_runtime import DownloadReceipt, NonRetryableExtractionError, RetryableExtractionError


class PlaywrightBrowserDriver:
    def __init__(self, page: Any):
        self.page = page
        self.scope = page

    def navigate(self, url: str) -> None:
        response = self.page.goto(url, wait_until="domcontentloaded")
        if response is not None and response.status >= 500:
            raise RetryableExtractionError(f"navigation status {response.status}")
        if response is not None and response.status >= 400:
            raise NonRetryableExtractionError(f"navigation status {response.status}")
        self.scope = self.page

    def open_popup(self, selector: str) -> None:
        with self.page.expect_popup() as popup_info:
            self.page.locator(selector).click()
        self.page = popup_info.value
        self.page.wait_for_load_state("domcontentloaded")
        self.scope = self.page

    def open_new_tab(self, selector: str) -> None:
        self.open_popup(selector)

    def enter_frame(self, selector: str) -> None:
        self.scope = self.page.frame_locator(selector)

    def capture_download(self, selector: str, destination_dir: Path) -> DownloadReceipt:
        destination_dir.mkdir(parents=True, exist_ok=True)
        with self.page.expect_download() as download_info:
            self.scope.locator(selector).click()
        download = download_info.value
        suggested = download.suggested_filename
        target = destination_dir / suggested
        download.save_as(str(target))
        data = target.read_bytes()
        return DownloadReceipt(
            path=str(target),
            sha256=sha256(data).hexdigest(),
            size_bytes=len(data),
            suggested_filename=suggested,
        )

    def extract_records(self, extraction: Mapping[str, Any]) -> list[dict[str, Any]]:
        item_selector = extraction.get("item_selector")
        fields = extraction.get("fields", {})
        if not item_selector or not fields:
            raise NonRetryableExtractionError("item_selector and fields are required")
        items = self.scope.locator(item_selector)
        records: list[dict[str, Any]] = []
        for index in range(items.count()):
            item = items.nth(index)
            record: dict[str, Any] = {}
            for name, definition in fields.items():
                if isinstance(definition, str):
                    locator = item.locator(definition)
                    record[name] = locator.inner_text().strip()
                else:
                    locator = item.locator(definition["selector"])
                    attribute = definition.get("attribute")
                    record[name] = locator.get_attribute(attribute) if attribute else locator.inner_text().strip()
            records.append(record)
        return records

    def click_load_more(self, selector: str) -> bool:
        locator = self.scope.locator(selector)
        if locator.count() == 0 or not locator.first.is_visible():
            return False
        locator.first.click()
        self.page.wait_for_timeout(150)
        return True

    def scroll_once(self) -> bool:
        before = self.page.evaluate("document.documentElement.scrollHeight")
        self.page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        self.page.wait_for_timeout(200)
        after = self.page.evaluate("document.documentElement.scrollHeight")
        return after > before

    def goto_page(self, page_number: int, step: Mapping[str, Any]) -> bool:
        if page_number == int(step.get("start_page", 1)):
            return True
        template = step.get("page_url_template")
        if template:
            self.navigate(template.format(page=page_number))
            return True
        next_selector = step.get("next_selector")
        if not next_selector:
            return False
        locator = self.scope.locator(next_selector)
        if locator.count() == 0:
            return False
        locator.first.click()
        self.page.wait_for_load_state("domcontentloaded")
        self.scope = self.page
        return True

    def fetch_cursor(self, cursor: str | None, step: Mapping[str, Any]) -> tuple[list[dict[str, Any]], str | None]:
        raise NonRetryableExtractionError(
            "cursor pagination requires an injected API driver; Playwright DOM driver does not invent request templates"
        )

    def restore(self, step_state: Mapping[str, Any]) -> None:
        # A durable caller may navigate to the saved URL/page before invoking run.
        # The runtime never fabricates browser state from an incomplete checkpoint.
        return None
