#!/usr/bin/env python3
"""Stable local terminal receipt store for Source Factory.

This module stores terminal worker receipts after a queue claim has been accepted.
It is local-only and has no network, browser, GPT, middleware, or deployment effects.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

REQUIRED_TERMINAL_FIELDS = ["status", "worker_id", "task_id", "outputs", "verification", "blockers"]
FORBIDDEN_COUNTER_FIELDS = [
    "prompt_send_count",
    "browser_launch_count",
    "pc_agent_service_start_count",
    "external_api_call_count",
    "middleware_transmission_count",
    "production_deploy_count",
]


def _now_iso() -> str:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Seoul")).replace(microsecond=0).isoformat()
    except Exception:
        return datetime.now().replace(microsecond=0).isoformat()


def validate_terminal_receipt(receipt: Dict[str, Any]) -> Tuple[bool, List[str]]:
    missing = [field for field in REQUIRED_TERMINAL_FIELDS if field not in receipt]
    counters = receipt.get("forbidden_effect_counters", {})
    for field in FORBIDDEN_COUNTER_FIELDS:
        if int(counters.get(field, 0) or 0) != 0:
            missing.append(f"NON_ZERO_FORBIDDEN_COUNTER:{field}")
    return (len(missing) == 0, missing)


def receipt_dedupe_key(receipt: Dict[str, Any]) -> str:
    return "|".join([
        str(receipt.get("queue_id", "")),
        str(receipt.get("assignment_id", "")),
        str(receipt.get("worker_id", "")),
        str(receipt.get("claim_key", "")),
    ])


class TerminalReceiptStore:
    def __init__(self, store_path: Path | str):
        self.store_path = Path(store_path)
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.store_path.exists():
            self.store_path.write_text(json.dumps({"schema_version": "SOURCE_FACTORY_TERMINAL_RECEIPT_STORE_V1", "receipts": []}, indent=2), encoding="utf-8")

    def _read(self) -> Dict[str, Any]:
        return json.loads(self.store_path.read_text(encoding="utf-8"))

    def _write(self, data: Dict[str, Any]) -> None:
        self.store_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_receipts(self) -> List[Dict[str, Any]]:
        return list(self._read().get("receipts", []))

    def save_terminal_receipt(self, receipt: Dict[str, Any]) -> Dict[str, Any]:
        valid, problems = validate_terminal_receipt(receipt)
        if not valid:
            return {"status": "REJECTED_INVALID_TERMINAL_RECEIPT", "problems": problems, "dedupe_key": receipt_dedupe_key(receipt)}

        data = self._read()
        receipts = data.setdefault("receipts", [])
        key = receipt_dedupe_key(receipt)
        for existing in receipts:
            if existing.get("dedupe_key") == key:
                return {"status": "REJECTED_DUPLICATE_TERMINAL_RECEIPT", "problems": [], "dedupe_key": key}

        stored = dict(receipt)
        stored["dedupe_key"] = key
        stored["stored_at"] = _now_iso()
        receipts.append(stored)
        self._write(data)
        return {"status": "ACCEPTED_TERMINAL_RECEIPT", "problems": [], "dedupe_key": key}
