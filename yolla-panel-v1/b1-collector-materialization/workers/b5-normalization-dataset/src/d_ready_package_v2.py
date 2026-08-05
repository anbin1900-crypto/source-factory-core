from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
BLOB_RE = re.compile(r"^[0-9a-f]{40}$")
MIME_RE = re.compile(r"^[a-z0-9.+-]+/[a-z0-9.+-]+$")
LANGUAGE_RE = re.compile(r"^[a-z]{2}$")


class PackageValidationError(ValueError):
    pass


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise PackageValidationError(f"JSON object required: {path}")
    return value


def _require(mapping: Dict[str, Any], names: Iterable[str], context: str) -> None:
    missing = [name for name in names if name not in mapping]
    if missing:
        raise PackageValidationError(f"{context}: missing fields {missing}")


def _require_sha256(value: Any, context: str) -> None:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise PackageValidationError(f"{context}: lowercase SHA-256 required")


def _require_blob(value: Any, context: str) -> None:
    if not isinstance(value, str) or not BLOB_RE.fullmatch(value):
        raise PackageValidationError(f"{context}: Git blob SHA required")


def verify_embedded_hash(document: Dict[str, Any], field: str) -> None:
    _require_sha256(document.get(field), field)
    calculated = sha256_json({key: value for key, value in document.items() if key != field})
    if calculated != document[field]:
        raise PackageValidationError(f"{field}: mismatch expected={document[field]} calculated={calculated}")


def validate_authority_type(value: Dict[str, Any]) -> None:
    _require(value, ["value", "decision_pointer_blob", "decision_pointer_sha256", "d_decision_created_by_b5"], "authority_type")
    allowed = {"OFFICIAL_PRIMARY", "OFFICIAL_SECONDARY", "LICENSED_PROVIDER", "USER_SUPPLIED_FIXTURE"}
    if value["value"] not in allowed:
        raise PackageValidationError("authority_type: unknown value")
    _require_blob(value["decision_pointer_blob"], "authority_type.decision_pointer_blob")
    _require_sha256(value["decision_pointer_sha256"], "authority_type.decision_pointer_sha256")
    if value["d_decision_created_by_b5"] is not False:
        raise PackageValidationError("authority_type: B-5 must not create D decision")


def validate_d_refs(refs: Dict[str, Any]) -> None:
    required = ["schema_profile", "field_mapping", "validation_ruleset", "acceptance_receipt_contract", "decision_pointer"]
    _require(refs, required, "d_contract_blob_refs")
    for name in required:
        ref = refs[name]
        _require(ref, ["path", "blob_sha", "content_sha256"], f"d_contract_blob_refs.{name}")
        if not ref["path"]:
            raise PackageValidationError(f"d_contract_blob_refs.{name}.path empty")
        _require_blob(ref["blob_sha"], f"d_contract_blob_refs.{name}.blob_sha")
        _require_sha256(ref["content_sha256"], f"d_contract_blob_refs.{name}.content_sha256")


def validate_processing_events(events: List[Dict[str, Any]]) -> None:
    if not events:
        raise PackageValidationError("processing_events: empty")
    previous = "0" * 64
    for expected_sequence, event in enumerate(events, start=1):
        _require(event, ["sequence", "event", "entry_hash", "previous_hash"], "processing_event")
        if event["sequence"] != expected_sequence:
            raise PackageValidationError("processing_events: non-monotonic sequence")
        if event["previous_hash"] != previous:
            raise PackageValidationError("processing_events: broken previous_hash chain")
        _require_sha256(event["entry_hash"], "processing_event.entry_hash")
        _require_sha256(event["previous_hash"], "processing_event.previous_hash")
        previous = event["entry_hash"]


