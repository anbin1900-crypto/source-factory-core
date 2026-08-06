from __future__ import annotations

import csv
import io
import unittest

from validate_pdf_to_csv_cycle1 import SourceExpectation, validate_pdf_to_csv_cycle1


def make_csv(rows, columns=None, bom=True):
    output = io.StringIO(newline="")
    fieldnames = columns or ["source_file", "source_path", "chunk_no", "page_start", "page_end", "text"]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    payload = output.getvalue().encode("utf-8")
    return (b"\xef\xbb\xbf" + payload) if bom else payload


SOURCE = SourceExpectation("a.pdf", "C:/input/a.pdf", True)
BASE_ROWS = [
    {"source_file": "a.pdf", "source_path": "C:/input/a.pdf", "chunk_no": "1", "page_start": "1", "page_end": "1", "text": "alpha"},
    {"source_file": "a.pdf", "source_path": "C:/input/a.pdf", "chunk_no": "2", "page_start": "1", "page_end": "2", "text": "beta"},
]


class PdfToCsvCycle1ValidatorTests(unittest.TestCase):
    def validate(self, rows=BASE_ROWS, *, columns=None, bom=True, sources=(SOURCE,)):
        return validate_pdf_to_csv_cycle1({"a_0001.csv": make_csv(rows, columns, bom)}, sources)

    def codes(self, result):
        return {finding.code for finding in result.findings}

    def test_01_valid_fixture(self):
        self.assertTrue(self.validate().valid)

    def test_02_utf8_sig_required(self):
        self.assertIn("UTF8_SIG_BOM_MISSING", self.codes(self.validate(bom=False)))

    def test_03_required_columns(self):
        columns = ["source_file", "source_path", "chunk_no", "page_start", "page_end"]
        rows = [{key: value for key, value in BASE_ROWS[0].items() if key in columns}]
        self.assertIn("REQUIRED_COLUMNS_MISSING", self.codes(self.validate(rows, columns=columns)))

    def test_04_chunk_starts_at_one(self):
        rows = [dict(BASE_ROWS[0], chunk_no="2")]
        self.assertIn("NONCONTIGUOUS_CHUNK_SEQUENCE", self.codes(self.validate(rows)))

    def test_05_chunk_gap(self):
        rows = [BASE_ROWS[0], dict(BASE_ROWS[1], chunk_no="3")]
        self.assertIn("NONCONTIGUOUS_CHUNK_SEQUENCE", self.codes(self.validate(rows)))

    def test_06_duplicate_chunk(self):
        rows = [BASE_ROWS[0], dict(BASE_ROWS[1], chunk_no="1")]
        self.assertIn("DUPLICATE_CHUNK_NUMBER", self.codes(self.validate(rows)))

    def test_07_invalid_chunk_integer(self):
        rows = [dict(BASE_ROWS[0], chunk_no="x")]
        self.assertIn("INVALID_INTEGER", self.codes(self.validate(rows)))

    def test_08_invalid_page_integer(self):
        rows = [dict(BASE_ROWS[0], page_start="x")]
        self.assertIn("INVALID_INTEGER", self.codes(self.validate(rows)))

    def test_09_page_range_start_after_end(self):
        rows = [dict(BASE_ROWS[0], page_start="2", page_end="1")]
        self.assertIn("INVALID_PAGE_RANGE", self.codes(self.validate(rows)))

    def test_10_page_zero(self):
        rows = [dict(BASE_ROWS[0], page_start="0")]
        self.assertIn("INVALID_PAGE_RANGE", self.codes(self.validate(rows)))

    def test_11_page_start_regression(self):
        rows = [dict(BASE_ROWS[0], page_start="2", page_end="2"), dict(BASE_ROWS[1], page_start="1", page_end="2")]
        self.assertIn("PAGE_ORDER_REGRESSION", self.codes(self.validate(rows)))

    def test_12_page_end_regression(self):
        rows = [dict(BASE_ROWS[0], page_start="1", page_end="3"), dict(BASE_ROWS[1], page_start="2", page_end="2")]
        self.assertIn("PAGE_ORDER_REGRESSION", self.codes(self.validate(rows)))

    def test_13_empty_text_rejected_for_nonempty_source(self):
        rows = [dict(BASE_ROWS[0], text="")]
        self.assertIn("NONEMPTY_SOURCE_TEXT_MISSING", self.codes(self.validate(rows)))

    def test_14_nonempty_source_coverage_required(self):
        result = validate_pdf_to_csv_cycle1({}, (SOURCE,))
        self.assertIn("NONEMPTY_SOURCE_NOT_COVERED", self.codes(result))

    def test_15_no_artifacts(self):
        result = validate_pdf_to_csv_cycle1({}, (SOURCE,))
        self.assertIn("NO_CSV_ARTIFACTS", self.codes(result))

    def test_16_unknown_source(self):
        rows = [dict(BASE_ROWS[0], source_file="b.pdf", source_path="C:/input/b.pdf")]
        self.assertIn("UNKNOWN_SOURCE", self.codes(self.validate(rows)))

    def test_17_missing_source_identity(self):
        rows = [dict(BASE_ROWS[0], source_file="")]
        self.assertIn("SOURCE_IDENTITY_MISSING", self.codes(self.validate(rows)))

    def test_18_duplicate_source_expectation(self):
        result = self.validate(sources=(SOURCE, SOURCE))
        self.assertIn("DUPLICATE_SOURCE_EXPECTATION", self.codes(result))

    def test_19_empty_source_expectation(self):
        result = self.validate(sources=(SourceExpectation("", "", True),))
        self.assertIn("INVALID_SOURCE_EXPECTATION", self.codes(result))

    def test_20_empty_source_allows_empty_text(self):
        source = SourceExpectation("a.pdf", "C:/input/a.pdf", False)
        rows = [dict(BASE_ROWS[0], text="")]
        self.assertTrue(self.validate(rows, sources=(source,)).valid)

    def test_21_multiple_artifacts_contiguous_by_source(self):
        first = make_csv([BASE_ROWS[0]])
        second = make_csv([BASE_ROWS[1]])
        result = validate_pdf_to_csv_cycle1({"a_0001.csv": first, "a_0002.csv": second}, (SOURCE,))
        self.assertTrue(result.valid)

    def test_22_source_counts(self):
        result = self.validate()
        self.assertEqual(result.source_count_expected, 1)
        self.assertEqual(result.source_count_covered, 1)
        self.assertEqual(result.nonempty_source_count_covered, 1)

    def test_23_deterministic_hash(self):
        self.assertEqual(self.validate().canonical_sha256, self.validate().canonical_sha256)

    def test_24_no_semantic_validation(self):
        rows = [dict(BASE_ROWS[0], text="nonsensical but structurally present")]
        self.assertTrue(self.validate(rows).valid)


if __name__ == "__main__":
    unittest.main(verbosity=2)
