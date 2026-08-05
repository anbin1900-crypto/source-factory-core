from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping
import json

from raw_artifact_store import canonical_json_bytes, sha256_bytes, RawArtifactError


def build_source_record_envelope(
    manifest: Mapping[str, Any], raw_root: Path, *, run_id: str
) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    for entry in manifest["entries"]:
        raw_path = Path(raw_root) / entry["stored_path"]
        raw_bytes = raw_path.read_bytes()
        if sha256_bytes(raw_bytes) != entry["sha256"]:
            raise RawArtifactError("source envelope raw SHA-256 mismatch")
        payload = json.loads(raw_bytes.decode("utf-8"))
        source_records = payload.get("records")
        if not isinstance(source_records, list):
            raise RawArtifactError("source envelope records must be a list")
        if len(source_records) != entry["record_count"]:
            raise RawArtifactError("source envelope record-count mismatch")
        for index, source_fields in enumerate(source_records):
            records.append(
                {
                    "source_record_id": f"{entry['artifact_id']}:{index}",
                    "raw_artifact_id": entry["artifact_id"],
                    "source_url": entry["source_url"],
                    "collected_at": entry["collected_at"],
                    "record_index": index,
                    "source_fields": source_fields,
                    "source_sha256": sha256_bytes(canonical_json_bytes(source_fields)),
                }
            )
    return {
        "schema_version": "1.0.0",
        "bundle_id": f"{run_id}-source-envelope",
        "records": records,
        "record_count": len(records),
        "semantic_transformation_count": 0,
    }


def build_request_summary(entries: list[Mapping[str, Any]], run_id: str) -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "request_summary_id": f"{run_id}-request-summary",
        "requests": [
            {
                "artifact_id": entry["artifact_id"],
                "source_url": entry["source_url"],
                "collected_at": entry["collected_at"],
                "method": entry["request_summary"]["method"],
                "page": entry["request_summary"]["page"],
                "credential_reference": entry["request_summary"].get(
                    "credential_reference"
                ),
                "record_count": entry["record_count"],
                "metadata": entry["metadata"],
            }
            for entry in entries
        ],
        "network_call_count": 0,
        "secret_value_exposure_count": 0,
    }
