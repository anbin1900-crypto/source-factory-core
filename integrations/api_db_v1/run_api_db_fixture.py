#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ALIASES = {
    "provider_id": "source_system_id",
    "call_id": "request_id",
    "asset_id": "artifact_id",
    "target_dataset_id": "dataset_id",
}
CANONICAL = tuple(ALIASES.values())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")

def sha(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()

def stable_id(prefix: str, seed: str) -> str:
    return f"{prefix}_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:26]}"

def adapt_ingress(payload: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, str]]]:
    output = dict(payload)
    applied = []
    for legacy, canonical in ALIASES.items():
        if legacy not in output:
            continue
        legacy_value = output[legacy]
        if canonical in output and output[canonical] != legacy_value:
            raise ValueError(f"ALIAS_VALUE_CONFLICT:{legacy}:{canonical}")
        output[canonical] = legacy_value
        del output[legacy]
        applied.append({"legacy": legacy, "canonical": canonical})
    for name in CANONICAL:
        if not str(output.get(name, "")).strip():
            raise ValueError(f"CANONICAL_IDENTIFIER_MISSING:{name}")
    if output.get("source_run_type") != "API":
        raise ValueError("SOURCE_RUN_TYPE_MUST_BE_API")
    if output.get("production") is not False:
        raise ValueError("PRODUCTION_MUST_BE_FALSE")
    return output, applied

def build_analysis(api: dict[str, Any], artifact_sha: str) -> dict[str, Any]:
    response = api["response"]
    document_id = stable_id("DOC", api["dataset_id"] + response["document_title"])
    document_version_id = stable_id("DOCV", document_id + response["effective_date"] + artifact_sha)
    fragment_id = stable_id("FRG", document_version_id + response["content"])
    analysis_job_id = stable_id("AJOB", fragment_id + "NORM_EXTRACTION")
    assertion_id = stable_id("AST", fragment_id + "obligation")
    evidence_link_id = stable_id("EVL", assertion_id + fragment_id)
    analysis_result_id = stable_id("ARES", analysis_job_id + artifact_sha)
    quote_hash = hashlib.sha256(response["content"].encode("utf-8")).hexdigest()
    result = {
        "analysis_result_id": analysis_result_id,
        "analysis_job_id": analysis_job_id,
        "domain_pack_id": "DOMAIN_PACK_HAZARDOUS_MATERIALS_FIXTURE",
        "document_id": document_id,
        "document_version_id": document_version_id,
        "fragment_ids": [fragment_id],
        "document_type": response["document_type"],
        "effective_date": response["effective_date"],
        "analysis_type": "NORM_EXTRACTION",
        "topics": [response["topic"]],
        "summary": response["content"],
        "assertions": [{
            "assertion_id": assertion_id,
            "norm_type": "OBLIGATION",
            "subject": "주유취급소 관계인",
            "action": "시설 상태 확인 및 점검기록 보존",
            "object": "주유취급소 시설과 점검기록",
            "conditions": [],
            "exceptions": [],
            "deadline": None,
            "penalty": None,
            "procedure_steps": ["시설 상태를 확인한다", "점검기록을 보존한다"],
            "related_authorities": [],
            "evidence": [{
                "evidence_link_id": evidence_link_id,
                "fragment_id": fragment_id,
                "locator": "fixture:response.content",
                "quote_hash": quote_hash,
                "support_type": "DIRECT",
                "support_strength": 1.0
            }],
            "confidence": 1.0,
            "review_required": False,
            "status": "EVIDENCE_VERIFIED"
        }],
        "relations": [],
        "defined_terms": [],
        "unresolved_items": [],
        "confidence": 1.0,
        "model_name": "DETERMINISTIC_LOCAL_FIXTURE",
        "model_version": "1.0.0",
        "prompt_version": "fixture-v1",
        "input_hash": artifact_sha,
        "output_hash": "0" * 64,
        "validation_status": "VALIDATED",
        "failure_status": None,
        "created_at": now_iso(),
        "security": {
            "security_class": "LEVEL_0_PUBLIC_AUTHORITY",
            "contains_personal_data": False,
            "contains_sensitive_data": False,
            "contains_case_data": False,
            "external_ai_allowed": False,
            "access_policy_ref": "D_GROUP_PUBLIC_AUTHORITY_DEFAULT",
            "retention_policy_ref": "D_GROUP_SOURCE_IMMUTABILITY_DEFAULT",
            "audit_required": True
        }
    }
    result["output_hash"] = sha({k: v for k, v in result.items() if k != "output_hash"})
    return result

def validate_analysis(result: dict[str, Any]) -> None:
    required = [
        "analysis_result_id", "analysis_job_id", "domain_pack_id", "document_id",
        "document_version_id", "document_type", "analysis_type", "topics", "summary",
        "assertions", "relations", "defined_terms", "unresolved_items", "confidence",
        "model_name", "model_version", "prompt_version", "input_hash", "output_hash",
        "validation_status", "failure_status", "created_at", "security"
    ]
    missing = [name for name in required if name not in result]
    if missing:
        raise ValueError("ANALYSIS_REQUIRED_FIELD_MISSING:" + ",".join(missing))
    if not result["assertions"] or not result["assertions"][0]["evidence"]:
        raise ValueError("ASSERTION_WITHOUT_EVIDENCE")
    if result["security"]["contains_personal_data"] or result["security"]["contains_case_data"]:
        raise ValueError("SECURITY_POLICY_VIOLATION")
    for name in ("input_hash", "output_hash"):
        if len(result[name]) != 64:
            raise ValueError(f"HASH_INVALID:{name}")

