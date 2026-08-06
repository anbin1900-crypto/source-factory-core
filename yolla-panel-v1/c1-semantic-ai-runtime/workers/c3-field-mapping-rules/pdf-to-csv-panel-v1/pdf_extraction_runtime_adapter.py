from __future__ import annotations

from dataclasses import asdict, dataclass
from importlib.util import find_spec
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
import hashlib
import json
import shutil

from pdf_text_extractor import Config as ExtractionConfig
from pdf_text_extractor import ExtractionError, TesseractOCR, extract_pdf


class RuntimeAdapterError(RuntimeError):
    def __init__(self, code: str, message: str, processing_order: int | None = None):
        super().__init__(message)
        self.code = code
        self.processing_order = processing_order


@dataclass(frozen=True)
class RuntimeAdapterConfig:
    verify_file_exists: bool = True
    verify_size_bytes: bool = True
    continue_on_file_error: bool = True
    require_ocr_runtime_at_start: bool = False

    def validate(self) -> None:
        for field_name in (
            "verify_file_exists",
            "verify_size_bytes",
            "continue_on_file_error",
            "require_ocr_runtime_at_start",
        ):
            if not isinstance(getattr(self, field_name), bool):
                raise ValueError(field_name)


def _module_available(name: str, finder: Callable[[str], Any] = find_spec) -> bool:
    try:
        return finder(name) is not None
    except (ImportError, AttributeError, ValueError):
        return False


def dependency_doctor(
    *,
    finder: Callable[[str], Any] = find_spec,
    which: Callable[[str], str | None] = shutil.which,
) -> dict[str, Any]:
    pymupdf = _module_available("fitz", finder)
    pillow = _module_available("PIL", finder)
    pytesseract = _module_available("pytesseract", finder)
    tesseract_path = which("tesseract")
    ocr_ready = bool(pymupdf and pillow and pytesseract and tesseract_path)
    direct_text_ready = pymupdf
    if ocr_ready:
        status = "READY_DIRECT_TEXT_AND_OCR"
    elif direct_text_ready:
        status = "READY_DIRECT_TEXT_ONLY_OCR_UNAVAILABLE"
    else:
        status = "BLOCKED_PYMUPDF_UNAVAILABLE"
    return {
        "schema_version": "PDF_EXTRACTION_DEPENDENCY_DOCTOR_V1",
        "status": status,
        "pymupdf_available": pymupdf,
        "pillow_available": pillow,
        "pytesseract_available": pytesseract,
        "tesseract_executable_available": bool(tesseract_path),
        "tesseract_executable_path": tesseract_path,
        "direct_text_ready": direct_text_ready,
        "ocr_ready": ocr_ready,
        "semantic_analysis_count": 0,
        "gpt_call_count": 0,
    }


