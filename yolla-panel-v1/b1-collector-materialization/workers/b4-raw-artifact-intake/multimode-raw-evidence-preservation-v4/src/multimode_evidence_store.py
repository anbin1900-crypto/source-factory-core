from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Mapping

MODES = {"DATA", "PRODUCT", "WRITE", "MY_LISTING", "EDIT"}
EVIDENCE_KINDS = {"PAGE_STATE", "DOM", "NETWORK_REQUEST", "NETWORK_RESPONSE", "FORM_STRUCTURE", "PRODUCT_BLUEPRINT", "SCREENSHOT", "TRACE", "RECEIPT"}
FORBIDDEN_KEYS = {"authorization", "cookie", "token", "access_token", "refresh_token", "api_key", "apikey", "secret", "password", "credential", "credentials", "sessionid", "session_id"}
RAW_SECRET_PATTERNS = [
    re.compile(rb"(?i)\bBearer\s+[A-Za-z0-9._~+/\-=]{8,}\b"),
    re.compile(rb"(?i)\b(api[_-]?key|token|secret|password|authorization|cookie)\s*[:=]\s*[^\s,;]{4,}"),
]
RAW_PII_PATTERNS = [
    re.compile(rb"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"),
    re.compile(rb"\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b"),
    re.compile(rb"\b\d{6}[- ]?[1-4]\d{6}\b"),
]

