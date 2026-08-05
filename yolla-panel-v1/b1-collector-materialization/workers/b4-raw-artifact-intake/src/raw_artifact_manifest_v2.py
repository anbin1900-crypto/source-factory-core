from __future__ import annotations
import hashlib
import json
import re
from pathlib import Path
from typing import Any

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
BLOB_RE = re.compile(r"^[0-9a-f]{40}$")
FORBIDDEN_SECRET_KEYS = re.compile(r"(phone|telephone|mobile|person_name|account_id|cookie|token|password|api.?key|secret)", re.I)

class ManifestValidationError(ValueError):
    pass

def require(condition: bool, message: str) -> None:
    if not condition:
        raise ManifestValidationError(message)

def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    require(isinstance(value, dict), f"{path}: object required")
    return value

def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def forbidden_key_paths(value: Any, path: str = "$") -> list[str]:
    hits: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if FORBIDDEN_SECRET_KEYS.search(str(key)):
                hits.append(child_path)
            hits.extend(forbidden_key_paths(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            hits.extend(forbidden_key_paths(child, f"{path}[{index}]"))
    return hits

def validate_entry(entry: dict[str, Any], root: Path) -> None:
    required = [
        "artifact_native_key", "source_key", "official_source_url", "route_template",
        "locator", "captured_at", "storage_pointer", "mime_type", "byte_size",
        "sha256", "raw_or_redacted", "redaction_status", "personal_data_status",
        "secret_status", "immutability_status", "source_receipt_pointer",
    ]
    require(all(field in entry for field in required), "required artifact field missing")
    require(entry["source_key"] == "PENDING_AUTHORITY", "source_key must await authority")
    require(entry["official_source_url"] == "PENDING_AUTHORITY", "official URL must await authority")
    require(entry["route_template"] == "https://fixture.invalid/listings?page={page}", "route template")
    require(entry["route_template_status"] == "FIXTURE_VERIFIED_FROM_REQUEST_SUMMARY", "route evidence")
    require(entry["mime_type"] == "application/json", "fixture MIME")
    require(entry["mime_type_scope"] == "FIXTURE_BYTE_VERIFIED", "MIME scope")
    require(entry["expected_mime_type"] == "application/json", "expected MIME")
    require(entry["observed_mime_type"] == "NOT_OBSERVED", "actual MIME not observed")
    require(entry["raw_or_redacted"] == "RAW", "raw/redacted")
    require(entry["redaction_status"] == "NOT_APPLICABLE", "redaction")
    require(entry["personal_data_status"] == "NOT_APPLICABLE", "personal data")
    require(entry["secret_status"] == "NOT_APPLICABLE", "secret status")
    require(entry["immutability_status"] == "IMMUTABLE_GIT_BLOB_VERIFIED", "immutability")
    require(entry["byte_size"] > 0, "byte size")
    require(bool(SHA256_RE.fullmatch(entry["sha256"])), "SHA-256")
    require(entry["storage_pointer"].startswith("github://"), "storage pointer")

    locator = entry["locator"]
    require(locator["repository"] == "anbin1900-crypto/source-factory-core", "locator repo")
    require(locator["ref"] == "6dfe697363a69f83797775aa549f34614aa3748a", "locator ref")
    require(bool(BLOB_RE.fullmatch(locator["blob_sha"])), "locator blob")
    require(locator["byte_scope"] == "EXACT_GIT_BLOB_BYTES", "byte scope")

    prefix = "yolla-panel-v1/b1-collector-materialization/workers/b4-raw-artifact-intake/"
    require(locator["path"].startswith(prefix), "owned raw path")
    raw_path = root / locator["path"][len(prefix):]
    require(raw_path.is_file(), "raw byte file missing")
    raw_bytes = raw_path.read_bytes()
    require(len(raw_bytes) == entry["byte_size"], "byte size mismatch")
    require(sha256_bytes(raw_bytes) == entry["sha256"], "hash mismatch")
    payload = json.loads(raw_bytes.decode("utf-8"))
    require(len(payload.get("records", [])) == entry["record_count"], "record count")
    require(forbidden_key_paths(payload) == [], "unauthorized personal/secret metadata")

    receipt = entry["source_receipt_pointer"]
    require(receipt["blob_sha"] == "f4fdab98c6e20d94be90027893e8a63ab1618e03", "receipt blob")
    require(receipt["request_summary_blob_sha"] == "50d0457a42a72e1b4e1c964ffc65f9e13f61b21d", "request summary blob")

    metadata = entry["metadata_status"]
    require(metadata == {
        "source_key": "PENDING_AUTHORITY",
        "official_source_url": "PENDING_AUTHORITY",
        "observed_mime_type": "NOT_OBSERVED",
        "invented_metadata": "FORBIDDEN",
    }, "metadata status")

def validate_manifest(manifest: dict[str, Any], root: Path) -> dict[str, Any]:
    require(manifest["schema_version"] == "RAW_ARTIFACT_MANIFEST_V2", "schema version")
    require(manifest["task_id"] == "RAW_ARTIFACT_MANIFEST_V2", "task id")
    require(manifest["directive_comment"] == 5196652743, "directive comment")
    require(manifest["current_remote_head_baseline"] == "6dfe697363a69f83797775aa549f34614aa3748a", "baseline")
    require(manifest["manifest_mode"] == "FIXTURE_BYTE_VERIFIED_D_INTAKE_PREPARATION", "mode")
    entries = manifest["entries"]
    require(len(entries) == manifest["artifact_count"] == 2, "artifact count")
    require(len({entry["artifact_native_key"] for entry in entries}) == 2, "duplicate artifact key")
    for entry in entries:
        validate_entry(entry, root)
    require(sum(entry["record_count"] for entry in entries) == manifest["total_record_count"] == 4, "total records")

    counters = manifest["validation_counters"]
    required_counters = [
        "RAW_OVERWRITE_COUNT", "HASH_MISMATCH_COUNT", "SIZE_MISMATCH_COUNT",
        "SECRET_VALUE_STORAGE_COUNT", "UNAUTHORIZED_PERSONAL_DATA_COUNT",
        "INVENTED_METADATA_COUNT", "SOURCE_FIELD_LOSS_COUNT",
    ]
    require(all(counters[name] == 0 for name in required_counters), "non-zero required counter")
    boundaries = manifest["boundaries"]
    require(all(boundaries[name] is False for name in boundaries), "boundary must be false")
    return {
        "result": "PASS",
        "artifact_count": 2,
        "total_record_count": 4,
        **counters,
    }

def validate_fixture(fixture: dict[str, Any], manifest: dict[str, Any]) -> None:
    require(fixture["schema_version"] == "B4_RAW_ARTIFACT_MANIFEST_V2_FIXTURE_V1", "fixture schema")
    require(fixture["task_id"] == manifest["task_id"], "fixture task")
    require(fixture["expected_terminal"] == "B4_RAW_ARTIFACT_MANIFEST_V2_D_READY", "fixture terminal")
    require(fixture["expected_validation_counters"] == manifest["validation_counters"], "fixture counters")
    expected = fixture["fixture_byte_authority"]
    require(len(expected) == 2, "fixture byte count")
    by_key = {entry["artifact_native_key"]: entry for entry in manifest["entries"]}
    for item in expected:
        entry = by_key[item["artifact_native_key"]]
        require(item["blob_sha"] == entry["locator"]["blob_sha"], "fixture blob")
        require(item["byte_size"] == entry["byte_size"], "fixture size")
        require(item["sha256"] == entry["sha256"], "fixture SHA")
        require(item["record_count"] == entry["record_count"], "fixture records")

def validate_root(root: Path) -> dict[str, Any]:
    root = Path(root)
    manifest = load_json(root / "RAW_ARTIFACT_MANIFEST_V2.json")
    fixture = load_json(root / "B4_RAW_ARTIFACT_MANIFEST_V2_FIXTURE_V1.json")
    result = validate_manifest(manifest, root)
    validate_fixture(fixture, manifest)
    return result

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    print(json.dumps(validate_root(args.root), ensure_ascii=False, sort_keys=True))
