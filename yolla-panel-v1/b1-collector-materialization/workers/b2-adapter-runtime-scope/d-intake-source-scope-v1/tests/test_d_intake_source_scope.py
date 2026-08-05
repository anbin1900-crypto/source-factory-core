from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.d_intake_source_scope_validator import (
    SourceScopeContractError,
    contract_sha256,
    validate_contract,
    validate_contract_file,
)

CONTRACT_PATH = ROOT / "contracts" / "B2_D_INTAKE_SOURCE_SCOPE_CONTRACT_V1.json"
FIXTURE_PATH = ROOT / "fixtures" / "B2_D_INTAKE_SOURCE_SCOPE_FIXTURE_V1.json"


class DIntakeSourceScopeContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    def test_01_contract_file_passes(self):
        self.assertTrue(validate_contract_file(CONTRACT_PATH)["accepted"])

    def test_02_fixture_contract_passes(self):
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.assertEqual(fixture["contract_ref"], "contracts/B2_D_INTAKE_SOURCE_SCOPE_CONTRACT_V1.json")
        self.assertEqual(fixture["contract_canonical_sha256"], contract_sha256(self.contract))
        self.assertTrue(validate_contract(self.contract)["accepted"])

    def test_03_source_key_exact(self):
        self.assertEqual(self.contract["source_key"], "NAVER_FIN_LAND_PUBLIC_WEB_V1")

    def test_04_source_alias_candidate_exact(self):
        self.assertEqual(self.contract["source_alias_candidate"], "NAVER_FIN_LAND")

    def test_05_alias_decision_owner_d1(self):
        self.assertEqual(self.contract["source_key_alias_decision_owner"], "D-1")

    def test_06_silent_source_key_rename_false(self):
        self.assertFalse(self.contract["SILENT_SOURCE_KEY_RENAME"])

    def test_07_source_name_exact(self):
        self.assertEqual(self.contract["source_name"], "네이버페이 부동산")

    def test_08_official_url_exact(self):
        self.assertEqual(self.contract["official_source_url"], "https://fin.land.naver.com")

    def test_09_method_get(self):
        self.assertEqual(self.contract["method"], "GET")

    def test_10_response_format_html(self):
        self.assertEqual(self.contract["response_format"], "HTML")

    def test_11_authorized_scope_exact(self):
        self.assertEqual(self.contract["authorized_scope"], "PUBLIC_NON_LOGIN_READ_ONLY")

    def test_12_active_profiles_7_of_7(self):
        self.assertEqual(self.contract["active_profiles"], ["EP-001", "EP-002", "EP-003", "EP-004", "EP-005", "EP-010", "EP-012"])

    def test_13_ep011_excluded(self):
        self.assertEqual(self.contract["excluded_profiles"][0]["profile_id"], "EP-011")
        self.assertFalse(self.contract["excluded_profiles"][0]["included"])

    def test_14_route_template_count_7(self):
        self.assertEqual(len(self.contract["route_templates"]), 7)

    def test_15_route_profile_binding_unique(self):
        profiles = [x["profile_id"] for x in self.contract["route_templates"]]
        self.assertEqual(len(profiles), len(set(profiles)))

    def test_16_all_route_methods_get(self):
        self.assertTrue(all(x["method"] == "GET" for x in self.contract["route_templates"]))

    def test_17_all_route_formats_html(self):
        self.assertTrue(all(x["response_format"] == "HTML" for x in self.contract["route_templates"]))

    def test_18_credential_not_required(self):
        self.assertFalse(self.contract["credential_required"])

    def test_19_login_not_required(self):
        self.assertFalse(self.contract["login_required"])

    def test_20_pagination_not_observed(self):
        self.assertFalse(self.contract["pagination_observed"])

    def test_21_authority_type_unresolved(self):
        self.assertIsNone(self.contract["authority_type"])

    def test_22_d_canonical_source_id_null(self):
        self.assertIsNone(self.contract["d_canonical_source_id"])

    def test_23_authority_boundary_false(self):
        for key in ("D_CANONICAL_SOURCE_ID_GENERATION", "D_AUTHORITY_TYPE_FINAL_DECISION", "D_ACCEPTANCE_RECEIPT_ISSUANCE"):
            self.assertFalse(self.contract[key])

    def test_24_d_contract_blob_binding_4_of_4(self):
        self.assertEqual(self.contract["D_schema_blob"], "710f1de7860f62143f81f36bd3eb4fbe2b613ff1")
        self.assertEqual(self.contract["D_mapping_blob"], "fcd879221b8d2b2c8f988a76e4045877ced9336b")
        self.assertEqual(self.contract["D_ruleset_blob"], "7bc601dd16a84f44b95c7e5757a1a796cb5fd793")
        self.assertEqual(self.contract["D_receipt_contract_blob"], "c5b2d0087c52fb1af4b9c0a31f7181aedebfd410")

    def test_25_a2_package_blob_bound(self):
        self.assertEqual(self.contract["input_bindings"]["A2_VERIFIED_ADAPTER_PACKAGE"]["package_blob"], "d758afef96e76b664f6d8b0383c5a7bc017c731a")

    def test_26_a2_profiles_match(self):
        self.assertEqual(self.contract["input_bindings"]["A2_VERIFIED_ADAPTER_PACKAGE"]["active_profiles"], self.contract["active_profiles"])

    def test_27_a5_handoff_blob_bound(self):
        self.assertEqual(self.contract["input_bindings"]["A5_D_SOURCE_ENDPOINT_SCHEMA_HANDOFF"]["handoff_blob"], "0fac8fac5069a013717ea74202d6d1741adfd966")

    def test_28_a5_active_profile_pass(self):
        self.assertEqual(self.contract["input_bindings"]["A5_D_SOURCE_ENDPOINT_SCHEMA_HANDOFF"]["active_profile_binding"], "PASS_7_OF_7")

    def test_29_scope_flags_false(self):
        scope = self.contract["scope_policy"]
        self.assertFalse(any(scope[key] for key in ("credential_required", "login_required", "browser_automation_authorized", "automated_pagination_authorized", "actual_site_extraction_authorized", "bulk_collection_authorized")))

    def test_30_handoff_to_b5_b6_b1(self):
        handoff = self.contract["handoff"]
        self.assertEqual((handoff["consumer"], handoff["consumer_pr"]), ("B-5", 41))
        self.assertEqual((handoff["independent_preflight_consumer"], handoff["independent_preflight_pr"]), ("B-6", 42))
        self.assertEqual((handoff["control_consumer"], handoff["control_pr"]), ("B-1", 19))

    def test_31_safety_counters_zero(self):
        safety = self.contract["safety"]
        self.assertEqual(safety["actual_site_call_count"], 0)
        self.assertEqual(safety["d_canonical_id_generation_count"], 0)
        self.assertEqual(safety["d_canonical_db_write_count"], 0)
        self.assertEqual(safety["d_acceptance_receipt_issuance_count"], 0)

    def test_32_environment_flags_false(self):
        safety = self.contract["safety"]
        self.assertFalse(any(safety[key] for key in ("actual_site_extraction", "production", "ready", "merge", "self_merge")))

    def test_33_wrong_source_key_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["source_key"] = "NAVER_FIN_LAND"
        with self.assertRaisesRegex(SourceScopeContractError, "INVALID_SOURCE_KEY"):
            validate_contract(changed)

    def test_34_silent_rename_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["SILENT_SOURCE_KEY_RENAME"] = True
        with self.assertRaisesRegex(SourceScopeContractError, "SILENT_SOURCE_KEY_RENAME_FORBIDDEN"):
            validate_contract(changed)

    def test_35_authority_type_value_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["authority_type"] = "OFFICIAL_PRIMARY"
        with self.assertRaisesRegex(SourceScopeContractError, "AUTHORITY_TYPE_MUST_REMAIN_UNRESOLVED"):
            validate_contract(changed)

    def test_36_ep011_active_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["active_profiles"].append("EP-011")
        with self.assertRaises(SourceScopeContractError):
            validate_contract(changed)

    def test_37_route_method_post_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["route_templates"][0]["method"] = "POST"
        with self.assertRaisesRegex(SourceScopeContractError, "METHOD_NOT_GET"):
            validate_contract(changed)

    def test_38_raw_secret_field_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["scope_policy"]["api_key"] = "raw"
        with self.assertRaisesRegex(SourceScopeContractError, "RAW_SECRET_FIELD_REJECTED"):
            validate_contract(changed)

    def test_39_wrong_d_blob_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["D_schema_blob"] = "0" * 40
        with self.assertRaisesRegex(SourceScopeContractError, "INVALID_D_SCHEMA_BLOB"):
            validate_contract(changed)

    def test_40_contract_hash_stable(self):
        self.assertEqual(contract_sha256(self.contract), contract_sha256(copy.deepcopy(self.contract)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
