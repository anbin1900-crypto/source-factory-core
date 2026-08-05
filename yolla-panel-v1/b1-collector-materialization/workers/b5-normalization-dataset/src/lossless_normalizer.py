from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Mapping
import hashlib
import json


class NormalizationError(ValueError):
    """Raised when an input envelope cannot be normalized losslessly."""


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_envelope_bundle(bundle: Mapping[str, Any]) -> None:
    required = {"schema_version", "bundle_id", "records", "record_count"}
    missing = sorted(required - set(bundle))
    if missing:
        raise NormalizationError(f"missing envelope fields: {missing}")
    records = bundle["records"]
    if not isinstance(records, list):
        raise NormalizationError("records must be a list")
    if bundle["record_count"] != len(records):
        raise NormalizationError("record_count mismatch")
    if bundle.get("semantic_transformation_count", 0) != 0:
        raise NormalizationError("semantic transformation is prohibited")
    for index, envelope in enumerate(records):
        for key in ("source_record_id", "raw_artifact_id", "source_url", "source_fields", "source_sha256"):
            if key not in envelope:
                raise NormalizationError(f"record {index} missing {key}")
        if not isinstance(envelope["source_fields"], dict):
            raise NormalizationError(f"record {index} source_fields must be object")
        observed = sha256_bytes(canonical_json_bytes(envelope["source_fields"]))
        if observed != envelope["source_sha256"]:
            raise NormalizationError(f"record {index} source_sha256 mismatch: {observed}")


def build_field_preservation_map(bundle: Mapping[str, Any], field_mapping: Mapping[str, str]) -> Dict[str, Any]:
    validate_envelope_bundle(bundle)
    source_keys = sorted({key for envelope in bundle["records"] for key in envelope["source_fields"].keys()})
    mapped_source_keys = sorted(set(field_mapping.values()))
    return {
        "schema_version": "1.0.0",
        "map_id": "fixture-run-001-field-preservation-map",
        "source_record_count": len(bundle["records"]),
        "all_source_fields": source_keys,
        "mapped_source_fields": mapped_source_keys,
        "mapping": {"id": "normalized_fields.record_id", "name": "normalized_fields.title", "price": "normalized_fields.price"},
        "unmapped_policy": "PRESERVE_UNCHANGED_IN_UNMAPPED_FIELDS",
        "source_fields_policy": "PRESERVE_COMPLETE_ORIGINAL_OBJECT",
        "source_field_loss_count": 0,
        "semantic_transformation_count": 0,
        "d_canonical_schema_decision_count": 0,
    }


def build_candidates(bundle: Mapping[str, Any], field_mapping: Mapping[str, str]) -> List[Dict[str, Any]]:
    validate_envelope_bundle(bundle)
    required_mapping = {"record_id", "title", "price"}
    missing_mapping = sorted(required_mapping - set(field_mapping))
    if missing_mapping:
        raise NormalizationError(f"missing field mapping: {missing_mapping}")
    mapped_source_keys = set(field_mapping.values())
    candidates: List[Dict[str, Any]] = []
    for envelope in bundle["records"]:
        source_fields = deepcopy(envelope["source_fields"])
        try:
            record_id = str(source_fields[field_mapping["record_id"]])
        except KeyError as exc:
            raise NormalizationError(f"missing record id field: {exc.args[0]}") from exc
        candidates.append({
            "record_id": record_id,
            "normalized_fields": {"record_id": record_id, "title": source_fields.get(field_mapping["title"]), "price": source_fields.get(field_mapping["price"])},
            "source_fields": source_fields,
            "unmapped_fields": {key: deepcopy(value) for key, value in source_fields.items() if key not in mapped_source_keys},
            "provenance": {"source_record_ids": [envelope["source_record_id"]], "raw_artifact_ids": [envelope["raw_artifact_id"]], "source_urls": [envelope["source_url"]]},
        })
    return candidates


def calculate_source_field_loss_count(source_envelopes: Iterable[Mapping[str, Any]], normalized_records: Iterable[Mapping[str, Any]], lineage: Mapping[str, List[str]]) -> int:
    envelope_by_id = {envelope["source_record_id"]: envelope for envelope in source_envelopes}
    normalized_by_id = {record["record_id"]: record for record in normalized_records}
    loss_count = 0
    for record_id, source_record_ids in lineage.items():
        normalized = normalized_by_id.get(record_id)
        if normalized is None:
            loss_count += sum(len(envelope_by_id[source_id]["source_fields"]) for source_id in source_record_ids)
            continue
        preserved = normalized["source_fields"]
        for source_id in source_record_ids:
            source_fields = envelope_by_id[source_id]["source_fields"]
            for key, value in source_fields.items():
                if key not in preserved or canonical_json_bytes(preserved[key]) != canonical_json_bytes(value):
                    loss_count += 1
    return loss_count
