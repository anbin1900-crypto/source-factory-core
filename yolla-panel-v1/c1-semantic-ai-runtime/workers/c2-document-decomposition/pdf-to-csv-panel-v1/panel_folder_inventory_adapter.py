#!/usr/bin/env python3
"""Panel input adapter for folder or single-PDF preprocessing selection.

Both input modes are normalized to the existing ``PDF_FOLDER_INVENTORY_V1``
shape so downstream extraction/chunk/CSV code does not need a second pipeline.
No semantic analysis, GPT call, or database write is performed here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from pdf_folder_inventory import InventoryError, build_inventory

SCHEMA_VERSION = "PANEL_PDF_SELECTION_INVENTORY_ADAPTER_V2"
CYCLE1_POINTER_BLOB = "ba27ebb810d29b989a6677930b13b04cd7e23daf"
CYCLE1_INVENTORY_SCHEMA = "PDF_FOLDER_INVENTORY_V1"


class FolderSelectionAdapterError(RuntimeError):
    pass


def _validate_selected_directory(
    selected_path: str | os.PathLike[str], *, role: str
) -> Path:
    if selected_path is None or not str(selected_path).strip():
        raise FolderSelectionAdapterError(f"{role}_FOLDER_REQUIRED")
    path = Path(selected_path)
    try:
        path.lstat()
    except FileNotFoundError as exc:
        raise FolderSelectionAdapterError(f"{role}_FOLDER_NOT_FOUND:{path}") from exc
    except OSError as exc:
        raise FolderSelectionAdapterError(
            f"{role}_FOLDER_STAT_FAILED:{path}:{exc}"
        ) from exc
    if path.is_symlink():
        raise FolderSelectionAdapterError(f"{role}_FOLDER_SYMLINK_FORBIDDEN:{path}")
    if not path.is_dir():
        raise FolderSelectionAdapterError(f"{role}_FOLDER_NOT_DIRECTORY:{path}")
    try:
        return path.resolve(strict=True)
    except OSError as exc:
        raise FolderSelectionAdapterError(
            f"{role}_FOLDER_RESOLVE_FAILED:{path}:{exc}"
        ) from exc


def _validate_selected_pdf(selected_path: str | os.PathLike[str]) -> Path:
    if selected_path is None or not str(selected_path).strip():
        raise FolderSelectionAdapterError("PDF_FILE_REQUIRED")
    path = Path(selected_path)
    try:
        path.lstat()
    except FileNotFoundError as exc:
        raise FolderSelectionAdapterError(f"PDF_FILE_NOT_FOUND:{path}") from exc
    except OSError as exc:
        raise FolderSelectionAdapterError(f"PDF_FILE_STAT_FAILED:{path}:{exc}") from exc
    if path.is_symlink():
        raise FolderSelectionAdapterError(f"PDF_FILE_SYMLINK_FORBIDDEN:{path}")
    if not path.is_file():
        raise FolderSelectionAdapterError(f"PDF_FILE_NOT_FILE:{path}")
    if path.suffix.casefold() != ".pdf":
        raise FolderSelectionAdapterError(f"PDF_FILE_EXTENSION_INVALID:{path}")
    try:
        return path.resolve(strict=True)
    except OSError as exc:
        raise FolderSelectionAdapterError(f"PDF_FILE_RESOLVE_FAILED:{path}:{exc}") from exc


def _verify_output_writable(output_folder: Path) -> None:
    probe_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=".c2-pdf-to-csv-write-probe-",
            suffix=".tmp",
            dir=output_folder,
            delete=False,
        ) as probe:
            probe_path = Path(probe.name)
            probe.flush()
            os.fsync(probe.fileno())
        probe_path.unlink()
    except OSError as exc:
        if probe_path is not None:
            try:
                probe_path.unlink(missing_ok=True)
            except OSError:
                pass
        raise FolderSelectionAdapterError(
            f"OUTPUT_FOLDER_NOT_WRITABLE:{output_folder}:{exc}"
        ) from exc


def _inventory_digest(files: list[dict[str, Any]]) -> str:
    payload = json.dumps(
        files,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _single_pdf_inventory(pdf_file: Path) -> dict[str, Any]:
    """Normalize one explicitly selected PDF to the existing inventory schema."""
    root = pdf_file.parent.resolve(strict=True)
    entry = {
        "processing_order": 1,
        "relative_path": pdf_file.name,
        "file_name": pdf_file.name,
        "size_bytes": pdf_file.stat().st_size,
    }
    files = [entry]
    return {
        "schema_version": CYCLE1_INVENTORY_SCHEMA,
        "selected_folder": str(root),
        "ordering_rule": "EXPLICIT_SINGLE_PDF_SELECTION",
        "recursive": False,
        "pdf_extension_case_sensitive": False,
        "symlinks_followed": False,
        "pdf_count": 1,
        "inventory_sha256": _inventory_digest(files),
        "files": files,
    }


def _validate_cycle1_inventory(
    inventory: dict[str, Any], source_folder: Path
) -> None:
    if not isinstance(inventory, dict):
        raise FolderSelectionAdapterError("CYCLE1_INVENTORY_NOT_OBJECT")
    if inventory.get("schema_version") != CYCLE1_INVENTORY_SCHEMA:
        raise FolderSelectionAdapterError("CYCLE1_INVENTORY_SCHEMA_MISMATCH")
    if inventory.get("selected_folder") != str(source_folder):
        raise FolderSelectionAdapterError("CYCLE1_INVENTORY_SOURCE_FOLDER_MISMATCH")
    files = inventory.get("files")
    if not isinstance(files, list):
        raise FolderSelectionAdapterError("CYCLE1_INVENTORY_FILES_NOT_ARRAY")
    if inventory.get("pdf_count") != len(files):
        raise FolderSelectionAdapterError("CYCLE1_INVENTORY_COUNT_MISMATCH")
    digest = inventory.get("inventory_sha256")
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(ch not in "0123456789abcdef" for ch in digest)
    ):
        raise FolderSelectionAdapterError("CYCLE1_INVENTORY_HASH_INVALID")
    if digest != _inventory_digest(files):
        raise FolderSelectionAdapterError("CYCLE1_INVENTORY_HASH_MISMATCH")
    for expected, item in enumerate(files, 1):
        if not isinstance(item, dict):
            raise FolderSelectionAdapterError("CYCLE1_INVENTORY_ENTRY_NOT_OBJECT")
        if item.get("processing_order") != expected:
            raise FolderSelectionAdapterError("CYCLE1_PROCESSING_ORDER_INVALID")
        rel = item.get("relative_path")
        if (
            not isinstance(rel, str)
            or not rel
            or Path(rel).is_absolute()
            or rel.startswith("../")
            or "/../" in rel
            or "\\" in rel
        ):
            raise FolderSelectionAdapterError("CYCLE1_RELATIVE_PATH_INVALID")
        if not isinstance(item.get("file_name"), str) or not item["file_name"]:
            raise FolderSelectionAdapterError("CYCLE1_FILE_NAME_INVALID")
        size = item.get("size_bytes")
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise FolderSelectionAdapterError("CYCLE1_SIZE_BYTES_INVALID")


def adapt_selection(
    output_folder,
    *,
    source_folder=None,
    pdf_file=None,
    verify_output_writable: bool = True,
) -> dict[str, Any]:
    """Accept exactly one source mode and normalize it to one downstream contract."""
    folder_given = source_folder is not None and bool(str(source_folder).strip())
    pdf_given = pdf_file is not None and bool(str(pdf_file).strip())
    if folder_given == pdf_given:
        raise FolderSelectionAdapterError(
            "EXACTLY_ONE_SOURCE_MODE_REQUIRED:FOLDER_OR_SINGLE_PDF"
        )

    output = _validate_selected_directory(output_folder, role="OUTPUT")
    if verify_output_writable:
        _verify_output_writable(output)

    if folder_given:
        source = _validate_selected_directory(source_folder, role="SOURCE")
        if os.path.normcase(str(source)) == os.path.normcase(str(output)):
            raise FolderSelectionAdapterError("SOURCE_OUTPUT_FOLDER_COLLISION")
        try:
            inventory = build_inventory(source)
        except (InventoryError, FileNotFoundError, OSError) as exc:
            raise FolderSelectionAdapterError(f"CYCLE1_INVENTORY_FAILED:{exc}") from exc
        mode = "FOLDER"
        selected_pdf = None
    else:
        selected = _validate_selected_pdf(pdf_file)
        source = selected.parent.resolve(strict=True)
        inventory = _single_pdf_inventory(selected)
        mode = "SINGLE_PDF"
        selected_pdf = str(selected)

    _validate_cycle1_inventory(inventory, source)
    count = inventory["pdf_count"]
    return {
        "schema_version": SCHEMA_VERSION,
        "selection_mode": mode,
        "source_folder": str(source),
        "selected_pdf_file": selected_pdf,
        "output_folder": str(output),
        "source_output_distinct": (
            os.path.normcase(str(source)) != os.path.normcase(str(output))
        ),
        "output_write_probe": "PASS" if verify_output_writable else "SKIPPED_BY_CALLER",
        "cycle1_pointer_blob": CYCLE1_POINTER_BLOB,
        "inventory": inventory,
        "pdf_count": count,
        "selection_status": "READY" if count > 0 else "NO_PDF_FILES",
        "ready_for_processing": count > 0,
        "semantic_analysis_performed": False,
        "gpt_call_performed": False,
    }


def adapt_folder_selection(
    source_folder,
    output_folder,
    *,
    verify_output_writable: bool = True,
) -> dict[str, Any]:
    """Backward-compatible folder selection entry point."""
    return adapt_selection(
        output_folder,
        source_folder=source_folder,
        verify_output_writable=verify_output_writable,
    )


def adapt_pdf_file_selection(
    pdf_file,
    output_folder,
    *,
    verify_output_writable: bool = True,
) -> dict[str, Any]:
    """Explicit single-PDF entry point used by the standalone panel."""
    return adapt_selection(
        output_folder,
        pdf_file=pdf_file,
        verify_output_writable=verify_output_writable,
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Normalize a selected folder or one PDF into deterministic PDF inventory."
    )
    parser.add_argument("source_path")
    parser.add_argument("output_folder")
    parser.add_argument(
        "--single-pdf",
        action="store_true",
        help="Treat source_path as one explicitly selected PDF instead of a folder.",
    )
    parser.add_argument("--skip-output-write-probe", action="store_true")
    parser.add_argument("--compact", action="store_true")
    return parser


def main(argv=None):
    args = _parser().parse_args(argv)
    try:
        if args.single_pdf:
            result = adapt_pdf_file_selection(
                args.source_path,
                args.output_folder,
                verify_output_writable=not args.skip_output_write_probe,
            )
        else:
            result = adapt_folder_selection(
                args.source_path,
                args.output_folder,
                verify_output_writable=not args.skip_output_write_probe,
            )
        print(json.dumps(result, ensure_ascii=False, indent=None if args.compact else 2))
        return 0
    except FolderSelectionAdapterError as exc:
        print(f"PDF_SELECTION_ADAPTER_ERROR:{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
