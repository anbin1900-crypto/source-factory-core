from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path


BLUEPRINT_SCHEMA = "REAL_ESTATE_SITE_BLUEPRINT_DB_V1"
CAPABILITY_SCHEMA = "SITE_CAPABILITY_PROFILE_V1"
BINDING_PACKAGE_SCHEMA = "LISTING_ONTOLOGY_BINDING_PACKAGE_V1"
REQUIRED_PARENT_DATASETS = {
    "REAL_ESTATE_LISTING_FIELD_ONTOLOGY_V1": 6,
    "SITE_LISTING_BINDING_V1": 12,
    "FIELD_TRANSFORM_CANDIDATE_V1": 24,
}
SEMANTIC_STATES = {"UNKNOWN", "CANDIDATE", "CANONICAL"}


def canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def sha256_file(path: Path) -> str:
    return sha256_bytes(Path(path).read_bytes())


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: Path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def evidence_valid(pointer):
    return (
        isinstance(pointer, dict)
        and isinstance(pointer.get("path"), str)
        and bool(pointer["path"])
        and isinstance(pointer.get("blob"), str)
        and len(pointer["blob"]) == 40
        and isinstance(pointer.get("selector"), str)
        and bool(pointer["selector"])
    )


def validate_parent_v5(parent):
    if parent.get("terminal") != "B5_REAL_ESTATE_FIELD_ONTOLOGY_SITE_BINDING_READY":
        raise ValueError("PARENT_V5_TERMINAL_MISMATCH")
    if not isinstance(parent.get("head"), str) or len(parent["head"]) != 40:
        raise ValueError("PARENT_V5_HEAD_INVALID")
    if not isinstance(parent.get("pointer_blob"), str) or len(parent["pointer_blob"]) != 40:
        raise ValueError("PARENT_V5_POINTER_INVALID")
    datasets = parent.get("datasets")
    if not isinstance(datasets, dict) or set(datasets) != set(REQUIRED_PARENT_DATASETS):
        raise ValueError("PARENT_V5_DATASET_SET_MISMATCH")
    for name, count in REQUIRED_PARENT_DATASETS.items():
        item = datasets[name]
        if not isinstance(item.get("path"), str) or not item["path"]:
            raise ValueError("PARENT_V5_DATASET_PATH_INVALID")
        if not isinstance(item.get("blob"), str) or len(item["blob"]) != 40:
            raise ValueError("PARENT_V5_DATASET_BLOB_INVALID")
        if item.get("record_count") != count:
            raise ValueError("PARENT_V5_RECORD_COUNT_MISMATCH")
    return {"result": "PASS", "dataset_count": 3, "record_count": sum(REQUIRED_PARENT_DATASETS.values())}


