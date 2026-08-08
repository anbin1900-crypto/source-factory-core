#!/usr/bin/env python3
from __future__ import annotations
import copy
import hashlib
import json
import unittest
from pathlib import Path

from validate_knowledge_candidate_bundle_v2 import validate_bundle, ValidationError

ROOT = Path(__file__).resolve().parent
BASE = json.loads((ROOT / "KNOWLEDGE_CANDIDATE_BUNDLE_V2.json").read_text(encoding="utf-8"))
ULID_FRAGMENT = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
ULID_ASSERTION = "01ARZ3NDEKTSV4RRFFQ69G5FAW"

def valid_nonempty():
    quote = "Evidence-backed fixture statement."
    data = copy.deepcopy(BASE)
    data["knowledge_objects"] = [{
        "candidate_id":"candidate-001",
        "knowledge_type":"INFORMATION_ONLY",
        "canonical_key":"fixture:key:001",
        "canonical_label":"Fixture label",
        "fragment_id":ULID_FRAGMENT,
        "assertions":[{
            "assertion_id":ULID_ASSERTION,
            "norm_type":"INFORMATION_ONLY",
            "conditions":[],
            "exceptions":[],
            "confidence":0.9
        }]
    }]
    data["evidence_refs"] = [{
        "evidence_id":"evidence-001",
        "assertion_id":ULID_ASSERTION,
        "fragment_id":ULID_FRAGMENT,
        "quote":quote,
        "quote_hash":hashlib.sha256(quote.encode("utf-8")).hexdigest(),
        "official_source_url":"https://fixture.invalid/source/1",
        "source_sha256":"a"*64
    }]
    data["rejected_records"] = []
    data["candidate_count"] = 1
    data["assertion_count"] = 1
    data["evidence_count"] = 1
    data["validation_summary"].update({
        "candidate_count":1,"assertion_count":1,"evidence_count":1,"rejected_record_count":0
    })
    return data

