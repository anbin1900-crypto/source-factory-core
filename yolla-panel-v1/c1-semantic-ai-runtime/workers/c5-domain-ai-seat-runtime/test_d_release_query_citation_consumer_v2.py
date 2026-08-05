from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from d_release_query_citation_consumer_v2 import (
    EXPECTED_D1_AUTHORITY,
    evaluate_runtime_activation,
    validate_fixture_matrix,
)

ROOT = Path(__file__).parent
MATRIX = json.loads((ROOT / "D_RELEASE_QUERY_CITATION_ACTIVATION_FIXTURE_V2.json").read_text())
BASE_RECEIPT = MATRIX["base_authoritative_receipt"]
BASE_RELEASE = MATRIX["base_authoritative_release"]


class TestDReleaseConsumerV2(unittest.TestCase):
    def result(self, receipt=None, release=None):
        return evaluate_runtime_activation(
            BASE_RECEIPT if receipt is None else receipt,
            BASE_RELEASE if release is None else release,
        )

    def test_01_authoritative_pair_activates(self):
        self.assertEqual(self.result().activation_status, "ACTIVATED_BY_D1_RELEASE")

    def test_02_missing_receipt_fails_closed(self):
        self.assertEqual(evaluate_runtime_activation(None, BASE_RELEASE).first_blocker, "D1_ACTUAL_ACCEPTANCE_RECEIPT_NOT_PUBLISHED")

    def test_03_missing_release_fails_closed(self):
        self.assertEqual(evaluate_runtime_activation(BASE_RECEIPT, None).first_blocker, "D1_KNOWLEDGE_RELEASE_V1_NOT_PUBLISHED")

    def test_04_fixture_receipt_is_not_authority(self):
        receipt = copy.deepcopy(BASE_RECEIPT); receipt["fixture_only"] = True
        self.assertIn("FIXTURE_RECEIPT_NOT_AUTHORITY", self.result(receipt=receipt).reason_codes)

    def test_05_fixture_release_is_not_authority(self):
        release = copy.deepcopy(BASE_RELEASE); release["fixture_only"] = True
        self.assertIn("FIXTURE_RELEASE_NOT_AUTHORITY", self.result(release=release).reason_codes)

    def test_06_wrong_receipt_issuer(self):
        receipt = copy.deepcopy(BASE_RECEIPT); receipt["issuer"] = "C-1"
        self.assertIn("RECEIPT_ISSUER_NOT_D1", self.result(receipt=receipt).reason_codes)

    def test_07_wrong_release_issuer(self):
        release = copy.deepcopy(BASE_RELEASE); release["issuer"] = "C-1"
        self.assertIn("RELEASE_ISSUER_NOT_D1", self.result(release=release).reason_codes)

    def test_08_rejected_receipt_not_eligible(self):
        receipt = copy.deepcopy(BASE_RECEIPT); receipt["decision"] = "REJECTED"
        self.assertIn("RECEIPT_DECISION_NOT_RUNTIME_ELIGIBLE", self.result(receipt=receipt).reason_codes)

    def test_09_empty_accepted_set_blocked(self):
        receipt = copy.deepcopy(BASE_RECEIPT); receipt["accepted_record_ids"] = []
        self.assertIn("RECEIPT_ACCEPTED_RECORD_SET_EMPTY", self.result(receipt=receipt).reason_codes)

    def test_10_missing_knowledge_version(self):
        release = copy.deepcopy(BASE_RELEASE); release["knowledge_version"] = None
        self.assertIn("KNOWLEDGE_VERSION_NOT_BOUND", self.result(release=release).reason_codes)

    def test_11_missing_version_contract(self):
        release = copy.deepcopy(BASE_RELEASE); release.pop("version_policy_ref")
        self.assertIn("KNOWLEDGE_VERSION_CONTRACT_NOT_BOUND", self.result(release=release).reason_codes)

    def test_12_version_contract_mismatch(self):
        release = copy.deepcopy(BASE_RELEASE); release["version_policy_ref"]["blob"] = "0" * 40
        self.assertIn("KNOWLEDGE_VERSION_CONTRACT_BLOB_MISMATCH", self.result(release=release).reason_codes)

    def test_13_missing_query_contract(self):
        release = copy.deepcopy(BASE_RELEASE); release.pop("query_contract_ref")
        self.assertIn("QUERY_CONTRACT_NOT_BOUND", self.result(release=release).reason_codes)

    def test_14_query_contract_mismatch(self):
        release = copy.deepcopy(BASE_RELEASE); release["query_contract_ref"]["blob"] = "1" * 40
        self.assertIn("QUERY_CONTRACT_BLOB_MISMATCH", self.result(release=release).reason_codes)

    def test_15_missing_citation_contract(self):
        release = copy.deepcopy(BASE_RELEASE); release.pop("citation_contract_ref")
        self.assertIn("CITATION_CONTRACT_NOT_BOUND", self.result(release=release).reason_codes)

    def test_16_citation_contract_mismatch(self):
        release = copy.deepcopy(BASE_RELEASE); release["citation_contract_ref"]["blob"] = "2" * 40
        self.assertIn("CITATION_CONTRACT_BLOB_MISMATCH", self.result(release=release).reason_codes)

    def test_17_missing_evidence_contract(self):
        release = copy.deepcopy(BASE_RELEASE); release.pop("evidence_contract_ref")
        self.assertIn("EVIDENCE_CONTRACT_NOT_BOUND", self.result(release=release).reason_codes)

    def test_18_evidence_contract_mismatch(self):
        release = copy.deepcopy(BASE_RELEASE); release["evidence_contract_ref"]["blob"] = "3" * 40
        self.assertIn("EVIDENCE_CONTRACT_BLOB_MISMATCH", self.result(release=release).reason_codes)

    def test_19_receipt_id_mismatch(self):
        release = copy.deepcopy(BASE_RELEASE); release["acceptance_receipt_ref"]["receipt_id"] = "OTHER"
        self.assertIn("ACCEPTANCE_RECEIPT_ID_MISMATCH", self.result(release=release).reason_codes)

    def test_20_receipt_sha_mismatch(self):
        release = copy.deepcopy(BASE_RELEASE); release["acceptance_receipt_ref"]["receipt_sha256"] = "4" * 64
        self.assertIn("ACCEPTANCE_RECEIPT_SHA256_MISMATCH", self.result(release=release).reason_codes)

    def test_21_package_id_mismatch(self):
        release = copy.deepcopy(BASE_RELEASE); release["package_id"] = "OTHER"
        self.assertIn("PACKAGE_ID_MISMATCH", self.result(release=release).reason_codes)

    def test_22_package_sha_mismatch(self):
        release = copy.deepcopy(BASE_RELEASE); release["package_sha256"] = "5" * 64
        self.assertIn("PACKAGE_SHA256_MISMATCH", self.result(release=release).reason_codes)

    def test_23_released_record_must_be_accepted(self):
        release = copy.deepcopy(BASE_RELEASE); release["released_record_ids"] = ["NOT_ACCEPTED"]
        self.assertIn("RELEASED_RECORD_NOT_ACCEPTED_BY_RECEIPT", self.result(release=release).reason_codes)

    def test_24_rejected_record_cannot_be_released(self):
        release = copy.deepcopy(BASE_RELEASE); release["released_record_ids"] = ["REC-REJECTED"]
        result = self.result(release=release)
        self.assertIn("REJECTED_RECORD_INCLUDED_IN_RELEASE", result.reason_codes)

    def test_25_empty_release_set_blocked(self):
        release = copy.deepcopy(BASE_RELEASE); release["released_record_ids"] = []
        self.assertIn("RELEASED_RECORD_SET_EMPTY", self.result(release=release).reason_codes)

    def test_26_missing_snapshot_hash(self):
        release = copy.deepcopy(BASE_RELEASE); release["source_snapshot_sha256"] = None
        self.assertIn("SOURCE_SNAPSHOT_SHA256_MISSING", self.result(release=release).reason_codes)

    def test_27_release_status_must_be_issued(self):
        release = copy.deepcopy(BASE_RELEASE); release["release_status"] = "CANDIDATE"
        self.assertIn("KNOWLEDGE_RELEASE_STATUS_NOT_ISSUED", self.result(release=release).reason_codes)

    def test_28_receipt_release_created_must_be_true(self):
        receipt = copy.deepcopy(BASE_RECEIPT); receipt["knowledge_release_created"] = False
        self.assertIn("RECEIPT_KNOWLEDGE_RELEASE_CREATED_FALSE", self.result(receipt=receipt).reason_codes)

    def test_29_partial_receipt_valid_subset_activates(self):
        receipt = copy.deepcopy(BASE_RECEIPT); receipt["decision"] = "PARTIALLY_ACCEPTED"
        self.assertEqual(self.result(receipt=receipt).activation_status, "ACTIVATED_BY_D1_RELEASE")

    def test_30_fixture_matrix_all_passes(self):
        result = validate_fixture_matrix(MATRIX)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["failed_count"], 0)

    def test_31_authority_constants_exact(self):
        self.assertEqual(EXPECTED_D1_AUTHORITY["head"], "327547fd74f615a4c709c6da8473b1bf63fd5d6a")
        self.assertEqual(EXPECTED_D1_AUTHORITY["query_contract_blob"], "536e0cd95df6613fcf6306413870b09658d76d35")

    def test_32_activation_has_no_fixture_authority(self):
        self.assertFalse(self.result().fixture_as_authority)


if __name__ == "__main__":
    unittest.main(verbosity=2)
