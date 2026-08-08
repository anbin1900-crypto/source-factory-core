#!/usr/bin/env python3
"""One-shot PDF preprocessing pipeline: folder or one PDF -> small CSV chunks."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
WORKERS = HERE.parents[1]
C2 = WORKERS / "c2-document-decomposition" / "pdf-to-csv-panel-v1"
C3 = WORKERS / "c3-field-mapping-rules" / "pdf-to-csv-panel-v1"
C5 = WORKERS / "c5-domain-ai-seat-runtime" / "pdf-to-csv-panel-v1"
for path in (C2, C3, C5, HERE):
    text = str(path)
    if text not in sys.path:
        sys.path.insert(0, text)

from panel_folder_inventory_adapter import adapt_input_selection
from pdf_extraction_runtime_adapter import run_inventory_extraction
from text_chunk_csv_writer import chunk_pages, write_chunks
from output_path_policy import build_source_output_plan, plan_chunk_outputs


class PipelineError(RuntimeError):
    def __init__(self, code: str, stage: str, message: str | None = None, **details: Any):
        self.code = code
        self.stage = stage
        self.details = details
        super().__init__(message or code)

    def to_record(self) -> dict[str, Any]:
        return {
            "error_code": self.code,
            "error_stage": self.stage,
            "message": str(self),
            "details": self.details,
        }


def _adapt_selection(*, output_folder: str, source_folder: str | None, pdf_file: str | None) -> dict[str, Any]:
    if bool(source_folder) == bool(pdf_file):
        raise PipelineError("EXACTLY_ONE_SOURCE_MODE_REQUIRED", "INPUT")
    if source_folder:
        return adapt_input_selection("FOLDER", source_folder, output_folder)
    return adapt_input_selection("PDF_FILE", pdf_file, output_folder)


def _page_records(extraction: dict[str, Any], relative_path: str) -> list[dict[str, Any]]:
    records = extraction.get("records")
    if not isinstance(records, list) or not records:
        raise PipelineError("EXTRACTION_RECORDS_MISSING", "CHUNK", relative_path)
    pages: list[dict[str, Any]] = []
    for expected, row in enumerate(records, start=1):
        if not isinstance(row, dict):
            raise PipelineError("PAGE_RECORD_INVALID", "CHUNK", relative_path, expected_page=expected)
        page_no = row.get("page_no")
        text = row.get("text")
        if page_no != expected:
            raise PipelineError(
                "PAGE_ORDER_INVALID",
                "CHUNK",
                f"{relative_path}: expected page {expected}, got {page_no}",
                expected_page=expected,
                actual_page=page_no,
            )
        if not isinstance(text, str):
            raise PipelineError("PAGE_TEXT_INVALID", "CHUNK", relative_path, page_no=page_no)
        pages.append({"page_no": page_no, "text": text})
    if extraction.get("page_count") != len(pages):
        raise PipelineError(
            "PAGE_COUNT_MISMATCH",
            "CHUNK",
            relative_path,
            declared_page_count=extraction.get("page_count"),
            actual_page_count=len(pages),
        )
    return pages


def run_pipeline(
    *,
    output_folder: str,
    source_folder: str | None = None,
    pdf_file: str | None = None,
    max_chars: int = 12000,
    progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    events: list[dict[str, Any]] = []
    sequence = 0

    def emit(stage: str, **payload: Any) -> None:
        nonlocal sequence
        sequence += 1
        event = {"sequence": sequence, "stage": stage, **payload}
        events.append(event)
        if progress is not None:
            progress(dict(event))

    try:
        if not isinstance(max_chars, int) or isinstance(max_chars, bool) or max_chars < 1:
            raise PipelineError("MAX_CHARS_INVALID", "INPUT")

        emit("SELECTION_START")
        selection = _adapt_selection(
            output_folder=output_folder,
            source_folder=source_folder,
            pdf_file=pdf_file,
        )
        if not isinstance(selection, dict):
            raise PipelineError("SELECTION_RESULT_INVALID", "SELECTION")
        if not selection.get("ready_for_processing"):
            raise PipelineError("NO_PDF_FILES", "SELECTION")
        inventory = selection.get("inventory")
        if not isinstance(inventory, dict):
            raise PipelineError("INVENTORY_MISSING", "SELECTION")
        input_mode = selection.get("input_mode")
        if input_mode not in {"FOLDER", "PDF_FILE"}:
            raise PipelineError("SELECTION_MODE_INVALID", "SELECTION", actual_mode=input_mode)
        emit("SELECTION_READY", input_mode=input_mode, pdf_count=selection.get("pdf_count", 0))

        emit("EXTRACTION_START", pdf_count=selection.get("pdf_count", 0))
        extraction = run_inventory_extraction(inventory)
        if not isinstance(extraction, dict):
            raise PipelineError("EXTRACTION_RESULT_INVALID", "EXTRACTION")
        failed_count = extraction.get("failed_file_count")
        if not isinstance(failed_count, int):
            raise PipelineError("EXTRACTION_FAILED_COUNT_INVALID", "EXTRACTION")
        if failed_count:
            first_error = next(
                (item.get("error") for item in extraction.get("files", []) if item.get("status") == "ERROR"),
                None,
            )
            raise PipelineError(
                "EXTRACTION_FAILED",
                "EXTRACTION",
                f"{failed_count} source file(s) failed extraction",
                failed_file_count=failed_count,
                first_error=first_error,
            )
        files = extraction.get("files")
        if not isinstance(files, list) or not files:
            raise PipelineError("EXTRACTION_FILES_EMPTY", "EXTRACTION")
        emit("EXTRACTION_READY", passed_file_count=len(files))

        output_root = Path(selection["output_folder"])
        source_results: list[dict[str, Any]] = []
        total_chunks = 0

        for file_result in files:
            if not isinstance(file_result, dict):
                raise PipelineError("SOURCE_RESULT_INVALID", "SOURCE")
            if file_result.get("status") != "PASS" or not isinstance(file_result.get("extraction"), dict):
                raise PipelineError("SOURCE_NOT_EXTRACTED", "SOURCE", str(file_result.get("relative_path")))

            source_no = file_result.get("processing_order")
            if not isinstance(source_no, int) or isinstance(source_no, bool) or source_no < 1:
                raise PipelineError("SOURCE_ORDER_INVALID", "SOURCE")
            relative_path = str(file_result.get("relative_path") or "")
            if not relative_path:
                raise PipelineError("SOURCE_RELATIVE_PATH_MISSING", "SOURCE")
            emit("SOURCE_START", processing_order=source_no, relative_path=relative_path)

            source_plan = build_source_output_plan(relative_path, source_no)
            pages = _page_records(file_result["extraction"], relative_path)
            chunks = chunk_pages(
                pages,
                source_file=file_result["file_name"],
                source_path=file_result["source_path"],
                max_chars=max_chars,
            )
            if not chunks:
                raise PipelineError("CHUNK_RESULT_EMPTY", "CHUNK", relative_path)
            if any(len(chunk.text) > max_chars for chunk in chunks):
                raise PipelineError("CHUNK_LIMIT_EXCEEDED", "CHUNK", relative_path)

            chunk_plans = plan_chunk_outputs(
                source_plan,
                [(c.chunk_no, c.page_start, c.page_end) for c in chunks],
            )
            by_no = {plan.chunk_no: plan for plan in chunk_plans}
            if len(by_no) != len(chunks):
                raise PipelineError("CHUNK_NAMING_PLAN_MISMATCH", "OUTPUT", relative_path)
            target_dir = output_root / Path(source_plan.output_relative_dir)
            written = write_chunks(
                chunks,
                output_dir=target_dir,
                filename_factory=lambda chunk, plans=by_no: plans[chunk.chunk_no].csv_filename,
            )
            if not isinstance(written, list) or len(written) != len(chunks):
                raise PipelineError("CSV_WRITE_COUNT_MISMATCH", "OUTPUT", relative_path)
            if any(item.get("encoding") != "UTF-8-SIG" for item in written):
                raise PipelineError("CSV_ENCODING_MISMATCH", "OUTPUT", relative_path)

            total_chunks += len(written)
            source_results.append(
                {
                    "processing_order": source_no,
                    "source_file": file_result["file_name"],
                    "source_path": file_result["source_path"],
                    "relative_path": relative_path,
                    "page_count": file_result["extraction"]["page_count"],
                    "chunk_count": len(written),
                    "output_relative_dir": source_plan.output_relative_dir,
                    "files": written,
                }
            )
            emit(
                "SOURCE_COMPLETE",
                processing_order=source_no,
                source_file=file_result["file_name"],
                chunk_count=len(written),
            )

        emit("COMPLETE", pdf_count=len(source_results), chunk_count=total_chunks)
        return {
            "schema_version": "PDF_TO_CSV_PIPELINE_RESULT_V2",
            "status": "PASS",
            "input_mode": selection["input_mode"],
            "selection_mode": selection["input_mode"],
            "source_folder": selection["source_folder"],
            "selected_pdf": selection.get("selected_pdf"),
            "selected_pdf_file": selection.get("selected_pdf"),
            "output_folder": selection["output_folder"],
            "max_chars": max_chars,
            "pdf_count": len(source_results),
            "chunk_count": total_chunks,
            "sources": source_results,
            "events": events,
            "semantic_analysis": False,
            "gpt_call": False,
            "database_write": False,
        }
    except PipelineError as exc:
        emit(
            "ERROR",
            error_stage=exc.stage,
            error_code=exc.code,
            message=str(exc),
            details=exc.details,
        )
        exc.details = {**exc.details, "events": list(events)}
        raise
    except Exception as exc:
        wrapped = PipelineError(
            "PIPELINE_UNEXPECTED_ERROR",
            "PIPELINE",
            str(exc),
            exception_type=type(exc).__name__,
        )
        emit(
            "ERROR",
            error_stage=wrapped.stage,
            error_code=wrapped.code,
            message=str(wrapped),
            details=wrapped.details,
        )
        wrapped.details = {**wrapped.details, "events": list(events)}
        raise wrapped from exc


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--source-folder")
    source.add_argument("--pdf-file")
    parser.add_argument("--output-folder", required=True)
    parser.add_argument("--max-chars", type=int, default=12000)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args(argv)
    try:
        result = run_pipeline(
            source_folder=args.source_folder,
            pdf_file=args.pdf_file,
            output_folder=args.output_folder,
            max_chars=args.max_chars,
        )
    except PipelineError as exc:
        payload = {
            "status": "ERROR",
            "error": exc.to_record(),
            "events": exc.details.get("events", []),
        }
        print(json.dumps(payload, ensure_ascii=False, indent=None if args.compact else 2), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=None if args.compact else 2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
