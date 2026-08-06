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
    pass


def _adapt_selection(
    *,
    output_folder: str,
    source_folder: str | None,
    pdf_file: str | None,
) -> dict[str, Any]:
    if bool(source_folder) == bool(pdf_file):
        raise PipelineError("EXACTLY_ONE_SOURCE_MODE_REQUIRED")
    if source_folder:
        return adapt_input_selection("FOLDER", source_folder, output_folder)
    return adapt_input_selection("PDF_FILE", pdf_file, output_folder)


def run_pipeline(
    *,
    output_folder: str,
    source_folder: str | None = None,
    pdf_file: str | None = None,
    max_chars: int = 12000,
    progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    if not isinstance(max_chars, int) or isinstance(max_chars, bool) or max_chars < 1:
        raise PipelineError("MAX_CHARS_INVALID")

    emit = progress or (lambda event: None)
    emit({"stage": "SELECTION_START"})
    selection = _adapt_selection(
        output_folder=output_folder,
        source_folder=source_folder,
        pdf_file=pdf_file,
    )
    if not selection["ready_for_processing"]:
        raise PipelineError("NO_PDF_FILES")

    emit({"stage": "EXTRACTION_START", "pdf_count": selection["pdf_count"]})
    extraction = run_inventory_extraction(selection["inventory"])
    if extraction["failed_file_count"]:
        first_error = next(
            (item.get("error") for item in extraction["files"] if item["status"] == "ERROR"),
            None,
        )
        raise PipelineError(
            f"EXTRACTION_FAILED:{extraction['failed_file_count']}:{first_error}"
        )

    output_root = Path(selection["output_folder"])
    source_results: list[dict[str, Any]] = []
    total_chunks = 0

    for file_result in extraction["files"]:
        if file_result["status"] != "PASS" or not file_result["extraction"]:
            raise PipelineError(f"SOURCE_NOT_EXTRACTED:{file_result['relative_path']}")

        source_no = int(file_result["processing_order"])
        relative_path = str(file_result["relative_path"])
        source_plan = build_source_output_plan(relative_path, source_no)
        pages = [
            {"page_no": row["page_no"], "text": row["text"]}
            for row in file_result["extraction"]["records"]
        ]
        chunks = chunk_pages(
            pages,
            source_file=file_result["file_name"],
            source_path=file_result["source_path"],
            max_chars=max_chars,
        )
        chunk_plans = plan_chunk_outputs(
            source_plan,
            [(c.chunk_no, c.page_start, c.page_end) for c in chunks],
        )
        by_no = {plan.chunk_no: plan for plan in chunk_plans}
        target_dir = output_root / Path(source_plan.output_relative_dir)
        written = write_chunks(
            chunks,
            output_dir=target_dir,
            filename_factory=lambda chunk, plans=by_no: plans[chunk.chunk_no].csv_filename,
        )
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
            {
                "stage": "SOURCE_COMPLETE",
                "processing_order": source_no,
                "source_file": file_result["file_name"],
                "chunk_count": len(written),
            }
        )

    result = {
        "schema_version": "PDF_TO_CSV_PIPELINE_RESULT_V2",
        "status": "PASS",
        "selection_mode": selection["input_mode"],
        "source_folder": selection["source_folder"],
        "selected_pdf_file": selection.get("selected_pdf"),
        "output_folder": selection["output_folder"],
        "max_chars": max_chars,
        "pdf_count": len(source_results),
        "chunk_count": total_chunks,
        "sources": source_results,
        "semantic_analysis": False,
        "gpt_call": False,
        "database_write": False,
    }
    emit({"stage": "COMPLETE", "pdf_count": len(source_results), "chunk_count": total_chunks})
    return result


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
    except Exception as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=None if args.compact else 2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
