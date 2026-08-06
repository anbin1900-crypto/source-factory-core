#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from pdf_folder_inventory import (
    InventoryError,
    build_inventory,
    discover_pdf_files,
    write_inventory_json,
)


class PdfFolderInventoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _write(self, relative: str, content: bytes = b"pdf") -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def test_empty_folder(self) -> None:
        inventory = build_inventory(self.root)
        self.assertEqual(inventory["pdf_count"], 0)
        self.assertEqual(inventory["files"], [])

    def test_recursive_pdf_discovery(self) -> None:
        self._write("one.pdf")
        self._write("nested/two.pdf")
        files = discover_pdf_files(self.root)
        self.assertEqual(
            [item["relative_path"] for item in files],
            ["nested/two.pdf", "one.pdf"],
        )

    def test_case_insensitive_pdf_extension(self) -> None:
        self._write("a.PDF")
        self._write("b.PdF")
        self.assertEqual(len(discover_pdf_files(self.root)), 2)

    def test_non_pdf_files_are_ignored(self) -> None:
        self._write("a.pdf")
        self._write("b.pdf.txt")
        self._write("c.txt")
        self.assertEqual(
            [item["file_name"] for item in discover_pdf_files(self.root)],
            ["a.pdf"],
        )

    def test_relative_paths_are_posix_style(self) -> None:
        self._write("nested/three.pdf")
        self.assertEqual(
            discover_pdf_files(self.root)[0]["relative_path"],
            "nested/three.pdf",
        )

    def test_file_name_and_size_are_recorded(self) -> None:
        self._write("nested/size.pdf", b"123456")
        item = discover_pdf_files(self.root)[0]
        self.assertEqual(item["file_name"], "size.pdf")
        self.assertEqual(item["size_bytes"], 6)

    def test_processing_order_is_contiguous_and_one_based(self) -> None:
        self._write("c.pdf")
        self._write("a.pdf")
        self._write("b.pdf")
        self.assertEqual(
            [item["processing_order"] for item in discover_pdf_files(self.root)],
            [1, 2, 3],
        )

    def test_order_is_deterministic_not_creation_order(self) -> None:
        for relative in ["Z.pdf", "a/2.pdf", "A/1.pdf", "b.pdf"]:
            self._write(relative)
        expected = ["A/1.pdf", "a/2.pdf", "b.pdf", "Z.pdf"]
        first = [item["relative_path"] for item in discover_pdf_files(self.root)]
        second = [item["relative_path"] for item in discover_pdf_files(self.root)]
        self.assertEqual(first, expected)
        self.assertEqual(second, expected)

    def test_unicode_order_is_repeatable(self) -> None:
        self._write("가.pdf")
        self._write("나.pdf")
        first = discover_pdf_files(self.root)
        second = discover_pdf_files(self.root)
        self.assertEqual(first, second)

    def test_empty_pdf_file_is_inventory_entry(self) -> None:
        self._write("empty.pdf", b"")
        item = discover_pdf_files(self.root)[0]
        self.assertEqual(item["size_bytes"], 0)

    def test_hidden_pdf_is_included(self) -> None:
        self._write(".hidden.pdf")
        self.assertEqual(
            discover_pdf_files(self.root)[0]["relative_path"],
            ".hidden.pdf",
        )

    def test_source_pdf_is_not_modified(self) -> None:
        source = self._write("source.pdf", b"immutable")
        before = (source.read_bytes(), source.stat().st_mtime_ns)
        discover_pdf_files(self.root)
        after = (source.read_bytes(), source.stat().st_mtime_ns)
        self.assertEqual(before, after)

    def test_inventory_hash_is_stable(self) -> None:
        self._write("a.pdf", b"1")
        self._write("b.pdf", b"22")
        self.assertEqual(
            build_inventory(self.root)["inventory_sha256"],
            build_inventory(self.root)["inventory_sha256"],
        )

    def test_inventory_hash_changes_when_size_changes(self) -> None:
        path = self._write("a.pdf", b"1")
        before = build_inventory(self.root)["inventory_sha256"]
        path.write_bytes(b"longer")
        after = build_inventory(self.root)["inventory_sha256"]
        self.assertNotEqual(before, after)

    def test_inventory_hash_matches_canonical_files(self) -> None:
        self._write("a.pdf", b"1")
        inventory = build_inventory(self.root)
        payload = json.dumps(
            inventory["files"],
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        self.assertEqual(
            inventory["inventory_sha256"],
            hashlib.sha256(payload).hexdigest(),
        )

    def test_missing_root_fails_closed(self) -> None:
        with self.assertRaises(InventoryError):
            discover_pdf_files(self.root / "missing")

    def test_file_root_fails_closed(self) -> None:
        file_root = self._write("not-a-folder.pdf")
        with self.assertRaises(InventoryError):
            discover_pdf_files(file_root)

    def test_selected_root_symlink_fails_closed(self) -> None:
        target = self.root / "target"
        target.mkdir()
        link = self.root / "root-link"
        try:
            link.symlink_to(target, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("symlink creation unavailable")
        with self.assertRaises(InventoryError):
            discover_pdf_files(link)

    def test_nested_symlink_directory_is_not_followed(self) -> None:
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "outside.pdf").write_bytes(b"x")
        selected = self.root / "selected"
        selected.mkdir()
        link = selected / "linked"
        try:
            link.symlink_to(outside, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("symlink creation unavailable")
        self.assertEqual(discover_pdf_files(selected), [])

    def test_symlink_pdf_is_not_included(self) -> None:
        source = self._write("source.pdf")
        link = self.root / "linked.pdf"
        try:
            link.symlink_to(source)
        except (OSError, NotImplementedError):
            self.skipTest("symlink creation unavailable")
        self.assertEqual(
            [item["relative_path"] for item in discover_pdf_files(self.root)],
            ["source.pdf"],
        )

    def test_write_inventory_json_round_trip(self) -> None:
        self._write("a.pdf")
        inventory = build_inventory(self.root)
        output = self.root / "out" / "inventory.json"
        write_inventory_json(inventory, output)
        self.assertEqual(
            json.loads(output.read_text(encoding="utf-8")),
            inventory,
        )
        self.assertFalse(output.with_name(output.name + ".tmp").exists())

    def test_cli_stdout_success(self) -> None:
        self._write("a.pdf")
        script = Path(__file__).with_name("pdf_folder_inventory.py")
        result = subprocess.run(
            [sys.executable, str(script), str(self.root), "--compact"],
            check=False,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["pdf_count"], 1)

    def test_cli_missing_folder_returns_two(self) -> None:
        script = Path(__file__).with_name("pdf_folder_inventory.py")
        result = subprocess.run(
            [sys.executable, str(script), str(self.root / "missing")],
            check=False,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("PDF_INVENTORY_ERROR", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
