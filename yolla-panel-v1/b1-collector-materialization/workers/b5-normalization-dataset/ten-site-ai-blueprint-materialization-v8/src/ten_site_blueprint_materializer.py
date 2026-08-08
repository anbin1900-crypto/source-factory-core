from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path


SITE_COUNT = 10
PRODUCT_ARCHETYPES = (
    "SEARCH",
    "LIST",
    "DETAIL",
    "MAP",
    "AGENCY",
    "MY_LISTING",
    "CREATE",
    "EDIT",
)
MAPPING_STATES = {"CANDIDATE", "UNKNOWN", "CONFLICT"}
PRODUCERS = {"A4", "A5", "B3"}
FORBIDDEN_SITE_KEYS = {
    "site_name",
    "site_url",
    "url",
    "session",
    "session_value",
    "cookie",
    "password",
    "raw_secret",
    "raw_pii",
}


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
        and isinstance(value.get("artifact_path"), str)
        and bool(value["artifact_path"])
        and isinstance(value.get("json_pointer"), str)
        and value["json_pointer"].startswith("#/")
    )


def _reject_sensitive_keys(value, path="$"):
    if isinstance(value, dict):
        for key, nested in value.items():
            if key.lower() in FORBIDDEN_SITE_KEYS:
                raise ValueError(f"FORBIDDEN_TARGET_OR_SECRET_KEY:{path}.{key}")
            _reject_sensitive_keys(nested, f"{path}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            _reject_sensitive_keys(nested, f"{path}[{index}]")


def validate_input(source):
    if source.get("schema_version") != "B5_TEN_SITE_BLUEPRINT_MATERIALIZATION_INPUT_V1":
        raise ValueError("INPUT_SCHEMA_MISMATCH")
    parent = source.get("parent_v7", {})
    if parent.get("head") != "a5445ba97dad347e3bc7a7a4b9586ad3de4c3c98":
        raise ValueError("PARENT_V7_HEAD_MISMATCH")
    if parent.get("pointer_blob") != "8452508bb9f4dd0af0cc2731de76339ed4615096":
        raise ValueError("PARENT_V7_POINTER_MISMATCH")
    if parent.get("execution_status") != "EXECUTION_PENDING":
        raise ValueError("PARENT_V7_EXECUTION_STATUS_MISMATCH")

    _reject_sensitive_keys(source)

    slots = source.get("producer_slots")
    if not isinstance(slots, dict) or set(slots) != PRODUCERS:
        raise ValueError("PRODUCER_SLOT_SET_MISMATCH")
    for producer, slot in slots.items():
        if slot.get("status") not in {"WAITING_INPUT", "BOUND"}:
            raise ValueError(f"PRODUCER_STATUS_INVALID:{producer}")
        if slot["status"] == "BOUND" and not exact_pointer(slot.get("exact_pointer")):
            raise ValueError(f"BOUND_POINTER_INVALID:{producer}")
        if slot["status"] == "WAITING_INPUT" and slot.get("exact_pointer") is not None:
            raise ValueError(f"WAITING_POINTER_MUST_BE_NULL:{producer}")

    ontology = source.get("common_ontology")
    if not isinstance(ontology, list) or not ontology:
        raise ValueError("COMMON_ONTOLOGY_REQUIRED")
    ontology_ids = set()
    for field in ontology:
        field_id = field.get("field_id")
        if not field_id or field_id in ontology_ids:
            raise ValueError("DUPLICATE_OR_MISSING_ONTOLOGY_FIELD")
        ontology_ids.add(field_id)
        if field.get("mapping_status") not in {"CANDIDATE", "UNKNOWN"}:
            raise ValueError("D_CANONICAL_PROMOTION_FORBIDDEN")
        if field.get("canonical_authority") is not None:
            raise ValueError("D_CANONICAL_AUTHORITY_FORBIDDEN")

    sites = source.get("sites")
    if not isinstance(sites, list) or len(sites) != SITE_COUNT:
        raise ValueError("EXACTLY_TEN_SITE_SLOTS_REQUIRED")
    site_ids = set()
    source_field_count = 0
    for site in sites:
        site_id = site.get("site_id")
        if not site_id or site_id in site_ids:
            raise ValueError("DUPLICATE_OR_MISSING_SITE_ID")
        site_ids.add(site_id)
        if site.get("authority_status") != "WAITING_INPUT":
            raise ValueError("SITE_AUTHORITY_MUST_WAIT_FOR_V2_INPUT")
        extensions = site.get("source_extensions")
        if not isinstance(extensions, list):
            raise ValueError("SOURCE_EXTENSIONS_LIST_REQUIRED")
        extension_names = set()
        for extension in extensions:
            name = extension.get("source_field_name")
            if not name or name in extension_names:
                raise ValueError("DUPLICATE_OR_MISSING_SOURCE_EXTENSION")
            extension_names.add(name)
            source_field_count += 1
            if extension.get("mapping_status") not in MAPPING_STATES:
                raise ValueError("SOURCE_EXTENSION_STATUS_INVALID")
            if "raw_value" not in extension:
                raise ValueError("SOURCE_EXTENSION_RAW_VALUE_REQUIRED")
            candidates = extension.get("candidate_field_ids", [])
            if not isinstance(candidates, list) or any(x not in ontology_ids for x in candidates):
                raise ValueError("SOURCE_EXTENSION_CANDIDATE_INVALID")
            if extension["mapping_status"] == "CONFLICT" and len(candidates) < 2:
                raise ValueError("CONFLICT_REQUIRES_MULTIPLE_CANDIDATES")
    return {
        "site_count": len(site_ids),
        "ontology_field_count": len(ontology_ids),
        "source_field_count": source_field_count,
    }


def materialize(source):
    metrics = validate_input(source)
    site_ids = [site["site_id"] for site in source["sites"]]
    parent = source["parent_v7"]
    lineage = {
        "cycle_id": source["cycle_id"],
        "directive_id": source["directive_id"],
        "directive_comment": source["directive_comment"],
        "parent_v7_head": parent["head"],
        "parent_v7_pointer_blob": parent["pointer_blob"],
        "parent_v7_terminal": parent["terminal"],
        "append_policy": "SEPARATE_V8_APPEND_ONLY_NO_PRIOR_REWRITE",
        "input_sha256": sha256_json(source),
    }
    lineage["lineage_key"] = sha256_json(lineage)

    ontology_records = []
    for field in sorted(source["common_ontology"], key=lambda item: item["field_id"]):
        ontology_records.append(copy.deepcopy(field) | {
            "applicable_site_slots": copy.deepcopy(site_ids),
            "record_policy": "APPEND_ONLY_CANDIDATE_OR_UNKNOWN",
        })

    blueprint_records = []
    for archetype in PRODUCT_ARCHETYPES:
        blueprint_records.append({
            "blueprint_id": f"REAL_ESTATE_PRODUCT::{archetype}::V1",
            "archetype": archetype,
            "applicable_site_slots": copy.deepcopy(site_ids),
            "authority_status": "WAITING_INPUT",
            "required_structure": copy.deepcopy(source["product_blueprint_templates"][archetype]),
            "site_specific_values": "LATE_BIND_ONLY",
            "final_write_or_edit_submit": False,
            "record_policy": "APPEND_ONLY_TEMPLATE",
        })

    extension_records = []
    materialized_source_field_count = 0
    for site in sorted(source["sites"], key=lambda item: item["site_id"]):
        for extension in sorted(site["source_extensions"], key=lambda item: item["source_field_name"]):
            extension_records.append({
                "extension_id": f"{site['site_id']}::{extension['source_field_name']}::V1",
                "site_id": site["site_id"],
                "authority_status": site["authority_status"],
                "source_field_name": extension["source_field_name"],
                "raw_value": copy.deepcopy(extension["raw_value"]),
                "mapping_status": extension["mapping_status"],
                "candidate_field_ids": copy.deepcopy(extension["candidate_field_ids"]),
                "conflict_detail": copy.deepcopy(extension.get("conflict_detail")),
                "evidence_pointer": copy.deepcopy(extension.get("evidence_pointer")),
                "canonical_authority": None,
                "record_policy": "LOSSLESS_APPEND_ONLY_EXTENSION",
            })
            materialized_source_field_count += 1

    producer_slots = copy.deepcopy(source["producer_slots"])
    bound_count = sum(slot["status"] == "BOUND" for slot in producer_slots.values())
    waiting_count = len(producer_slots) - bound_count
    source_field_loss_count = metrics["source_field_count"] - materialized_source_field_count
    if source_field_loss_count:
        raise ValueError("SOURCE_FIELD_LOSS")

    datasets = {
        "B5_TEN_SITE_SOURCE_ONTOLOGY_V1": {
            "schema_version": "B5_TEN_SITE_SOURCE_ONTOLOGY_V1",
            "lineage": lineage,
            "records": ontology_records,
        },
        "B5_AI_REAL_ESTATE_PRODUCT_BLUEPRINT_V1": {
            "schema_version": "B5_AI_REAL_ESTATE_PRODUCT_BLUEPRINT_V1",
            "lineage": lineage,
            "records": blueprint_records,
        },
        "B5_LOSSLESS_SITE_EXTENSION_PACKAGE_V1": {
            "schema_version": "B5_LOSSLESS_SITE_EXTENSION_PACKAGE_V1",
            "lineage": lineage,
            "site_slots": [{"site_id": site["site_id"], "authority_status": site["authority_status"]} for site in source["sites"]],
            "producer_slots": producer_slots,
            "records": extension_records,
        },
    }
    receipt = {
        "schema_version": "B5_MATERIALIZATION_VALIDATION_RECEIPT_V1",
        "lineage": lineage,
        "execution_status": "EVIDENCE_BOUND" if waiting_count == 0 else "WAITING_INPUT",
        "site_slot_count": metrics["site_count"],
        "product_blueprint_count": len(blueprint_records),
        "ontology_field_count": metrics["ontology_field_count"],
        "source_field_count": metrics["source_field_count"],
        "materialized_source_field_count": materialized_source_field_count,
        "source_field_loss_count": source_field_loss_count,
        "bound_producer_count": bound_count,
        "waiting_producer_count": waiting_count,
        "common_mapping_layer_preserved": True,
        "site_extension_layer_preserved": True,
        "candidate_unknown_conflict_separated": True,
        "prior_v6_v7_rewrite_count": 0,
        "d_canonical_schema_decision_count": 0,
        "raw_secret_or_pii_count": 0,
        "final_write_or_edit_submit_count": 0,
        "production_write_count": 0,
        "dataset_sha256": {name: sha256_json(value) for name, value in datasets.items()},
    }
    datasets["B5_MATERIALIZATION_VALIDATION_RECEIPT_V1"] = receipt
    pointer = {
        "schema_version": "LATEST_B5_TEN_SITE_AI_BLUEPRINT_MATERIALIZATION_POINTER_V1",
        "lineage_key": lineage["lineage_key"],
        "execution_status": receipt["execution_status"],
        "outputs": {
            name: {"sha256": sha256_json(value), "record_count": len(value.get("records", []))}
            for name, value in datasets.items()
        },
        "terminal": "B5_AI_BLUEPRINT_ONTOLOGY_MATERIALIZER_PASS",
        "live_pass_claimed": False,
        "production": False,
        "ready": False,
        "merge": False,
    }
    return datasets, pointer


def write_outputs(source_path, output_root):
    source = json.loads(Path(source_path).read_text(encoding="utf-8"))
    datasets, pointer = materialize(source)
    root = Path(output_root)
    root.mkdir(parents=True, exist_ok=True)
    for name, value in datasets.items():
        (root / f"{name}.json").write_text(
            json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
    (root / "LATEST_POINTER.json").write_text(
        json.dumps(pointer, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return pointer


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("output")
    args = parser.parse_args()
    print(canonical_json(write_outputs(args.source, args.output)))
