#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from text_chunk_csv_writer import (
    COLUMNS,
    ChunkWriterError,
    EmptyTextError,
    chunk_pages,
    convert,
    normalize_pages,
    render_csv_bytes,
    write_chunks,
)


class Tests(unittest.TestCase):
    def test_aliases(self):
        self.assertEqual(normalize_pages([{"page_no": 1, "text": "a"}])[0].page_no, 1)
        self.assertEqual(normalize_pages([{"page_number": 1, "text": "a"}])[0].page_no, 1)

    def test_alias_conflict(self):
        with self.assertRaises(ChunkWriterError):
            normalize_pages([{"page_no": 1, "page_number": 2, "text": "a"}])

    def test_page_order_fail_closed(self):
        cases = (
            [{"page_no": 1, "text": "a"}, {"page_no": 1, "text": "b"}],
            [{"page_no": 2, "text": "a"}, {"page_no": 1, "text": "b"}],
        )
        for pages in cases:
            with self.subTest(pages=pages), self.assertRaises(ChunkWriterError):
                normalize_pages(pages)

    def test_empty_fail_closed(self):
        with self.assertRaises(EmptyTextError):
            normalize_pages([])
        with self.assertRaises(EmptyTextError):
            normalize_pages([{"page_no": 1, "text": " \n"}])

    def test_invalid_values(self):
        with self.assertRaises(ChunkWriterError):
            normalize_pages([{"page_no": True, "text": "a"}])
        with self.assertRaises(ChunkWriterError):
            normalize_pages([{"page_no": 1, "text": 3}])
        with self.assertRaises(ChunkWriterError):
            chunk_pages(
                [{"page_no": 1, "text": "a"}],
                source_file="a",
                source_path="/a",
                max_chars=0,
            )

    def test_exact_split_and_order(self):
        chunks = chunk_pages(
            [{"page_no": 1, "text": "abcdef"}, {"page_no": 2, "text": "XYZ"}],
            source_file="a.pdf",
            source_path="/a.pdf",
            max_chars=2,
        )
        self.assertEqual([chunk.text for chunk in chunks], ["ab", "cd", "ef", "XY", "Z"])
        self.assertEqual([chunk.chunk_no for chunk in chunks], [1, 2, 3, 4, 5])
        self.assertTrue(all(chunk.page_start == chunk.page_end for chunk in chunks))

    def test_unicode_codepoints(self):
        chunks = chunk_pages(
            [{"page_no": 1, "text": "가😀나다"}],
            source_file="a",
            source_path="/a",
            max_chars=2,
        )
        self.assertEqual([chunk.text for chunk in chunks], ["가😀", "나다"])

    def test_hash_exact(self):
        chunk = chunk_pages(
            [{"page_no": 1, "text": "A\r\n가"}],
            source_file="a",
            source_path="/a",
            max_chars=9,
        )[0]
        expected = hashlib.sha256("A\r\n가".encode("utf-8")).hexdigest()
        self.assertEqual(chunk.text_sha256, expected)

    def test_csv_bom_columns_and_escaping(self):
        chunk = chunk_pages(
            [{"page_no": 1, "text": "a,b\n\"c\""}],
            source_file="a",
            source_path="/a",
            max_chars=99,
        )[0]
        payload = render_csv_bytes(chunk)
        self.assertTrue(payload.startswith(b"\xef\xbb\xbf"))
        row = list(csv.DictReader(io.StringIO(payload.decode("utf-8-sig"))))[0]
        self.assertEqual(tuple(row), COLUMNS)
        self.assertEqual(row["text"], "a,b\n\"c\"")

    def test_write_and_identical_reuse(self):
        chunks = chunk_pages(
            [{"page_no": 1, "text": "abcd"}],
            source_file="a",
            source_path="/a",
            max_chars=2,
        )
        with tempfile.TemporaryDirectory() as directory:
            first = write_chunks(chunks, output_dir=directory)
            second = write_chunks(chunks, output_dir=directory)
            self.assertEqual(len(first), 2)
            self.assertEqual(second[0]["status"], "REUSED_IDENTICAL")

    def test_conflict_and_overwrite(self):
        chunks = chunk_pages(
            [{"page_no": 1, "text": "ab"}],
            source_file="a",
            source_path="/a",
            max_chars=2,
        )
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "chunk_000001.csv"
            target.write_bytes(b"bad")
            with self.assertRaises(FileExistsError):
                write_chunks(chunks, output_dir=directory)
            result = write_chunks(chunks, output_dir=directory, overwrite=True)
            self.assertEqual(result[0]["status"], "REPLACED")

    def test_filename_safety(self):
        chunks = chunk_pages(
            [{"page_no": 1, "text": "abcd"}],
            source_file="a",
            source_path="/a",
            max_chars=2,
        )
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ChunkWriterError):
                write_chunks(
                    chunks,
                    output_dir=directory,
                    filename_factory=lambda chunk: "same.csv",
                )
            with self.assertRaises(ChunkWriterError):
                write_chunks(
                    chunks[:1],
                    output_dir=directory,
                    filename_factory=lambda chunk: "../bad.csv",
                )

    def test_convert_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            result = convert(
                [{"page_no": 3, "text": "abc"}, {"page_no": 4, "text": "def"}],
                source_file="a.pdf",
                source_path="/a.pdf",
                output_dir=directory,
                max_chars=2,
            )
            self.assertEqual(result["chunk_count"], 4)
            self.assertEqual((result["page_start"], result["page_end"]), (3, 4))
            self.assertFalse(result["semantic_analysis"])
            self.assertFalse(result["gpt_call"])

    def test_cli(self):
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.json"
            output_dir = Path(directory) / "out"
            input_path.write_text(
                json.dumps({
                    "source_file": "a.pdf",
                    "source_path": "/a.pdf",
                    "pages": [{"page_no": 1, "text": "abcd"}],
                }),
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("text_chunk_csv_writer.py")),
                    "--input-json",
                    str(input_path),
                    "--output-dir",
                    str(output_dir),
                    "--max-chars",
                    "2",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["chunk_count"], 2)

    def test_input_not_mutated(self):
        value = [{"page_no": 1, "text": "abc", "meta": {"x": 1}}]
        before = json.dumps(value, sort_keys=True)
        chunk_pages(value, source_file="a", source_path="/a", max_chars=2)
        self.assertEqual(json.dumps(value, sort_keys=True), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
