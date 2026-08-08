from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Mapping, Tuple
import json


class DeduplicationError(ValueError):
    """Raised when records with the same identity conflict."""


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def deduplicate_candidates(candidates: Iterable[Mapping[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, List[str]], int]:
    normalized_records: List[Dict[str, Any]] = []
    seen: Dict[str, Dict[str, Any]] = {}
    lineage: Dict[str, List[str]] = {}
    duplicate_count = 0
    for candidate_value in candidates:
        candidate = deepcopy(dict(candidate_value))
        record_id = str(candidate["record_id"])
        source_record_id = candidate["provenance"]["source_record_ids"][0]
        lineage.setdefault(record_id, []).append(source_record_id)
        if record_id in seen:
            if canonical_json_bytes(seen[record_id]["source_fields"]) != canonical_json_bytes(candidate["source_fields"]):
                raise DeduplicationError(f"conflicting duplicate record: {record_id}")
            duplicate_count += 1
            continue
        seen[record_id] = candidate
        normalized_records.append(candidate)
    for record in normalized_records:
        source_record_ids = lineage[record["record_id"]]
        record["provenance"]["source_record_ids"] = source_record_ids
        record["provenance"]["raw_artifact_ids"] = sorted({source_record_id.split(":")[0] for source_record_id in source_record_ids})
    return normalized_records, lineage, duplicate_count


def build_dedup_lineage_contract(lineage: Mapping[str, List[str]], duplicate_count: int) -> Dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "lineage_id": "fixture-run-001-dedup-lineage",
        "identity_key": "source_fields.id",
        "duplicate_equivalence": "CANONICAL_SOURCE_FIELDS_BYTE_EQUAL",
        "conflicting_duplicate_policy": "FAIL_CLOSED",
        "lineage": dict(lineage),
        "duplicate_count": duplicate_count,
        "source_record_reference_count": sum(len(ids) for ids in lineage.values()),
        "distinct_record_count": len(lineage),
    }