def validate_fixture(fixture):
    if fixture.get("schema_version") != "REAL_ESTATE_SITE_BLUEPRINT_INPUT_V1":
        raise ValueError("FIXTURE_SCHEMA_MISMATCH")
    validate_parent_v5(fixture.get("parent_v5", {}))
    sites = fixture.get("sites")
    if not isinstance(sites, list) or not sites:
        raise ValueError("SITE_INPUT_REQUIRED")
    site_ids = set()
    blueprint_ids = set()
    source_fields = set()
    page_count = feature_count = capability_count = 0
    for site in sites:
        site_id = site.get("site_id")
        version = site.get("blueprint_version")
        if not site_id or site_id in site_ids:
            raise ValueError("DUPLICATE_OR_MISSING_SITE_ID")
        site_ids.add(site_id)
        blueprint_id = (site_id, version)
        if not isinstance(version, int) or version < 1 or blueprint_id in blueprint_ids:
            raise ValueError("BLUEPRINT_VERSION_INVALID")
        blueprint_ids.add(blueprint_id)
        for collection_name, id_key in (("pages", "page_id"), ("features", "feature_id"), ("capabilities", "capability_id")):
            records = site.get(collection_name)
            if not isinstance(records, list) or not records:
                raise ValueError("SITE_COMPONENT_REQUIRED:" + collection_name)
            identities = set()
            for record in records:
                identity = record.get(id_key)
                if not identity or identity in identities:
                    raise ValueError("DUPLICATE_SITE_COMPONENT:" + collection_name)
                identities.add(identity)
                if record.get("status") not in {"UNKNOWN", "CANDIDATE"}:
                    raise ValueError("UNSUPPORTED_SITE_COMPONENT_PROMOTION")
                if not 0 <= record.get("confidence", -1) <= 1:
                    raise ValueError("SITE_COMPONENT_CONFIDENCE_OUT_OF_RANGE")
                if not evidence_valid(record.get("evidence_pointer")):
                    raise ValueError("SITE_COMPONENT_EVIDENCE_INVALID")
            if collection_name == "pages":
                page_count += len(records)
            elif collection_name == "features":
                feature_count += len(records)
            else:
                capability_count += len(records)
        fields = site.get("fields")
        if not isinstance(fields, list) or not fields:
            raise ValueError("SITE_FIELDS_REQUIRED")
        for field in fields:
            identity = (site_id, field.get("source_field_name"))
            if not identity[1] or identity in source_fields:
                raise ValueError("DUPLICATE_OR_MISSING_SOURCE_FIELD")
            source_fields.add(identity)
            if field.get("semantic_status") not in SEMANTIC_STATES:
                raise ValueError("INVALID_FIELD_SEMANTIC_STATUS")
            if field.get("semantic_status") == "CANONICAL" and not field.get("canonical_authority_pointer"):
                raise ValueError("UNSUPPORTED_CANONICAL_CONFIRMATION")
            if not 0 <= field.get("confidence", -1) <= 1:
                raise ValueError("FIELD_CONFIDENCE_OUT_OF_RANGE")
            if not isinstance(field.get("source_observation"), dict) or not field["source_observation"]:
                raise ValueError("SOURCE_OBSERVATION_REQUIRED")
            if not evidence_valid(field.get("evidence_pointer")):
                raise ValueError("FIELD_EVIDENCE_INVALID")
            transforms = field.get("transform_candidates")
            if not isinstance(transforms, list) or {item.get("direction") for item in transforms} != {"READ", "WRITE"}:
                raise ValueError("READ_WRITE_TRANSFORM_PAIR_REQUIRED")
            for transform in transforms:
                expected = "CANDIDATE" if transform["direction"] == "READ" else "UNKNOWN"
                if transform.get("semantic_status") != expected:
                    raise ValueError("TRANSFORM_STATUS_MISMATCH")
                if not evidence_valid(transform.get("evidence_pointer")):
                    raise ValueError("TRANSFORM_EVIDENCE_INVALID")
    if len(source_fields) != REQUIRED_PARENT_DATASETS["SITE_LISTING_BINDING_V1"]:
        raise ValueError("PARENT_BINDING_COUNT_PARITY_FAILURE")
    return {
        "site_count": len(site_ids),
        "page_count": page_count,
        "feature_count": feature_count,
        "capability_count": capability_count,
        "source_field_count": len(source_fields),
    }


def _lineage(fixture):
    parent = fixture["parent_v5"]
    value = {
        "cycle_id": fixture["cycle_id"],
        "directive_id": fixture["directive_id"],
        "parent_v5_head": parent["head"],
        "parent_v5_pointer_blob": parent["pointer_blob"],
        "parent_dataset_blobs": {name: item["blob"] for name, item in sorted(parent["datasets"].items())},
        "source_fixture_sha256": sha256_json(fixture),
        "append_policy": "APPEND_ONLY_VERSIONED_NO_EXISTING_RECORD_REWRITE",
    }
    value["lineage_key"] = sha256_json(value)
    return value