def validate_dataset(dataset: Dict[str, Any]) -> None:
    _require(dataset, [
        "schema_version", "source_key", "authority_type", "input_record_count", "output_record_count",
        "duplicate_count", "source_field_loss_count", "silent_drop_count", "records", "rejected_records",
        "unmapped_field_preservation", "dedup_lineage", "dataset_sha256"
    ], "dataset")
    if dataset["schema_version"] != "NORMALIZED_DATASET_V2":
        raise PackageValidationError("dataset: schema version")
    validate_authority_type(dataset["authority_type"])
    if dataset["source_field_loss_count"] != 0 or dataset["silent_drop_count"] != 0:
        raise PackageValidationError("dataset: field loss or silent drop")
    if dataset["input_record_count"] != dataset["output_record_count"] + dataset["duplicate_count"]:
        raise PackageValidationError("dataset: count parity")
    if len(dataset["records"]) != dataset["output_record_count"]:
        raise PackageValidationError("dataset: output count mismatch")
    lineage_ids: List[str] = []
    for record in dataset["records"]:
        _require(record, [
            "source_record_id", "source_record_lineage", "title", "record_type", "language_code",
            "record_hash", "verified_source_sha256", "fields", "normalized_fields", "unmapped_fields",
            "raw_artifact_refs", "official_source_urls", "locator"
        ], "dataset.record")
        if not LANGUAGE_RE.fullmatch(record["language_code"]):
            raise PackageValidationError("dataset.record: language_code")
        _require_sha256(record["record_hash"], "dataset.record.record_hash")
        _require_sha256(record["verified_source_sha256"], "dataset.record.verified_source_sha256")
        if record["record_hash"] != record["verified_source_sha256"]:
            raise PackageValidationError("dataset.record: hash parity")
        if sha256_json(record["fields"]) != record["verified_source_sha256"]:
            raise PackageValidationError("dataset.record: source fields hash mismatch")
        if not record["source_record_lineage"]:
            raise PackageValidationError("dataset.record: empty lineage")
        lineage_ids.extend(record["source_record_lineage"])
    if len(lineage_ids) != dataset["input_record_count"]:
        raise PackageValidationError("dataset: lineage does not cover all input records")
    if len(set(lineage_ids)) != len(lineage_ids):
        raise PackageValidationError("dataset: duplicate source lineage id")
    for rejected in dataset["rejected_records"]:
        if rejected.get("source_value_preserved") is not True or "source_fields" not in rejected:
            raise PackageValidationError("dataset: rejected source not preserved")
    for unmapped in dataset["unmapped_field_preservation"]:
        if unmapped.get("preserved") is not True or unmapped.get("target_mapping_status") != "UNMAPPED_PRESERVED":
            raise PackageValidationError("dataset: unmapped source not preserved")
    verify_embedded_hash(dataset, "dataset_sha256")


def validate_package(package: Dict[str, Any]) -> None:
    _require(package, [
        "schema_version", "package_type", "package_id", "producer", "source", "authority_type",
        "collection_run", "raw_artifacts", "records", "rejected_records", "unmapped_fields",
        "normalized_dataset_ref", "database", "d_contract_blob_refs", "processing_event_ledger",
        "source_field_loss_count", "silent_drop_count", "boundaries", "package_sha256"
    ], "package")
    if package["schema_version"] != "MATERIALIZED_DATABASE_PACKAGE_V2" or package["package_type"] != "MATERIALIZED_DATABASE_PACKAGE_V2":
        raise PackageValidationError("package: schema/package type")
    if package["producer"] != "B-5":
        raise PackageValidationError("package: owner")
    validate_authority_type(package["authority_type"])
    validate_d_refs(package["d_contract_blob_refs"])
    source = package["source"]
    _require(source, ["source_key", "source_name", "official_source_url", "method", "response_format", "authorized_scope", "d_contract_blob_refs"], "source")
    if source.get("d_canonical_id_generation") is not False or source.get("d_canonical_source_id") is not None:
        raise PackageValidationError("source: canonical id created")
    if package["source_field_loss_count"] != 0 or package["silent_drop_count"] != 0:
        raise PackageValidationError("package: field loss or silent drop")
    for artifact in package["raw_artifacts"]:
        _require(artifact, [
            "artifact_native_key", "storage_pointer", "mime_type", "byte_size", "sha256",
            "official_source_url", "captured_at", "locator", "redaction_status", "personal_data_status",
            "immutability", "raw_overwrite", "secret_storage"
        ], "raw_artifact")
        if not MIME_RE.fullmatch(artifact["mime_type"]):
            raise PackageValidationError("raw_artifact: mime")
        if artifact["byte_size"] < 0:
            raise PackageValidationError("raw_artifact: byte size")
        _require_sha256(artifact["sha256"], "raw_artifact.sha256")
        if artifact["immutability"] != "APPEND_ONLY_NO_OVERWRITE" or artifact["raw_overwrite"] is not False:
            raise PackageValidationError("raw_artifact: overwrite boundary")
        if artifact["secret_storage"] is not False:
            raise PackageValidationError("raw_artifact: secret storage")
    validate_processing_events(package["processing_event_ledger"]["entries"])
    database = package["database"]
    if database["database_type"] != "SQLITE_FIXTURE" or database["row_count"] != len(package["records"]):
        raise PackageValidationError("database: row parity")
    _require_sha256(database["decoded_sha256"], "database.decoded_sha256")
    boundaries = package["boundaries"]
    forbidden_true = ["actual_site_extraction", "d_canonical_id_generation", "d_acceptance_decision_generation", "d_canonical_db_write", "authoritative_db_write_performed", "production", "ready", "merge"]
    for name in forbidden_true:
        if boundaries.get(name) is not False:
            raise PackageValidationError(f"boundaries.{name} must be false")
    for name in ["site_call_count", "postgresql_connection_count", "migration_apply_count"]:
        if boundaries.get(name) != 0:
            raise PackageValidationError(f"boundaries.{name} must be zero")
    verify_embedded_hash(package, "package_sha256")


