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
        self.assertTrue(validate_contract(fixture["contract"])["accepted"])

    def test_03_source_key_exact(self):
        self.assertEqual(self.contract["source_key"], "NAVER_FIN_LAND_PUBLIC_WEB_V1")

    def test_04_source_name_exact(self):
        self.assertEqual(self.contract["source_name"], "네이버페이 부동산")

    def test_05_official_url_exact(self):
        self.assertEqual(self.contract["official_source_url"], "https://fin.land.naver.com")

    def test_06_method_get(self):
        self.assertEqual(self.contract["method"], "GET")

    def test_07_response_format_html(self):
        self.assertEqual(self.contract["response_format"], "HTML")

    def test_08_authorized_scope_exact(self):
        self.assertEqual(self.contract["authorized_scope"], "PUBLIC_NON_LOGIN_READ_ONLY")

    def test_09_authority_type_unresolved(self):
        self.assertIsNone(self.contract["authority_type"])

    def test_10_authority_type_status_pending(self):
        self.assertEqual(self.contract["authority_type_status"], "PENDING_D1_DECISION")

    def test_11_d_canonical_source_id_null(self):
        self.assertIsNone(self.contract["d_canonical_source_id"])

    def test_12_d_decision_owner(self):
        self.assertEqual(
            self.contract["authority_type_decision_pointer"]["decision_owner"],
            "D-1_ONLY",
        )

    def test_13_schema_blob_exact(self):
        self.assertEqual(
            self.contract["d_contract_refs"]["schema_blob"],
            "710f1de7860f62143f81f36bd3eb4fbe2b613ff1",
        )

    def test_14_mapping_blob_exact(self):
        self.assertEqual(
            self.contract["d_contract_refs"]["mapping_blob"],
            "fcd879221b8d2b2c8f988a76e4045877ced9336b",
        )

    def test_15_ruleset_blob_exact(self):
        self.assertEqual(
            self.contract["d_contract_refs"]["ruleset_blob"],
            "7bc601dd16a84f44b95c7e5757a1a796cb5fd793",
        )

    def test_16_receipt_blob_exact(self):
        self.assertEqual(
            self.contract["d_contract_refs"]["receipt_contract_blob"],
            "c5b2d0087c52fb1af4b9c0a31f7181aedebfd410",
        )

    def test_17_scope_flags_all_false(self):
        flags = self.contract["scope_policy"]
        self.assertFalse(
            any(
                flags[key]
                for key in (
                    "credential_required",
                    "browser_automation_authorized",
                    "automated_pagination_authorized",
                    "actual_site_extraction_authorized",
                    "bulk_collection_authorized",
                )
            )
        )

    def test_18_handoff_to_b5(self):
        self.assertEqual(self.contract["handoff"]["consumer"], "B-5")

    def test_19_next_event_exact(self):
        self.assertEqual(
            self.contract["handoff"]["next_event"], "B5_RESUME_AFTER_B2_AND_B4"
        )

    def test_20_no_acceptance_claim(self):
        self.assertFalse(self.contract["handoff"]["producer_acceptance_claim"])

    def test_21_no_canonical_write_claim(self):
        self.assertFalse(self.contract["handoff"]["producer_canonical_write_claim"])

    def test_22_safety_counters_zero(self):
        safety = self.contract["safety"]
        self.assertEqual(safety["d_canonical_id_generation_count"], 0)
        self.assertEqual(safety["d_canonical_db_write_count"], 0)
        self.assertEqual(safety["postgresql_connection_count"], 0)

    def test_23_environment_flags_false(self):
        safety = self.contract["safety"]
        self.assertFalse(
            any(
                safety[key]
                for key in (
                    "actual_site_extraction",
                    "production",
                    "ready",
                    "merge",
                    "self_merge",
                )
            )
        )

    def test_24_wrong_source_key_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["source_key"] = "WRONG"
        with self.assertRaisesRegex(SourceScopeContractError, "INVALID_SOURCE_KEY"):
            validate_contract(changed)

    def test_25_authority_type_value_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["authority_type"] = "OFFICIAL_PRIMARY"
        with self.assertRaisesRegex(
            SourceScopeContractError, "AUTHORITY_TYPE_MUST_REMAIN_UNRESOLVED"
        ):
            validate_contract(changed)

    def test_26_raw_secret_field_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["scope_policy"]["api_key"] = "raw"
        with self.assertRaisesRegex(SourceScopeContractError, "RAW_SECRET_FIELD_REJECTED"):
            validate_contract(changed)

    def test_27_http_url_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["official_source_url"] = "http://fin.land.naver.com"
        with self.assertRaises(SourceScopeContractError):
            validate_contract(changed)

    def test_28_canonical_id_generation_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["d_canonical_source_id"] = "01JTEST"
        with self.assertRaisesRegex(
            SourceScopeContractError, "D_CANONICAL_SOURCE_ID_MUST_BE_NULL"
        ):
            validate_contract(changed)

    def test_29_wrong_d_blob_rejected(self):
        changed = copy.deepcopy(self.contract)
        changed["d_contract_refs"]["schema_blob"] = "0" * 40
        with self.assertRaisesRegex(SourceScopeContractError, "INVALID_SCHEMA_BLOB"):
            validate_contract(changed)

    def test_30_package_hash_stable(self):
        self.assertEqual(
            contract_sha256(self.contract), contract_sha256(copy.deepcopy(self.contract))
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
