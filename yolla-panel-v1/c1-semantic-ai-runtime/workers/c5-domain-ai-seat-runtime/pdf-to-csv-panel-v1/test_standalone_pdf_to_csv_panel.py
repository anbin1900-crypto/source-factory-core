from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
MODULE_PATH = HERE / "standalone_pdf_to_csv_panel.py"
spec = importlib.util.spec_from_file_location("panel_under_test", MODULE_PATH)
assert spec and spec.loader
panel = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = panel
spec.loader.exec_module(panel)


class RequestValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.source_dir = root / "source"
        self.output_dir = root / "output"
        self.source_dir.mkdir()
        self.output_dir.mkdir()
        self.pdf = self.source_dir / "선택.pdf"
        self.pdf.write_bytes(b"%PDF-fixture")
        self.txt = self.source_dir / "note.txt"
        self.txt.write_text("x", encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_folder_request_valid(self):
        req = panel.validate_request(
            mode="FOLDER", source=str(self.source_dir),
            output=str(self.output_dir), max_chars=12000,
        )
        self.assertEqual(req.mode, "FOLDER")

    def test_pdf_request_valid(self):
        req = panel.validate_request(
            mode="PDF_FILE", source=str(self.pdf),
            output=str(self.output_dir), max_chars=12000,
        )
        self.assertEqual(req.mode, "PDF_FILE")

    def test_single_pdf_alias_remains_compatible(self):
        req = panel.validate_request(
            mode="SINGLE_PDF", source=str(self.pdf),
            output=str(self.output_dir), max_chars=12000,
        )
        self.assertEqual(req.mode, "PDF_FILE")

    def test_pdf_extension_casefold_valid(self):
        upper = self.source_dir / "UPPER.PDF"
        upper.write_bytes(b"%PDF")
        req = panel.validate_request(
            mode="pdf_file", source=str(upper),
            output=str(self.output_dir), max_chars=12000,
        )
        self.assertEqual(req.mode, "PDF_FILE")

    def test_mode_required(self):
        with self.assertRaisesRegex(panel.PanelInputError, "PANEL_INPUT_MODE_INVALID"):
            panel.validate_request(
                mode=None, source=str(self.pdf),
                output=str(self.output_dir), max_chars=1,
            )

    def test_source_required(self):
        with self.assertRaisesRegex(panel.PanelInputError, "SOURCE_NOT_SELECTED"):
            panel.validate_request(
                mode="FOLDER", source="", output=str(self.output_dir), max_chars=1,
            )

    def test_output_required(self):
        with self.assertRaisesRegex(panel.PanelInputError, "OUTPUT_FOLDER_NOT_SELECTED"):
            panel.validate_request(
                mode="FOLDER", source=str(self.source_dir), output="", max_chars=1,
            )

    def test_source_must_exist(self):
        with self.assertRaisesRegex(panel.PanelInputError, "SOURCE_NOT_FOUND"):
            panel.validate_request(
                mode="FOLDER", source=str(self.source_dir / "missing"),
                output=str(self.output_dir), max_chars=1,
            )

    def test_folder_mode_requires_directory(self):
        with self.assertRaisesRegex(panel.PanelInputError, "FOLDER_SELECTION_NOT_DIRECTORY"):
            panel.validate_request(
                mode="FOLDER", source=str(self.pdf),
                output=str(self.output_dir), max_chars=1,
            )

    def test_pdf_mode_requires_file(self):
        with self.assertRaisesRegex(panel.PanelInputError, "PDF_SELECTION_NOT_FILE"):
            panel.validate_request(
                mode="PDF_FILE", source=str(self.source_dir),
                output=str(self.output_dir), max_chars=1,
            )

    def test_pdf_mode_rejects_non_pdf(self):
        with self.assertRaisesRegex(panel.PanelInputError, "PDF_SELECTION_EXTENSION_INVALID"):
            panel.validate_request(
                mode="PDF_FILE", source=str(self.txt),
                output=str(self.output_dir), max_chars=1,
            )

    def test_output_must_exist(self):
        with self.assertRaisesRegex(panel.PanelInputError, "OUTPUT_FOLDER_NOT_FOUND"):
            panel.validate_request(
                mode="FOLDER", source=str(self.source_dir),
                output=str(self.output_dir / "missing"), max_chars=1,
            )

    def test_output_must_be_directory(self):
        out_file = Path(self.tmp.name) / "out.txt"
        out_file.write_text("x", encoding="utf-8")
        with self.assertRaisesRegex(panel.PanelInputError, "OUTPUT_SELECTION_NOT_DIRECTORY"):
            panel.validate_request(
                mode="FOLDER", source=str(self.source_dir),
                output=str(out_file), max_chars=1,
            )

    def test_chunk_size_zero_rejected(self):
        with self.assertRaisesRegex(panel.PanelInputError, "CHUNK_SIZE_INVALID"):
            panel.validate_request(
                mode="FOLDER", source=str(self.source_dir),
                output=str(self.output_dir), max_chars=0,
            )

    def test_chunk_size_bool_rejected(self):
        with self.assertRaisesRegex(panel.PanelInputError, "CHUNK_SIZE_INVALID"):
            panel.validate_request(
                mode="FOLDER", source=str(self.source_dir),
                output=str(self.output_dir), max_chars=True,
            )


class PipelineBindingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.source_dir = root / "source"
        self.output_dir = root / "output"
        self.source_dir.mkdir()
        self.output_dir.mkdir()
        self.pdf = self.source_dir / "one.pdf"
        self.pdf.write_bytes(b"%PDF")

    def tearDown(self):
        self.tmp.cleanup()

    def test_folder_kwargs_use_source_folder_only(self):
        kwargs = panel.build_pipeline_kwargs(
            mode="FOLDER", source=str(self.source_dir),
            output=str(self.output_dir), max_chars=12000,
        )
        self.assertIn("source_folder", kwargs)
        self.assertNotIn("pdf_file", kwargs)

    def test_pdf_kwargs_use_pdf_file_only(self):
        kwargs = panel.build_pipeline_kwargs(
            mode="PDF_FILE", source=str(self.pdf),
            output=str(self.output_dir), max_chars=12000,
        )
        self.assertIn("pdf_file", kwargs)
        self.assertNotIn("source_folder", kwargs)

    def test_progress_callback_is_forwarded(self):
        callback = lambda event: None
        kwargs = panel.build_pipeline_kwargs(
            mode="FOLDER", source=str(self.source_dir),
            output=str(self.output_dir), max_chars=12000, progress=callback,
        )
        self.assertIs(kwargs["progress"], callback)

    def test_folder_executes_exactly_one_pipeline_call(self):
        calls = []
        def pipeline(**kwargs):
            calls.append(kwargs)
            return {"status": "PASS", "pdf_count": 2, "chunk_count": 4}
        result = panel.run_panel_request(
            mode="FOLDER", source=str(self.source_dir),
            output=str(self.output_dir),
            pipeline_loader=lambda: pipeline,
        )
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(len(calls), 1)
        self.assertIn("source_folder", calls[0])
        self.assertNotIn("pdf_file", calls[0])

    def test_single_pdf_executes_exactly_one_pipeline_call(self):
        calls = []
        def pipeline(**kwargs):
            calls.append(kwargs)
            return {"status": "PASS", "pdf_count": 1, "chunk_count": 2}
        result = panel.run_panel_request(
            mode="PDF_FILE", source=str(self.pdf),
            output=str(self.output_dir),
            pipeline_loader=lambda: pipeline,
        )
        self.assertEqual(result["pdf_count"], 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["pdf_file"], str(self.pdf.resolve()))
        self.assertNotIn("source_folder", calls[0])

    def test_nonselected_pdf_cannot_be_added_by_panel_layer(self):
        second = self.source_dir / "second.pdf"
        second.write_bytes(b"%PDF")
        calls = []
        def pipeline(**kwargs):
            calls.append(kwargs)
            return {"status": "PASS", "pdf_count": 1, "chunk_count": 1}
        panel.run_panel_request(
            mode="PDF_FILE", source=str(self.pdf),
            output=str(self.output_dir),
            pipeline_loader=lambda: pipeline,
        )
        self.assertEqual(set(calls[0]), {"pdf_file", "output_folder", "max_chars"})
        self.assertNotIn(str(second.resolve()), repr(calls[0]))

    def test_non_object_pipeline_result_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, "C4_PIPELINE_RESULT_NOT_OBJECT"):
            panel.run_panel_request(
                mode="FOLDER", source=str(self.source_dir),
                output=str(self.output_dir),
                pipeline_loader=lambda: (lambda **kwargs: []),
            )

    def test_non_pass_pipeline_result_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, "C4_PIPELINE_RESULT_NOT_PASS:ERROR"):
            panel.run_panel_request(
                mode="FOLDER", source=str(self.source_dir),
                output=str(self.output_dir),
                pipeline_loader=lambda: (lambda **kwargs: {"status": "ERROR"}),
            )

    def test_result_summary(self):
        self.assertEqual(
            panel.result_summary({"pdf_count": 3, "chunk_count": 7}),
            "완료: PDF 3개 / CSV 7개",
        )