def build_packages(fixture):
    fixture_metrics = validate_fixture(fixture)
    lineage = _lineage(fixture)
    blueprint_records = []
    capability_records = []
    binding_records = []
    for site in sorted(fixture["sites"], key=lambda item: (item["site_id"], item["blueprint_version"])):
        site_id = site["site_id"]
        version = site["blueprint_version"]
        blueprint_record_id = f"{site_id}::BLUEPRINT::V{version}"
        blueprint_records.append({
            "blueprint_record_id": blueprint_record_id,
            "site_id": site_id,
            "blueprint_version": version,
            "valid_from": site["valid_from"],
            "supersedes_blueprint_record_id": site.get("supersedes_blueprint_record_id"),
            "record_policy": "APPEND_ONLY",
            "semantic_status": "CANDIDATE",
            "pages": copy.deepcopy(site["pages"]),
            "features": copy.deepcopy(site["features"]),
            "capabilities": copy.deepcopy(site["capabilities"]),
            "fields": [copy.deepcopy(field["source_observation"]) | {
                "source_field_name": field["source_field_name"],
                "canonical_candidate_id": field["canonical_candidate_id"],
                "semantic_status": field["semantic_status"],
                "confidence": field["confidence"],
                "evidence_pointer": copy.deepcopy(field["evidence_pointer"]),
            } for field in site["fields"]],
        })
        capability_records.append({
            "capability_profile_id": f"{site_id}::CAPABILITY::V{version}",
            "site_id": site_id,
            "blueprint_record_id": blueprint_record_id,
            "profile_version": version,
            "semantic_status": "CANDIDATE",
            "pages": copy.deepcopy(site["pages"]),
            "features": copy.deepcopy(site["features"]),
            "capabilities": copy.deepcopy(site["capabilities"]),
            "evidence_pointers": [copy.deepcopy(item["evidence_pointer"]) for name in ("pages", "features", "capabilities") for item in site[name]],
        })
        for field in sorted(site["fields"], key=lambda item: item["source_field_name"]):
            binding_records.append({
                "binding_record_id": f"{site_id}::{field['source_field_name']}::V{version}",
                "site_id": site_id,
                "blueprint_record_id": blueprint_record_id,
                "source_field_name": field["source_field_name"],
                "canonical_candidate_id": field["canonical_candidate_id"],
                "semantic_status": field["semantic_status"],
                "confidence": field["confidence"],
                "source_observation": copy.deepcopy(field["source_observation"]),
                "transform_candidates": copy.deepcopy(field["transform_candidates"]),
                "evidence_pointer": copy.deepcopy(field["evidence_pointer"]),
                "business_rule_status": "UNKNOWN",
                "canonical_authority_pointer": field.get("canonical_authority_pointer"),
            })
    packages = {
        BLUEPRINT_SCHEMA: {"schema_version": BLUEPRINT_SCHEMA, "lineage": lineage, "records": blueprint_records},
        CAPABILITY_SCHEMA: {"schema_version": CAPABILITY_SCHEMA, "lineage": lineage, "records": capability_records},
        BINDING_PACKAGE_SCHEMA: {"schema_version": BINDING_PACKAGE_SCHEMA, "lineage": lineage, "records": binding_records},
    }
    validation = validate_packages(fixture, packages)
    return packages, fixture_metrics, validation


def validate_packages(fixture, packages):
    if set(packages) != {BLUEPRINT_SCHEMA, CAPABILITY_SCHEMA, BINDING_PACKAGE_SCHEMA}:
        raise ValueError("REQUIRED_PACKAGE_SET_MISMATCH")
    source = {
        (site["site_id"], field["source_field_name"]): field
        for site in fixture["sites"] for field in site["fields"]
    }
    bindings = packages[BINDING_PACKAGE_SCHEMA]["records"]
    materialized = {(item["site_id"], item["source_field_name"]): item for item in bindings}
    if len(materialized) != len(bindings):
        raise ValueError("DUPLICATE_BINDING_RECORD")
    if set(source) != set(materialized):
        raise ValueError("SOURCE_FIELD_LOSS_OR_SYNTHESIS")
    transform_ids = set()
    unknown_transform_count = 0
    for identity, source_field in source.items():
        record = materialized[identity]
        if record["source_observation"] != source_field["source_observation"]:
            raise ValueError("SOURCE_OBSERVATION_REWRITE")
        if record["semantic_status"] == "CANONICAL" and not record.get("canonical_authority_pointer"):
            raise ValueError("UNSUPPORTED_CANONICAL_CONFIRMATION")
        if record["business_rule_status"] != "UNKNOWN":
            raise ValueError("UNOBSERVED_BUSINESS_RULE_PROMOTION")
        if not evidence_valid(record["evidence_pointer"]):
            raise ValueError("BINDING_EVIDENCE_INVALID")
        for transform in record["transform_candidates"]:
            transform_id = transform.get("transform_candidate_id")
            if not transform_id or transform_id in transform_ids:
                raise ValueError("DUPLICATE_OR_MISSING_TRANSFORM_ID")
            transform_ids.add(transform_id)
            unknown_transform_count += transform["semantic_status"] == "UNKNOWN"
    blueprint_records = packages[BLUEPRINT_SCHEMA]["records"]
    capability_records = packages[CAPABILITY_SCHEMA]["records"]
    if len(blueprint_records) != len(fixture["sites"]) or len(capability_records) != len(fixture["sites"]):
        raise ValueError("SITE_RECORD_COUNT_MISMATCH")
    return {
        "source_field_loss_count": len(set(source) - set(materialized)),
        "source_field_synthesis_count": len(set(materialized) - set(source)),
        "binding_count": len(bindings),
        "transform_candidate_count": len(transform_ids),
        "unknown_transform_count": unknown_transform_count,
        "unknown_business_rule_count": len(bindings),
        "canonical_confirmed_without_authority_count": 0,
    }


