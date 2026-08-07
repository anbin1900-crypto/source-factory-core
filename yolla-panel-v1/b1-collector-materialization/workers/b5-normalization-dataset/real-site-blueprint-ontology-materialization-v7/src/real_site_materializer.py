from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path


OUTPUTS = (
    "REAL_SITE_BLUEPRINT_DB_UPDATE_V1",
    "REAL_SITE_ONTOLOGY_BINDING_UPDATE_V1",
    "REAL_SITE_SITE_BINDING_VERSION_V1",
    "MATERIALIZATION_RECEIPT_V1",
)
SEMANTIC_STATES = {"OBSERVED", "INFERRED", "CANDIDATE", "UNKNOWN"}


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value):
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def exact_pointer(value):
    return (
        isinstance(value, dict)
        and isinstance(value.get("producer_head"), str)
        and len(value["producer_head"]) == 40
        and isinstance(value.get("artifact_blob"), str)
        and len(value["artifact_blob"]) == 40
        and isinstance(value.get("artifact_sha256"), str)
        and len(value["artifact_sha256"]) == 64
        and bool(value.get("artifact_path"))
        and bool(value.get("json_pointer"))
    )


def validate_input(source):
    parent = source.get("parent_v6", {})
    if parent.get("head") != "dad617da0c60b0937c04de46c92fd3fb72c5d556":
        raise ValueError("PARENT_V6_HEAD_MISMATCH")
    if parent.get("pointer_blob") != "5c9b18bffb20a33999b506bdfb29212f751a29ee":
        raise ValueError("PARENT_V6_POINTER_MISMATCH")
    base = parent.get("dataset_blobs", {})
    if set(base) != {
        "REAL_ESTATE_SITE_BLUEPRINT_DB_V1",
        "SITE_CAPABILITY_PROFILE_V1",
        "LISTING_ONTOLOGY_BINDING_PACKAGE_V1",
    }:
        raise ValueError("PARENT_V6_DATASET_SET_MISMATCH")
    if any(not isinstance(v, str) or len(v) != 40 for v in base.values()):
        raise ValueError("PARENT_V6_DATASET_POINTER_INVALID")
    observations = source.get("observations")
    if not isinstance(observations, list):
        raise ValueError("OBSERVATIONS_LIST_REQUIRED")
    identities = set()
    fields = set()
    for item in observations:
        identity = item.get("observation_id")
        if not identity or identity in identities:
            raise ValueError("DUPLICATE_OR_MISSING_OBSERVATION_ID")
        identities.add(identity)
        if item.get("semantic_status") not in SEMANTIC_STATES:
            raise ValueError("SEMANTIC_STATUS_INVALID")
        if item["semantic_status"] == "OBSERVED" and not exact_pointer(item.get("evidence_pointer")):
            raise ValueError("OBSERVED_REQUIRES_EXACT_EVIDENCE")
        if item["semantic_status"] != "OBSERVED" and item.get("evidence_pointer") is not None and not exact_pointer(item["evidence_pointer"]):
            raise ValueError("EVIDENCE_POINTER_INVALID")
        source_fields = item.get("source_fields", {})
        if not isinstance(source_fields, dict):
            raise ValueError("SOURCE_FIELDS_OBJECT_REQUIRED")
        for name in source_fields:
            fields.add((identity, name))
        mappings = item.get("mappings", [])
        if not isinstance(mappings, list):
            raise ValueError("MAPPINGS_LIST_REQUIRED")
        for mapping in mappings:
            if mapping.get("status") not in {"CANDIDATE", "UNKNOWN"}:
                raise ValueError("D_CANONICAL_PROMOTION_FORBIDDEN")
    return {"observation_count": len(identities), "source_field_count": len(fields)}


