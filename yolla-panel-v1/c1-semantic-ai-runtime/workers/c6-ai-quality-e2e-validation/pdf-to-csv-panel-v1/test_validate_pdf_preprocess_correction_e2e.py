from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from validate_pdf_preprocess_correction_e2e import (
    CorrectionE2EValidationError,
    REQUIRED_COLUMNS,
    validate_result,
)


def write_csv(path: Path, *, chunk_no: int, page_start: int = 1, page_end: int = 1, text: str = "fixture", bom: bool = True, columns=REQUIRED_COLUMNS) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoding = "utf-8-sig" if bom else "utf-8"
    with path.open("w", encoding=encoding, newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(columns))
        writer.writeheader()
        row = {
            "source_file": "a.pdf",
            "source_path": "/fixture/a.pdf",
            "chunk_no": str(chunk_no),
            "page_start": str(page_start),
            "page_end": str(page_end),
            "text": text,
        }
        writer.writerow({key: row[key] for key in columns})


def source(name: str, paths: list[Path]) -> dict:
    return {
        "source_file": name,
        "files": [{"path": str(path)} for path in paths],
    }


class CorrectionE2EValidatorTests(unittest.TestCase):
    def test_folder_mode_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = root / "a1.csv"
            b = root / "b1.csv"
            write_csv(a, chunk_no=1)
            write_csv(b, chunk_no=1)
            result = {
                "status": "PASS",
                "input_mode": "FOLDER",
                "pdf_count": 2,
                "sources": [source("a.pdf", [a]), source("b.pdf", [b])],
                "events": [{"stage": "SELECTION_START"}, {"stage": "COMPLETE"}],
            }
            self.assertEqual(
                validate_result(result, expected_mode="FOLDER", expected_source_files=["a.pdf", "b.pdf"])["status"],
                "PASS",
            )

    def test_single_pdf_mode_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.csv"
            write_csv(path, chunk_no=1)
            result = {
                "status": "PASS",
                "input_mode": "PDF_FILE",
                "selected_pdf": "/fixture/a.pdf",
                "pdf_count": 1,
                "sources": [source("a.pdf", [path])],
            }
            self.assertEqual(
                validate_result(
                    result,
                    expected_mode="PDF_FILE",
                    expected_source_files=["a.pdf"],
                    selected_pdf="/fixture/a.pdf",
                )["source_count"],
                1,
            )

    def test_non_selected_pdf_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = root / "a.csv"
            b = root / "b.csv"
            write_csv(a, chunk_no=1)
            write_csv(b, chunk_no=1)
            result = {
                "status": "PASS",
                "input_mode": "PDF_FILE",
                "selected_pdf": "/fixture/a.pdf",
                "pdf_count": 2,
                "sources": [source("a.pdf", [a]), source("b.pdf", [b])],
            }
            with self.assertRaises(CorrectionE2EValidationError):
                validate_result(result, expected_mode="PDF_FILE", expected_source_files=["a.pdf"], selected_pdf="/fixture/a.pdf")

    def test_utf8_sig_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.csv"
            write_csv(path, chunk_no=1, bom=False)
            result = {"status": "PASS", "input_mode": "FOLDER", "pdf_count": 1, "sources": [source("a.pdf", [path])]}
            with self.assertRaises(CorrectionE2EValidationError):
                validate_result(result, expected_mode="FOLDER", expected_source_files=["a.pdf"])

    def test_required_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.csv"
            write_csv(path, chunk_no=1, columns=REQUIRED_COLUMNS[:-1])
            result = {"status": "PASS", "input_mode": "FOLDER", "pdf_count": 1, "sources": [source("a.pdf", [path])]}
            with self.assertRaises(CorrectionE2EValidationError):
                validate_result(result, expected_mode="FOLDER", expected_source_files=["a.pdf"])

    def test_chunk_continuity(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = root / "a1.csv"
            b = root / "a2.csv"
            write_csv(a, chunk_no=1)
            write_csv(b, chunk_no=3)
            result = {"status": "PASS", "input_mode": "FOLDER", "pdf_count": 1, "sources": [source("a.pdf", [a, b])]}
            with self.assertRaises(CorrectionE2EValidationError):
                validate_result(result, expected_mode="FOLDER", expected_source_files=["a.pdf"])

    def test_page_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = root / "a1.csv"
            b = root / "a2.csv"
            write_csv(a, chunk_no=1, page_start=2, page_end=2)
            write_csv(b, chunk_no=2, page_start=1, page_end=1)
            result = {"status": "PASS", "input_mode": "FOLDER", "pdf_count": 1, "sources": [source("a.pdf", [a, b])]}
            with self.assertRaises(CorrectionE2EValidationError):
                validate_result(result, expected_mode="FOLDER", expected_source_files=["a.pdf"])

    def test_empty_text_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.csv"
            write_csv(path, chunk_no=1, text="")
            result = {"status": "PASS", "input_mode": "FOLDER", "pdf_count": 1, "sources": [source("a.pdf", [path])]}
            with self.assertRaises(CorrectionE2EValidationError):
                validate_result(result, expected_mode="FOLDER", expected_source_files=["a.pdf"])

    def test_selected_pdf_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.csv"
            write_csv(path, chunk_no=1)
            result = {"status": "PASS", "input_mode": "PDF_FILE", "selected_pdf": "/fixture/b.pdf", "pdf_count": 1, "sources": [source("a.pdf", [path])]}
            with self.assertRaises(CorrectionE2EValidationError):
                validate_result(result, expected_mode="PDF_FILE", expected_source_files=["a.pdf"], selected_pdf="/fixture/a.pdf")

    def test_progress_event_chain(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.csv"
            write_csv(path, chunk_no=1)
            result = {
                "status": "PASS",
                "input_mode": "FOLDER",
                "pdf_count": 1,
                "sources": [source("a.pdf", [path])],
                "events": [{"stage": "SELECTION_START"}],
            }
            with self.assertRaises(CorrectionE2EValidationError):
                validate_result(result, expected_mode="FOLDER", expected_source_files=["a.pdf"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
