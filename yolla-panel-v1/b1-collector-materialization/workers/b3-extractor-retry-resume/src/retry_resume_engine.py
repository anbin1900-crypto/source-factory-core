from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from typing import Any


class NonRetryableFailure(RuntimeError):
    pass


class RetryExhaustedError(RuntimeError):
    pass


class LedgerIntegrityError(ValueError):
    pass


class ProgressRegressionError(ValueError):
    pass


class FixtureRequestError(RuntimeError):
    def __init__(self, status_code: int, message: str = "fixture request failure") -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 3
    retryable_statuses: tuple[int, ...] = (408, 409, 425, 429)
    retryable_status_min: int = 500
    retryable_status_max: int = 599

    def is_retryable(self, error: BaseException) -> bool:
        if isinstance(error, (TimeoutError, ConnectionError)):
            return True
        status = getattr(error, "status_code", None)
        return bool(
            isinstance(status, int)
            and (status in self.retryable_statuses or self.retryable_status_min <= status <= self.retryable_status_max)
        )


class AppendOnlyResumeLedger:
    def __init__(self, entries: list[dict[str, Any]] | None = None) -> None:
        self._entries: list[dict[str, Any]] = []
        for entry in entries or []:
            self._entries.append(json.loads(json.dumps(entry, ensure_ascii=False, sort_keys=True)))
        self.validate()

    @staticmethod
    def _deep_copy(value: Any) -> Any:
        return json.loads(json.dumps(value, ensure_ascii=False, sort_keys=True))

    @property
    def entries(self) -> list[dict[str, Any]]:
        return self._deep_copy(self._entries)

    def append(self, event: str, payload: dict[str, Any]) -> dict[str, Any]:
        sequence = len(self._entries) + 1
        previous_hash = self._entries[-1]["entry_hash"] if self._entries else "0" * 64
        body = {
            "sequence": sequence,
            "event": event,
            "payload": self._deep_copy(payload),
            "previous_hash": previous_hash,
        }
        encoded = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        body["entry_hash"] = sha256(encoded).hexdigest()
        self._entries.append(body)
        return dict(body)

    def validate(self) -> bool:
        previous_hash = "0" * 64
        for expected_sequence, entry in enumerate(self._entries, start=1):
            if entry.get("sequence") != expected_sequence:
                raise LedgerIntegrityError("non-contiguous ledger sequence")
            if entry.get("previous_hash") != previous_hash:
                raise LedgerIntegrityError("ledger previous hash mismatch")
            body = {k: entry[k] for k in ("sequence", "event", "payload", "previous_hash")}
            encoded = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            expected_hash = sha256(encoded).hexdigest()
            if entry.get("entry_hash") != expected_hash:
                raise LedgerIntegrityError("ledger entry hash mismatch")
            previous_hash = expected_hash
        return True

    def has_complete(self, execution_key: str) -> bool:
        return any(
            entry["event"] == "COMPLETE" and entry["payload"].get("execution_key") == execution_key
            for entry in self._entries
        )

    def last_cursor_snapshot(self, execution_key: str) -> dict[str, Any] | None:
        for entry in reversed(self._entries):
            if entry["payload"].get("execution_key") == execution_key and "cursor" in entry["payload"]:
                return dict(entry["payload"]["cursor"])
        return None


class ProgressTracker:
    def __init__(self, events: list[dict[str, Any]] | None = None) -> None:
        self.events = [dict(item) for item in (events or [])]
        self.validate()

    def append(self, *, stage: str, completed_units: int, total_units: int) -> dict[str, Any]:
        if total_units <= 0:
            raise ValueError("total_units must be positive")
        if completed_units < 0 or completed_units > total_units:
            raise ValueError("invalid completed_units")
        percent = round(completed_units * 100.0 / total_units, 4)
        if self.events and percent < self.events[-1]["percent"]:
            raise ProgressRegressionError("progress percent regression")
        event = {
            "sequence": len(self.events) + 1,
            "stage": stage,
            "completed_units": completed_units,
            "total_units": total_units,
            "percent": percent,
        }
        self.events.append(event)
        return dict(event)

    def validate(self) -> bool:
        last_percent = -1.0
        for expected_sequence, event in enumerate(self.events, start=1):
            if event.get("sequence") != expected_sequence:
                raise ProgressRegressionError("progress sequence mismatch")
            percent = float(event.get("percent", -1))
            if percent < last_percent:
                raise ProgressRegressionError("progress percent regression")
            last_percent = percent
        return True