def _canonical_files_sha256(files: Sequence[Mapping[str, Any]]) -> str:
    payload = json.dumps(
        list(files),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def validate_inventory(inventory: Mapping[str, Any]) -> tuple[Path, list[dict[str, Any]]]:
    if not isinstance(inventory, Mapping):
        raise RuntimeAdapterError("INVENTORY_NOT_OBJECT", "inventory must be an object")
    if inventory.get("schema_version") != "PDF_FOLDER_INVENTORY_V1":
        raise RuntimeAdapterError(
            "INVENTORY_SCHEMA_UNSUPPORTED",
            "schema_version must be PDF_FOLDER_INVENTORY_V1",
        )
    selected_folder = inventory.get("selected_folder")
    if not isinstance(selected_folder, str) or not selected_folder.strip():
        raise RuntimeAdapterError(
            "SELECTED_FOLDER_INVALID", "selected_folder must be a non-empty string"
        )
    files = inventory.get("files")
    if not isinstance(files, list):
        raise RuntimeAdapterError("INVENTORY_FILES_NOT_ARRAY", "files must be an array")

    normalized: list[dict[str, Any]] = []
    for index, raw in enumerate(files, start=1):
        if not isinstance(raw, Mapping):
            raise RuntimeAdapterError(
                "INVENTORY_RECORD_NOT_OBJECT",
                f"inventory record {index} must be an object",
                index,
            )
        missing = [
            field
            for field in ("processing_order", "relative_path", "file_name", "size_bytes")
            if field not in raw
        ]
        if missing:
            raise RuntimeAdapterError(
                "INVENTORY_RECORD_FIELD_MISSING",
                f"record {index} missing {','.join(missing)}",
                index,
            )
        order = raw["processing_order"]
        if type(order) is not int or order != index:
            raise RuntimeAdapterError(
                "PROCESSING_ORDER_NOT_CONTIGUOUS",
                f"expected processing_order {index}",
                index,
            )
        relative_path = raw["relative_path"]
        file_name = raw["file_name"]
        size_bytes = raw["size_bytes"]
        if not isinstance(relative_path, str) or not relative_path:
            raise RuntimeAdapterError(
                "RELATIVE_PATH_INVALID", f"record {index}", index
            )
        rel = Path(relative_path.replace("\\", "/"))
        if rel.is_absolute() or ".." in rel.parts:
            raise RuntimeAdapterError(
                "RELATIVE_PATH_ESCAPE_DETECTED", relative_path, index
            )
        if not isinstance(file_name, str) or file_name != rel.name:
            raise RuntimeAdapterError(
                "FILE_NAME_MISMATCH", f"record {index}", index
            )
        if rel.suffix.casefold() != ".pdf":
            raise RuntimeAdapterError(
                "INVENTORY_RECORD_NOT_PDF", relative_path, index
            )
        if type(size_bytes) is not int or size_bytes < 0:
            raise RuntimeAdapterError(
                "SIZE_BYTES_INVALID", f"record {index}", index
            )
        normalized.append(
            {
                "processing_order": order,
                "relative_path": rel.as_posix(),
                "file_name": file_name,
                "size_bytes": size_bytes,
            }
        )

    declared_count = inventory.get("pdf_count")
    if declared_count is not None and declared_count != len(normalized):
        raise RuntimeAdapterError(
            "PDF_COUNT_MISMATCH",
            f"declared {declared_count}, actual {len(normalized)}",
        )
    declared_hash = inventory.get("inventory_sha256")
    if declared_hash is not None:
        actual_hash = _canonical_files_sha256(normalized)
        if declared_hash != actual_hash:
            raise RuntimeAdapterError(
                "INVENTORY_SHA256_MISMATCH",
                f"declared {declared_hash}, actual {actual_hash}",
            )
    return Path(selected_folder), normalized


def _resolve_source_path(
    root: Path,
    record: Mapping[str, Any],
    cfg: RuntimeAdapterConfig,
) -> Path:
    candidate = root / str(record["relative_path"])
    root_resolved = root.resolve(strict=False)
    resolved = candidate.resolve(strict=False)
    try:
        resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise RuntimeAdapterError(
            "RELATIVE_PATH_ESCAPE_DETECTED",
            str(record["relative_path"]),
            int(record["processing_order"]),
        ) from exc

    if cfg.verify_file_exists:
        if not resolved.exists():
            raise RuntimeAdapterError(
                "INVENTORY_SOURCE_FILE_NOT_FOUND",
                str(resolved),
                int(record["processing_order"]),
            )
        if not resolved.is_file():
            raise RuntimeAdapterError(
                "INVENTORY_SOURCE_NOT_FILE",
                str(resolved),
                int(record["processing_order"]),
            )
    if cfg.verify_size_bytes and resolved.exists():
        actual_size = resolved.stat().st_size
        if actual_size != record["size_bytes"]:
            raise RuntimeAdapterError(
                "INVENTORY_SIZE_MISMATCH",
                f"{resolved}: expected {record['size_bytes']}, actual {actual_size}",
                int(record["processing_order"]),
            )
    return resolved


def _event(sequence: int, stage: str, **payload: Any) -> dict[str, Any]:
    return {"sequence": sequence, "stage": stage, **payload}


def run_inventory_extraction(
    inventory: Mapping[str, Any],
    *,
    adapter_config: RuntimeAdapterConfig | None = None,
    extraction_config: ExtractionConfig | None = None,
    doctor: Mapping[str, Any] | None = None,
    doctor_factory: Callable[[], Mapping[str, Any]] = dependency_doctor,
    extractor: Callable[..., Mapping[str, Any]] = extract_pdf,
    ocr_factory: Callable[[], Any] = TesseractOCR,
) -> dict[str, Any]:
    cfg = adapter_config or RuntimeAdapterConfig()
    cfg.validate()
    root, records = validate_inventory(inventory)
    runtime = dict(doctor if doctor is not None else doctor_factory())

    if not runtime.get("direct_text_ready"):
        raise RuntimeAdapterError(
            "PYMUPDF_RUNTIME_UNAVAILABLE",
            "PyMuPDF is required for PDF page access",
        )
    if cfg.require_ocr_runtime_at_start and not runtime.get("ocr_ready"):
        raise RuntimeAdapterError(
            "OCR_RUNTIME_UNAVAILABLE",
            "Pillow, pytesseract and the Tesseract executable are required",
        )

    ocr = ocr_factory() if runtime.get("ocr_ready") else None
    events: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    sequence = 1
    events.append(_event(sequence, "START", total_files=len(records)))
    sequence += 1

    for record in records:
        order = int(record["processing_order"])
        events.append(
            _event(
                sequence,
                "FILE_START",
                processing_order=order,
                relative_path=record["relative_path"],
            )
        )
        sequence += 1
        try:
            source_path = _resolve_source_path(root, record, cfg)
            extraction = dict(
                extractor(
                    source_path,
                    ocr=ocr,
                    config=extraction_config or ExtractionConfig(),
                )
            )
            files.append(
                {
                    **record,
                    "source_path": str(source_path),
                    "status": "PASS",
                    "error": None,
                    "extraction": extraction,
                }
            )
            events.append(
                _event(
                    sequence,
                    "FILE_PASS",
                    processing_order=order,
                    page_count=extraction.get("page_count", 0),
                    ocr_page_count=extraction.get("ocr_page_count", 0),
                )
            )
        except (ExtractionError, RuntimeAdapterError, OSError) as exc:
            code = getattr(exc, "code", "PDF_EXTRACTION_RUNTIME_ERROR")
            page_no = getattr(exc, "page_no", None)
            files.append(
                {
                    **record,
                    "source_path": str(root / record["relative_path"]),
                    "status": "ERROR",
                    "error": {
                        "code": code,
                        "message": str(exc),
                        "page_no": page_no,
                    },
                    "extraction": None,
                }
            )
            events.append(
                _event(
                    sequence,
                    "FILE_ERROR",
                    processing_order=order,
                    error_code=code,
                    page_no=page_no,
                )
            )
            if not cfg.continue_on_file_error:
                raise RuntimeAdapterError(code, str(exc), order) from exc
        sequence += 1

    passed = [item for item in files if item["status"] == "PASS"]
    failed = [item for item in files if item["status"] == "ERROR"]
    total_pages = sum(
        int(item["extraction"].get("page_count", 0))
        for item in passed
        if item["extraction"]
    )
    direct_pages = sum(
        int(item["extraction"].get("direct_text_page_count", 0))
        for item in passed
        if item["extraction"]
    )
    ocr_pages = sum(
        int(item["extraction"].get("ocr_page_count", 0))
        for item in passed
        if item["extraction"]
    )
    status = "PASS" if not failed else ("PARTIAL_FAILURE" if passed else "FAILURE")
    events.append(
        _event(
            sequence,
            "COMPLETE",
            status=status,
            passed_files=len(passed),
            failed_files=len(failed),
        )
    )
    return {
        "schema_version": "PDF_EXTRACTION_RUNTIME_RESULT_V1",
        "selected_folder": str(root),
        "inventory_sha256": inventory.get("inventory_sha256")
        or _canonical_files_sha256(records),
        "doctor": runtime,
        "adapter_config": asdict(cfg),
        "status": status,
        "inventory_file_count": len(records),
        "attempted_file_count": len(files),
        "passed_file_count": len(passed),
        "failed_file_count": len(failed),
        "total_page_count": total_pages,
        "direct_text_page_count": direct_pages,
        "ocr_page_count": ocr_pages,
        "files": files,
        "events": events,
        "source_order_preserved": [
            item["processing_order"] for item in files
        ] == list(range(1, len(files) + 1)),
        "semantic_analysis_count": 0,
        "gpt_call_count": 0,
        "database_write_count": 0,
        "original_pdf_mutation_count": 0,
    }


def run_panel_selection_extraction(
    selection: Mapping[str, Any],
    **kwargs: Any,
) -> dict[str, Any]:
    if not isinstance(selection, Mapping):
        raise RuntimeAdapterError(
            "PANEL_SELECTION_NOT_OBJECT", "panel selection must be an object"
        )
    if selection.get("schema_version") != "PANEL_FOLDER_SELECTION_INVENTORY_ADAPTER_V1":
        raise RuntimeAdapterError(
            "PANEL_SELECTION_SCHEMA_UNSUPPORTED",
            "schema_version must be PANEL_FOLDER_SELECTION_INVENTORY_ADAPTER_V1",
        )
    required = (
        "source_folder",
        "output_folder",
        "inventory",
        "pdf_count",
        "selection_status",
        "ready_for_processing",
    )
    missing = [field for field in required if field not in selection]
    if missing:
        raise RuntimeAdapterError(
            "PANEL_SELECTION_FIELD_MISSING", ",".join(missing)
        )
    inventory = selection["inventory"]
    if not isinstance(inventory, Mapping):
        raise RuntimeAdapterError(
            "PANEL_SELECTION_INVENTORY_INVALID", "inventory must be an object"
        )
    source_folder = Path(str(selection["source_folder"])).resolve(strict=False)
    inventory_folder = Path(str(inventory.get("selected_folder", ""))).resolve(
        strict=False
    )
    if source_folder != inventory_folder:
        raise RuntimeAdapterError(
            "PANEL_SELECTION_SOURCE_FOLDER_MISMATCH",
            f"source_folder={source_folder}, inventory.selected_folder={inventory_folder}",
        )
    if selection["pdf_count"] != inventory.get("pdf_count"):
        raise RuntimeAdapterError(
            "PANEL_SELECTION_PDF_COUNT_MISMATCH",
            f"selection={selection['pdf_count']}, inventory={inventory.get('pdf_count')}",
        )
    selection_status = selection["selection_status"]
    ready = selection["ready_for_processing"]
    if selection_status == "NO_PDF_FILES":
        if selection["pdf_count"] != 0 or ready is not False:
            raise RuntimeAdapterError(
                "PANEL_SELECTION_NO_PDF_STATE_INVALID",
                "NO_PDF_FILES requires pdf_count=0 and ready_for_processing=false",
            )
    elif selection_status == "READY":
        if ready is not True:
            raise RuntimeAdapterError(
                "PANEL_SELECTION_NOT_READY",
                "READY requires ready_for_processing=true",
            )
    else:
        raise RuntimeAdapterError(
            "PANEL_SELECTION_STATUS_UNSUPPORTED", str(selection_status)
        )

    result = run_inventory_extraction(inventory, **kwargs)
    if selection_status == "NO_PDF_FILES":
        result["status"] = "NO_PDF_FILES"
        result["events"][-1]["status"] = "NO_PDF_FILES"
    result["panel_selection_status"] = selection_status
    result["output_folder"] = str(selection["output_folder"])
    result["cycle1_pointer_blob"] = selection.get("cycle1_pointer_blob")
    return result
