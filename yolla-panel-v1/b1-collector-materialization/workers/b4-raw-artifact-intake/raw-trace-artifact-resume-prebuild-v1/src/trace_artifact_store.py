from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping

FORBIDDEN_SECRET_KEYS = {
    "authorization", "cookie", "token", "access_token", "refresh_token",
    "api_key", "apikey", "secret", "password", "sessionid", "session_id",
}
SECRET_TEXT_PATTERNS = [
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/\-=]{8,}\b"),
    re.compile(r"(?i)\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]{4,}"),
]

ARTIFACT_TYPES = {
    "RESPONSE_BODY", "DOM_SNAPSHOT", "TRACE", "SCREENSHOT", "RECEIPT"
}


class TraceArtifactError(ValueError):
    pass


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _assert_no_secret_metadata(value: Any, path: str = "$") -> None:
    if isinstance(value, Mapping):
        for key, nested in value.items():
            if str(key).lower() in FORBIDDEN_SECRET_KEYS:
                raise TraceArtifactError(f"secret metadata field prohibited at {path}.{key}")
            _assert_no_secret_metadata(nested, f"{path}.{key}")
    elif isinstance(value, list):
        for idx, nested in enumerate(value):
            _assert_no_secret_metadata(nested, f"{path}[{idx}]")


def _assert_no_secret_raw(data: bytes) -> None:
    text = data.decode("utf-8", errors="ignore")
    for pattern in SECRET_TEXT_PATTERNS:
        if pattern.search(text):
            raise TraceArtifactError("secret-like raw content prohibited")


@dataclass(frozen=True)
class TraceArtifactEnvelope:
    schema_version: str
    artifact_id: str
    artifact_type: str
    status: str
    page_id: str
    action_id: str
    request_id: str
    command_id: str
    source_url: str
    captured_at: str
    sha256: str
    size_bytes: int
    record_count: int
    stored_path: str
    lineage_seq: int
    previous_artifact_id: str | None
    pagination_cursor: str | None
    retry_count: int
    resume_cursor: str | None
    redaction_metadata: dict[str, Any]


class AppendOnlyTraceArtifactStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.completed_dir = self.root / "completed"
        self.partial_dir = self.root / "partial"
        self.ledger_path = self.root / "lineage.jsonl"
        self.completed_dir.mkdir(parents=True, exist_ok=True)
        self.partial_dir.mkdir(parents=True, exist_ok=True)

    def _ledger_entries(self) -> list[dict[str, Any]]:
        if not self.ledger_path.exists():
            return []
        out: list[dict[str, Any]] = []
        for line in self.ledger_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                out.append(json.loads(line))
        return out

    def verify_ledger(self) -> None:
        prev = "GENESIS"
        for idx, row in enumerate(self._ledger_entries(), start=1):
            payload = dict(row)
            entry_hash = payload.pop("entry_hash")
            if payload.get("previous_entry_hash") != prev:
                raise TraceArtifactError(f"ledger chain break at sequence {idx}")
            if sha256_bytes(canonical_json_bytes(payload)) != entry_hash:
                raise TraceArtifactError(f"ledger hash mismatch at sequence {idx}")
            prev = entry_hash

    def _append_ledger(self, event: dict[str, Any]) -> dict[str, Any]:
        rows = self._ledger_entries()
        previous_entry_hash = rows[-1]["entry_hash"] if rows else "GENESIS"
        payload = dict(event)
        payload["previous_entry_hash"] = previous_entry_hash
        entry_hash = sha256_bytes(canonical_json_bytes(payload))
        row = dict(payload)
        row["entry_hash"] = entry_hash
        with self.ledger_path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        return row

    def stage_partial(
        self,
        *,
        artifact_type: str,
        raw_bytes: bytes,
        page_id: str,
        action_id: str,
        request_id: str,
        command_id: str,
        source_url: str,
        captured_at: str,
        record_count: int,
        pagination_cursor: str | None,
        retry_count: int,
        resume_cursor: str | None,
        redaction_metadata: Mapping[str, Any],
    ) -> dict[str, Any]:
        if artifact_type not in ARTIFACT_TYPES:
            raise TraceArtifactError("unsupported artifact_type")
        if record_count < 0 or retry_count < 0:
            raise TraceArtifactError("negative count prohibited")
        _assert_no_secret_metadata(redaction_metadata)
        _assert_no_secret_raw(raw_bytes)
        digest = sha256_bytes(raw_bytes)
        partial_id = f"partial-{command_id}-{artifact_type.lower()}-{digest[:12]}"
        target = self.partial_dir / f"{partial_id}.partial"
        try:
            with target.open("xb") as handle:
                handle.write(raw_bytes)
                handle.flush()
                os.fsync(handle.fileno())
        except FileExistsError as exc:
            raise TraceArtifactError("partial artifact overwrite rejected") from exc
        meta = {
            "schema_version": "PARTIAL_ARTIFACT_RECOVERY_V1",
            "partial_id": partial_id,
            "artifact_type": artifact_type,
            "status": "PARTIAL",
            "page_id": page_id,
            "action_id": action_id,
            "request_id": request_id,
            "command_id": command_id,
            "source_url": source_url,
            "captured_at": captured_at,
            "sha256": digest,
            "size_bytes": len(raw_bytes),
            "record_count": record_count,
            "pagination_cursor": pagination_cursor,
            "retry_count": retry_count,
            "resume_cursor": resume_cursor,
            "redaction_metadata": dict(redaction_metadata),
            "stored_path": str(target.relative_to(self.root)).replace("\\", "/"),
        }
        meta_path = self.partial_dir / f"{partial_id}.json"
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        return meta

    def promote_partial(self, partial_id: str) -> TraceArtifactEnvelope:
        meta_path = self.partial_dir / f"{partial_id}.json"
        if not meta_path.exists():
            raise TraceArtifactError("partial metadata not found")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        partial_path = self.root / meta["stored_path"]
        raw = partial_path.read_bytes()
        if sha256_bytes(raw) != meta["sha256"]:
            raise TraceArtifactError("partial artifact hash mismatch")
        rows = self._ledger_entries()
        lineage_seq = len(rows) + 1
        previous_artifact_id = None
        for row in reversed(rows):
            if row.get("event") == "ARTIFACT_COMPLETED":
                previous_artifact_id = row["artifact"]["artifact_id"]
                break
        artifact_id = f"artifact-{lineage_seq:06d}-{meta['sha256'][:16]}"
        final_name = f"{artifact_id}.bin"
        final_path = self.completed_dir / final_name
        try:
            with final_path.open("xb") as handle:
                handle.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
        except FileExistsError as exc:
            raise TraceArtifactError("completed artifact overwrite rejected") from exc
        envelope = TraceArtifactEnvelope(
            schema_version="SOURCE_TRACE_ARTIFACT_ENVELOPE_V1",
            artifact_id=artifact_id,
            artifact_type=meta["artifact_type"],
            status="COMPLETED",
            page_id=meta["page_id"],
            action_id=meta["action_id"],
            request_id=meta["request_id"],
            command_id=meta["command_id"],
            source_url=meta["source_url"],
            captured_at=meta["captured_at"],
            sha256=meta["sha256"],
            size_bytes=meta["size_bytes"],
            record_count=meta["record_count"],
            stored_path=str(final_path.relative_to(self.root)).replace("\\", "/"),
            lineage_seq=lineage_seq,
            previous_artifact_id=previous_artifact_id,
            pagination_cursor=meta.get("pagination_cursor"),
            retry_count=int(meta.get("retry_count", 0)),
            resume_cursor=meta.get("resume_cursor"),
            redaction_metadata=dict(meta["redaction_metadata"]),
        )
        self._append_ledger({
            "schema_version": "SOURCE_TRACE_ARTIFACT_LINEAGE_EVENT_V1",
            "event": "ARTIFACT_COMPLETED",
            "artifact": asdict(envelope),
        })
        meta["status"] = "PROMOTED"
        meta["promoted_artifact_id"] = artifact_id
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        partial_path.unlink()
        self.verify_ledger()
        return envelope

    def abandon_partial(self, partial_id: str, reason: str) -> dict[str, Any]:
        meta_path = self.partial_dir / f"{partial_id}.json"
        if not meta_path.exists():
            raise TraceArtifactError("partial metadata not found")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["status"] = "ABANDONED"
        meta["recovery_reason"] = reason
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        self._append_ledger({
            "schema_version": "PARTIAL_ARTIFACT_RECOVERY_EVENT_V1",
            "event": "PARTIAL_ABANDONED",
            "partial_id": partial_id,
            "resume_cursor": meta.get("resume_cursor"),
            "reason": reason,
        })
        self.verify_ledger()
        return meta

    def last_confirmed_artifact(self) -> dict[str, Any] | None:
        for row in reversed(self._ledger_entries()):
            if row.get("event") == "ARTIFACT_COMPLETED":
                return dict(row["artifact"])
        return None

    def read_completed(self, artifact_id: str) -> bytes:
        for row in self._ledger_entries():
            if row.get("event") == "ARTIFACT_COMPLETED" and row["artifact"]["artifact_id"] == artifact_id:
                entry = row["artifact"]
                data = (self.root / entry["stored_path"]).read_bytes()
                if sha256_bytes(data) != entry["sha256"]:
                    raise TraceArtifactError("completed artifact readback hash mismatch")
                return data
        raise TraceArtifactError("artifact not found")

    def recovery_state(self) -> dict[str, Any]:
        last = self.last_confirmed_artifact()
        partials = []
        for path in sorted(self.partial_dir.glob("*.json")):
            meta = json.loads(path.read_text(encoding="utf-8"))
            if meta.get("status") == "PARTIAL":
                partials.append(meta)
        return {
            "schema_version": "PAGINATION_RETRY_RESUME_STATE_V1",
            "last_confirmed_artifact_id": last["artifact_id"] if last else None,
            "pagination_cursor": last.get("pagination_cursor") if last else None,
            "retry_count": last.get("retry_count", 0) if last else 0,
            "resume_cursor": last.get("resume_cursor") if last else "page:1",
            "partial_artifact_count": len(partials),
            "partial_artifact_ids": [p["partial_id"] for p in partials],
            "recovery_rule": "RESUME_FROM_LAST_COMPLETED_ARTIFACT_NEVER_FROM_PARTIAL",
        }
