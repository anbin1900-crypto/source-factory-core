"""Browser edge-case extraction runtime with crash-safe resume.

The runtime is driver-agnostic. A Playwright-compatible driver can execute real
browser work, while deterministic fake drivers exercise popup/frame/download,
load-more, infinite-scroll, page/cursor pagination and retry/resume semantics.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import json
import os
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, MutableMapping, Protocol, Sequence


class RetryableExtractionError(RuntimeError):
    """A transient failure that may be retried."""


class NonRetryableExtractionError(RuntimeError):
    """A deterministic failure that must fail closed."""


class InjectedInterruption(RuntimeError):
    """Controlled interruption used to verify checkpoint resume."""


@dataclass(frozen=True)
class DownloadReceipt:
    path: str
    sha256: str
    size_bytes: int
    suggested_filename: str | None = None


@dataclass
class RunReceipt:
    status: str
    records: list[dict[str, Any]]
    downloads: list[dict[str, Any]]
    resume_used: bool
    retry_count: int
    completed_steps: int
    checkpoint_path: str
    trace: list[dict[str, Any]] = field(default_factory=list)

    @property
    def record_count(self) -> int:
        return len(self.records)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "record_count": self.record_count,
            "records": self.records,
            "downloads": self.downloads,
            "resume_used": self.resume_used,
            "retry_count": self.retry_count,
            "completed_steps": self.completed_steps,
            "checkpoint_path": self.checkpoint_path,
            "trace": self.trace,
        }


class BrowserDriver(Protocol):
    def navigate(self, url: str) -> None: ...
    def open_popup(self, selector: str) -> None: ...
    def open_new_tab(self, selector: str) -> None: ...
    def enter_frame(self, selector: str) -> None: ...
    def capture_download(self, selector: str, destination_dir: Path) -> DownloadReceipt: ...
    def extract_records(self, extraction: Mapping[str, Any]) -> list[dict[str, Any]]: ...
    def click_load_more(self, selector: str) -> bool: ...
    def scroll_once(self) -> bool: ...
    def goto_page(self, page_number: int, step: Mapping[str, Any]) -> bool: ...
    def fetch_cursor(self, cursor: str | None, step: Mapping[str, Any]) -> tuple[list[dict[str, Any]], str | None]: ...
    def restore(self, step_state: Mapping[str, Any]) -> None: ...


class AtomicCheckpointStore:
    """Atomic JSON checkpoint store; the previous committed state is never edited in-place."""

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def load(self) -> dict[str, Any] | None:
        if not self.path.exists():
            return None
        return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, state: Mapping[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        payload = json.dumps(state, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        tmp.write_text(payload, encoding="utf-8")
        os.replace(tmp, self.path)

    def clear(self) -> None:
        if self.path.exists():
            self.path.unlink()


class BrowserEdgeRuntime:
    """Executes an extraction recipe and checkpoints after every accepted unit of work."""

    SUPPORTED_STEPS = {
        "navigate", "popup", "new_tab", "frame", "download", "extract",
        "load_more", "infinite_scroll", "page_pagination", "cursor_pagination",
    }

    def __init__(
        self,
        driver: BrowserDriver,
        checkpoint_store: AtomicCheckpointStore,
        download_dir: str | Path,
        *,
        identity_field: str = "id",
        max_retries: int = 2,
    ) -> None:
        if max_retries < 0:
            raise ValueError("max_retries must be non-negative")
        self.driver = driver
        self.checkpoint_store = checkpoint_store
        self.download_dir = Path(download_dir)
        self.identity_field = identity_field
        self.max_retries = max_retries

    def run(
        self,
        recipe: Mapping[str, Any],
        *,
        max_records: int = 20,
        interrupt_after_records: int | None = None,
    ) -> RunReceipt:
        self._validate_recipe(recipe)
        if max_records < 1 or max_records > 20:
            raise ValueError("max_records must be in 1..20")

        checkpoint = self.checkpoint_store.load()
        resume_used = checkpoint is not None
        state = checkpoint or self._new_state(recipe)
        self.driver.restore(state.get("step_state", {}))

        try:
            steps = recipe["steps"]
            while state["step_index"] < len(steps):
                step_index = state["step_index"]
                step = steps[step_index]
                self._execute_step(step, state, max_records=max_records, interrupt_after_records=interrupt_after_records)
                state["step_index"] += 1
                state["completed_steps"] = state["step_index"]
                state["step_state"] = {}
                self._trace(state, "STEP_COMPLETE", step_index=step_index, step_type=step["type"])
                self.checkpoint_store.save(state)

            state["status"] = "PASS"
            self.checkpoint_store.save(state)
            return self._receipt(state, resume_used=resume_used)
        except InjectedInterruption:
            self.checkpoint_store.save(state)
            raise

    def _new_state(self, recipe: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "schema_version": "B4_BROWSER_EDGE_CHECKPOINT_V1",
            "recipe_id": recipe["recipe_id"],
            "step_index": 0,
            "completed_steps": 0,
            "records": [],
            "seen_ids": [],
            "downloads": [],
            "retry_count": 0,
            "step_state": {},
            "trace": [],
            "status": "RUNNING",
        }

    def _execute_step(self, step: Mapping[str, Any], state: MutableMapping[str, Any], *, max_records: int, interrupt_after_records: int | None) -> None:
        step_type = step["type"]
        if step_type == "navigate":
            self._retry(lambda: self.driver.navigate(step["url"]), state, step_type)
        elif step_type == "popup":
            self._retry(lambda: self.driver.open_popup(step["selector"]), state, step_type)
        elif step_type == "new_tab":
            self._retry(lambda: self.driver.open_new_tab(step["selector"]), state, step_type)
        elif step_type == "frame":
            self._retry(lambda: self.driver.enter_frame(step["selector"]), state, step_type)
        elif step_type == "download":
            receipt = self._retry(lambda: self.driver.capture_download(step["selector"], self.download_dir), state, step_type)
            state["downloads"].append(receipt.__dict__)
            self._trace(state, "DOWNLOAD_CAPTURED", sha256=receipt.sha256, size_bytes=receipt.size_bytes)
        elif step_type == "extract":
            records = self._retry(lambda: self.driver.extract_records(step), state, step_type)
            self._accept_records(records, state, max_records, interrupt_after_records)
        elif step_type == "load_more":
            self._run_load_more(step, state, max_records, interrupt_after_records)
        elif step_type == "infinite_scroll":
            self._run_infinite_scroll(step, state, max_records, interrupt_after_records)
        elif step_type == "page_pagination":
            self._run_page_pagination(step, state, max_records, interrupt_after_records)
        elif step_type == "cursor_pagination":
            self._run_cursor_pagination(step, state, max_records, interrupt_after_records)
        else:
            raise NonRetryableExtractionError(f"unsupported step: {step_type}")

    def _run_load_more(self, step: Mapping[str, Any], state: MutableMapping[str, Any], max_records: int, interrupt_after_records: int | None) -> None:
        rounds = int(state["step_state"].get("round", 0))
        max_rounds = int(step.get("max_rounds", 20))
        while rounds < max_rounds and len(state["records"]) < max_records:
            records = self._retry(lambda: self.driver.extract_records(step), state, "load_more_extract")
            self._accept_records(records, state, max_records, interrupt_after_records)
            clicked = self._retry(lambda: self.driver.click_load_more(step["selector"]), state, "load_more_click")
            rounds += 1
            state["step_state"] = {"round": rounds}
            self.checkpoint_store.save(state)
            if not clicked:
                break

    def _run_infinite_scroll(self, step: Mapping[str, Any], state: MutableMapping[str, Any], max_records: int, interrupt_after_records: int | None) -> None:
        rounds = int(state["step_state"].get("round", 0))
        stable = int(state["step_state"].get("stable", 0))
        max_rounds = int(step.get("max_rounds", 20))
        stable_limit = int(step.get("stable_rounds", 2))
        while rounds < max_rounds and stable < stable_limit and len(state["records"]) < max_records:
            before = len(state["records"])
            records = self._retry(lambda: self.driver.extract_records(step), state, "scroll_extract")
            self._accept_records(records, state, max_records, interrupt_after_records)
            moved = self._retry(self.driver.scroll_once, state, "scroll_once")
            after = len(state["records"])
            stable = stable + 1 if (after == before and not moved) else 0
            rounds += 1
            state["step_state"] = {"round": rounds, "stable": stable}
            self.checkpoint_store.save(state)

    def _run_page_pagination(self, step: Mapping[str, Any], state: MutableMapping[str, Any], max_records: int, interrupt_after_records: int | None) -> None:
        page = int(state["step_state"].get("page", step.get("start_page", 1)))
        max_pages = int(step.get("max_pages", 100))
        while page <= max_pages and len(state["records"]) < max_records:
            available = self._retry(lambda: self.driver.goto_page(page, step), state, "goto_page")
            if not available:
                break
            records = self._retry(lambda: self.driver.extract_records(step), state, "page_extract")
            self._accept_records(records, state, max_records, interrupt_after_records)
            page += 1
            state["step_state"] = {"page": page}
            self.checkpoint_store.save(state)

    def _run_cursor_pagination(self, step: Mapping[str, Any], state: MutableMapping[str, Any], max_records: int, interrupt_after_records: int | None) -> None:
        cursor = state["step_state"].get("cursor", step.get("initial_cursor"))
        pages = int(state["step_state"].get("pages", 0))
        max_pages = int(step.get("max_pages", 100))
        while pages < max_pages and len(state["records"]) < max_records:
            records, next_cursor = self._retry(lambda: self.driver.fetch_cursor(cursor, step), state, "fetch_cursor")
            self._accept_records(records, state, max_records, interrupt_after_records)
            pages += 1
            state["step_state"] = {"cursor": next_cursor, "pages": pages}
            self.checkpoint_store.save(state)
            if next_cursor is None or next_cursor == cursor:
                break
            cursor = next_cursor

    def _accept_records(self, records: Iterable[Mapping[str, Any]], state: MutableMapping[str, Any], max_records: int, interrupt_after_records: int | None) -> None:
        seen = set(state["seen_ids"])
        for source_record in records:
            if len(state["records"]) >= max_records:
                break
            record = dict(source_record)
            identity = record.get(self.identity_field)
            if identity is None or str(identity).strip() == "":
                raise NonRetryableExtractionError(f"record missing identity field: {self.identity_field}")
            identity = str(identity)
            if identity in seen:
                continue
            seen.add(identity)
            state["seen_ids"].append(identity)
            state["records"].append(record)
            self._trace(state, "RECORD_ACCEPTED", identity=identity, count=len(state["records"]))
            self.checkpoint_store.save(state)
            if interrupt_after_records is not None and len(state["records"]) >= interrupt_after_records:
                raise InjectedInterruption(f"interrupted after {interrupt_after_records} records")

    def _retry(self, operation: Callable[[], Any], state: MutableMapping[str, Any], label: str) -> Any:
        attempt = 0
        while True:
            try:
                return operation()
            except RetryableExtractionError as exc:
                if attempt >= self.max_retries:
                    self._trace(state, "RETRY_EXHAUSTED", operation=label, error=str(exc))
                    raise
                attempt += 1
                state["retry_count"] += 1
                self._trace(state, "RETRY", operation=label, attempt=attempt, error=str(exc))
                self.checkpoint_store.save(state)

    def _receipt(self, state: Mapping[str, Any], *, resume_used: bool) -> RunReceipt:
        return RunReceipt(
            status=str(state["status"]),
            records=[dict(record) for record in state["records"]],
            downloads=[dict(item) for item in state["downloads"]],
            resume_used=resume_used,
            retry_count=int(state["retry_count"]),
            completed_steps=int(state["completed_steps"]),
            checkpoint_path=str(self.checkpoint_store.path),
            trace=[dict(item) for item in state["trace"]],
        )

    @staticmethod
    def _trace(state: MutableMapping[str, Any], event: str, **payload: Any) -> None:
        state["trace"].append({"event": event, **payload})

    def _validate_recipe(self, recipe: Mapping[str, Any]) -> None:
        if not recipe.get("recipe_id"):
            raise ValueError("recipe_id is required")
        steps = recipe.get("steps")
        if not isinstance(steps, Sequence) or isinstance(steps, (str, bytes)) or not steps:
            raise ValueError("steps must be a non-empty sequence")
        for index, step in enumerate(steps):
            if not isinstance(step, Mapping):
                raise ValueError(f"step {index} must be an object")
            step_type = step.get("type")
            if step_type not in self.SUPPORTED_STEPS:
                raise ValueError(f"step {index} has unsupported type: {step_type}")


def hash_file(path: str | Path) -> str:
    digest = sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()
