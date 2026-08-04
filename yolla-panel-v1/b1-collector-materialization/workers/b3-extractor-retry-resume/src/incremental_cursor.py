from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import json
from typing import Any, Iterable


class CursorRegressionError(ValueError):
    pass


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def dedup_key(record: dict[str, Any]) -> str:
    """Stable exactly-once key. Prefer source ID, then canonical full record hash."""
    if isinstance(record.get("id"), str) and record["id"].strip():
        return f"id:{record['id'].strip()}"
    return "sha256:" + sha256(canonical_json(record).encode("utf-8")).hexdigest()


@dataclass
class IncrementalCursor:
    start_page: int = 1
    last_committed_page: int = 0
    next_page: int | None = 1
    accepted_keys: set[str] = field(default_factory=set)
    output_records: list[dict[str, Any]] = field(default_factory=list)
    input_record_count: int = 0
    duplicate_count: int = 0
    completed: bool = False

    def commit_page(
        self,
        *,
        page: int,
        next_page: int | None,
        records: Iterable[dict[str, Any]],
    ) -> dict[str, int]:
        if self.completed:
            raise CursorRegressionError("cursor already completed")
        if page <= self.last_committed_page:
            raise CursorRegressionError("page regression or duplicate page commit")
        if self.next_page is not None and page != self.next_page:
            raise CursorRegressionError(f"expected page {self.next_page}, got {page}")

        added = 0
        duplicates = 0
        for record in records:
            self.input_record_count += 1
            key = dedup_key(record)
            if key in self.accepted_keys:
                self.duplicate_count += 1
                duplicates += 1
                continue
            self.accepted_keys.add(key)
            self.output_records.append(record)
            added += 1

        self.last_committed_page = page
        self.next_page = next_page
        if next_page is None:
            self.completed = True
        return {"added": added, "duplicates": duplicates}

    @property
    def output_record_count(self) -> int:
        return len(self.output_records)

    def snapshot(self) -> dict[str, Any]:
        return {
            "start_page": self.start_page,
            "last_committed_page": self.last_committed_page,
            "next_page": self.next_page,
            "accepted_keys": sorted(self.accepted_keys),
            "output_records": self.output_records,
            "input_record_count": self.input_record_count,
            "duplicate_count": self.duplicate_count,
            "output_record_count": self.output_record_count,
            "completed": self.completed,
        }

    @classmethod
    def from_snapshot(cls, value: dict[str, Any]) -> "IncrementalCursor":
        cursor = cls(start_page=int(value.get("start_page", 1)))
        cursor.last_committed_page = int(value.get("last_committed_page", 0))
        cursor.next_page = value.get("next_page")
        cursor.accepted_keys = set(value.get("accepted_keys", []))
        cursor.output_records = list(value.get("output_records", []))
        cursor.input_record_count = int(value.get("input_record_count", 0))
        cursor.duplicate_count = int(value.get("duplicate_count", 0))
        cursor.completed = bool(value.get("completed", False))
        return cursor
