from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ONTOLOGY_SCHEMA = "REAL_ESTATE_LISTING_FIELD_ONTOLOGY_V1"
BINDING_SCHEMA = "SITE_LISTING_BINDING_V1"
TRANSFORM_SCHEMA = "FIELD_TRANSFORM_CANDIDATE_V1"
REQUIRED_CANDIDATES = (
    "sale_price",
    "deposit",
    "monthly_rent",
    "exclusive_area",
    "floor",
    "direction",
)
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


def _evidence_valid(pointer):
    return (
        isinstance(pointer, dict)
        and isinstance(pointer.get("path"), str)
        and bool(pointer["path"])
        and isinstance(pointer.get("artifact_sha256"), str)
        and len(pointer["artifact_sha256"]) == 64
    )


def validate_fixture(fixture):
    if fixture.get("schema_version") != "REAL_ESTATE_FIELD_OBSERVATION_FIXTURE_V1":
        raise ValueError("FIXTURE_SCHEMA_MISMATCH")
    sites = fixture.get("sites")
    if not isinstance(sites, list) or not sites:
        raise ValueError("SITE_OBSERVATIONS_REQUIRED")
    site_ids = set()
    identities = set()
    candidate_counts = {candidate: 0 for candidate in REQUIRED_CANDIDATES}
    for site in sites:
        site_id = site.get("source_site_id")
        if not site_id or site_id in site_ids:
            raise ValueError("DUPLICATE_OR_MISSING_SITE_ID")
        site_ids.add(site_id)
        if not _evidence_valid(site.get("evidence_pointer")):
            raise ValueError("INVALID_SITE_EVIDENCE_POINTER")
        fields = site.get("field_observations")
        if not isinstance(fields, list) or not fields:
            raise ValueError("FIELD_OBSERVATIONS_REQUIRED")
        for field in fields:
            identity = (site_id, field.get("source_field_name"))
            if not identity[1] or identity in identities:
                raise ValueError("DUPLICATE_OR_MISSING_SOURCE_FIELD")
            identities.add(identity)
            for key in ("label", "name", "options", "unit", "validation", "canonical_candidate_id", "semantic_status", "confidence"):
                if key not in field:
                    raise ValueError(f"MISSING_OBSERVATION_ATTRIBUTE:{key}")
            candidate = field["canonical_candidate_id"]
            if candidate not in candidate_counts:
                raise ValueError("UNREGISTERED_CANONICAL_CANDIDATE")
            candidate_counts[candidate] += 1
            if field["semantic_status"] not in SEMANTIC_STATES:
                raise ValueError("INVALID_SEMANTIC_STATUS")
            if field["semantic_status"] == "CANONICAL" and not field.get("canonical_authority_pointer"):
                raise ValueError("UNSUPPORTED_CANONICAL_CONFIRMATION")
            if not isinstance(field["options"], list) or not isinstance(field["validation"], dict):
                raise ValueError("INVALID_OPTION_OR_VALIDATION_SHAPE")
            if not 0 <= field["confidence"] <= 1:
                raise ValueError("CONFIDENCE_OUT_OF_RANGE")
    missing = [candidate for candidate, count in candidate_counts.items() if count == 0]
    if missing:
        raise ValueError("MISSING_REQUIRED_CANDIDATES:" + ",".join(missing))
    return {"site_count": len(site_ids), "source_field_count": len(identities), "candidate_counts": candidate_counts}


def validate_evidence_files(fixture, package_root: Path):
    package_root = Path(package_root)
    checked = {}
    for site in fixture["sites"]:
        pointer = site["evidence_pointer"]
        relative_path = pointer["path"].split("#", 1)[0]
        path = package_root / relative_path
        if not path.is_file():
            raise ValueError(f"EVIDENCE_FILE_MISSING:{relative_path}")
        actual = sha256_file(path)
        if actual != pointer["artifact_sha256"]:
            raise ValueError(f"EVIDENCE_FILE_HASH_MISMATCH:{relative_path}")
        checked[relative_path] = actual
    return {"result": "PASS", "artifact_count": len(checked), "artifacts": checked}


