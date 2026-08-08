import json
import tempfile
import unittest
from pathlib import Path

from pdf_extraction_runtime_adapter import (
    RuntimeAdapterConfig,
    RuntimeAdapterError,
    _canonical_files_sha256,
    dependency_doctor,
    run_inventory_extraction,
    validate_inventory,
    run_panel_selection_extraction,
)


def inventory(root, files):
    return {
        "schema_version": "PDF_FOLDER_INVENTORY_V1",
        "selected_folder": str(root),
        "pdf_count": len(files),
        "files": files,
        "inventory_sha256": _canonical_files_sha256(files),
    }


class FakeExtractor:
    def __init__(self, outcomes=None):
        self.calls = []
        self.outcomes = list(outcomes or [])

    def __call__(self, path, *, ocr, config):
        self.calls.append((Path(path), ocr, config))
        if self.outcomes:
            outcome = self.outcomes.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome
        return {
            "page_count": 2,
            "direct_text_page_count": 1,
            "ocr_page_count": 1 if ocr else 0,
            "records": [],
        }


class C3RuntimeAdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "a.pdf").write_bytes(b"abc")
        (self.root / "nested").mkdir()
        (self.root / "nested" / "B.PDF").write_bytes(b"12345")
        self.files = [
            {"processing_order": 1, "relative_path": "a.pdf", "file_name": "a.pdf", "size_bytes": 3},
            {"processing_order": 2, "relative_path": "nested/B.PDF", "file_name": "B.PDF", "size_bytes": 5},
        ]
        self.inv = inventory(self.root, self.files)
        self.ready = {"status": "READY_DIRECT_TEXT_AND_OCR", "direct_text_ready": True, "ocr_ready": True}
        self.direct_only = {"status": "READY_DIRECT_TEXT_ONLY_OCR_UNAVAILABLE", "direct_text_ready": True, "ocr_ready": False}

    def test_01_doctor_all_ready(self):
        self.assertEqual(dependency_doctor(finder=lambda name: object(), which=lambda name: "/tesseract")["status"], "READY_DIRECT_TEXT_AND_OCR")

    def test_02_doctor_direct_only(self):
        finder = lambda name: object() if name == "fitz" else None
        self.assertEqual(dependency_doctor(finder=finder, which=lambda name: None)["status"], "READY_DIRECT_TEXT_ONLY_OCR_UNAVAILABLE")

    def test_03_doctor_pymupdf_missing(self):
        self.assertEqual(dependency_doctor(finder=lambda name: None, which=lambda name: None)["status"], "BLOCKED_PYMUPDF_UNAVAILABLE")

    def test_04_inventory_schema_required(self):
        bad = dict(self.inv); bad["schema_version"] = "X"
        with self.assertRaises(RuntimeAdapterError) as ctx: validate_inventory(bad)
        self.assertEqual(ctx.exception.code, "INVENTORY_SCHEMA_UNSUPPORTED")

    def test_05_inventory_files_array(self):
        bad = dict(self.inv); bad["files"] = {}
        with self.assertRaises(RuntimeAdapterError) as ctx: validate_inventory(bad)
        self.assertEqual(ctx.exception.code, "INVENTORY_FILES_NOT_ARRAY")

    def test_06_contiguous_order(self):
        with self.assertRaises(RuntimeAdapterError) as ctx: validate_inventory(inventory(self.root, [dict(self.files[0], processing_order=2)]))
        self.assertEqual(ctx.exception.code, "PROCESSING_ORDER_NOT_CONTIGUOUS")

    def test_07_escape_rejected(self):
        bad = [{"processing_order":1,"relative_path":"../x.pdf","file_name":"x.pdf","size_bytes":0}]
        with self.assertRaises(RuntimeAdapterError) as ctx: validate_inventory(inventory(self.root, bad))
        self.assertEqual(ctx.exception.code, "RELATIVE_PATH_ESCAPE_DETECTED")

    def test_08_absolute_rejected(self):
        bad = [{"processing_order":1,"relative_path":str((self.root/"a.pdf").resolve()),"file_name":"a.pdf","size_bytes":3}]
        with self.assertRaises(RuntimeAdapterError): validate_inventory(inventory(self.root, bad))

    def test_09_file_name_match(self):
        with self.assertRaises(RuntimeAdapterError) as ctx: validate_inventory(inventory(self.root, [dict(self.files[0], file_name="b.pdf")]))
        self.assertEqual(ctx.exception.code, "FILE_NAME_MISMATCH")

    def test_10_pdf_extension(self):
        with self.assertRaises(RuntimeAdapterError) as ctx: validate_inventory(inventory(self.root, [dict(self.files[0], relative_path="a.txt", file_name="a.txt")]))
        self.assertEqual(ctx.exception.code, "INVENTORY_RECORD_NOT_PDF")

    def test_11_negative_size(self):
        with self.assertRaises(RuntimeAdapterError) as ctx: validate_inventory(inventory(self.root, [dict(self.files[0], size_bytes=-1)]))
        self.assertEqual(ctx.exception.code, "SIZE_BYTES_INVALID")

    def test_12_count_mismatch(self):
        bad = dict(self.inv); bad["pdf_count"] = 99
        with self.assertRaises(RuntimeAdapterError) as ctx: validate_inventory(bad)
        self.assertEqual(ctx.exception.code, "PDF_COUNT_MISMATCH")

    def test_13_hash_mismatch(self):
        bad = dict(self.inv); bad["inventory_sha256"] = "0" * 64
        with self.assertRaises(RuntimeAdapterError) as ctx: validate_inventory(bad)
        self.assertEqual(ctx.exception.code, "INVENTORY_SHA256_MISMATCH")

    def test_14_direct_runtime_required(self):
        with self.assertRaises(RuntimeAdapterError) as ctx: run_inventory_extraction(self.inv, doctor={"direct_text_ready":False,"ocr_ready":False})
        self.assertEqual(ctx.exception.code, "PYMUPDF_RUNTIME_UNAVAILABLE")

    def test_15_ocr_strict_gate(self):
        with self.assertRaises(RuntimeAdapterError) as ctx: run_inventory_extraction(self.inv, doctor=self.direct_only, adapter_config=RuntimeAdapterConfig(require_ocr_runtime_at_start=True))
        self.assertEqual(ctx.exception.code, "OCR_RUNTIME_UNAVAILABLE")

    def test_16_ocr_factory_called_when_ready(self):
        marker = object(); fake = FakeExtractor()
        result = run_inventory_extraction(self.inv, doctor=self.ready, extractor=fake, ocr_factory=lambda: marker)
        self.assertIs(fake.calls[0][1], marker); self.assertEqual(result["status"], "PASS")

    def test_17_ocr_none_in_direct_only_mode(self):
        fake = FakeExtractor(); run_inventory_extraction(self.inv, doctor=self.direct_only, extractor=fake)
        self.assertIsNone(fake.calls[0][1])

    def test_18_source_order_preserved(self):
        result = run_inventory_extraction(self.inv, doctor=self.ready, extractor=FakeExtractor())
        self.assertTrue(result["source_order_preserved"])
        self.assertEqual([f["relative_path"] for f in result["files"]], ["a.pdf", "nested/B.PDF"])

    def test_19_counts_accumulate(self):
        result = run_inventory_extraction(self.inv, doctor=self.ready, extractor=FakeExtractor())
        self.assertEqual((result["total_page_count"], result["direct_text_page_count"], result["ocr_page_count"]), (4,2,2))

    def test_20_events_monotonic(self):
        result = run_inventory_extraction(self.inv, doctor=self.ready, extractor=FakeExtractor())
        self.assertEqual([e["sequence"] for e in result["events"]], list(range(1, len(result["events"])+1)))

    def test_21_events_have_start_complete(self):
        result = run_inventory_extraction(self.inv, doctor=self.ready, extractor=FakeExtractor())
        self.assertEqual(result["events"][0]["stage"], "START"); self.assertEqual(result["events"][-1]["stage"], "COMPLETE")

    def test_22_missing_file_error_recorded(self):
        (self.root / "a.pdf").unlink()
        result = run_inventory_extraction(self.inv, doctor=self.ready, extractor=FakeExtractor())
        self.assertEqual(result["files"][0]["error"]["code"], "INVENTORY_SOURCE_FILE_NOT_FOUND")
        self.assertEqual(result["status"], "PARTIAL_FAILURE")

    def test_23_size_mismatch_error_recorded(self):
        (self.root / "a.pdf").write_bytes(b"changed")
        result = run_inventory_extraction(self.inv, doctor=self.ready, extractor=FakeExtractor())
        self.assertEqual(result["files"][0]["error"]["code"], "INVENTORY_SIZE_MISMATCH")

    def test_24_fail_fast(self):
        (self.root / "a.pdf").unlink()
        with self.assertRaises(RuntimeAdapterError): run_inventory_extraction(self.inv, doctor=self.ready, extractor=FakeExtractor(), adapter_config=RuntimeAdapterConfig(continue_on_file_error=False))

    def test_25_extraction_error_preserved(self):
        from pdf_text_extractor import ExtractionError
        result = run_inventory_extraction(self.inv, doctor=self.ready, extractor=FakeExtractor([ExtractionError("EMPTY_TEXT_AFTER_OCR", "empty", 3)]))
        self.assertEqual(result["files"][0]["error"]["code"], "EMPTY_TEXT_AFTER_OCR")
        self.assertEqual(result["files"][0]["error"]["page_no"], 3)

    def test_26_all_failure_status(self):
        from pdf_text_extractor import ExtractionError
        result = run_inventory_extraction(self.inv, doctor=self.ready, extractor=FakeExtractor([ExtractionError("X", "x"), ExtractionError("Y", "y")]))
        self.assertEqual(result["status"], "FAILURE"); self.assertEqual(result["failed_file_count"], 2)

    def test_27_zero_file_inventory(self):
        result = run_inventory_extraction(inventory(self.root, []), doctor=self.ready, extractor=FakeExtractor())
        self.assertEqual(result["status"], "PASS"); self.assertEqual(result["attempted_file_count"], 0)

    def test_28_boundaries_zero(self):
        result = run_inventory_extraction(self.inv, doctor=self.ready, extractor=FakeExtractor())
        self.assertEqual((result["semantic_analysis_count"], result["gpt_call_count"], result["database_write_count"], result["original_pdf_mutation_count"]), (0,0,0,0))

    def test_29_inventory_hash_stable(self):
        a = _canonical_files_sha256(self.files); b = _canonical_files_sha256(json.loads(json.dumps(self.files)))
        self.assertEqual(a,b); self.assertEqual(len(a),64)

    def test_30_config_type_validation(self):
        with self.assertRaises(ValueError): RuntimeAdapterConfig(verify_file_exists=1).validate()

    def panel_selection(self, *, status="READY", ready=True, inv=None):
        chosen = inv or self.inv
        return {"schema_version":"PANEL_FOLDER_SELECTION_INVENTORY_ADAPTER_V1","source_folder":str(self.root),"output_folder":str(self.root / "out"),"inventory":chosen,"pdf_count":chosen["pdf_count"],"selection_status":status,"ready_for_processing":ready,"cycle1_pointer_blob":"ba27ebb810d29b989a6677930b13b04cd7e23daf"}

    def test_31_panel_schema_required(self):
        bad=self.panel_selection(); bad["schema_version"]="X"
        with self.assertRaises(RuntimeAdapterError) as ctx: run_panel_selection_extraction(bad,doctor=self.ready,extractor=FakeExtractor())
        self.assertEqual(ctx.exception.code,"PANEL_SELECTION_SCHEMA_UNSUPPORTED")

    def test_32_panel_source_mismatch(self):
        bad=self.panel_selection(); bad["source_folder"]=str(self.root / "other")
        with self.assertRaises(RuntimeAdapterError) as ctx: run_panel_selection_extraction(bad,doctor=self.ready,extractor=FakeExtractor())
        self.assertEqual(ctx.exception.code,"PANEL_SELECTION_SOURCE_FOLDER_MISMATCH")

    def test_33_panel_not_ready(self):
        with self.assertRaises(RuntimeAdapterError) as ctx: run_panel_selection_extraction(self.panel_selection(ready=False),doctor=self.ready,extractor=FakeExtractor())
        self.assertEqual(ctx.exception.code,"PANEL_SELECTION_NOT_READY")

    def test_34_panel_wrapper_pass(self):
        result=run_panel_selection_extraction(self.panel_selection(),doctor=self.ready,extractor=FakeExtractor())
        self.assertEqual(result["status"],"PASS"); self.assertEqual(result["panel_selection_status"],"READY"); self.assertTrue(result["output_folder"].endswith("out"))

    def test_35_panel_no_pdf_explicit(self):
        empty=inventory(self.root,[])
        result=run_panel_selection_extraction(self.panel_selection(status="NO_PDF_FILES",ready=False,inv=empty),doctor=self.ready,extractor=FakeExtractor())
        self.assertEqual(result["status"],"NO_PDF_FILES"); self.assertEqual(result["attempted_file_count"],0)

if __name__ == "__main__":
    unittest.main(verbosity=2)
