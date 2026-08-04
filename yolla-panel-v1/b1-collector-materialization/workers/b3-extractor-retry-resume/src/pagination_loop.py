from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from typing import Any

try:
    from .incremental_cursor import IncrementalCursor, canonical_json
    from .retry_resume_engine import (
        AppendOnlyResumeLedger,
        FixtureRequestError,
        NonRetryableFailure,
        ProgressTracker,
        RetryExhaustedError,
        RetryPolicy,
    )
except ImportError:  # direct module execution in the fixture test harness
    from incremental_cursor import IncrementalCursor, canonical_json
    from retry_resume_engine import (
        AppendOnlyResumeLedger,
        FixtureRequestError,
        NonRetryableFailure,
        ProgressTracker,
        RetryExhaustedError,
        RetryPolicy,
    )


class PaginationPolicyError(ValueError):
    pass


class SimulatedCrash(RuntimeError):
    pass


@dataclass(frozen=True)
class PaginationPolicy:
    strategy: str
    start_page: int
    page_size: int
    max_pages: int
    max_records: int
    stop_condition: str

    @classmethod
    def from_adapter_package(cls, package: dict[str, Any]) -> "PaginationPolicy":
        if package.get("fixture") is not True:
            raise PaginationPolicyError("only fixture adapter is allowed before A-2 verification")
        if package.get("verified") is not False:
            raise PaginationPolicyError("fixture package must not claim verified actual mode")
        if package.get("metadata", {}).get("zero_network_calls") is not True:
            raise PaginationPolicyError("fixture package must require zero network calls")
        pagination = package.get("request_policy", {}).get("pagination", {})
        scope = package.get("scope", {})
        policy = cls(
            strategy=pagination.get("strategy"),
            start_page=int(pagination.get("start_page", 0)),
            page_size=int(pagination.get("page_size", 0)),
            max_pages=int(scope.get("max_pages", 0)),
            max_records=int(scope.get("max_records", 0)),
            stop_condition=pagination.get("stop_condition"),
        )
        if policy.strategy != "page_number":
            raise PaginationPolicyError("unsupported pagination strategy")
        if policy.start_page < 1 or policy.page_size < 1 or policy.max_pages < 1 or policy.max_records < 1:
            raise PaginationPolicyError("invalid pagination limits")
        if policy.stop_condition not in {"empty_page", "next_page_null"}:
            raise PaginationPolicyError("unsupported stop condition")
        return policy


class FixturePageAdapter:
    """Zero-network fixture adapter with deterministic failure injection."""

    def __init__(self, pages: dict[int, dict[str, Any]], failures: dict[int, list[BaseException]] | None = None) -> None:
        self.pages = {int(page): json.loads(canonical_json(value)) for page, value in pages.items()}
        self.failures = {int(page): list(items) for page, items in (failures or {}).items()}
        self.attempts: dict[int, int] = {}
        self.network_call_count = 0

    def fetch(self, page: int) -> dict[str, Any]:
        self.attempts[page] = self.attempts.get(page, 0) + 1
        failure_queue = self.failures.get(page, [])
        if failure_queue:
            raise failure_queue.pop(0)
        if page not in self.pages:
            return {"records": [], "next_page": None, "metadata": {"fixture_page": page, "source": "fixture"}}
        return json.loads(canonical_json(self.pages[page]))