def validate_contracts(contract_root: Path, datasets):
    contract_root = Path(contract_root)
    for schema, dataset in datasets.items():
        contract = read_json(contract_root / f"{schema}.schema.json")
        if contract["properties"]["schema_version"].get("const") != schema:
            raise ValueError(f"CONTRACT_CONST_MISMATCH:{schema}")
        if contract.get("required") != ["schema_version", "lineage", "records"]:
            raise ValueError(f"CONTRACT_REQUIRED_MISMATCH:{schema}")
        if dataset["schema_version"] != schema or not isinstance(dataset["records"], list):
            raise ValueError(f"DATASET_CONTRACT_MISMATCH:{schema}")
    return {"result": "PASS", "contract_count": len(datasets)}


def build_datasets(fixture):
    metrics = validate_fixture(fixture)
    observations = []
    for site in fixture["sites"]:
        for field in site["field_observations"]:
            observations.append((site, field))
    observations.sort(key=lambda item: (item[0]["source_site_id"], item[1]["source_field_name"]))

    ontology_records = []
    for candidate in REQUIRED_CANDIDATES:
        matched = [(site, field) for site, field in observations if field["canonical_candidate_id"] == candidate]
        template = matched[0][1]
        ontology_records.append({
            "canonical_candidate_id": candidate,
            "label_ko": fixture["candidate_definitions"][candidate]["label_ko"],
            "description": fixture["candidate_definitions"][candidate]["description"],
            "value_type_candidate": fixture["candidate_definitions"][candidate]["value_type_candidate"],
            "unit_candidates": sorted({field["unit"] for _, field in matched if field["unit"]}),
            "option_candidates": sorted({option for _, field in matched for option in field["options"]}),
            "validation_candidates": [field["validation"] for _, field in matched],
            "semantic_status": "CANDIDATE",
            "canonical_authority_pointer": None,
            "evidence_pointers": [
                {**site["evidence_pointer"], "selector": f"#/field_observations/{field['source_field_name']}"}
                for site, field in matched
            ],
            "source_observation_count": len(matched),
            "confidence_floor": min(field["confidence"] for _, field in matched),
            "example_validation": template["validation"],
        })

    binding_records = []
    transform_records = []
    for site, field in observations:
        site_id = site["source_site_id"]
        source_name = field["source_field_name"]
        read_id = f"READ::{site_id}::{source_name}"
        write_id = f"WRITE::{site_id}::{source_name}"
        evidence = {**site["evidence_pointer"], "selector": f"#/field_observations/{source_name}"}
        raw_observation = {key: field[key] for key in ("source_field_name", "label", "name", "options", "unit", "validation")}
        binding_records.append({
            "source_site_id": site_id,
            "source_field_name": source_name,
            "canonical_candidate_id": field["canonical_candidate_id"],
            "semantic_status": field["semantic_status"],
            "confidence": field["confidence"],
            "source_observation": raw_observation,
            "read_transform_candidate_id": read_id,
            "write_transform_candidate_id": write_id,
            "business_rule_status": "UNKNOWN",
            "evidence_pointer": evidence,
            "canonical_authority_pointer": field.get("canonical_authority_pointer"),
        })
        transform_records.extend([
            {
                "transform_candidate_id": read_id,
                "direction": "READ",
                "source_site_id": site_id,
                "source_field_name": source_name,
                "canonical_candidate_id": field["canonical_candidate_id"],
                "operation_candidate": field["read_transform_candidate"],
                "semantic_status": "CANDIDATE",
                "confidence": field["confidence"],
                "preserve_raw_value": True,
                "evidence_pointer": evidence,
            },
            {
                "transform_candidate_id": write_id,
                "direction": "WRITE",
                "source_site_id": site_id,
                "source_field_name": source_name,
                "canonical_candidate_id": field["canonical_candidate_id"],
                "operation_candidate": "RESTORE_RAW_VALUE",
                "semantic_status": "UNKNOWN",
                "confidence": 0.0,
                "preserve_raw_value": True,
                "unobserved_reason": "WRITE_BEHAVIOR_NOT_OBSERVED",
                "evidence_pointer": evidence,
            },
        ])

    lineage = {
        "cycle_id": fixture["cycle_id"],
        "directive_id": fixture["directive_id"],
        "parent_v4_pointer": fixture["lineage"]["parent_v4_pointer"],
        "a5_entity_transform_manifest": fixture["lineage"]["a5_entity_transform_manifest"],
        "b1_multimode_handoff": fixture["lineage"]["b1_multimode_handoff"],
        "source_fixture_sha256": sha256_json(fixture),
    }
    lineage["lineage_key"] = sha256_json(lineage)
    datasets = {
        ONTOLOGY_SCHEMA: {"schema_version": ONTOLOGY_SCHEMA, "lineage": lineage, "records": ontology_records},
        BINDING_SCHEMA: {"schema_version": BINDING_SCHEMA, "lineage": lineage, "records": binding_records},
        TRANSFORM_SCHEMA: {"schema_version": TRANSFORM_SCHEMA, "lineage": lineage, "records": transform_records},
    }
    validate_datasets(fixture, datasets)
    return datasets, metrics