def append_blueprint_record(records, record):
    before = {item["blueprint_record_id"]: sha256_json(item) for item in records}
    if record["blueprint_record_id"] in before:
        raise ValueError("BLUEPRINT_RECORD_ALREADY_EXISTS")
    result = copy.deepcopy(records)
    result.append(copy.deepcopy(record))
    after = {item["blueprint_record_id"]: sha256_json(item) for item in result if item["blueprint_record_id"] in before}
    if before != after:
        raise ValueError("EXISTING_BLUEPRINT_RECORD_REWRITE")
    return result


def verify_append_and_version(packages):
    original = copy.deepcopy(packages[BLUEPRINT_SCHEMA]["records"])
    old_hashes = {item["blueprint_record_id"]: sha256_json(item) for item in original}
    seed = copy.deepcopy(original[0])
    appended_site = copy.deepcopy(seed)
    appended_site.update({
        "site_id": "SITE-APPEND-FIXTURE",
        "blueprint_record_id": "SITE-APPEND-FIXTURE::BLUEPRINT::V1",
        "blueprint_version": 1,
        "valid_from": "2026-08-08T02:30:00+09:00",
        "supersedes_blueprint_record_id": None,
    })
    with_site = append_blueprint_record(original, appended_site)
    versioned = copy.deepcopy(seed)
    versioned.update({
        "blueprint_record_id": f"{seed['site_id']}::BLUEPRINT::V2",
        "blueprint_version": 2,
        "valid_from": "2026-08-08T02:31:00+09:00",
        "supersedes_blueprint_record_id": seed["blueprint_record_id"],
    })
    with_version = append_blueprint_record(with_site, versioned)
    current_hashes = {item["blueprint_record_id"]: sha256_json(item) for item in with_version if item["blueprint_record_id"] in old_hashes}
    if current_hashes != old_hashes:
        raise ValueError("APPEND_VERSION_REWROTE_EXISTING_RECORD")
    if versioned["supersedes_blueprint_record_id"] != seed["blueprint_record_id"]:
        raise ValueError("VERSION_LINEAGE_MISMATCH")
    return {
        "result": "PASS",
        "existing_record_rewrite_count": 0,
        "new_site_append_count": 1,
        "new_version_append_count": 1,
        "original_record_count": len(original),
        "simulated_record_count": len(with_version),
        "version_lineage": "PASS",
    }


def validate_contracts(contract_root: Path, packages):
    contract_root = Path(contract_root)
    for schema, package in packages.items():
        contract = read_json(contract_root / f"{schema}.schema.json")
        if contract["properties"]["schema_version"].get("const") != schema:
            raise ValueError("CONTRACT_CONST_MISMATCH:" + schema)
        if contract.get("required") != ["schema_version", "lineage", "records"]:
            raise ValueError("CONTRACT_REQUIRED_MISMATCH:" + schema)
        if package["schema_version"] != schema or not isinstance(package["records"], list):
            raise ValueError("PACKAGE_CONTRACT_MISMATCH:" + schema)
    return {"result": "PASS", "contract_count": len(packages)}


def _checkpoint(seq, phase, lineage_key, packages, previous=None):
    value = {
        "schema_version": "REAL_ESTATE_SITE_BLUEPRINT_DB_CHECKPOINT_V1",
        "checkpoint_seq": seq,
        "phase": phase,
        "lineage_key": lineage_key,
        "packages": packages,
        "previous_checkpoint_sha256": None if previous is None else sha256_json(previous),
    }
    value["checkpoint_sha256"] = sha256_json(value)
    return value


