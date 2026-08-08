from __future__ import annotations
from pathlib import Path
import json,sys,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from extraction_acceptance import AcceptanceError,load_json,validate_bundle,validate_hex40

class ExtractionAcceptanceTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.exact=load_json(ROOT/"B6_EXACT_HEAD_BLOB_MATRIX_V1.json")
  cls.outputs=load_json(ROOT/"B6_REQUIRED_OUTPUT_ACCEPTANCE_MATRIX_V1.json")
  cls.report=load_json(ROOT/"B6_EXTRACTION_ACCEPTANCE_REPORT_V1.json")
  cls.audit=load_json(ROOT/"B6_C1_HANDOFF_AUDIT_RECEIPT_V1.json")
  cls.candidate=load_json(ROOT/"B1_TO_C1_HANDOFF_CANDIDATE_V1.json")
  cls.result=validate_bundle(ROOT)
 def test_01_exact_heads_bound_4_of_4(self): self.assertEqual(len(self.exact["workers"]),4)
 def test_02_all_heads_are_40_hex(self):
  for w,i in self.exact["workers"].items(): validate_hex40(i["head"],w)
 def test_03_pointer_blobs_bound_4_of_4(self):
  for w,i in self.exact["workers"].items(): validate_hex40(i["pointer_blob"],w)
 def test_04_worker_gate_pass(self): self.assertEqual(self.result["worker_gate"],"PASS_4_OF_4")
 def test_05_raw_manifest_present(self): self.assertTrue(self.outputs["required_outputs"]["RAW_ARTIFACT_MANIFEST_V1"]["present"])
 def test_06_source_envelope_present(self): self.assertTrue(self.outputs["required_outputs"]["SOURCE_RECORD_ENVELOPE_V1"]["present"])
 def test_07_normalized_dataset_present(self): self.assertTrue(self.outputs["required_outputs"]["NORMALIZED_DATASET_V1"]["present"])
 def test_08_extraction_receipt_present(self): self.assertTrue(self.outputs["required_outputs"]["EXTRACTION_RECEIPT_V1"]["present"])
 def test_09_sqlite_base64_present(self): self.assertTrue(self.outputs["required_outputs"]["FIXTURE_SQLITE_BASE64"]["present"])
 def test_10_required_outputs_pass_5_of_5(self): self.assertEqual(self.result["required_outputs"],"PASS_5_OF_5")
 def test_11_raw_sha_parity(self): self.assertTrue(self.outputs["required_outputs"]["EXTRACTION_RECEIPT_V1"]["raw_manifest_sha256_match"])
 def test_12_source_envelope_sha_parity(self): self.assertTrue(self.outputs["required_outputs"]["EXTRACTION_RECEIPT_V1"]["source_envelope_sha256_match"])
 def test_13_input_count_parity(self): self.assertEqual(self.outputs["required_outputs"]["RAW_ARTIFACT_MANIFEST_V1"]["record_count"],4)
 def test_14_duplicate_count_one(self): self.assertEqual(self.outputs["required_outputs"]["NORMALIZED_DATASET_V1"]["duplicate_count"],1)
 def test_15_output_count_three(self): self.assertEqual(self.outputs["required_outputs"]["NORMALIZED_DATASET_V1"]["output_record_count"],3)
 def test_16_source_field_loss_zero(self): self.assertEqual(self.result["source_field_loss_count"],0)
 def test_17_retry_resume_deterministic(self): self.assertTrue(self.result["retry_resume_deterministic"])
 def test_18_duplicate_execution_delta_zero(self): self.assertEqual(self.result["duplicate_execution_delta"],0)
 def test_19_sqlite_row_count_three(self): self.assertEqual(self.result["sqlite_row_count"],3)
 def test_20_sqlite_size_exact(self): self.assertEqual(self.result["sqlite_decoded_size_bytes"],12288)
 def test_21_sqlite_sha_exact(self): self.assertEqual(self.result["sqlite_decoded_sha256"],"f03e20844e805af3105791934352f8bc3dcbeb1a165ad5c80e5d6ae5739ea14d")
 def test_22_unverified_adapter_actual_mode_rejected(self): self.assertTrue(self.report["pipeline_validation"]["unverified_adapter_actual_mode_rejected"])
 def test_23_actual_site_and_network_zero(self): self.assertFalse(self.result["actual_site_extraction"]); self.assertEqual(self.result["network_call_count"],0)
 def test_24_c1_source_evidence_only(self): self.assertEqual(self.result["handoff_boundary"],"PASS_SOURCE_EVIDENCE_ONLY")
 def test_25_semantic_and_d_write_zero(self): self.assertEqual(self.result["semantic_transformation_count"],0); self.assertEqual(self.result["d_canonical_db_write_count"],0)
 def test_26_production_ready_merge_false(self):
  for d in (self.report,self.audit,self.candidate): self.assertFalse(d["production"]); self.assertFalse(d["ready"]); self.assertFalse(d["merge"])
 def test_27_fail_closed_mutation_entry_condition(self):
  with tempfile.TemporaryDirectory() as td:
   t=Path(td)
   names=["B6_EXACT_HEAD_BLOB_MATRIX_V1.json","B6_REQUIRED_OUTPUT_ACCEPTANCE_MATRIX_V1.json","B6_EXTRACTION_ACCEPTANCE_REPORT_V1.json","B6_C1_HANDOFF_AUDIT_RECEIPT_V1.json","B1_TO_C1_HANDOFF_CANDIDATE_V1.json"]
   for n in names:
    d=load_json(ROOT/n)
    if n=="B6_EXACT_HEAD_BLOB_MATRIX_V1.json": d["entry_condition_met"]=False
    (t/n).write_text(json.dumps(d),encoding="utf-8")
   with self.assertRaises(AcceptanceError): validate_bundle(t)
if __name__=="__main__": unittest.main(verbosity=2)