def validate_datasets(fixture, datasets):
    if set(datasets) != {ONTOLOGY_SCHEMA, BINDING_SCHEMA, TRANSFORM_SCHEMA}:
        raise ValueError("REQUIRED_DATASET_SET_MISMATCH")
    source_identities = {
        (site["source_site_id"], field["source_field_name"])
        for site in fixture["sites"] for field in site["field_observations"]
    }
    bindings = datasets[BINDING_SCHEMA]["records"]
    bound_identities = {(record["source_site_id"], record["source_field_name"]) for record in bindings}
    if len(bound_identities) != len(bindings):
        raise ValueError("DUPLICATE_SITE_BINDING")
    if source_identities != bound_identities:
        raise ValueError("SOURCE_FIELD_LOSS_OR_SYNTHESIS")
    ontology_ids = {record["canonical_candidate_id"] for record in datasets[ONTOLOGY_SCHEMA]["records"]}
    if ontology_ids != set(REQUIRED_CANDIDATES):
        raise ValueError("ONTOLOGY_CANDIDATE_SET_MISMATCH")
    transforms = datasets[TRANSFORM_SCHEMA]["records"]
    transform_by_id = {record["transform_candidate_id"]: record for record in transforms}
    if len(transform_by_id) != len(transforms):
        raise ValueError("DUPLICATE_TRANSFORM_CANDIDATE")
    for record in bindings:
        if record["canonical_candidate_id"] not in ontology_ids:
            raise ValueError("UNRESOLVED_ONTOLOGY_CANDIDATE")
        if record["semantic_status"] == "CANONICAL" and not record.get("canonical_authority_pointer"):
            raise ValueError("UNSUPPORTED_CANONICAL_CONFIRMATION")
        if record["business_rule_status"] != "UNKNOWN":
            raise ValueError("UNOBSERVED_BUSINESS_RULE_PROMOTION")
        if not _evidence_valid(record["evidence_pointer"]):
            raise ValueError("INVALID_BINDING_EVIDENCE")
        for key, direction in (("read_transform_candidate_id", "READ"), ("write_transform_candidate_id", "WRITE")):
            transform = transform_by_id.get(record[key])
            if transform is None or transform["direction"] != direction:
                raise ValueError("TRANSFORM_LINEAGE_MISMATCH")
            if (transform["source_site_id"], transform["source_field_name"]) != (record["source_site_id"], record["source_field_name"]):
                raise ValueError("TRANSFORM_SOURCE_IDENTITY_MISMATCH")
    return {
        "source_field_loss_count": len(source_identities - bound_identities),
        "source_field_synthesis_count": len(bound_identities - source_identities),
        "canonical_confirmed_without_authority_count": 0,
        "binding_count": len(bindings),
        "transform_count": len(transforms),
    }


