from __future__ import annotations
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from raw_artifact_manifest_v2 import (
    ManifestValidationError, forbidden_key_paths, load_json, sha256_bytes,
    validate_fixture, validate_manifest, validate_root
)

class TestRawArtifactManifestV2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = load_json(ROOT / "RAW_ARTIFACT_MANIFEST_V2.json")
        cls.fixture = load_json(ROOT / "B4_RAW_ARTIFACT_MANIFEST_V2_FIXTURE_V1.json")
        cls.entries = cls.manifest["entries"]

    def test_01_full_validation(self): self.assertEqual(validate_root(ROOT)["result"], "PASS")
    def test_02_schema_version(self): self.assertEqual(self.manifest["schema_version"], "RAW_ARTIFACT_MANIFEST_V2")
    def test_03_task_id(self): self.assertEqual(self.manifest["task_id"], "RAW_ARTIFACT_MANIFEST_V2")
    def test_04_directive(self): self.assertEqual(self.manifest["directive_comment"], 5196652743)
    def test_05_baseline(self): self.assertEqual(self.manifest["current_remote_head_baseline"], "6dfe697363a69f83797775aa549f34614aa3748a")
    def test_06_artifact_count(self): self.assertEqual(self.manifest["artifact_count"], 2)
    def test_07_record_count(self): self.assertEqual(self.manifest["total_record_count"], 4)
    def test_08_source_key_pending(self): self.assertTrue(all(e["source_key"] == "PENDING_AUTHORITY" for e in self.entries))
    def test_09_official_url_pending(self): self.assertTrue(all(e["official_source_url"] == "PENDING_AUTHORITY" for e in self.entries))
    def test_10_route_template(self): self.assertTrue(all(e["route_template"] == "https://fixture.invalid/listings?page={page}" for e in self.entries))
    def test_11_fixture_urls(self): self.assertEqual([e["observed_fixture_source_url"] for e in self.entries], ["https://fixture.invalid/listings?page=1","https://fixture.invalid/listings?page=2"])
    def test_12_capture_time(self): self.assertTrue(all(e["captured_at"] == "2026-08-04T05:22:00+09:00" for e in self.entries))
    def test_13_storage_pointer(self): self.assertTrue(all(e["storage_pointer"].startswith("github://") for e in self.entries))
    def test_14_fixture_mime(self): self.assertTrue(all(e["mime_type"] == "application/json" for e in self.entries))
    def test_15_expected_mime(self): self.assertTrue(all(e["expected_mime_type"] == "application/json" for e in self.entries))
    def test_16_observed_mime(self): self.assertTrue(all(e["observed_mime_type"] == "NOT_OBSERVED" for e in self.entries))
    def test_17_sizes(self): self.assertEqual([e["byte_size"] for e in self.entries], [254,246])
    def test_18_hashes(self): self.assertEqual([e["sha256"] for e in self.entries], ["b8ab938fbc39b3f3b41f73f3b819a871c9e8416aa269e18278682ae0362338f0","c2bd6c5ae5921e520c35fbc7ebe22baff7926944bc001277b9d95931947ab4d2"])
    def test_19_raw_state(self): self.assertTrue(all(e["raw_or_redacted"] == "RAW" for e in self.entries))
    def test_20_redaction(self): self.assertTrue(all(e["redaction_status"] == "NOT_APPLICABLE" for e in self.entries))
    def test_21_personal_data(self): self.assertTrue(all(e["personal_data_status"] == "NOT_APPLICABLE" for e in self.entries))
    def test_22_secret_status(self): self.assertTrue(all(e["secret_status"] == "NOT_APPLICABLE" for e in self.entries))
    def test_23_immutability(self): self.assertTrue(all(e["immutability_status"] == "IMMUTABLE_GIT_BLOB_VERIFIED" for e in self.entries))
    def test_24_receipt_blob(self): self.assertTrue(all(e["source_receipt_pointer"]["blob_sha"] == "f4fdab98c6e20d94be90027893e8a63ab1618e03" for e in self.entries))
    def test_25_request_summary_blob(self): self.assertTrue(all(e["source_receipt_pointer"]["request_summary_blob_sha"] == "50d0457a42a72e1b4e1c964ffc65f9e13f61b21d" for e in self.entries))
    def test_26_raw_bytes_no_forbidden_keys(self):
        for path in (ROOT / "raw").glob("*.json"):
            self.assertEqual(forbidden_key_paths(json.loads(path.read_text())), [])
    def test_27_raw_overwrite_zero(self): self.assertEqual(self.manifest["validation_counters"]["RAW_OVERWRITE_COUNT"], 0)
    def test_28_hash_mismatch_zero(self): self.assertEqual(self.manifest["validation_counters"]["HASH_MISMATCH_COUNT"], 0)
    def test_29_size_mismatch_zero(self): self.assertEqual(self.manifest["validation_counters"]["SIZE_MISMATCH_COUNT"], 0)
    def test_30_secret_storage_zero(self): self.assertEqual(self.manifest["validation_counters"]["SECRET_VALUE_STORAGE_COUNT"], 0)
    def test_31_personal_data_zero(self): self.assertEqual(self.manifest["validation_counters"]["UNAUTHORIZED_PERSONAL_DATA_COUNT"], 0)
    def test_32_invented_metadata_zero(self): self.assertEqual(self.manifest["validation_counters"]["INVENTED_METADATA_COUNT"], 0)
    def test_33_source_field_loss_zero(self): self.assertEqual(self.manifest["validation_counters"]["SOURCE_FIELD_LOSS_COUNT"], 0)
    def test_34_fixture_validation(self): validate_fixture(self.fixture, self.manifest)
    def test_35_page1_bytes(self): self.assertEqual(sha256_bytes((ROOT / "raw/raw-001-b8ab938fbc39b3f3.json").read_bytes()), self.entries[0]["sha256"])
    def test_36_page2_bytes(self): self.assertEqual(sha256_bytes((ROOT / "raw/raw-002-c2bd6c5ae5921e52.json").read_bytes()), self.entries[1]["sha256"])

