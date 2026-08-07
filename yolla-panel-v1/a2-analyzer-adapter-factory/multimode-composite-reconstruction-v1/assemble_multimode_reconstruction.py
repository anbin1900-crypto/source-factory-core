#!/usr/bin/env python3
import hashlib, json, sys

def stable_digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()

def assemble(fixture):
    records = fixture["common_evidence"]
    branches = {}
    branch_modes = {
        "DATA_ADAPTER": ["DATA"],
        "PRODUCT_BLUEPRINT": ["PRODUCT"],
        "WRITE_MY_LISTING_EDIT_SPEC": ["WRITE", "MY_LISTING", "EDIT"],
    }
    for branch, modes in branch_modes.items():
        selected = [r for r in records if any(m in r["consumers"] for m in modes)]
        branches[branch] = {
            "evidence_ids": [r["evidence_id"] for r in selected],
            "records": selected,
        }
    composite = {
        "schema_version": "MULTIMODE_ANALYZER_COMPOSITE_V1",
        "common_evidence_source": "COMMON_SITE_EVIDENCE_MODEL_V2",
        "branches": branches,
        "invariants": {
            "assertion_states": ["OBSERVED", "INFERRED", "UNKNOWN"],
            "confidence_preserved": True,
            "evidence_pointer_preserved": True,
            "unknown_must_not_fabricate": True,
            "legacy_data_projection_unchanged": True,
        },
        "critical_product_structure_coverage": fixture["critical_product_structure_coverage"],
        "unknown_index": [r for r in records if r["state"] == "UNKNOWN"],
        "late_bind_slots": fixture["late_bind_slots"],
    }
    package = {
        "schema_version": "AI_SITE_RECONSTRUCTION_PACKAGE_V1",
        "source_composite_digest_sha256": stable_digest(composite),
        "product_blueprint": fixture["product_blueprint"],
        "data_adapter": {
            "evidence_ids": branches["DATA_ADAPTER"]["evidence_ids"],
            "backward_compatible": True,
        },
        "write_my_listing_edit_spec": {
            "modes": ["WRITE", "MY_LISTING", "EDIT"],
            "evidence_ids": branches["WRITE_MY_LISTING_EDIT_SPEC"]["evidence_ids"],
            "final_submit_boundary": "USER_CONFIRM_REQUIRED",
        },
        "critical_product_structure_coverage": fixture["critical_product_structure_coverage"],
        "unknown_index": composite["unknown_index"],
        "next_live_action_input": fixture["next_live_action_input"],
        "exact_producer_heads": fixture["exact_producer_heads"],
        "late_bind_slots": fixture["late_bind_slots"],
        "boundaries": fixture["boundaries"],
    }
    package["package_digest_sha256"] = stable_digest(package)
    return composite, package

if __name__ == "__main__":
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        fixture = json.load(f)
    composite, package = assemble(fixture)
    print(json.dumps({"composite": composite, "package": package}, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