def validate_intake_request(request: Dict[str, Any], package: Dict[str, Any]) -> None:
    _require(request, [
        "schema_version", "intake_request_id", "producer", "package_type", "package_id", "package_sha256",
        "source_key", "authority_type", "schema_profile_ref", "mapping_contract_ref", "ruleset_ref",
        "acceptance_receipt_contract_ref", "decision_pointer_ref", "requested_action", "request_status",
        "fixture_only", "canonical_ids_generated", "acceptance_decision", "authoritative_db_write_requested",
        "authoritative_db_write_performed", "postgresql_connection_count", "migration_apply_count",
        "rejected_records_preserved", "unmapped_fields_preserved", "source_field_loss_count",
        "silent_drop_count", "production", "ready", "merge", "request_sha256"
    ], "intake_request")
    if request["schema_version"] != "D_INTAKE_REQUEST_V1":
        raise PackageValidationError("intake_request: schema")
    if request["package_id"] != package["package_id"] or request["package_sha256"] != package["package_sha256"]:
        raise PackageValidationError("intake_request: package binding")
    if request["acceptance_decision"] is not None:
        raise PackageValidationError("intake_request: B-5 acceptance decision")
    forbidden_true = [
        "canonical_ids_generated", "authoritative_db_write_requested", "authoritative_db_write_performed",
        "production", "ready", "merge"
    ]
    for name in forbidden_true:
        if request[name] is not False:
            raise PackageValidationError(f"intake_request.{name} must be false")
    if request["postgresql_connection_count"] != 0 or request["migration_apply_count"] != 0:
        raise PackageValidationError("intake_request: runtime DB action")
    if request["source_field_loss_count"] != 0 or request["silent_drop_count"] != 0:
        raise PackageValidationError("intake_request: field loss")
    for ref_name in ["schema_profile_ref", "mapping_contract_ref", "ruleset_ref", "acceptance_receipt_contract_ref", "decision_pointer_ref"]:
        validate_d_refs({
            "schema_profile": request[ref_name],
            "field_mapping": request[ref_name],
            "validation_ruleset": request[ref_name],
            "acceptance_receipt_contract": request[ref_name],
            "decision_pointer": request[ref_name],
        })
    verify_embedded_hash(request, "request_sha256")


def validate_bundle(bundle: Dict[str, Any], root: Path) -> Dict[str, Any]:
    _require(bundle, ["schema_version", "batch_id", "task_id", "upstream_authorities", "normalized_dataset_ref", "materialized_database_package_ref", "d_intake_request_ref", "schema_refs", "validation_summary", "bundle_sha256"], "bundle")
    if bundle["schema_version"] != "B5_D_READY_FIXTURE_PACKAGE_V2":
        raise PackageValidationError("bundle: schema")
    dataset = load_json(root / bundle["normalized_dataset_ref"]["path"])
    package = load_json(root / bundle["materialized_database_package_ref"]["path"])
    request = load_json(root / bundle["d_intake_request_ref"]["path"])
    validate_dataset(dataset)
    validate_package(package)
    validate_intake_request(request, package)
    if bundle["normalized_dataset_ref"]["content_sha256"] != hashlib.sha256((root / bundle["normalized_dataset_ref"]["path"]).read_bytes()).hexdigest():
        raise PackageValidationError("bundle: dataset file hash")
    if bundle["materialized_database_package_ref"]["content_sha256"] != hashlib.sha256((root / bundle["materialized_database_package_ref"]["path"]).read_bytes()).hexdigest():
        raise PackageValidationError("bundle: package file hash")
    if bundle["d_intake_request_ref"]["content_sha256"] != hashlib.sha256((root / bundle["d_intake_request_ref"]["path"]).read_bytes()).hexdigest():
        raise PackageValidationError("bundle: request file hash")
    summary = bundle["validation_summary"]
    if summary["source_field_loss_count"] != 0 or summary["silent_drop_count"] != 0:
        raise PackageValidationError("bundle: summary field loss")
    verify_embedded_hash(bundle, "bundle_sha256")
    return {
        "result": "PASS",
        "package_sha256": package["package_sha256"],
        "dataset_sha256": dataset["dataset_sha256"],
        "request_sha256": request["request_sha256"],
        "bundle_sha256": bundle["bundle_sha256"],
        "source_field_loss_count": 0,
        "silent_drop_count": 0,
    }


def validate_root(root: Path) -> Dict[str, Any]:
    bundle = load_json(root / "generated" / "B5_D_READY_FIXTURE_PACKAGE_V2.json")
    return validate_bundle(bundle, root)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = validate_root(args.root)
    text = json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2)
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)