def mutation(name, mutate):
    def test(self):
        value = copy.deepcopy(self.manifest)
        mutate(value)
        with self.assertRaises(ManifestValidationError):
            validate_manifest(value, ROOT)
    test.__name__ = name
    return test

MUTATIONS = [
    ("test_37_reject_invented_source_key", lambda m: m["entries"][0].__setitem__("source_key", "invented")),
    ("test_38_reject_invented_official_url", lambda m: m["entries"][0].__setitem__("official_source_url", "https://invented.invalid")),
    ("test_39_reject_observed_mime_promotion", lambda m: m["entries"][0].__setitem__("observed_mime_type", "application/json")),
    ("test_40_reject_hash_mismatch", lambda m: m["entries"][0].__setitem__("sha256", "0" * 64)),
    ("test_41_reject_size_mismatch", lambda m: m["entries"][0].__setitem__("byte_size", 255)),
    ("test_42_reject_nonzero_secret_count", lambda m: m["validation_counters"].__setitem__("SECRET_VALUE_STORAGE_COUNT", 1)),
    ("test_43_reject_nonzero_personal_count", lambda m: m["validation_counters"].__setitem__("UNAUTHORIZED_PERSONAL_DATA_COUNT", 1)),
    ("test_44_reject_nonzero_invented_count", lambda m: m["validation_counters"].__setitem__("INVENTED_METADATA_COUNT", 1)),
    ("test_45_reject_duplicate_artifact_key", lambda m: m["entries"][1].__setitem__("artifact_native_key", m["entries"][0]["artifact_native_key"])),
    ("test_46_reject_boundary_write", lambda m: m["boundaries"].__setitem__("raw_byte_overwrite", True)),
]
for name, mutate in MUTATIONS:
    setattr(TestRawArtifactManifestV2, name, mutation(name, mutate))

if __name__ == "__main__":
    unittest.main(verbosity=2)
