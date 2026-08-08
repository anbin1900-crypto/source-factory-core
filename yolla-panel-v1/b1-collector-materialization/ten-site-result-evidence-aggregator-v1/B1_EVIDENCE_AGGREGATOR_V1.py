from __future__ import annotations
from collections import defaultdict
from copy import deepcopy

LANES = ("DATA","PRODUCT","WRITE","MY_LISTING","EDIT")
KINDS = ("OBSERVED","FIXTURE","INFERRED","UNKNOWN","WAITING_INPUT")
PASS_STATUSES = ("PASS","TECHNICAL_PASS")

def _require(condition, message):
    if not condition:
        raise ValueError(message)

def normalize_receipt(receipt):
    r = deepcopy(receipt)
    for key in ("site_slot","site_id","lane","command_id","receipt_id","attempt_count","result","evidence","validation","status"):
        _require(key in r, f"missing:{key}")
    _require(r["lane"] in LANES, "invalid_lane")
    _require(r["evidence"].get("kind") in KINDS, "invalid_evidence_kind")
    _require(isinstance(r["attempt_count"], int) and r["attempt_count"] >= 1, "invalid_attempt_count")
    if r["status"] in PASS_STATUSES:
        _require(r["validation"].get("exact") is True, "pass_without_exact_validation")
        _require(bool(r["validation"].get("pointer")), "pass_without_validation_pointer")
        _require(r["evidence"].get("kind") in ("OBSERVED","FIXTURE"), "pass_from_non_verifiable_evidence_kind")
        _require(bool(r["evidence"].get("pointer")), "pass_without_evidence_pointer")
    if r["evidence"].get("kind") in ("INFERRED","UNKNOWN","WAITING_INPUT"):
        _require(r["status"] not in PASS_STATUSES, "non_exact_evidence_promoted_to_pass")
    r.setdefault("source_pointer_lineage", [])
    r.setdefault("capabilities", [])
    return r

def aggregate(receipts):
    accepted = {}
    duplicates = []
    retry_groups = defaultdict(list)
    conflicts = []
    for raw in receipts:
        r = normalize_receipt(raw)
        dup_key = (r["site_slot"], r["lane"], r["command_id"], r["receipt_id"])
        if dup_key in accepted:
            duplicates.append({"duplicate_key": list(dup_key), "receipt_id": r["receipt_id"]})
            continue
        accepted[dup_key] = r
        retry_groups[(r["site_slot"], r["lane"], r["command_id"])].append(r)

    cells = []
    for group_key, group in sorted(retry_groups.items()):
        by_attempt = defaultdict(list)
        for r in group:
            by_attempt[r["attempt_count"]].append(r)
        for attempt, same_attempt in by_attempt.items():
            signatures = {(x["status"], x["result"].get("code"), x["validation"].get("pointer")) for x in same_attempt}
            if len(signatures) > 1:
                conflicts.append({"retry_group_key": list(group_key), "attempt_count": attempt, "reason":"SAME_ATTEMPT_CONFLICT"})
        ordered = sorted(group, key=lambda x: (x["attempt_count"], x["receipt_id"]))
        effective = deepcopy(ordered[-1])
        lineage=[]
        for r in ordered:
            lineage.extend(r.get("source_pointer_lineage", []))
            if r["evidence"].get("pointer"):
                lineage.append(r["evidence"]["pointer"])
            if r["validation"].get("pointer"):
                lineage.append(r["validation"]["pointer"])
        effective["source_pointer_lineage"] = list(dict.fromkeys(lineage))
        effective["retry_receipt_ids"] = [r["receipt_id"] for r in ordered]
        effective["retry_attempts"] = [r["attempt_count"] for r in ordered]
        if any(c["retry_group_key"] == list(group_key) for c in conflicts):
            effective["status"] = "CONFLICT"
            effective["result"] = {"code":"SAME_ATTEMPT_CONFLICT"}
        cells.append(effective)

    return {
        "materialized_cells": cells,
        "accepted_receipt_count": len(accepted),
        "duplicate_receipt_count": len(duplicates),
        "duplicates": duplicates,
        "retry_group_count": len(retry_groups),
        "conflict_count": len(conflicts),
        "conflicts": conflicts
    }

def compute_gap_snapshot(matrix_template, aggregated):
    slots = [s["slot_id"] for s in matrix_template["site_slots"]]
    done={(c["site_slot"],c["lane"]) for c in aggregated["materialized_cells"] if c["status"] in PASS_STATUSES}
    gaps=[]
    for slot in slots:
        for lane in LANES:
            if (slot,lane) not in done:
                gaps.append({"site_slot":slot,"lane":lane,"status":"WAITING_INPUT"})
    next_target = gaps[0] if gaps else None
    per_slot={}
    for slot in slots:
        missing=[g["lane"] for g in gaps if g["site_slot"]==slot]
        per_slot[slot]={"missing_capabilities":missing,"complete":not missing}
    return {
        "potential_cell_count":len(slots)*len(LANES),
        "technical_pass_cell_count":len(done),
        "gap_count":len(gaps),
        "next_execution_target":next_target,
        "site_gaps":per_slot
    }
