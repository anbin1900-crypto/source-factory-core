"""Local exactly-once claim store for Source Factory dry-run/runtime preparation.

This module is intentionally local-file based. It does not mutate a remote queue,
call GitHub APIs, send prompts, launch browsers, start PC Agent services, call
external APIs, transmit middleware data, or deploy production.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_dedupe_key(queue_id: str, assignment_id: str, worker_id: str) -> str:
    raw = "|".join([queue_id.strip(), assignment_id.strip(), worker_id.strip()])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ClaimAttempt:
    status: str
    dedupe_key: str
    queue_id: str
    assignment_id: str
    worker_id: str
    claim_key: str
    created_at: str
    duplicate_of: Optional[str] = None


class LocalClaimStore:
    """Small JSON-backed claim store used for exactly-once validation."""

    def __init__(self, store_path: str | Path):
        self.store_path = Path(store_path)
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.store_path.exists():
            self._write({"schema_version": "SOURCE_FACTORY_LOCAL_CLAIM_STORE_V1", "claims": []})

    def _read(self) -> Dict[str, Any]:
        return json.loads(self.store_path.read_text(encoding="utf-8"))

    def _write(self, payload: Dict[str, Any]) -> None:
        self.store_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_claims(self) -> List[Dict[str, Any]]:
        payload = self._read()
        claims = payload.get("claims", [])
        if not isinstance(claims, list):
            raise ValueError("Invalid local claim store: claims is not a list")
        return claims

    def try_claim(self, *, queue_id: str, assignment_id: str, worker_id: str) -> ClaimAttempt:
        dedupe_key = build_dedupe_key(queue_id, assignment_id, worker_id)
        payload = self._read()
        claims = payload.setdefault("claims", [])
        if not isinstance(claims, list):
            raise ValueError("Invalid local claim store: claims is not a list")

        for existing in claims:
            if existing.get("dedupe_key") == dedupe_key:
                return ClaimAttempt(
                    status="REJECTED_DUPLICATE_CLAIM",
                    dedupe_key=dedupe_key,
                    queue_id=queue_id,
                    assignment_id=assignment_id,
                    worker_id=worker_id,
                    claim_key=existing.get("claim_key", ""),
                    created_at=utc_now_iso(),
                    duplicate_of=existing.get("claim_key", ""),
                )

        claim_key = "CLAIM-" + dedupe_key[:24]
        attempt = ClaimAttempt(
            status="ACCEPTED_FIRST_CLAIM",
            dedupe_key=dedupe_key,
            queue_id=queue_id,
            assignment_id=assignment_id,
            worker_id=worker_id,
            claim_key=claim_key,
            created_at=utc_now_iso(),
        )
        claims.append(asdict(attempt))
        self._write(payload)
        return attempt


__all__ = ["LocalClaimStore", "ClaimAttempt", "build_dedupe_key"]
