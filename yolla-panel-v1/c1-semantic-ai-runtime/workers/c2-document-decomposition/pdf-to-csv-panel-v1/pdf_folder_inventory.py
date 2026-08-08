#!/usr/bin/env python3
"""Deterministic recursive PDF folder inventory.

This module discovers PDF files under a selected folder without opening or
modifying them. It intentionally performs no text extraction, OCR, chunking,
CSV writing, or semantic processing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import unicodedata
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = "PDF_FOLDER_INVENTORY_V1"


class InventoryError(RuntimeError):
    """Raised when an inventory cannot be produced without silent loss."""


def _path_sort_key(relative_path: str) -> tuple[str, bytes]:
    """Return a deterministic, case-insensitive Unicode-aware path key.

    NFC + casefold gives stable human-oriented ordering. The original UTF-8
    bytes are a final tie-breaker so distinct paths never depend on traversal
    order.
    """

    normalized = unicodedata.normalize("NFC", relative_path)
    return normalized.casefold(), relative_path.encode("utf-8", "surrogatepass")


def _canonical_inventory_bytes(entries: Iterable[dict[str, Any]]) -> bytes:
    canonical = json.dumps(
        list(entries),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return canonical.encode("utf-8")


def discover_pdf_files(selected_folder: str | os.PathLike[str]) -> list[dict[str, Any]]:
    """Return a deterministic list of PDF files beneath *selected_folder*.

    Rules:
    - recursive traversal;
    - extension match is case-insensitive and must be exactly ``.pdf``;
    - directory and file symlinks are excluded to prevent root escape/loops;
    - filesystem access failures raise :class:`InventoryError`;
    - ordering is deterministic from the relative path, not traversal order;
    - source files are never opened or modified.
    """

    root = Path(selected_folder)
    try:
        root_lstat = root.lstat()
    except FileNotFoundError as exc:
        raise InventoryError(f"SELECTED_FOLDER_NOT_FOUND:{root}") from exc
    except OSError as exc:
        raise InventoryError(f"SELECTED_FOLDER_STAT_FAILED:{root}:{exc}") from exc

    if root.is_symlink():
        raise InventoryError(f"SELECTED_FOLDER_SYMLINK_FORBIDDEN:{root}")
    if not root_lstat or not root.is_dir():
        raise InventoryError(f"SELECTED_FOLDER_NOT_DIRECTORY:{root}")

    found: list[dict[str, Any]] = []

    def on_walk_error(exc: OSError) -> None:
        path = getattr(exc, "filename", None) or str(root)
        raise InventoryError(f"DIRECTORY_TRAVERSAL_FAILED:{path}:{exc}") from exc

    try:
        for current_dir, dirnames, filenames in os.walk(
            root, topdown=True, followlinks=False, onerror=on_walk_error
        ):
            current = Path(current_dir)

            safe_dirs: list[str] = []
            for dirname in dirnames:
                candidate = current / dirname
                try:
                    if not candidate.is_symlink():
                        safe_dirs.append(dirname)
                except OSError as exc:
                    raise InventoryError(
                        f"DIRECTORY_ENTRY_STAT_FAILED:{candidate}:{exc}"
                    ) from exc
            dirnames[:] = sorted(safe_dirs, key=lambda name: _path_sort_key(name))

            for filename in filenames:
                candidate = current / filename
                try:
                    if candidate.is_symlink():
                        continue
                    if candidate.suffix.casefold() != ".pdf":
                        continue
                    stat_result = candidate.stat()
                    if not candidate.is_file():
                        continue
                except OSError as exc:
                    raise InventoryError(f"FILE_STAT_FAILED:{candidate}:{exc}") from exc

                try:
                    relative = candidate.relative_to(root).as_posix()
                except ValueError as exc:
                    raise InventoryError(f"RELATIVE_PATH_ESCAPE_DETECTED:{candidate}") from exc

                found.append(
                    {
                        "relative_path": relative,
                        "file_name": candidate.name,
                        "size_bytes": stat_result.st_size,
                    }
                )
    except InventoryError:
        raise
    except OSError as exc:
        raise InventoryError(f"DIRECTORY_TRAVERSAL_FAILED:{root}:{exc}") from exc

    found.sort(key=lambda entry: _path_sort_key(entry["relative_path"]))
    return [
        {
            "processing_order": index,
            **entry,
        }
        for index, entry in enumerate(found, start=1)
    ]


def build_inventory(selected_folder: str | os.PathLike[str]) -> dict[str, Any]:
    """Build the complete inventory document for a selected folder."""

    root = Path(selected_folder).resolve(strict=True)
    entries = discover_pdf_files(root)
    inventory_sha256 = hashlib.sha256(_canonical_inventory_bytes(entries)).hexdigest()
    return {
        "schema_version": SCHEMA_VERSION,
        "selected_folder": str(root),
        "ordering_rule": "NFC_CASEFOLD_RELATIVE_PATH_THEN_ORIGINAL_UTF8_BYTES",
        "recursive": True,
        "pdf_extension_case_sensitive": False,
        "symlinks_followed": False,
        "pdf_count": len(entries),
        "inventory_sha256": inventory_sha256,
        "files": entries,
    }


def write_inventory_json(
    inventory: dict[str, Any], output_path: str | os.PathLike[str]
) -> Path:
    """Write inventory JSON atomically using UTF-8 and a trailing newline."""

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destination.with_name(destination.name + ".tmp")
    payload = json.dumps(inventory, ensure_ascii=False, indent=2) + "\n"
    try:
        temp_path.write_text(payload, encoding="utf-8", newline="\n")
        os.replace(temp_path, destination)
    except OSError as exc:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise InventoryError(f"INVENTORY_WRITE_FAILED:{destination}:{exc}") from exc
    return destination


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Recursively discover PDF files and emit deterministic JSON inventory."
    )
    parser.add_argument("selected_folder", help="Folder selected by the panel/user")
    parser.add_argument(
        "--output",
        help="Optional JSON output path. When omitted, JSON is written to stdout.",
    )
    parser.add_argument(
        "--compact", action="store_true", help="Emit compact JSON instead of indented JSON"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        inventory = build_inventory(args.selected_folder)
        if args.output:
            write_inventory_json(inventory, args.output)
        else:
            indent = None if args.compact else 2
            print(json.dumps(inventory, ensure_ascii=False, indent=indent))
        return 0
    except (InventoryError, FileNotFoundError, OSError) as exc:
        print(f"PDF_INVENTORY_ERROR:{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