def stage(api: dict[str, Any], analysis: dict[str, Any], output_root: Path) -> dict[str, Any]:
    output_root.mkdir(parents=True, exist_ok=True)
    db_path = output_root / "knowledge_staging_fixture.db"
    artifact_payload = api["response"]
    artifact_bytes = canonical_bytes(artifact_payload)
    artifact_sha = hashlib.sha256(artifact_bytes).hexdigest()
    connection = sqlite3.connect(db_path)
    try:
        connection.executescript("""
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS raw_artifacts(
          artifact_id TEXT PRIMARY KEY,
          source_system_id TEXT NOT NULL,
          request_id TEXT NOT NULL,
          dataset_id TEXT NOT NULL,
          sha256 TEXT NOT NULL UNIQUE,
          mime_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          production INTEGER NOT NULL CHECK(production=0)
        );
        CREATE TABLE IF NOT EXISTS analysis_results(
          analysis_result_id TEXT PRIMARY KEY,
          artifact_id TEXT NOT NULL REFERENCES raw_artifacts(artifact_id),
          document_id TEXT NOT NULL,
          document_version_id TEXT NOT NULL,
          result_json TEXT NOT NULL,
          validation_status TEXT NOT NULL,
          production INTEGER NOT NULL CHECK(production=0)
        );
        """)
        connection.execute("BEGIN")
        connection.execute(
            "INSERT OR IGNORE INTO raw_artifacts VALUES(?,?,?,?,?,?,?,?,0)",
            (api["artifact_id"], api["source_system_id"], api["request_id"], api["dataset_id"],
             artifact_sha, "application/json", len(artifact_bytes), artifact_bytes.decode("utf-8"))
        )
        connection.execute(
            "INSERT OR IGNORE INTO analysis_results VALUES(?,?,?,?,?,?,0)",
            (analysis["analysis_result_id"], api["artifact_id"], analysis["document_id"],
             analysis["document_version_id"], json.dumps(analysis, ensure_ascii=False, sort_keys=True),
             analysis["validation_status"])
        )
        connection.commit()
        row = connection.execute("""
          SELECT a.artifact_id,a.source_system_id,a.request_id,a.dataset_id,a.sha256,
                 r.analysis_result_id,r.document_id,r.document_version_id,r.validation_status
          FROM raw_artifacts a JOIN analysis_results r ON r.artifact_id=a.artifact_id
          WHERE a.artifact_id=?
        """, (api["artifact_id"],)).fetchone()
        if row is None:
            raise ValueError("DB_READBACK_MISSING")
        connection.execute("BEGIN")
        connection.execute(
            "INSERT INTO raw_artifacts VALUES(?,?,?,?,?,?,?,?,0)",
            ("ART_ROLLBACK_TEST", api["source_system_id"], "REQ_ROLLBACK", api["dataset_id"],
             "f" * 64, "application/json", 2, "{}")
        )
        connection.rollback()
        if connection.execute("SELECT COUNT(*) FROM raw_artifacts WHERE artifact_id='ART_ROLLBACK_TEST'").fetchone()[0] != 0:
            raise ValueError("ROLLBACK_SIMULATION_FAILED")
        return {
            "schema_version": "YOLLA_KNOWLEDGE_DB_STAGING_RECEIPT_V1",
            "status": "PASS",
            "engine": "SQLITE_LOCAL_ISOLATED_POSTGRESQL_SHAPE_FIXTURE",
            "database_path": str(db_path),
            "artifact_id": row[0],
            "analysis_result_id": row[5],
            "write_pass": True,
            "readback_pass": True,
            "rollback_pass": True,
            "foreign_key_pass": True,
            "production": False,
            "postgresql_apply_claimed": False
        }
    finally:
        connection.close()

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args()
    fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
    canonical, applied = adapt_ingress(fixture)
    artifact_sha = sha(canonical["response"])
    analysis = build_analysis(canonical, artifact_sha)
    validate_analysis(analysis)
    receipt = stage(canonical, analysis, Path(args.output_root))
    result = {
        "schema_version": "YOLLA_API_DB_FIXTURE_EXECUTION_RESULT_V1",
        "status": "PASS",
        "canonical_identifiers": {name: canonical[name] for name in CANONICAL},
        "applied_aliases": applied,
        "legacy_identifier_output_count": sum(1 for name in ALIASES if name in canonical),
        "api_fixture_received": True,
        "canonical_normalization_pass": True,
        "analysis_schema_pass": True,
        "database_receipt": receipt,
        "artifacts": [{
            "artifact_id": canonical["artifact_id"],
            "sha256": artifact_sha,
            "mime_type": "application/json",
            "byte_size": len(canonical_bytes(canonical["response"]))
        }],
        "outputs": [analysis],
        "production": False
    }
    print("YOLLA_RESULT_JSON=" + json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
