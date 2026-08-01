#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path

REQUIRED = [
    "integrations/api_db_v1/API_W01_INTEGRATION_MAPPING_V1.json",
    "integrations/api_db_v1/KNOWLEDGE_DB_MAPPING_V1.json",
    "integrations/api_db_v1/fixtures/API_MINIMUM_FIXTURE_V1.json",
    "integrations/api_db_v1/fixtures/MINIMUM_E2E_DIRECTIVE_V1.json",
    "integrations/api_db_v1/run_api_db_fixture.py",
    "integrations/api_db_v1/run_minimum_yolla_integration_e2e.py",
    "integrations/api_db_v1/postgresql/staging_schema.sql",
    "integrations/api_db_v1/postgresql/insert_fixture.sql",
    "integrations/api_db_v1/postgresql/readback.sql",
    "integrations/api_db_v1/postgresql/rollback.sql",
]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("root")
    parser.add_argument("--output")
    args = parser.parse_args()
    root = Path(args.root)
    findings = []
    for relative in REQUIRED:
        if not (root / relative).is_file():
            findings.append({"code": "MISSING_FILE", "path": relative})
    if not findings:
        api = json.loads((root / REQUIRED[0]).read_text(encoding="utf-8"))
        db = json.loads((root / REQUIRED[1]).read_text(encoding="utf-8"))
        fixture = json.loads((root / REQUIRED[2]).read_text(encoding="utf-8"))
        if api["authority"]["frozen_package_commit"] != "1d34f80ce96c29de6698798ed36c5c685d438841":
            findings.append({"code": "API_AUTHORITY_MISMATCH", "path": "mapping"})
        if db["authority"]["control_head"] != "9dc66268889391f5148f5bc4991209759b197de3":
            findings.append({"code": "DB_AUTHORITY_MISMATCH", "path": "mapping"})
        if fixture.get("production") is not False:
            findings.append({"code": "PRODUCTION_TRUE", "path": "fixture"})
        if set(api["ingress_aliases"].values()) != {"source_system_id", "request_id", "artifact_id", "dataset_id"}:
            findings.append({"code": "CANONICAL_ID_SET_INVALID", "path": "mapping"})
        source = (root / REQUIRED[4]).read_text(encoding="utf-8")
        for marker in ["ALIAS_VALUE_CONFLICT", "YOLLA_RESULT_JSON=", "sqlite3", "rollback_pass", "contains_personal_data"]:
            if marker not in source:
                findings.append({"code": "RUNNER_MARKER_MISSING", "path": marker})
        schema = (root / REQUIRED[6]).read_text(encoding="utf-8").lower()
        if "production boolean" not in schema or "check (production = false)" not in schema:
            findings.append({"code": "SQL_PRODUCTION_GUARD_MISSING", "path": REQUIRED[6]})
    result = {
        "schema_version": "YOLLA_API_DB_INTEGRATION_VALIDATION_V1",
        "accepted": not findings,
        "finding_count": len(findings),
        "findings": findings,
        "required_file_count": len(REQUIRED),
        "production_execution_claimed": False,
        "postgresql_apply_claimed": False
    }
    text = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0 if result["accepted"] else 2

if __name__ == "__main__":
    raise SystemExit(main())