class LoaderAndSourceContractTests(unittest.TestCase):
    def test_missing_c4_pipeline_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            missing = Path(td) / "missing.py"
            with patch.object(panel, "C4_PIPELINE_PATH", missing):
                with self.assertRaisesRegex(RuntimeError, "C4_PIPELINE_NOT_FOUND"):
                    panel.load_c4_pipeline()

    def test_c4_module_without_run_pipeline_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            source = Path(td) / "pipeline.py"
            source.write_text("X = 1\n", encoding="utf-8")
            with patch.object(panel, "C4_PIPELINE_PATH", source):
                with self.assertRaisesRegex(RuntimeError, "C4_RUN_PIPELINE_NOT_CALLABLE"):
                    panel.load_c4_pipeline()

    def test_c4_module_callable_is_loaded(self):
        with tempfile.TemporaryDirectory() as td:
            source = Path(td) / "pipeline.py"
            source.write_text(
                "def run_pipeline(**kwargs):\n"
                "    return {'status': 'PASS', 'pdf_count': 0, 'chunk_count': 0}\n",
                encoding="utf-8",
            )
            with patch.object(panel, "C4_PIPELINE_PATH", source):
                func = panel.load_c4_pipeline()
                self.assertTrue(callable(func))
                self.assertEqual(func()["status"], "PASS")

    def test_source_has_two_dedicated_input_buttons(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn('QPushButton("폴더 선택")', source)
        self.assertIn('QPushButton("PDF 파일 선택")', source)
        self.assertNotIn("QRadioButton", source)
        self.assertNotIn("QButtonGroup", source)

    def test_source_has_progress_error_and_result_widgets(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("QProgressBar", source)
        self.assertIn("self.error_text", source)
        self.assertIn("self.result_text", source)

    def test_selected_pdf_path_is_visible(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("self.source_edit.setReadOnly(True)", source)
        self.assertIn('self._set_input("PDF_FILE", value)', source)

    def test_gui_thread_calls_public_panel_request_path(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("result = run_panel_request(", source)
        self.assertIn("progress=self.event.emit", source)

    def test_controls_are_disabled_while_busy(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("self.folder_button.setEnabled(not busy)", source)
        self.assertIn("self.pdf_button.setEnabled(not busy)", source)
        self.assertIn("self.output_button.setEnabled(not busy)", source)
        self.assertIn("self.max_chars.setEnabled(not busy)", source)

    def test_worker_cleanup_is_explicit(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("self.worker.finished.connect(self.on_worker_finished)", source)
        self.assertIn("self.worker = None", source)
        self.assertIn("worker.deleteLater()", source)

    def test_main_fails_cleanly_without_pyside6(self):
        if panel.PYSIDE6_AVAILABLE:
            self.skipTest("PySide6 is installed in this environment")
        self.assertEqual(panel.main(), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
