from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import base64
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from build_fixture_package import (  # noqa: E402
    EXPECTED_NORMALIZED_DATASET_SHA256,
    EXPECTED_SQLITE_SHA256,
    EXPECTED_SQLITE_SIZE,
    build_package,
)
from deduplicator import DeduplicationError, deduplicate_candidates  # noqa: E402
from lossless_normalizer import (  # noqa: E402
    build_candidates,
    build_field_preservation_map,
    calculate_source_field_loss_count,
    canonical_json_bytes,
    sha256_bytes,
    validate_envelope_bundle,
)
from sqlite_materializer import decode_database, materialize_records  # noqa: E402


class NormalizationDatasetReceiptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.bundle = json.loads(
            (ROOT / "fixtures" / "SOURCE_RECORD_ENVELOPE_V1.json").read_text(
                encoding="utf-8"
            )
        )
        cls.mapping = {"record_id": "id", "title": "name", "price": "price"}
        cls.result = build_package(ROOT)
        cls.dataset_bytes = (ROOT / "generated" / "NORMALIZED_DATASET_V1.json").read_bytes()
        cls.dataset = json.loads(cls.dataset_bytes)
        cls.receipt_bytes = (ROOT / "generated" / "EXTRACTION_RECEIPT_V1.json").read_bytes()
        cls.receipt = json.loads(cls.receipt_bytes)
        cls.b64_path = ROOT / "generated" / "fixture_materialized.sqlite.b64"

    def test_01_envelope_record_count_is_four(self): self.assertEqual(self.bundle["record_count"], 4)
    def test_02_envelope_validation_passes(self): validate_envelope_bundle(self.bundle)
    def test_03_envelope_hash_exact(self): self.assertEqual(sha256_bytes(canonical_json_bytes(self.bundle)), "9889c83d72f6ecca84714509493552b8a9bfa304917275cb779ddb0ecb3aa0ba")
    def test_04_candidates_count_is_four(self): self.assertEqual(len(build_candidates(self.bundle, self.mapping)), 4)
    def test_05_output_count_is_three(self): self.assertEqual(self.dataset["output_record_count"], 3)
    def test_06_duplicate_count_is_one(self): self.assertEqual(self.dataset["duplicate_count"], 1)
    def test_07_source_field_loss_is_zero(self): self.assertEqual(self.dataset["source_field_loss_count"], 0)
    def test_08_dataset_hash_exact(self): self.assertEqual(hashlib.sha256(self.dataset_bytes).hexdigest(), EXPECTED_NORMALIZED_DATASET_SHA256)
    def test_09_receipt_hash_exact(self): self.assertEqual(hashlib.sha256(self.receipt_bytes).hexdigest(), "ca8d871353740ccb5ea753467d5e3d183ded1e958688f92d019ca1756930711c")
    def test_10_receipt_points_to_dataset(self): self.assertEqual(self.receipt["normalized_dataset_sha256"], EXPECTED_NORMALIZED_DATASET_SHA256)
    def test_11_l001_nested_extra_preserved(self): self.assertEqual(self.dataset["records"][0]["source_fields"]["extra"], {"floor": 3, "tags": ["a", "b"]})
    def test_12_l001_unmapped_extra_preserved(self): self.assertEqual(self.dataset["records"][0]["unmapped_fields"]["extra"], {"floor": 3, "tags": ["a", "b"]})
    def test_13_l002_note_preserved(self): self.assertEqual(self.dataset["records"][1]["source_fields"]["note"], "preserve-me")
    def test_14_l003_unknown_field_preserved(self): self.assertEqual(self.dataset["records"][2]["unmapped_fields"]["unknown_field"], {"x": 1})
    def test_15_mapped_title_exact(self): self.assertEqual([r["normalized_fields"]["title"] for r in self.dataset["records"]], ["Alpha", "Beta", "Gamma"])
    def test_16_mapped_price_exact(self): self.assertEqual([r["normalized_fields"]["price"] for r in self.dataset["records"]], [100, 200, 300])
    def test_17_l002_lineage_has_two_sources(self): self.assertEqual(len(self.dataset["dedup_lineage"]["L-002"]), 2)
    def test_18_every_source_record_in_lineage(self): self.assertEqual(sum(len(v) for v in self.dataset["dedup_lineage"].values()), 4)
    def test_19_distinct_records_not_collapsed(self): self.assertEqual(set(self.dataset["dedup_lineage"]), {"L-001", "L-002", "L-003"})
    def test_20_conflicting_duplicate_fails_closed(self):
        candidates = build_candidates(self.bundle, self.mapping)
        candidates[2] = deepcopy(candidates[2]); candidates[2]["source_fields"]["price"] = 999
        with self.assertRaises(DeduplicationError): deduplicate_candidates(candidates)
    def test_21_field_preservation_map_loss_zero(self): self.assertEqual(build_field_preservation_map(self.bundle, self.mapping)["source_field_loss_count"], 0)
    def test_22_calculated_field_loss_zero(self):
        records, lineage, _ = deduplicate_candidates(build_candidates(self.bundle, self.mapping))
        self.assertEqual(calculate_source_field_loss_count(self.bundle["records"], records, lineage), 0)
    def test_23_second_build_is_deterministic(self):
        before = self.dataset_bytes
        build_package(ROOT)
        self.assertEqual((ROOT / "generated" / "NORMALIZED_DATASET_V1.json").read_bytes(), before)
    def test_24_base64_decoded_size_exact(self): self.assertEqual(len(base64.b64decode(self.b64_path.read_text())), EXPECTED_SQLITE_SIZE)
    def test_25_base64_decoded_sha_exact(self): self.assertEqual(hashlib.sha256(base64.b64decode(self.b64_path.read_text())).hexdigest(), EXPECTED_SQLITE_SHA256)
    def test_26_sqlite_row_count_exact(self):
        with tempfile.TemporaryDirectory() as td:
            info = decode_database(self.b64_path, Path(td) / "readback.sqlite")
            self.assertEqual(info["row_count"], 3)
    def test_27_sqlite_schema_exact(self):
        with tempfile.TemporaryDirectory() as td:
            info = decode_database(self.b64_path, Path(td) / "readback.sqlite")
            self.assertEqual(info["schema_sql"], "CREATE TABLE records (record_id TEXT PRIMARY KEY, normalized_json TEXT NOT NULL, source_fields_json TEXT NOT NULL, provenance_json TEXT NOT NULL)")
    def test_28_sqlite_record_ids_exact(self):
        with tempfile.TemporaryDirectory() as td:
            db = Path(td) / "readback.sqlite"; decode_database(self.b64_path, db)
            con = sqlite3.connect(db)
            try: ids = [r[0] for r in con.execute("SELECT record_id FROM records ORDER BY record_id")]
            finally: con.close()
            self.assertEqual(ids, ["L-001", "L-002", "L-003"])
    def test_29_forbidden_counters_zero(self):
        self.assertEqual(self.result["network_call_count"], 0); self.assertEqual(self.result["semantic_transformation_count"], 0); self.assertEqual(self.result["d_canonical_schema_decision_count"], 0); self.assertEqual(self.result["d_canonical_db_write_count"], 0)
    def test_30_result_parity_exact(self):
        self.assertEqual((self.result["input_record_count"], self.result["duplicate_count"], self.result["output_record_count"], self.result["sqlite_row_count"]), (4, 1, 3, 3))


if __name__ == "__main__":
    unittest.main(verbosity=2)