class PaginationExtractor:
    def __init__(
        self,
        *,
        policy: PaginationPolicy,
        retry_policy: RetryPolicy | None = None,
    ) -> None:
        self.policy = policy
        self.retry_policy = retry_policy or RetryPolicy()

    @staticmethod
    def execution_key(adapter_package: dict[str, Any], pages: dict[int, dict[str, Any]]) -> str:
        payload = {
            "adapter_id": adapter_package["adapter_id"],
            "package_id": adapter_package["package_id"],
            "pages": {str(k): pages[k] for k in sorted(pages)},
        }
        return sha256(canonical_json(payload).encode("utf-8")).hexdigest()

    def _fetch_with_retry(
        self,
        *,
        adapter: FixturePageAdapter,
        page: int,
        ledger: AppendOnlyResumeLedger,
        execution_key: str,
        cursor: IncrementalCursor,
    ) -> dict[str, Any]:
        for attempt in range(1, self.retry_policy.max_attempts + 1):
            try:
                return adapter.fetch(page)
            except BaseException as error:  # fixture-only classification boundary
                retryable = self.retry_policy.is_retryable(error)
                ledger.append(
                    "RETRY_CLASSIFIED" if retryable else "NONRETRYABLE_FAILURE",
                    {
                        "execution_key": execution_key,
                        "page": page,
                        "attempt": attempt,
                        "error_type": type(error).__name__,
                        "status_code": getattr(error, "status_code", None),
                        "retryable": retryable,
                        "cursor": cursor.snapshot(),
                    },
                )
                if not retryable:
                    raise NonRetryableFailure(str(error)) from error
                if attempt >= self.retry_policy.max_attempts:
                    ledger.append(
                        "RETRY_EXHAUSTED",
                        {
                            "execution_key": execution_key,
                            "page": page,
                            "attempts": attempt,
                            "cursor": cursor.snapshot(),
                        },
                    )
                    raise RetryExhaustedError(f"page {page} retry exhausted") from error
        raise AssertionError("unreachable")

    def run(
        self,
        *,
        adapter_package: dict[str, Any],
        adapter: FixturePageAdapter,
        ledger: AppendOnlyResumeLedger | None = None,
        progress: ProgressTracker | None = None,
        crash_after_page: int | None = None,
    ) -> dict[str, Any]:
        ledger = ledger or AppendOnlyResumeLedger()
        progress = progress or ProgressTracker()
        execution_key = self.execution_key(adapter_package, adapter.pages)

        if ledger.has_complete(execution_key):
            snapshot = ledger.last_cursor_snapshot(execution_key)
            cursor = IncrementalCursor.from_snapshot(snapshot or {})
            return self._receipt(
                execution_key=execution_key,
                cursor=cursor,
                ledger=ledger,
                progress=progress,
                adapter=adapter,
                execution_delta=0,
                resumed=False,
            )

        snapshot = ledger.last_cursor_snapshot(execution_key)
        cursor = IncrementalCursor.from_snapshot(snapshot) if snapshot else IncrementalCursor(start_page=self.policy.start_page, next_page=self.policy.start_page)
        resumed = snapshot is not None
        initial_output_count = cursor.output_record_count

        if not progress.events:
            progress.append(stage="START", completed_units=cursor.last_committed_page, total_units=max(len(adapter.pages), 1))
            ledger.append("START", {"execution_key": execution_key, "cursor": cursor.snapshot(), "resumed": resumed})

        while not cursor.completed:
            page = cursor.next_page
            if page is None:
                cursor.completed = True
                break
            if page - self.policy.start_page >= self.policy.max_pages:
                raise PaginationPolicyError("max_pages exceeded")

            payload = self._fetch_with_retry(
                adapter=adapter,
                page=page,
                ledger=ledger,
                execution_key=execution_key,
                cursor=cursor,
            )
            records = payload.get("records")
            if not isinstance(records, list):
                raise PaginationPolicyError("page records must be a list")
            if cursor.input_record_count + len(records) > self.policy.max_records:
                raise PaginationPolicyError("max_records exceeded")

            next_page = payload.get("next_page")
            if not records and self.policy.stop_condition == "empty_page":
                next_page = None
            if next_page is not None and (not isinstance(next_page, int) or next_page <= page):
                raise PaginationPolicyError("next_page must increase or be null")

            page_delta = cursor.commit_page(page=page, next_page=next_page, records=records)
            progress.append(
                stage="PAGE_COMMITTED",
                completed_units=min(cursor.last_committed_page, max(len(adapter.pages), 1)),
                total_units=max(len(adapter.pages), 1),
            )
            ledger.append(
                "PAGE_COMMITTED",
                {
                    "execution_key": execution_key,
                    "page": page,
                    "page_delta": page_delta,
                    "cursor": cursor.snapshot(),
                },
            )

            if crash_after_page == page:
                ledger.append(
                    "CRASH_SIMULATED_AFTER_COMMIT",
                    {"execution_key": execution_key, "page": page, "cursor": cursor.snapshot()},
                )
                raise SimulatedCrash(f"simulated crash after page {page}")

        if not cursor.completed:
            cursor.completed = True
        progress.append(stage="COMPLETE", completed_units=max(len(adapter.pages), 1), total_units=max(len(adapter.pages), 1))
        ledger.append("COMPLETE", {"execution_key": execution_key, "cursor": cursor.snapshot()})
        ledger.validate()
        progress.validate()
        return self._receipt(
            execution_key=execution_key,
            cursor=cursor,
            ledger=ledger,
            progress=progress,
            adapter=adapter,
            execution_delta=cursor.output_record_count - initial_output_count,
            resumed=resumed,
        )

    @staticmethod
    def _receipt(
        *,
        execution_key: str,
        cursor: IncrementalCursor,
        ledger: AppendOnlyResumeLedger,
        progress: ProgressTracker,
        adapter: FixturePageAdapter,
        execution_delta: int,
        resumed: bool,
    ) -> dict[str, Any]:
        return {
            "schema_version": "EXTRACTION_RUN_RECEIPT_V1",
            "execution_key": execution_key,
            "mode": "FIXTURE",
            "input_record_count": cursor.input_record_count,
            "duplicate_count": cursor.duplicate_count,
            "output_record_count": cursor.output_record_count,
            "output_records": cursor.output_records,
            "execution_delta": execution_delta,
            "resumed": resumed,
            "completed": cursor.completed,
            "last_committed_page": cursor.last_committed_page,
            "next_page": cursor.next_page,
            "network_call_count": adapter.network_call_count,
            "ledger_entry_count": len(ledger.entries),
            "progress_events": progress.events,
        }


__all__ = [
    "AppendOnlyResumeLedger",
    "FixturePageAdapter",
    "FixtureRequestError",
    "IncrementalCursor",
    "NonRetryableFailure",
    "PaginationExtractor",
    "PaginationPolicy",
    "PaginationPolicyError",
    "ProgressTracker",
    "RetryExhaustedError",
    "RetryPolicy",
    "SimulatedCrash",
]