class TestKnowledgeCandidateV2(unittest.TestCase):
    def assert_invalid(self, data, code):
        with self.assertRaisesRegex(ValidationError, code):
            validate_bundle(data)

    def test_01_empty_fixture_pass(self):
        self.assertEqual(validate_bundle(BASE)["status"], "PASS")
    def test_02_nonempty_evidence_backed_pass(self):
        self.assertEqual(validate_bundle(valid_nonempty())["candidate_count"], 1)
    def test_03_rule_coverage_exact(self):
        self.assertEqual(BASE["mapping_authority"]["rule_ids"], [f"C{i:03d}" for i in range(2,17)])
    def test_04_candidate_count_mismatch(self):
        d=valid_nonempty(); d["candidate_count"]=0; self.assert_invalid(d,"COUNT_MISMATCH")
    def test_05_assertion_count_mismatch(self):
        d=valid_nonempty(); d["assertion_count"]=0; self.assert_invalid(d,"COUNT_MISMATCH")
    def test_06_evidence_count_mismatch(self):
        d=valid_nonempty(); d["evidence_count"]=0; self.assert_invalid(d,"COUNT_MISMATCH")
    def test_07_candidate_id_required(self):
        d=valid_nonempty(); del d["knowledge_objects"][0]["candidate_id"]; self.assert_invalid(d,"MISSING_REQUIRED_VALUE")
    def test_08_candidate_id_trimmed(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["candidate_id"]=" x "; self.assert_invalid(d,"TEXT_NOT_TRIMMED")
    def test_09_knowledge_type_code(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["knowledge_type"]="bad-code"; self.assert_invalid(d,"INVALID_CODE")
    def test_10_canonical_key_required(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["canonical_key"]=""; self.assert_invalid(d,"MISSING_REQUIRED_VALUE")
    def test_11_canonical_label_nfc(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["canonical_label"]="e\u0301"; self.assert_invalid(d,"TEXT_NOT_NFC")
    def test_12_fragment_ulid(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["fragment_id"]="bad"; self.assert_invalid(d,"TYPE_ERROR_ULID")
    def test_13_assertions_nonempty(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["assertions"]=[]; self.assert_invalid(d,"MISSING_REQUIRED_VALUE")
    def test_14_assertion_id_required(self):
        d=valid_nonempty(); del d["knowledge_objects"][0]["assertions"][0]["assertion_id"]; self.assert_invalid(d,"MISSING_REQUIRED_VALUE")
    def test_15_norm_type_enum(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["assertions"][0]["norm_type"]="FAKE"; self.assert_invalid(d,"INVALID_CODE")
    def test_16_conditions_array(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["assertions"][0]["conditions"]="x"; self.assert_invalid(d,"TYPE_ERROR_ARRAY_TEXT")
    def test_17_exceptions_text(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["assertions"][0]["exceptions"]=[1]; self.assert_invalid(d,"MISSING_REQUIRED_VALUE")
    def test_18_confidence_type(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["assertions"][0]["confidence"]="0.9"; self.assert_invalid(d,"TYPE_ERROR_DECIMAL")
    def test_19_confidence_range(self):
        d=valid_nonempty(); d["knowledge_objects"][0]["assertions"][0]["confidence"]=1.1; self.assert_invalid(d,"RANGE_ERROR")
    def test_20_assertion_without_evidence(self):
        d=valid_nonempty(); d["evidence_refs"]=[]; d["evidence_count"]=0; d["validation_summary"]["evidence_count"]=0; self.assert_invalid(d,"ASSERTION_WITHOUT_EVIDENCE")
    def test_21_evidence_assertion_foreign(self):
        d=valid_nonempty(); d["evidence_refs"][0]["assertion_id"]="01ARZ3NDEKTSV4RRFFQ69G5FAX"; self.assert_invalid(d,"FOREIGN_REFERENCE_MISSING")
    def test_22_evidence_fragment_mismatch(self):
        d=valid_nonempty(); d["evidence_refs"][0]["fragment_id"]="01ARZ3NDEKTSV4RRFFQ69G5FAY"; self.assert_invalid(d,"FOREIGN_REFERENCE_MISMATCH")
    def test_23_quote_required(self):
        d=valid_nonempty(); d["evidence_refs"][0]["quote"]=""; self.assert_invalid(d,"MISSING_REQUIRED_VALUE")
    def test_24_quote_hash_mismatch(self):
        d=valid_nonempty(); d["evidence_refs"][0]["quote_hash"]="b"*64; self.assert_invalid(d,"QUOTE_HASH_MISMATCH")
    def test_25_official_url_absolute(self):
        d=valid_nonempty(); d["evidence_refs"][0]["official_source_url"]="/relative"; self.assert_invalid(d,"TYPE_ERROR_URI")
    def test_26_source_sha_lower_hex(self):
        d=valid_nonempty(); d["evidence_refs"][0]["source_sha256"]="A"*64; self.assert_invalid(d,"TYPE_ERROR_SHA256")
    def test_27_duplicate_candidate_id(self):
        d=valid_nonempty(); obj=copy.deepcopy(d["knowledge_objects"][0]); obj["assertions"][0]["assertion_id"]="01ARZ3NDEKTSV4RRFFQ69G5FAZ"; d["knowledge_objects"].append(obj); d["candidate_count"]=2; d["assertion_count"]=2; d["validation_summary"].update({"candidate_count":2,"assertion_count":2}); self.assert_invalid(d,"DUPLICATE_ID")
    def test_28_duplicate_assertion_id(self):
        d=valid_nonempty(); obj=copy.deepcopy(d["knowledge_objects"][0]); obj["candidate_id"]="candidate-002"; d["knowledge_objects"].append(obj); d["candidate_count"]=2; d["assertion_count"]=2; d["validation_summary"].update({"candidate_count":2,"assertion_count":2}); self.assert_invalid(d,"DUPLICATE_ID")
    def test_29_duplicate_evidence_id(self):
        d=valid_nonempty(); d["evidence_refs"].append(copy.deepcopy(d["evidence_refs"][0])); d["evidence_count"]=2; d["validation_summary"]["evidence_count"]=2; self.assert_invalid(d,"DUPLICATE_ID")
    def test_30_mapping_blob_exact(self):
        d=copy.deepcopy(BASE); d["mapping_authority"]["mapping_contract_blob"]="0"*40; self.assert_invalid(d,"MAPPING_VERSION_MISMATCH")
    def test_31_mapping_version_exact(self):
        d=copy.deepcopy(BASE); d["mapping_authority"]["mapping_version"]="2.0.0"; self.assert_invalid(d,"MAPPING_VERSION_MISMATCH")
    def test_32_mapping_rule_order_exact(self):
        d=copy.deepcopy(BASE); d["mapping_authority"]["rule_ids"]=list(reversed(d["mapping_authority"]["rule_ids"])); self.assert_invalid(d,"MAPPING_RULE_COVERAGE_ERROR")
    def test_33_rejected_value_not_invented(self):
        d=copy.deepcopy(BASE); d["rejected_records"][0]["source_value"]="invented"; self.assert_invalid(d,"SOURCE_VALUE_INVENTION")
    def test_34_rejected_value_preserved(self):
        d=copy.deepcopy(BASE); d["rejected_records"][0]["source_value_preserved"]=False; self.assert_invalid(d,"SILENT_DROP_DETECTED")
    def test_35_boundary_d_acceptance_false(self):
        d=copy.deepcopy(BASE); d["d_acceptance_claim"]=True; self.assert_invalid(d,"BOUNDARY_VIOLATION")
    def test_36_boundary_production_false(self):
        d=copy.deepcopy(BASE); d["production"]=True; self.assert_invalid(d,"BOUNDARY_VIOLATION")
    def test_37_summary_candidate_count(self):
        d=copy.deepcopy(BASE); d["validation_summary"]["candidate_count"]=1; self.assert_invalid(d,"SUMMARY_MISMATCH")
    def test_38_summary_fabricated_zero(self):
        d=copy.deepcopy(BASE); d["validation_summary"]["fabricated_candidate_count"]=1; self.assert_invalid(d,"SUMMARY_MISMATCH")
    def test_39_summary_assertion_without_evidence_zero(self):
        d=copy.deepcopy(BASE); d["validation_summary"]["assertion_without_evidence_count"]=1; self.assert_invalid(d,"SUMMARY_MISMATCH")
    def test_40_summary_silent_drop_zero(self):
        d=copy.deepcopy(BASE); d["validation_summary"]["silent_drop_count"]=1; self.assert_invalid(d,"SUMMARY_MISMATCH")
    def test_41_all_rejection_rules_covered(self):
        self.assertEqual({x["rule_id"] for x in BASE["rejected_records"]}, {f"C{i:03d}" for i in range(2,17)})
    def test_42_rejection_count_15(self):
        self.assertEqual(len(BASE["rejected_records"]), 15)

if __name__ == "__main__":
    unittest.main(verbosity=2)
