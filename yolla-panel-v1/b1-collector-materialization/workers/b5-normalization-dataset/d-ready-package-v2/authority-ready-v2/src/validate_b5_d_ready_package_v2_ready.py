from __future__ import annotations
import hashlib, json
from pathlib import Path
from typing import Any
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]

def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()

def load_json(name: str) -> dict:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))

def validate_all() -> dict:
    bundle = load_json("B5_D_READY_FIXTURE_PACKAGE_V2.json")
    package = bundle["materialized_database_package"]
    dataset = package["normalized_dataset"]
    request = bundle["d_intake_request"]
    schemas = [
        (load_json("MATERIALIZED_DATABASE_PACKAGE_V2.schema.json"), package),
        (load_json("NORMALIZED_DATASET_V2.schema.json"), dataset),
        (load_json("D_INTAKE_REQUEST_V1.schema.json"), request),
    ]
    checker = FormatChecker()
    for schema, instance in schemas:
        Draft202012Validator.check_schema(schema)
        Draft202012Validator(schema, format_checker=checker).validate(instance)
    assert sha256_json({k:v for k,v in dataset.items() if k != "dataset_sha256"}) == dataset["dataset_sha256"]
    assert sha256_json({k:v for k,v in package.items() if k != "package_sha256"}) == package["package_sha256"]
    assert sha256_json({k:v for k,v in request.items() if k != "request_sha256"}) == request["request_sha256"]
    assert sha256_json({k:v for k,v in bundle.items() if k != "bundle_sha256"}) == bundle["bundle_sha256"]
    for rec in dataset["records"]:
        material = {k:rec[k] for k in ["source_record_id","title","record_type","language_code","fields","raw_text","locator"]}
        assert sha256_json(material) == rec["record_hash"]
    return {
        "result":"PASS",
        "package_sha256":package["package_sha256"],
        "dataset_sha256":dataset["dataset_sha256"],
        "request_sha256":request["request_sha256"],
        "bundle_sha256":bundle["bundle_sha256"],
        "terminal":"B5_D_READY_PACKAGE_V2_READY",
        "next_event":"B6_D_PACKAGE_REPREFLIGHT",
    }

if __name__ == "__main__":
    print(json.dumps(validate_all(), ensure_ascii=False, sort_keys=True, indent=2))