def materialize(fixture, output_root: Path):
    output_root = Path(output_root)
    pointer_path = output_root / "LATEST_RESULT_POINTER.json"
    fixture_sha = sha256_json(fixture)
    if pointer_path.exists():
        existing = read_json(pointer_path)
        if existing["source_fixture_sha256"] != fixture_sha:
            raise ValueError("CONFLICTING_FIXTURE_FOR_EXISTING_LINEAGE")
        readback(output_root)
        return {**existing, "duplicate_materialization": True}
    packages, fixture_metrics, validation = build_packages(fixture)
    package_dir = output_root / "datasets"
    package_index = {}
    for schema, package in packages.items():
        path = package_dir / f"{schema}.json"
        write_json(path, package)
        package_index[schema] = {"path": str(path.relative_to(output_root)), "sha256": sha256_file(path), "record_count": len(package["records"])}
    lineage_key = packages[BLUEPRINT_SCHEMA]["lineage"]["lineage_key"]
    append_validation = verify_append_and_version(packages)
    checkpoint1 = _checkpoint(1, "PARENT_V5_DATASETS_BOUND", lineage_key, {})
    checkpoint2 = _checkpoint(2, "VERSIONED_BLUEPRINT_PACKAGES_MATERIALIZED", lineage_key, package_index, checkpoint1)
    checkpoint3 = _checkpoint(3, "APPEND_VERSION_NO_REWRITE_VERIFIED", lineage_key, package_index, checkpoint2)
    checkpoints = [checkpoint1, checkpoint2, checkpoint3]
    for index, checkpoint in enumerate(checkpoints, 1):
        write_json(output_root / "checkpoints" / f"checkpoint-{index:06d}.json", checkpoint)
    pointer = {
        "schema_version": "B5_REAL_ESTATE_SITE_BLUEPRINT_DB_PACKAGE_RESULT_POINTER_V1",
        "cycle_id": fixture["cycle_id"],
        "directive_id": fixture["directive_id"],
        "lineage_key": lineage_key,
        "source_fixture_sha256": fixture_sha,
        "parent_v5_head": fixture["parent_v5"]["head"],
        "parent_v5_pointer_blob": fixture["parent_v5"]["pointer_blob"],
        "latest_checkpoint_seq": 3,
        "latest_checkpoint_path": "checkpoints/checkpoint-000003.json",
        "latest_checkpoint_sha256": sha256_file(output_root / "checkpoints" / "checkpoint-000003.json"),
        "packages": package_index,
        **fixture_metrics,
        **validation,
        **append_validation,
        "source_field_loss_count": 0,
        "d_canonical_schema_decision": False,
        "target_pc_execution": False,
        "live_site_call": False,
        "production": False,
        "ready": False,
        "merge": False,
        "contextless_readback": True,
    }
    write_json(pointer_path, pointer)
    readback(output_root)
    return pointer


def readback(output_root: Path):
    output_root = Path(output_root)
    pointer = read_json(output_root / "LATEST_RESULT_POINTER.json")
    checkpoint = read_json(output_root / pointer["latest_checkpoint_path"])
    if sha256_file(output_root / pointer["latest_checkpoint_path"]) != pointer["latest_checkpoint_sha256"]:
        raise ValueError("CHECKPOINT_READBACK_HASH_MISMATCH")
    if checkpoint["checkpoint_seq"] != pointer["latest_checkpoint_seq"]:
        raise ValueError("CHECKPOINT_SEQUENCE_READBACK_MISMATCH")
    for schema, item in pointer["packages"].items():
        path = output_root / item["path"]
        package = read_json(path)
        if sha256_file(path) != item["sha256"] or len(package["records"]) != item["record_count"]:
            raise ValueError("PACKAGE_READBACK_MISMATCH:" + schema)
        if package["lineage"]["lineage_key"] != pointer["lineage_key"]:
            raise ValueError("PACKAGE_LINEAGE_READBACK_MISMATCH")
    return {"result": "PASS", "package_count": len(pointer["packages"]), "checkpoint_seq": checkpoint["checkpoint_seq"]}


def smoke(fixture_path: Path, output_root: Path):
    fixture = read_json(fixture_path)
    package_root = Path(fixture_path).resolve().parents[1]
    packages, _, _ = build_packages(fixture)
    contracts = validate_contracts(package_root / "contracts", packages)
    pointer = materialize(fixture, output_root)
    duplicate = materialize(fixture, output_root)
    return {
        "result": "PASS",
        "readback": readback(output_root),
        "parent_v5": validate_parent_v5(fixture["parent_v5"]),
        "contracts": contracts,
        "site_count": pointer["site_count"],
        "page_count": pointer["page_count"],
        "feature_count": pointer["feature_count"],
        "capability_count": pointer["capability_count"],
        "binding_count": pointer["binding_count"],
        "transform_candidate_count": pointer["transform_candidate_count"],
        "source_field_loss_count": pointer["source_field_loss_count"],
        "existing_record_rewrite_count": pointer["existing_record_rewrite_count"],
        "append_version": pointer["version_lineage"],
        "duplicate_materialization_noop": duplicate["duplicate_materialization"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(smoke(args.fixture, args.output), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
