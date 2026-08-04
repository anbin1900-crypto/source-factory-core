from __future__ import annotations

import copy
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.adapter_loader import AdapterPackageError, load_adapter_package, validate_adapter_package
from src.quota_schedule_planner import plan_quota_schedule
from src.scope_planner import plan_collection_scope

FIXTURE_PATH = ROOT / "fixtures" / "FIXTURE_ADAPTER_PACKAGE_V1.json"


class AdapterRuntimeScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.package = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    def test_01_valid_fixture_package_accepted(self):
        receipt = load_adapter_package(self.package, mode="fixture")
        self.assertTrue(receipt["accepted"])

    def test_02_missing_required_field_rejected(self):
        package = copy.deepcopy(self.package)
        del package["site_id"]
        with self.assertRaisesRegex(AdapterPackageError, "MISSING_REQUIRED_FIELD"):
            validate_adapter_package(package)

    def test_03_unknown_critical_field_rejected(self):
        package = copy.deepcopy(self.package)
        package["critical_runtime_override"] = True
        with self.assertRaisesRegex(AdapterPackageError, "UNKNOWN_CRITICAL_FIELD"):
            validate_adapter_package(package)

    def test_04_raw_api_key_rejected(self):
        package = copy.deepcopy(self.package)
        package["request_policy"]["api_key"] = "raw"
        with self.assertRaisesRegex(AdapterPackageError, "RAW_SECRET_FIELD_REJECTED"):
            validate_adapter_package(package)

    def test_05_raw_authorization_rejected_nested(self):
        package = copy.deepcopy(self.package)
        package["metadata"]["authorization"] = "Bearer raw"
        with self.assertRaisesRegex(AdapterPackageError, "RAW_SECRET_FIELD_REJECTED"):
            validate_adapter_package(package)

    def test_06_credential_reference_accepted(self):
        package = validate_adapter_package(self.package)
        self.assertEqual(package["credential_reference"], "secretref://fixture/no-secret-required")

    def test_07_invalid_credential_reference_rejected(self):
        package = copy.deepcopy(self.package)
        package["credential_reference"] = "plain-text-key"
        with self.assertRaisesRegex(AdapterPackageError, "INVALID_CREDENTIAL_REFERENCE"):
            validate_adapter_package(package)

    def test_08_unverified_package_rejected_for_actual_mode(self):
        with self.assertRaisesRegex(AdapterPackageError, "UNVERIFIED_PACKAGE_REJECTED_FOR_ACTUAL_MODE"):
            validate_adapter_package(self.package, mode="actual")

    def test_09_fixture_package_accepted_for_fixture_mode(self):
        validated = validate_adapter_package(self.package, mode="fixture")
        self.assertTrue(validated["fixture"])

    def test_10_non_fixture_rejected_for_fixture_mode(self):
        package = copy.deepcopy(self.package)
        package["fixture"] = False
        with self.assertRaisesRegex(AdapterPackageError, "NON_FIXTURE_PACKAGE_REJECTED"):
            validate_adapter_package(package, mode="fixture")

    def test_11_actual_verified_package_accepted(self):
        package = copy.deepcopy(self.package)
        package["verified"] = True
        package["fixture"] = False
        package["verification"]["status"] = "VERIFIED"
        package["verification"]["content_sha256"] = "a" * 64
        self.assertTrue(validate_adapter_package(package, mode="actual")["verified"])

    def test_12_scope_boundary_is_deterministic(self):
        package = validate_adapter_package(self.package)
        first = plan_collection_scope(package, ["listing", "agency"], ["/listings", "/agencies"])
        second = plan_collection_scope(package, ["agency", "listing"], ["/agencies", "/listings"])
        self.assertEqual(first, second)

    def test_13_scope_excludes_private_path(self):
        package = validate_adapter_package(self.package)
        package["scope"]["allowed_paths"].append("/listings/private")
        plan = plan_collection_scope(package)
        self.assertNotIn("/listings/private", plan["paths"])

    def test_14_scope_unknown_requested_paths_not_included(self):
        package = validate_adapter_package(self.package)
        plan = plan_collection_scope(package, requested_paths=["/listings", "/admin"])
        self.assertEqual(plan["paths"], ["/listings"])

    def test_15_empty_resource_scope_rejected(self):
        package = validate_adapter_package(self.package)
        with self.assertRaisesRegex(ValueError, "EMPTY_RESOURCE_SCOPE"):
            plan_collection_scope(package, requested_resources=["unknown"])

    def test_16_quota_limit_never_exceeded(self):
        package = validate_adapter_package(self.package)
        package["quota"]["requests_per_day"] = 2
        plan = plan_quota_schedule(package, "2026-08-04T00:00:00Z", requested_run_count=10)
        self.assertEqual(plan["scheduled_run_count"], 2)
        self.assertFalse(plan["quota_limit_exceeded"])

    def test_17_schedule_next_run_deterministic(self):
        package = validate_adapter_package(self.package)
        first = plan_quota_schedule(package, "2026-08-04T00:00:00Z", 3)
        second = plan_quota_schedule(package, datetime(2026, 8, 4, tzinfo=timezone.utc), 3)
        self.assertEqual(first, second)

    def test_18_schedule_respects_rate_interval(self):
        package = validate_adapter_package(self.package)
        package["schedule"]["cadence_minutes"] = 1
        package["quota"]["requests_per_minute"] = 1
        package["quota"]["minimum_interval_seconds"] = 1
        plan = plan_quota_schedule(package, "2026-08-04T00:00:00Z", 2)
        self.assertGreaterEqual(plan["minimum_interval_seconds"], 60)

    def test_19_pagination_policy_exposed_to_b3(self):
        receipt = load_adapter_package(self.package)
        self.assertEqual(receipt["pagination_handoff"]["strategy"], "page_number")
        self.assertEqual(receipt["pagination_handoff"]["page_size"], 50)

    def test_20_zero_network_calls(self):
        receipt = load_adapter_package(self.package)
        scope = plan_collection_scope(receipt["package"])
        schedule = plan_quota_schedule(receipt["package"], "2026-08-04T00:00:00Z")
        self.assertEqual(receipt["network_call_count"], 0)
        self.assertFalse(scope["actual_site_call"])
        self.assertEqual(schedule["network_call_count"], 0)

    def test_21_non_https_source_rejected(self):
        package = copy.deepcopy(self.package)
        package["source_url"] = "http://fixture.invalid"
        with self.assertRaisesRegex(AdapterPackageError, "SOURCE_URL_MUST_BE_HTTPS"):
            validate_adapter_package(package)

    def test_22_nondeterministic_jitter_rejected(self):
        package = copy.deepcopy(self.package)
        package["schedule"]["jitter_seconds"] = 10
        with self.assertRaisesRegex(AdapterPackageError, "NONDETERMINISTIC_JITTER_REJECTED"):
            validate_adapter_package(package)

    def test_23_receipt_hash_stable(self):
        first = load_adapter_package(self.package)
        second = load_adapter_package(copy.deepcopy(self.package))
        self.assertEqual(first["package_sha256"], second["package_sha256"])

    def test_24_file_loading_matches_mapping_loading(self):
        from_file = load_adapter_package(FIXTURE_PATH)
        from_mapping = load_adapter_package(self.package)
        self.assertEqual(from_file["package_sha256"], from_mapping["package_sha256"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
