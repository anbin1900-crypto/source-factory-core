from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]

def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()

def load_json(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))

def validate_all() -> dict:
    package_schema = load_json("MATERIALIZED_DATABASE_PACKAGE_V2.schema.json")
    dataset_schema = load_json("NORMALIZED_DATASET_V2.schema.json")
    request_schema = load_json("D_INTAKE_REQUEST_V1.schema.json")
    bundle = load_json("B5_D_READY_FIXTURE_PACKAGE_V2.json")
    package = bundle["materialized_database_package"]
    dataset = package["normalized_dataset"]
    request = bundle["d_intake_request"]
    checker = FormatChecker()

    Draft202012Validator.check_schema(package_schema)
    Draft202012Validator.check_schema(dataset_schema)
    Draft202012Validator.check_schema(request_schema)
    Draft202012Validator(package_schema, format_checker=checker).validate(package)
    Draft202012Validator(dataset_schema, format_checker=checker).validate(dataset)
    Draft202012Validator(request_schema, format_checker=checker).validate(request)

    if sha256_json({k:v for k,v in package.items() if k != "package_sha256"}) != package["package_sha256"]:
        raise ValueError("package_sha256 mismatch")
    if sha256_json({k:v for k,v in dataset.items() if k != "dataset_sha256"}) != dataset["dataset_sha256"]:
        raise ValueError("dataset_sha256 mismatch")
    if sha256_json({k:v for k,v in request.items() if k != "request_sha256"}) != request["request_sha256"]:
        raise ValueError("request_sha256 mismatch")
    if sha256_json({k:v for k,v in bundle.items() if k != "bundle_sha256"}) != bundle["bundle_sha256"]:
        raise ValueError("bundle_sha256 mismatch")
    return {
        "result": "PASS",
        "package_sha256": package["package_sha256"],
        "dataset_sha256": dataset["dataset_sha256"],
        "request_sha256": request["request_sha256"],
        "bundle_sha256": bundle["bundle_sha256"],
    }

if __name__ == "__main__":
    print(json.dumps(validate_all(), ensure_ascii=False, sort_keys=True, indent=2))