def _checkpoint(seq, phase, lineage_key, datasets, previous=None):
    value = {
        "schema_version": "BLUEPRINT_ONTOLOGY_BINDING_CHECKPOINT_V2",
        "checkpoint_seq": seq,
        "phase": phase,
        "lineage_key": lineage_key,
        "datasets": datasets,
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
    datasets, fixture_metrics = build_datasets(fixture)
    dataset_dir = output_root / "datasets"
    dataset_index = {}
    for schema, dataset in datasets.items():
        path = dataset_dir / f"{schema}.json"
        write_json(path, dataset)
        dataset_index[schema] = {
            "path": str(path.relative_to(output_root)),
            "sha256": sha256_file(path),
            "record_count": len(dataset["records"]),
        }
    lineage_key = datasets[ONTOLOGY_SCHEMA]["lineage"]["lineage_key"]
    checkpoint1 = _checkpoint(1, "PARENT_V4_BOUND", lineage_key, {})
    checkpoint2 = _checkpoint(2, "APPLICATION_SEMANTICS_MATERIALIZED", lineage_key, dataset_index, checkpoint1)
    write_json(output_root / "checkpoints" / "checkpoint-000001.json", checkpoint1)
    write_json(output_root / "checkpoints" / "checkpoint-000002.json", checkpoint2)
    validation = validate_datasets(fixture, datasets)
    pointer = {
        "schema_version": "B5_REAL_ESTATE_FIELD_ONTOLOGY_SITE_BINDING_RESULT_POINTER_V1",
        "cycle_id": fixture["cycle_id"],
        "directive_id": fixture["directive_id"],
        "lineage_key": lineage_key,
        "source_fixture_sha256": fixture_sha,
        "latest_checkpoint_seq": 2,
        "latest_checkpoint_path": "checkpoints/checkpoint-000002.json",
        "latest_checkpoint_sha256": sha256_file(output_root / "checkpoints" / "checkpoint-000002.json"),
        "datasets": dataset_index,
        "site_count": fixture_metrics["site_count"],
        **validation,
        "unknown_business_rule_count": len(datasets[BINDING_SCHEMA]["records"]),
        "unknown_write_transform_count": sum(record["semantic_status"] == "UNKNOWN" for record in datasets[TRANSFORM_SCHEMA]["records"] if record["direction"] == "WRITE"),
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
    for schema, item in pointer["datasets"].items():
        path = output_root / item["path"]
        dataset = read_json(path)
        if sha256_file(path) != item["sha256"] or len(dataset["records"]) != item["record_count"]:
            raise ValueError(f"DATASET_READBACK_MISMATCH:{schema}")
        if dataset["lineage"]["lineage_key"] != pointer["lineage_key"]:
            raise ValueError("DATASET_LINEAGE_READBACK_MISMATCH")
    return {"result": "PASS", "dataset_count": len(pointer["datasets"]), "checkpoint_seq": checkpoint["checkpoint_seq"]}


def smoke(fixture_path: Path, output_root: Path):
    fixture = read_json(fixture_path)
    package_root = Path(fixture_path).resolve().parents[1]
    evidence = validate_evidence_files(fixture, package_root)
    datasets, _ = build_datasets(fixture)
    contracts = validate_contracts(package_root / "contracts", datasets)
    pointer = materialize(fixture, output_root)
    duplicate = materialize(fixture, output_root)
    return {
        "result": "PASS",
        "readback": readback(output_root),
        "site_count": pointer["site_count"],
        "binding_count": pointer["binding_count"],
        "transform_count": pointer["transform_count"],
        "source_field_loss_count": pointer["source_field_loss_count"],
        "duplicate_materialization_noop": duplicate["duplicate_materialization"],
        "evidence": evidence,
        "contracts": contracts,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(smoke(args.fixture, args.output), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
