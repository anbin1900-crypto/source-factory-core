from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from hashlib import sha256
import json
import re
from typing import Any


class CollectionRunLedgerError(ValueError):
    """Base fail-closed error for the D collection-run ledger."""


class InvalidTransitionError(CollectionRunLedgerError):
    pass


class IdempotencyConflictError(CollectionRunLedgerError):
    pass


class LedgerIntegrityError(CollectionRunLedgerError):
    pass


class TimestampRegressionError(CollectionRunLedgerError):
    pass


_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()


def parse_timestamp(value: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise CollectionRunLedgerError("timestamp must be a non-empty ISO-8601 string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CollectionRunLedgerError("timestamp must be valid ISO-8601") from exc
    if parsed.tzinfo is None:
        raise CollectionRunLedgerError("timestamp must include timezone")
    return parsed


def validate_sha256(value: str, field_name: str = "sha256") -> None:
    if not isinstance(value, str) or _SHA256_RE.fullmatch(value) is None:
        raise CollectionRunLedgerError(f"{field_name} must be lowercase 64-hex sha256")


class DCollectionRunResumeLedger:
    """Append-only producer-native ledger prepared for D intake.

    It never creates a D canonical identifier, never calls a site, and never
    performs automated pagination. It emits COLLECTION_RUN and PROCESSING_EVENT
    facts with retry/resume lineage and deterministic hash-chain integrity.
    """

    ALLOWED_EVENT_TO_STATUS = {
        "RUN_CREATED": "CREATED",
        "RUN_STARTED": "RUNNING",
        "RETRY_SCHEDULED": "RETRY_WAIT",
        "RUN_INTERRUPTED": "INTERRUPTED",
        "RUN_RESUMED": "RESUMED",
        "RUN_COMPLETED": "COMPLETED",
        "RUN_FAILED": "FAILED",
    }
    ALLOWED_TRANSITIONS = {
        None: {"CREATED"},
        "CREATED": {"RUNNING", "FAILED"},
        "RUNNING": {"RETRY_WAIT", "INTERRUPTED", "COMPLETED", "FAILED"},
        "RETRY_WAIT": {"RUNNING", "FAILED"},
        "INTERRUPTED": {"RESUMED", "FAILED"},
        "RESUMED": {"RUNNING", "FAILED"},
        "COMPLETED": set(),
        "FAILED": set(),
    }
    TERMINAL_STATUSES = {"COMPLETED", "FAILED"}

    def __init__(
        self,
        *,
        source_key: str,
        native_run_key: str,
        package_sha256: str,
        entries: list[dict[str, Any]] | None = None,
    ) -> None:
        if not isinstance(source_key, str) or not source_key.strip():
            raise CollectionRunLedgerError("source_key is required")
        if not isinstance(native_run_key, str) or not native_run_key.strip():
            raise CollectionRunLedgerError("native_run_key is required")
        validate_sha256(package_sha256, "package_sha256")
        self.source_key = source_key
        self.native_run_key = native_run_key
        self.package_sha256 = package_sha256
        self._entries = deepcopy(entries or [])
        self._idempotency_index: dict[str, tuple[str, int]] = {}
        self.validate()

    @property
    def entries(self) -> list[dict[str, Any]]:
        return deepcopy(self._entries)

    @property
    def status(self) -> str | None:
        return self._entries[-1]["status_to"] if self._entries else None

    def _request_payload(
        self,
        *,
        event_type: str,
        occurred_at: str,
        idempotency_key: str,
        retry_attempt: int,
        resume_from_event_id: str | None,
        details: dict[str, Any] | None,
    ) -> dict[str, Any]:
        return {
            "event_type": event_type,
            "occurred_at": occurred_at,
            "idempotency_key": idempotency_key,
            "retry_attempt": retry_attempt,
            "resume_from_event_id": resume_from_event_id,
            "details": deepcopy(details or {}),
        }

    def record_event(
        self,
        *,
        event_type: str,
        occurred_at: str,
        idempotency_key: str,
        retry_attempt: int = 0,
        resume_from_event_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], bool]:
        if event_type not in self.ALLOWED_EVENT_TO_STATUS:
            raise CollectionRunLedgerError("unknown event_type")
        if not isinstance(idempotency_key, str) or not idempotency_key.strip():
            raise CollectionRunLedgerError("idempotency_key is required")
        if not isinstance(retry_attempt, int) or retry_attempt < 0:
            raise CollectionRunLedgerError("retry_attempt must be a non-negative integer")
        occurred = parse_timestamp(occurred_at)
        if self._entries and occurred < parse_timestamp(self._entries[-1]["occurred_at"]):
            raise TimestampRegressionError("processing event timestamp regression")

        request_payload = self._request_payload(
            event_type=event_type,
            occurred_at=occurred_at,
            idempotency_key=idempotency_key,
            retry_attempt=retry_attempt,
            resume_from_event_id=resume_from_event_id,
            details=details,
        )
        payload_sha256 = sha256_json(request_payload)
        prior = self._idempotency_index.get(idempotency_key)
        if prior is not None:
            prior_payload_hash, index = prior
            if prior_payload_hash != payload_sha256:
                raise IdempotencyConflictError("idempotency key reused with different payload")
            return deepcopy(self._entries[index]), False

        status_from = self.status
        status_to = self.ALLOWED_EVENT_TO_STATUS[event_type]
        if status_to not in self.ALLOWED_TRANSITIONS[status_from]:
            raise InvalidTransitionError(f"transition {status_from!r} -> {status_to!r} is not allowed")

        if event_type == "RUN_RESUMED":
            if not resume_from_event_id:
                raise CollectionRunLedgerError("resume_from_event_id is required for RUN_RESUMED")
            interrupted = next(
                (
                    entry
                    for entry in self._entries
                    if entry["native_event_id"] == resume_from_event_id
                    and entry["event_type"] == "RUN_INTERRUPTED"
                ),
                None,
            )
            if interrupted is None:
                raise CollectionRunLedgerError("resume_from_event_id must reference RUN_INTERRUPTED")
        elif resume_from_event_id is not None:
            raise CollectionRunLedgerError("resume_from_event_id is only valid for RUN_RESUMED")

        existing_retry_attempt = max((entry["retry_attempt"] for entry in self._entries), default=0)
        if retry_attempt < existing_retry_attempt:
            raise CollectionRunLedgerError("retry_attempt regression")
        if event_type == "RETRY_SCHEDULED" and retry_attempt <= existing_retry_attempt:
            raise CollectionRunLedgerError("RETRY_SCHEDULED must increment retry_attempt")

        sequence = len(self._entries) + 1
        previous_event_hash = self._entries[-1]["event_hash"] if self._entries else "0" * 64
        native_event_id = f"{self.native_run_key}:event:{sequence:04d}"
        event_body = {
            "native_event_id": native_event_id,
            "sequence": sequence,
            "event_type": event_type,
            "status_from": status_from,
            "status_to": status_to,
            "occurred_at": occurred_at,
            "idempotency_key": idempotency_key,
            "retry_attempt": retry_attempt,
            "resume_from_event_id": resume_from_event_id,
            "details": deepcopy(details or {}),
            "payload_sha256": payload_sha256,
            "previous_event_hash": previous_event_hash,
        }
        event_body["event_hash"] = sha256_json(event_body)
        self._entries.append(event_body)
        self._idempotency_index[idempotency_key] = (payload_sha256, sequence - 1)
        return deepcopy(event_body), True

    def validate(self) -> bool:
        previous_hash = "0" * 64
        previous_status: str | None = None
        previous_time: datetime | None = None
        max_retry_attempt = 0
        self._idempotency_index = {}

        for expected_sequence, entry in enumerate(self._entries, start=1):
            if entry.get("sequence") != expected_sequence:
                raise LedgerIntegrityError("non-contiguous processing event sequence")
            expected_event_id = f"{self.native_run_key}:event:{expected_sequence:04d}"
            if entry.get("native_event_id") != expected_event_id:
                raise LedgerIntegrityError("native_event_id mismatch")
            event_type = entry.get("event_type")
            if event_type not in self.ALLOWED_EVENT_TO_STATUS:
                raise LedgerIntegrityError("unknown event_type in ledger")
            expected_status = self.ALLOWED_EVENT_TO_STATUS[event_type]
            if entry.get("status_from") != previous_status or entry.get("status_to") != expected_status:
                raise LedgerIntegrityError("status transition binding mismatch")
            if expected_status not in self.ALLOWED_TRANSITIONS[previous_status]:
                raise LedgerIntegrityError("invalid persisted status transition")
            occurred = parse_timestamp(entry.get("occurred_at"))
            if previous_time is not None and occurred < previous_time:
                raise LedgerIntegrityError("persisted timestamp regression")
            if entry.get("previous_event_hash") != previous_hash:
                raise LedgerIntegrityError("previous_event_hash mismatch")

            request_payload = self._request_payload(
                event_type=event_type,
                occurred_at=entry["occurred_at"],
                idempotency_key=entry["idempotency_key"],
                retry_attempt=entry["retry_attempt"],
                resume_from_event_id=entry.get("resume_from_event_id"),
                details=entry.get("details"),
            )
            payload_hash = sha256_json(request_payload)
            if entry.get("payload_sha256") != payload_hash:
                raise LedgerIntegrityError("payload_sha256 mismatch")
            event_body = {key: entry[key] for key in entry if key != "event_hash"}
            expected_hash = sha256_json(event_body)
            if entry.get("event_hash") != expected_hash:
                raise LedgerIntegrityError("event_hash mismatch")

            key = entry.get("idempotency_key")
            if key in self._idempotency_index:
                raise LedgerIntegrityError("duplicate idempotency key persisted")
            self._idempotency_index[key] = (payload_hash, expected_sequence - 1)

            retry_attempt = entry.get("retry_attempt")
            if not isinstance(retry_attempt, int) or retry_attempt < max_retry_attempt:
                raise LedgerIntegrityError("retry_attempt regression")
            if event_type == "RETRY_SCHEDULED" and retry_attempt <= max_retry_attempt:
                raise LedgerIntegrityError("retry attempt did not increment")
            max_retry_attempt = max(max_retry_attempt, retry_attempt)

            if event_type == "RUN_RESUMED":
                resume_id = entry.get("resume_from_event_id")
                if not any(
                    prior_entry["native_event_id"] == resume_id
                    and prior_entry["event_type"] == "RUN_INTERRUPTED"
                    for prior_entry in self._entries[: expected_sequence - 1]
                ):
                    raise LedgerIntegrityError("invalid resume lineage")
            elif entry.get("resume_from_event_id") is not None:
                raise LedgerIntegrityError("unexpected resume_from_event_id")

            previous_hash = expected_hash
            previous_status = expected_status
            previous_time = occurred
        return True

    def to_d_consumption_payload(self) -> dict[str, Any]:
        self.validate()
        started = next((entry["occurred_at"] for entry in self._entries if entry["status_to"] == "RUNNING"), None)
        ended = self._entries[-1]["occurred_at"] if self.status in self.TERMINAL_STATUSES else None
        interruption_ids = [
            entry["native_event_id"] for entry in self._entries if entry["event_type"] == "RUN_INTERRUPTED"
        ]
        resume_edges = [
            {
                "resume_event_id": entry["native_event_id"],
                "resume_from_event_id": entry["resume_from_event_id"],
            }
            for entry in self._entries
            if entry["event_type"] == "RUN_RESUMED"
        ]
        return {
            "schema_version": "B3_D_COLLECTION_RUN_RESUME_LEDGER_V1",
            "collection_run": {
                "native_run_identity": {
                    "source_key": self.source_key,
                    "native_run_key": self.native_run_key,
                },
                "d_canonical_run_id": None,
                "package_sha256": self.package_sha256,
                "started_at": started,
                "ended_at": ended,
                "status": self.status,
                "retry_count": max((entry["retry_attempt"] for entry in self._entries), default=0),
                "resume_count": len(resume_edges),
                "processing_event_count": len(self._entries),
            },
            "processing_events": self.entries,
            "retry_resume_lineage": {
                "interruption_event_ids": interruption_ids,
                "resume_edges": resume_edges,
            },
            "safety": {
                "site_call_count": 0,
                "automated_pagination": False,
                "d_canonical_id_generation": False,
                "production": False,
                "ready": False,
                "merge": False,
            },
        }

    @classmethod
    def from_d_consumption_payload(cls, payload: dict[str, Any]) -> "DCollectionRunResumeLedger":
        if payload.get("schema_version") != "B3_D_COLLECTION_RUN_RESUME_LEDGER_V1":
            raise CollectionRunLedgerError("unsupported schema_version")
        run = payload.get("collection_run") or {}
        identity = run.get("native_run_identity") or {}
        if run.get("d_canonical_run_id") is not None:
            raise CollectionRunLedgerError("D canonical run id must not be generated")
        ledger = cls(
            source_key=identity.get("source_key"),
            native_run_key=identity.get("native_run_key"),
            package_sha256=run.get("package_sha256"),
            entries=payload.get("processing_events") or [],
        )
        if ledger.to_d_consumption_payload() != payload:
            raise LedgerIntegrityError("D consumption payload derived fields mismatch")
        return ledger
