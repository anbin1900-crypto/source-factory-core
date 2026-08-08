from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterable, Mapping
import base64
import hashlib
import json
import sqlite3


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def materialize_records(records: Iterable[Mapping[str, Any]], database_path: Path) -> None:
    records = list(records)
    if database_path.exists():
        database_path.unlink()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    try:
        connection.execute("CREATE TABLE records (record_id TEXT PRIMARY KEY, normalized_json TEXT NOT NULL, source_fields_json TEXT NOT NULL, provenance_json TEXT NOT NULL)")
        for record in records:
            connection.execute("INSERT INTO records VALUES(?,?,?,?)", (
                record["record_id"],
                json.dumps(record["normalized_fields"], ensure_ascii=False, sort_keys=True),
                json.dumps(record["source_fields"], ensure_ascii=False, sort_keys=True),
                json.dumps(record["provenance"], ensure_ascii=False, sort_keys=True),
            ))
        connection.commit()
    finally:
        connection.close()


def inspect_database(database_path: Path) -> Dict[str, Any]:
    data = database_path.read_bytes()
    connection = sqlite3.connect(database_path)
    try:
        row_count = connection.execute("SELECT COUNT(*) FROM records").fetchone()[0]
        schema_sql = connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='records'").fetchone()[0]
    finally:
        connection.close()
    return {"row_count": row_count, "decoded_size_bytes": len(data), "decoded_sha256": sha256_bytes(data), "schema_sql": schema_sql}


def encode_database(database_path: Path, base64_path: Path) -> Dict[str, Any]:
    data = database_path.read_bytes()
    encoded = base64.b64encode(data).decode("ascii") + "\n"
    base64_path.write_text(encoded, encoding="ascii")
    return {"transport_encoding": "BASE64", "transport_size_bytes": len(encoded.encode("ascii")), "decoded_size_bytes": len(data), "decoded_sha256": sha256_bytes(data)}


def decode_database(base64_path: Path, decoded_path: Path) -> Dict[str, Any]:
    decoded = base64.b64decode(base64_path.read_text(encoding="ascii"))
    decoded_path.write_bytes(decoded)
    return inspect_database(decoded_path)
