from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from raw_artifact_store import (  # noqa: E402
    ImmutableRawArtifactStore,
    RawArtifactError,
    build_manifest,
    canonical_json_bytes,
    sha256_bytes,
)
from source_record_envelope import (  # noqa: E402
    build_request_summary,
    build_source_record_envelope,
)

PAGE1 = (ROOT / "fixture_responses" / "page_001.json").read_bytes()
PAGE2 = (ROOT / "fixture_responses" / "page_002.json").read_bytes()
EXPECTED1 = "b8ab938fbc39b3f3b41f73f3b819a871c9e8416aa269e18278682ae0362338f0"
EXPECTED2 = "c2bd6c5ae5921e520c35fbc7ebe22baff7926944bc001277b9d95931947ab4d2"
COLLECTED = "2026-08-04T05:22:00+09:00"


def build_fixture(root: Path):
    store = ImmutableRawArtifactStore(root)
    entries = []
    for page, data in [(1, PAGE1), (2, PAGE2)]:
        stored = store.append(
            page=page,
            raw_bytes=data,
            source_url=f"https://fixture.invalid/listings?page={page}",
            collected_at=COLLECTED,
            request_summary={"method": "GET", "page": page, "credential_reference": None},
        )
        entries.append(stored.entry)
    manifest = build_manifest(entries, "fixture-run-001")
    envelope = build_source_record_envelope(manifest, root, run_id="fixture-run-001")
    summary = build_request_summary(entries, "fixture-run-001")
    return store, entries, manifest, envelope, summary


class RawArtifactSourceEnvelopeTests(unittest.TestCase):
    def test_01_page1_exact_sha(self): self.assertEqual(sha256_bytes(PAGE1), EXPECTED1)
    def test_02_page2_exact_sha(self): self.assertEqual(sha256_bytes(PAGE2), EXPECTED2)
    def test_03_page_sizes(self): self.assertEqual((len(PAGE1), len(PAGE2)), (254, 246))
    def test_04_manifest_artifact_count(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[2]["artifact_count"], 2)
    def test_05_manifest_total_record_count(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[2]["total_record_count"], 4)
    def test_06_raw_overwrite_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            store, *_ = build_fixture(Path(d))
            with self.assertRaisesRegex(RawArtifactError, "overwrite"):
                store.append(page=1, raw_bytes=PAGE1, source_url="https://fixture.invalid/listings?page=1", collected_at=COLLECTED, request_summary={"method":"GET","page":1,"credential_reference":None})
    def test_07_raw_readback_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            store, entries, *_ = build_fixture(Path(d)); self.assertEqual(store.verify_entry(entries[0]), PAGE1)
    def test_08_source_url_preserved(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[1][1]["source_url"], "https://fixture.invalid/listings?page=2")
    def test_09_collected_at_preserved(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[1][0]["collected_at"], COLLECTED)
    def test_10_request_method_preserved(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[1][0]["request_summary"]["method"], "GET")
    def test_11_request_page_preserved(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[1][1]["request_summary"]["page"], 2)
    def test_12_secret_key_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            store=ImmutableRawArtifactStore(Path(d))
            with self.assertRaisesRegex(RawArtifactError,"secret"):
                store.append(page=1,raw_bytes=PAGE1,source_url="x",collected_at=COLLECTED,request_summary={"token":"bad"})
    def test_13_nested_secret_key_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            store=ImmutableRawArtifactStore(Path(d))
            with self.assertRaisesRegex(RawArtifactError,"secret"):
                store.append(page=1,raw_bytes=PAGE1,source_url="x",collected_at=COLLECTED,request_summary={"safe":{"password":"bad"}})
    def test_14_metadata_parity(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[1][0]["metadata"], {"fixture_page":1,"source":"fixture"})
    def test_15_envelope_count(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[3]["record_count"], 4)
    def test_16_envelope_source_fields_preserved(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[3]["records"][1]["source_fields"]["note"], "preserve-me")
    def test_17_unknown_field_preserved(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[3]["records"][3]["source_fields"]["unknown_field"], {"x":1})
    def test_18_source_record_sha(self):
        with tempfile.TemporaryDirectory() as d:
            rec=build_fixture(Path(d))[3]["records"][0]; self.assertEqual(rec["source_sha256"], sha256_bytes(canonical_json_bytes(rec["source_fields"])))
    def test_19_source_lineage_to_artifact(self):
        with tempfile.TemporaryDirectory() as d: self.assertTrue(build_fixture(Path(d))[3]["records"][2]["source_record_id"].startswith("raw-002-"))
    def test_20_one_byte_mutation_sha_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            store, entries, *_=build_fixture(Path(d)); p=Path(d)/entries[0]["stored_path"]; p.write_bytes(PAGE1+b" ")
            with self.assertRaisesRegex(RawArtifactError,"size mismatch|SHA-256 mismatch"): store.verify_entry(entries[0])
    def test_21_semantic_transformation_zero(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[3]["semantic_transformation_count"], 0)
    def test_22_network_calls_zero(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[4]["network_call_count"], 0)
    def test_23_secret_exposure_zero(self):
        with tempfile.TemporaryDirectory() as d: self.assertEqual(build_fixture(Path(d))[4]["secret_value_exposure_count"], 0)
    def test_24_deterministic_manifest(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            ma=build_fixture(Path(a))[2]; mb=build_fixture(Path(b))[2]; self.assertEqual(canonical_json_bytes(ma), canonical_json_bytes(mb))

if __name__ == "__main__": unittest.main()
