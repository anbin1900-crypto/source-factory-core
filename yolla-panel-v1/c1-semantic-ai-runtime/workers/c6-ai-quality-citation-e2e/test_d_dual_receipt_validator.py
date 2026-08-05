import json
import unittest
from pathlib import Path

from d_dual_receipt_validator import apply_mutation, run_matrix, validate_fixture

ROOT = Path(__file__).resolve().parent
FIXTURE = json.loads((ROOT / "D_DUAL_RECEIPT_FIXTURE_V1.json").read_text(encoding="utf-8"))
MATRIX = json.loads((ROOT / "D_DUAL_RECEIPT_E2E_MATRIX_V1.json").read_text(encoding="utf-8"))


class DualReceiptValidatorTests(unittest.TestCase):
    def test_01_base_fixture_valid(self):
        self.assertTrue(validate_fixture(FIXTURE)["valid"])

    def test_02_fixture_runtime_inactive(self):
        self.assertFalse(validate_fixture(FIXTURE)["fixture_runtime_activated"])

    def test_03_fixture_not_activation_eligible(self):
        self.assertFalse(validate_fixture(FIXTURE)["runtime_activation_eligible"])

    def test_04_receipt_ids_distinct(self):
        self.assertNotEqual(FIXTURE["source_document_receipt"]["receipt_id"], FIXTURE["knowledge_candidate_receipt"]["receipt_id"])

    def test_05_receipt_types_distinct(self):
        self.assertNotEqual(FIXTURE["source_document_receipt"]["receipt_type"], FIXTURE["knowledge_candidate_receipt"]["receipt_type"])

    def test_06_source_db_write_false(self):
        self.assertIs(FIXTURE["source_document_receipt"]["authoritative_db_write_performed"], False)

    def test_07_knowledge_db_write_false(self):
        self.assertIs(FIXTURE["knowledge_candidate_receipt"]["authoritative_db_write_performed"], False)

    def test_08_runtime_db_write_false(self):
        self.assertIs(FIXTURE["c_ai_runtime_receipt"]["authoritative_db_write_performed"], False)

    def test_09_source_rejection_preserved(self):
        self.assertTrue(FIXTURE["source_document_receipt"]["rejected_records"][0]["source_value_preserved"])

    def test_10_knowledge_rejection_preserved(self):
        self.assertTrue(FIXTURE["knowledge_candidate_receipt"]["rejected_records"][0]["source_value_preserved"])

    def test_11_duplicate_id_rejected(self):
        self.assertIn("RECEIPT_ID_COLLISION", validate_fixture(apply_mutation(FIXTURE, "DUPLICATE_RECEIPT_ID"))["errors"])

    def test_12_source_contamination_rejected(self):
        self.assertIn("SOURCE_RECEIPT_SCOPE_CONTAMINATION", validate_fixture(apply_mutation(FIXTURE, "SOURCE_RECEIPT_HAS_KNOWLEDGE_PACKAGE_REF"))["errors"])

    def test_13_knowledge_contamination_rejected(self):
        self.assertIn("KNOWLEDGE_RECEIPT_SCOPE_CONTAMINATION", validate_fixture(apply_mutation(FIXTURE, "KNOWLEDGE_RECEIPT_HAS_SOURCE_PACKAGE_REF"))["errors"])

    def test_14_source_write_rejected(self):
        self.assertIn("AUTHORITATIVE_DB_WRITE_FORBIDDEN", validate_fixture(apply_mutation(FIXTURE, "SOURCE_DB_WRITE_TRUE"))["errors"])

    def test_15_knowledge_write_rejected(self):
        self.assertIn("AUTHORITATIVE_DB_WRITE_FORBIDDEN", validate_fixture(apply_mutation(FIXTURE, "KNOWLEDGE_DB_WRITE_TRUE"))["errors"])

    def test_16_rejection_loss_rejected(self):
        self.assertIn("REJECTED_VALUE_NOT_PRESERVED", validate_fixture(apply_mutation(FIXTURE, "REJECTED_VALUE_NOT_PRESERVED"))["errors"])

    def test_17_source_link_mismatch_rejected(self):
        self.assertIn("SOURCE_RECEIPT_LINK_MISMATCH", validate_fixture(apply_mutation(FIXTURE, "KNOWLEDGE_SOURCE_RECEIPT_REF_MISMATCH"))["errors"])

    def test_18_release_link_mismatch_rejected(self):
        self.assertIn("KNOWLEDGE_RELEASE_RECEIPT_LINK_MISMATCH", validate_fixture(apply_mutation(FIXTURE, "RELEASE_RECEIPT_REF_MISMATCH"))["errors"])

    def test_19_fixture_activation_rejected(self):
        self.assertIn("FIXTURE_RUNTIME_ACTIVATION_FORBIDDEN", validate_fixture(apply_mutation(FIXTURE, "FIXTURE_RUNTIME_ACTIVATED_TRUE"))["errors"])

    def test_20_query_contract_required(self):
        self.assertIn("KNOWLEDGE_RELEASE_CONTRACT_BINDING_MISSING", validate_fixture(apply_mutation(FIXTURE, "MISSING_QUERY_CONTRACT"))["errors"])

    def test_21_citation_contract_required(self):
        self.assertIn("KNOWLEDGE_RELEASE_CONTRACT_BINDING_MISSING", validate_fixture(apply_mutation(FIXTURE, "MISSING_CITATION_CONTRACT"))["errors"])

    def test_22_evidence_contract_required(self):
        self.assertIn("KNOWLEDGE_RELEASE_CONTRACT_BINDING_MISSING", validate_fixture(apply_mutation(FIXTURE, "MISSING_EVIDENCE_CONTRACT"))["errors"])

    def test_23_type_collision_rejected(self):
        self.assertIn("RECEIPT_TYPE_COLLISION", validate_fixture(apply_mutation(FIXTURE, "RECEIPT_TYPE_COLLISION"))["errors"])

    def test_24_matrix_passes(self):
        self.assertEqual(run_matrix(FIXTURE, MATRIX)["status"], "PASS_14_OF_14")

    def test_25_canonical_hash_deterministic(self):
        self.assertEqual(validate_fixture(FIXTURE)["canonical_sha256"], validate_fixture(FIXTURE)["canonical_sha256"])

    def test_26_no_semantic_rerun_claim(self):
        contract = json.loads((ROOT / "D_DUAL_RECEIPT_E2E_CONTRACT_V1.json").read_text(encoding="utf-8"))
        self.assertIs(contract["no_rerun_rule"]["duplicate_semantic_rerun"], False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