def materialize(source):
    metrics = validate_input(source)
    parent = source["parent_v6"]
    slots = copy.deepcopy(source.get("producer_slots", {}))
    bound = {k: v for k, v in slots.items() if v.get("status") == "BOUND"}
    pending = {k: v for k, v in slots.items() if v.get("status") != "BOUND"}
    for value in bound.values():
        if not exact_pointer(value.get("exact_pointer")):
            raise ValueError("BOUND_PRODUCER_EXACT_POINTER_INVALID")

    blueprint_records = []
    ontology_records = []
    binding_records = []
    source_field_total = 0
    materialized_field_total = 0
    for item in sorted(source["observations"], key=lambda x: x["observation_id"]):
        common = {
            "observation_id": item["observation_id"],
            "site_id": item["site_id"],
            "version": item["version"],
            "semantic_status": item["semantic_status"],
            "evidence_pointer": copy.deepcopy(item.get("evidence_pointer")),
            "command_id": item.get("command_id"),
            "page_id": item.get("page_id"),
            "action_id": item.get("action_id"),
        }
        blueprint_records.append(common | {
            "record_id": f"{item['site_id']}::REAL_SITE_BLUEPRINT::V{item['version']}",
            "product_blueprint": copy.deepcopy(item.get("product_blueprint", {})),
            "state_bindings": copy.deepcopy(item.get("state_bindings", [])),
            "api_bindings": copy.deepcopy(item.get("api_bindings", [])),
            "form_bindings": copy.deepcopy(item.get("form_bindings", [])),
            "record_policy": "APPEND_ONLY_NO_PARENT_REWRITE",
        })
        for mapping in item["mappings"]:
            ontology_records.append(common | copy.deepcopy(mapping))
        for name, raw_value in sorted(item["source_fields"].items()):
            source_field_total += 1
            binding_records.append(common | {
                "binding_id": f"{item['site_id']}::{name}::V{item['version']}",
                "source_field_name": name,
                "raw_value": copy.deepcopy(raw_value),
                "mapping_status": next((m["status"] for m in item["mappings"] if m.get("source_field_name") == name), "UNKNOWN"),
                "canonical_authority": None,
            })
            materialized_field_total += 1

    lineage = {
        "cycle_id": source["cycle_id"],
        "directive_id": source["directive_id"],
        "parent_v6_head": parent["head"],
        "parent_v6_pointer_blob": parent["pointer_blob"],
        "parent_dataset_blobs": copy.deepcopy(parent["dataset_blobs"]),
        "append_policy": "SEPARATE_V7_APPEND_ONLY_LAYER",
        "source_sha256": sha256_json(source),
    }
    lineage["lineage_key"] = sha256_json(lineage)
    datasets = {
        "REAL_SITE_BLUEPRINT_DB_UPDATE_V1": {"schema_version": "REAL_SITE_BLUEPRINT_DB_UPDATE_V1", "lineage": lineage, "records": blueprint_records},
        "REAL_SITE_ONTOLOGY_BINDING_UPDATE_V1": {"schema_version": "REAL_SITE_ONTOLOGY_BINDING_UPDATE_V1", "lineage": lineage, "records": ontology_records},
        "REAL_SITE_SITE_BINDING_VERSION_V1": {"schema_version": "REAL_SITE_SITE_BINDING_VERSION_V1", "lineage": lineage, "records": binding_records},
    }
    source_loss = source_field_total - materialized_field_total
    if source_loss != 0:
        raise ValueError("SOURCE_FIELD_LOSS")
    live_observed = sum(x["semantic_status"] == "OBSERVED" for x in source["observations"])
    receipt = {
        "schema_version": "MATERIALIZATION_RECEIPT_V1",
        "lineage": lineage,
        "execution_status": "LIVE_EVIDENCE_BOUND" if not pending else "EXECUTION_PENDING",
        "producer_slots": slots,
        "bound_producer_count": len(bound),
        "pending_producer_count": len(pending),
        "live_observation_count": live_observed,
        "source_field_count": source_field_total,
        "materialized_field_count": materialized_field_total,
        "source_field_loss_count": source_loss,
        "existing_v6_record_rewrite_count": 0,
        "d_canonical_schema_decision_count": 0,
        "production_write_count": 0,
        "dataset_sha256": {name: sha256_json(value) for name, value in datasets.items()},
    }
    datasets["MATERIALIZATION_RECEIPT_V1"] = receipt
    pointer = {
        "schema_version": "B5_REAL_SITE_BLUEPRINT_ONTOLOGY_MATERIALIZATION_RESULT_POINTER_V1",
        "lineage_key": lineage["lineage_key"],
        "outputs": {name: {"sha256": sha256_json(value), "record_count": len(value.get("records", []))} for name, value in datasets.items()},
        "execution_status": receipt["execution_status"],
        "terminal": "B5_REAL_SITE_BLUEPRINT_ONTOLOGY_MATERIALIZATION_READY",
    }
    return datasets, pointer, metrics


def write_outputs(source_path, output_root):
    source = json.loads(Path(source_path).read_text(encoding="utf-8"))
    datasets, pointer, _ = materialize(source)
    root = Path(output_root)
    root.mkdir(parents=True, exist_ok=True)
    for name, value in datasets.items():
        (root / f"{name}.json").write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    (root / "LATEST_POINTER.json").write_text(json.dumps(pointer, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return pointer
