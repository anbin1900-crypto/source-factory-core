from __future__ import annotations

from pathlib import Path
from typing import Any, Dict
import json

from deduplicator import build_dedup_lineage_contract, deduplicate_candidates
from lossless_normalizer import build_candidates, build_field_preservation_map, calculate_source_field_loss_count, canonical_json_bytes, sha256_bytes
from sqlite_materializer import decode_database, encode_database, inspect_database, materialize_records

EXPECTED_NORMALIZED_DATASET_SHA256 = "add8698d36c9a87043409168ce6831cf3ab87ff5d77db98c2a81aa782591a112"
EXPECTED_SQLITE_SHA256 = "f03e20844e805af3105791934352f8bc3dcbeb1a165ad5c80e5d6ae5739ea14d"
EXPECTED_SQLITE_SIZE = 12288
RAW_ARTIFACT_MANIFEST_SHA256 = "9059a443c88103cf1472b50617e61097b29ad8e118825485c2a1d68ccf748a97"


def write_canonical(path: Path, value: Any) -> str:
    data = canonical_json_bytes(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return sha256_bytes(data)


def build_package(root: Path) -> Dict[str, Any]:
    fixture_path = root / "fixtures" / "SOURCE_RECORD_ENVELOPE_V1.json"
    generated = root / "generated"
    generated.mkdir(parents=True, exist_ok=True)
    envelope_bundle = json.loads(fixture_path.read_text(encoding="utf-8"))
    field_mapping = {"record_id": "id", "title": "name", "price": "price"}
    candidates = build_candidates(envelope_bundle, field_mapping)
    normalized_records, lineage, duplicate_count = deduplicate_candidates(candidates)
    source_field_loss_count = calculate_source_field_loss_count(envelope_bundle["records"], normalized_records, lineage)
    if source_field_loss_count != 0:
        raise RuntimeError(f"source field loss detected: {source_field_loss_count}")
    field_preservation_map = build_field_preservation_map(envelope_bundle, field_mapping)
    dedup_lineage = build_dedup_lineage_contract(lineage, duplicate_count)
    dataset = {
        "schema_version": "1.0.0",
        "dataset_id": "fixture-run-001-normalized-dataset",
        "records": normalized_records,
        "input_record_count": len(envelope_bundle["records"]),
        "output_record_count": len(normalized_records),
        "duplicate_count": duplicate_count,
        "source_field_loss_count": source_field_loss_count,
        "dedup_lineage": lineage,
        "semantic_transformation_count": 0,
        "d_canonical_schema_decision_count": 0,
    }
    dataset_sha256 = write_canonical(generated / "NORMALIZED_DATASET_V1.json", dataset)
    if dataset_sha256 != EXPECTED_NORMALIZED_DATASET_SHA256:
        raise RuntimeError(f"normalized dataset sha mismatch: {dataset_sha256}")
    envelope_sha256 = sha256_bytes(canonical_json_bytes(envelope_bundle))
    receipt = {
        "schema_version": "1.0.0",
        "run_id": "fixture-run-001",
        "adapter_id": "fixture.real-estate.listings.v1",
        "mode": "FIXTURE",
        "raw_artifact_manifest_sha256": RAW_ARTIFACT_MANIFEST_SHA256,
        "source_record_envelope_sha256": envelope_sha256,
        "normalized_dataset_sha256": dataset_sha256,
        "input_record_count": len(envelope_bundle["records"]),
        "output_record_count": len(normalized_records),
        "duplicate_count": duplicate_count,
        "network_call_count": 0,
        "actual_site_extraction": False,
        "status": "FIXTURE_E2E_PASS",
    }
    extraction_receipt_sha256 = write_canonical(generated / "EXTRACTION_RECEIPT_V1.json", receipt)
    write_canonical(generated / "FIELD_PRESERVATION_MAP_V1.json", field_preservation_map)
    write_canonical(generated / "DEDUP_LINEAGE_V1.json", dedup_lineage)
    database_path = generated / "fixture_materialized.sqlite"
    materialize_records(normalized_records, database_path)
    database_inspection = inspect_database(database_path)
    if database_inspection["row_count"] != 3:
        raise RuntimeError("sqlite row count mismatch")
    if database_inspection["decoded_size_bytes"] != EXPECTED_SQLITE_SIZE:
        raise RuntimeError("sqlite size mismatch")
    if database_inspection["decoded_sha256"] != EXPECTED_SQLITE_SHA256:
        raise RuntimeError("sqlite sha mismatch")
    base64_path = generated / "fixture_materialized.sqlite.b64"
    base64_transport = encode_database(database_path, base64_path)
    decoded_path = generated / "fixture_materialized.readback.sqlite"
    decoded_inspection = decode_database(base64_path, decoded_path)
    decoded_path.unlink()
    database_path.unlink()
    package = {
        "schema_version": "1.0.0",
        "package_id": "fixture-run-001-materialized-db",
        "database_file": "fixture_materialized.sqlite",
        "database_sha256": EXPECTED_SQLITE_SHA256,
        "database_size_bytes": EXPECTED_SQLITE_SIZE,
        "row_count": 3,
        "normalized_dataset_sha256": dataset_sha256,
        "extraction_receipt_sha256": extraction_receipt_sha256,
        "database_type": "SQLITE_FIXTURE",
        "d_canonical_schema": False,
        "d_canonical_db_write_count": 0,
        "transport_encoding": "BASE64",
        "transport_file": "fixture_materialized.sqlite.b64",
        "decoded_database_size_bytes": decoded_inspection["decoded_size_bytes"],
        "decoded_database_sha256": decoded_inspection["decoded_sha256"],
    }
    package_sha256 = write_canonical(generated / "FIXTURE_MATERIALIZED_DATABASE_PACKAGE_V1.json", package)
    normalization_receipt = {
        "schema_version": "1.0.0",
        "receipt_id": "fixture-run-001-normalization-dedup",
        "source_record_envelope_sha256": envelope_sha256,
        "normalized_dataset_sha256": dataset_sha256,
        "extraction_receipt_sha256": extraction_receipt_sha256,
        "materialized_database_package_sha256": package_sha256,
        "input_record_count": 4,
        "duplicate_count": 1,
        "output_record_count": 3,
        "source_field_loss_count": 0,
        "semantic_transformation_count": 0,
        "d_canonical_schema_decision_count": 0,
        "d_canonical_db_write_count": 0,
    }
    write_canonical(generated / "NORMALIZATION_DEDUP_RECEIPT_V1.json", normalization_receipt)
    return {
        "envelope_sha256": envelope_sha256,
        "dataset_sha256": dataset_sha256,
        "extraction_receipt_sha256": extraction_receipt_sha256,
        "package_sha256": package_sha256,
        "input_record_count": 4,
        "duplicate_count": 1,
        "output_record_count": 3,
        "source_field_loss_count": 0,
        "sqlite_row_count": decoded_inspection["row_count"],
        "sqlite_decoded_size_bytes": decoded_inspection["decoded_size_bytes"],
        "sqlite_decoded_sha256": decoded_inspection["decoded_sha256"],
        "base64_transport_size_bytes": base64_transport["transport_size_bytes"],
        "network_call_count": 0,
        "semantic_transformation_count": 0,
        "d_canonical_schema_decision_count": 0,
        "d_canonical_db_write_count": 0,
    }


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parents[1]
    print(json.dumps(build_package(project_root), sort_keys=True))