class EvidenceError(ValueError):
    pass

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def _assert_safe_metadata(value: Any, path: str = "$") -> None:
    if isinstance(value, Mapping):
        for key, nested in value.items():
            if str(key).lower() in FORBIDDEN_KEYS:
                raise EvidenceError(f"forbidden secret metadata key at {path}.{key}")
            _assert_safe_metadata(nested, f"{path}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            _assert_safe_metadata(nested, f"{path}[{index}]")

def _assert_safe_raw(raw: bytes) -> None:
    if any(pattern.search(raw) for pattern in RAW_SECRET_PATTERNS):
        raise EvidenceError("secret/credential-like raw evidence prohibited")
    if any(pattern.search(raw) for pattern in RAW_PII_PATTERNS):
        raise EvidenceError("PII-like raw evidence prohibited")

class MultiModeEvidenceStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.raw_dir = self.root / "raw"
        self.refs_dir = self.root / "refs"
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.refs_dir.mkdir(parents=True, exist_ok=True)
        self.manifest_path = self.root / "MULTIMODE_RAW_EVIDENCE_MANIFEST_V1.json"
        self.lineage_path = self.root / "evidence-lineage.jsonl"

    def _manifest(self) -> dict[str, Any]:
        if self.manifest_path.exists():
            return json.loads(self.manifest_path.read_text(encoding="utf-8"))
        return {
            "schema_version": "MULTIMODE_RAW_EVIDENCE_MANIFEST_V1",
            "modes": sorted(MODES),
            "evidence": {},
            "action_refs": {},
            "compatibility": {
                "source_record_envelope_pointer": None,
                "command_artifact_checkpoint_pointer": None,
                "worker_state_checkpoint_pointer": None,
            },
            "raw_artifact_overwrite": False,
            "duplicate_materialization_count": 0,
        }

    def _atomic_manifest(self, payload: dict[str, Any]) -> None:
        tmp = self.manifest_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp, self.manifest_path)

    def _append_lineage(self, row: dict[str, Any]) -> None:
        with self.lineage_path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())

    def set_compatibility_pointers(self, *, source_record_envelope_pointer: str, command_artifact_checkpoint_pointer: str, worker_state_checkpoint_pointer: str) -> None:
        manifest = self._manifest()
        manifest["compatibility"] = {
            "source_record_envelope_pointer": source_record_envelope_pointer,
            "command_artifact_checkpoint_pointer": command_artifact_checkpoint_pointer,
            "worker_state_checkpoint_pointer": worker_state_checkpoint_pointer,
        }
        self._atomic_manifest(manifest)

    def materialize_raw(self, *, raw_bytes: bytes, evidence_kind: str, source_pointer: str, observed_at: str, mode: str, redaction_metadata: Mapping[str, Any] | None = None) -> dict[str, Any]:
        if mode not in MODES:
            raise EvidenceError("unsupported mode")
        if evidence_kind not in EVIDENCE_KINDS:
            raise EvidenceError("unsupported evidence kind")
        _assert_safe_raw(raw_bytes)
        _assert_safe_metadata(redaction_metadata or {})
        digest = sha256(raw_bytes)
        evidence_id = f"evidence-{digest[:24]}"
        manifest = self._manifest()
        if evidence_id in manifest["evidence"]:
            existing = manifest["evidence"][evidence_id]
            readback = (self.root / existing["stored_path"]).read_bytes()
            if sha256(readback) != existing["sha256"] or readback != raw_bytes:
                raise EvidenceError("existing evidence readback mismatch")
            self._append_lineage({"event": "DUPLICATE_EVIDENCE_REUSED", "evidence_id": evidence_id, "sha256": digest, "source_pointer": source_pointer, "observed_at": observed_at})
            return {"disposition": "DUPLICATE_REUSED", "evidence": existing}
        target = self.raw_dir / f"{evidence_id}.bin"
        with target.open("xb") as handle:
            handle.write(raw_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        readback = target.read_bytes()
        if readback != raw_bytes or sha256(readback) != digest:
            raise EvidenceError("exact readback mismatch")
        entry = {
            "schema_version": "MULTIMODE_RAW_EVIDENCE_ENTRY_V1",
            "evidence_id": evidence_id,
            "evidence_kind": evidence_kind,
            "sha256": digest,
            "size_bytes": len(raw_bytes),
            "source_pointer": source_pointer,
            "observed_at": observed_at,
            "first_mode": mode,
            "stored_path": str(target.relative_to(self.root)).replace("\\", "/"),
            "redaction_metadata": dict(redaction_metadata or {}),
        }
        manifest["evidence"][evidence_id] = entry
        self._atomic_manifest(manifest)
        self._append_lineage({"event": "RAW_EVIDENCE_MATERIALIZED", "evidence_id": evidence_id, "sha256": digest, "source_pointer": source_pointer, "observed_at": observed_at, "mode": mode})
        return {"disposition": "NEW_MATERIALIZED", "evidence": entry}

    def bind_action(self, *, action_id: str, mode: str, page_id: str, page_state_evidence_id: str, dom_evidence_ids: list[str], network_request_evidence_ids: list[str], network_response_evidence_ids: list[str], form_structure_evidence_ids: list[str], product_blueprint_evidence_ids: list[str], source_record_envelope_pointer: str, command_checkpoint_pointer: str, worker_state_checkpoint_pointer: str) -> dict[str, Any]:
        if mode not in MODES:
            raise EvidenceError("unsupported mode")
        manifest = self._manifest()
        all_ids = [page_state_evidence_id] + dom_evidence_ids + network_request_evidence_ids + network_response_evidence_ids + form_structure_evidence_ids + product_blueprint_evidence_ids
        missing = [value for value in all_ids if value not in manifest["evidence"]]
        if missing:
            raise EvidenceError(f"unknown evidence refs: {missing}")
        ref = {
            "schema_version": "ACTION_DOM_NETWORK_RESPONSE_EVIDENCE_REF_V1",
            "action_id": action_id,
            "mode": mode,
            "page_id": page_id,
            "page_state_artifact_ref": {"schema_version": "PAGE_STATE_ARTIFACT_REF_V1", "evidence_id": page_state_evidence_id},
            "dom_evidence_ids": dom_evidence_ids,
            "network_request_evidence_ids": network_request_evidence_ids,
            "network_response_evidence_ids": network_response_evidence_ids,
            "form_structure_evidence_ref": {"schema_version": "FORM_STRUCTURE_EVIDENCE_REF_V1", "evidence_ids": form_structure_evidence_ids},
            "product_blueprint_source_evidence_index": {"schema_version": "PRODUCT_BLUEPRINT_SOURCE_EVIDENCE_INDEX_V1", "evidence_ids": product_blueprint_evidence_ids},
            "source_record_envelope_pointer": source_record_envelope_pointer,
            "command_checkpoint_pointer": command_checkpoint_pointer,
            "worker_state_checkpoint_pointer": worker_state_checkpoint_pointer,
        }
        ref_path = self.refs_dir / f"{action_id}.json"
        if ref_path.exists():
            existing = json.loads(ref_path.read_text(encoding="utf-8"))
            if existing != ref:
                raise EvidenceError("action ref overwrite rejected")
            return existing
        ref_path.write_text(json.dumps(ref, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        manifest["action_refs"][action_id] = str(ref_path.relative_to(self.root)).replace("\\", "/")
        self._atomic_manifest(manifest)
        self._append_lineage({"event": "ACTION_EVIDENCE_BOUND", "action_id": action_id, "page_id": page_id, "mode": mode, "evidence_ids": all_ids})
        return ref

    def trace_action(self, action_id: str) -> dict[str, Any]:
        manifest = self._manifest()
        rel = manifest["action_refs"].get(action_id)
        if not rel:
            raise EvidenceError("action not found")
        ref = json.loads((self.root / rel).read_text(encoding="utf-8"))
        evidence_ids = [ref["page_state_artifact_ref"]["evidence_id"]] + ref["dom_evidence_ids"] + ref["network_request_evidence_ids"] + ref["network_response_evidence_ids"] + ref["form_structure_evidence_ref"]["evidence_ids"] + ref["product_blueprint_source_evidence_index"]["evidence_ids"]
        evidence = [manifest["evidence"][value] for value in evidence_ids]
        return {"action_ref": ref, "evidence": evidence, "evidence_count": len(evidence), "unique_evidence_count": len(set(evidence_ids))}

    def readback(self, evidence_id: str) -> bytes:
        manifest = self._manifest()
        entry = manifest["evidence"][evidence_id]
        raw = (self.root / entry["stored_path"]).read_bytes()
        if sha256(raw) != entry["sha256"] or len(raw) != entry["size_bytes"]:
            raise EvidenceError("readback mismatch")
        return raw
