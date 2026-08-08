from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
import hashlib
import json

FORBIDDEN_SECRET_KEYS = {
    "api_key", "apikey", "secret", "token", "password",
    "authorization", "cookie", "access_token", "refresh_token",
}


class RawArtifactError(ValueError):
    """Raised when immutable raw-artifact rules are violated."""


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _assert_no_secret_values(value: Any, path: str = "$") -> None:
    if isinstance(value, Mapping):
        for key, nested in value.items():
            key_text = str(key).lower()
            if key_text in FORBIDDEN_SECRET_KEYS:
                raise RawArtifactError(f"secret field prohibited at {path}.{key}")
            _assert_no_secret_values(nested, f"{path}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            _assert_no_secret_values(nested, f"{path}[{index}]")


@dataclass(frozen=True)
class StoredArtifact:
    entry: dict[str, Any]
    raw_bytes: bytes


class ImmutableRawArtifactStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def append(
        self,
        *,
        page: int,
        raw_bytes: bytes,
        source_url: str,
        collected_at: str,
        request_summary: Mapping[str, Any],
    ) -> StoredArtifact:
        _assert_no_secret_values(request_summary)
        try:
            payload = json.loads(raw_bytes.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RawArtifactError("raw artifact must be UTF-8 JSON") from exc
        records = payload.get("records")
        if not isinstance(records, list):
            raise RawArtifactError("raw artifact records must be a list")

        digest = sha256_bytes(raw_bytes)
        artifact_id = f"raw-{page:03d}-{digest[:16]}"
        filename = f"{artifact_id}.json"
        target = self.root / filename
        try:
            with target.open("xb") as handle:
                handle.write(raw_bytes)
        except FileExistsError as exc:
            raise RawArtifactError("raw artifact overwrite rejected") from exc

        readback = target.read_bytes()
        if readback != raw_bytes:
            raise RawArtifactError("raw artifact readback byte mismatch")

        entry = {
            "artifact_id": artifact_id,
            "source_url": source_url,
            "collected_at": collected_at,
            "sha256": digest,
            "size_bytes": len(raw_bytes),
            "record_count": len(records),
            "metadata": payload.get("metadata", {}),
            "request_summary": dict(request_summary),
            "stored_path": filename,
        }
        return StoredArtifact(entry=entry, raw_bytes=readback)

    def verify_entry(self, entry: Mapping[str, Any]) -> bytes:
        raw_bytes = (self.root / str(entry["stored_path"])).read_bytes()
        if len(raw_bytes) != entry["size_bytes"]:
            raise RawArtifactError("raw artifact size mismatch")
        if sha256_bytes(raw_bytes) != entry["sha256"]:
            raise RawArtifactError("raw artifact SHA-256 mismatch")
        return raw_bytes


def build_manifest(entries: list[Mapping[str, Any]], run_id: str) -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "manifest_id": f"{run_id}-raw-manifest",
        "entries": [dict(entry) for entry in entries],
        "artifact_count": len(entries),
        "total_record_count": sum(int(entry["record_count"]) for entry in entries),
        "immutability": "APPEND_ONLY_NO_OVERWRITE",
    }
