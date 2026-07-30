from __future__ import annotations

import sqlite3
from pathlib import Path


class DuplicateEventError(ValueError):
    pass


class EventConsumptionStore:
    def __init__(self, path: str | Path):
        self.path = str(path)
        self.conn = sqlite3.connect(self.path)
        self.conn.execute("CREATE TABLE IF NOT EXISTS consumed(event_id TEXT PRIMARY KEY, consumed_at TEXT NOT NULL, source_head TEXT NOT NULL)")
        self.conn.commit()

    def consume(self, event_id: str, consumed_at: str, source_head: str) -> None:
        try:
            self.conn.execute("INSERT INTO consumed VALUES(?,?,?)", (event_id, consumed_at, source_head))
            self.conn.commit()
        except sqlite3.IntegrityError as exc:
            raise DuplicateEventError("DUPLICATE_EVENT_CONSUMPTION") from exc

    def contains(self, event_id: str) -> bool:
        return self.conn.execute("SELECT 1 FROM consumed WHERE event_id=?", (event_id,)).fetchone() is not None

    def close(self) -> None:
        self.conn.close()
