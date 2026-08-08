from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any, Iterable

UTF8_SIG = b"\xef\xbb\xbf"
REQUIRED_COLUMNS = (
    "source_file",
    "source_path",
    "chunk_no",
    "page_start",
    "page_end",
    "text",
)


class CorrectionE2EValidationError(RuntimeError):
    pass


def _read_csv(path: Path) -> list[dict[str, str]]:
    payload = path.read_bytes()
    if not payload.startswith(UTF8_SIG):
        raise CorrectionE2EValidationError(f"UTF8_SIG_MISSING:{path}")
    try:
        text = payload.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CorrectionE2EValidationError(f"UTF8_DECODE_FAILED:{path}:{exc}") from exc
    reader = csv.DictReader(io.StringIO(text, newline=""))
    columns = tuple(reader.fieldnames or ())
    missing = [column for column in REQUIRED_COLUMNS if column not in columns]
    if missing:
        raise CorrectionE2EValidationError(
            f"REQUIRED_COLUMNS_MISSING:{path}:{','.join(missing)}"
        )
    return [dict(row) for row in reader]


def _validate_source_csvs(source: dict[str, Any]) -> tuple[int, int]:
    files = source.get("files")
    if not isinstance(files, list) or not files:
        raise CorrectionE2EValidationError("SOURCE_CSV_FILES_MISSING")

    rows: list[dict[str, str]] = []
    for item in files:
        path = Path(str(item.get("path", "")))
        if not path.is_file():
            raise CorrectionE2EValidationError(f"CSV_NOT_FOUND:{path}")
        rows.extend(_read_csv(path))

    chunk_numbers = [int(row["chunk_no"]) for row in rows]
    if chunk_numbers != list(range(1, len(rows) + 1)):
        raise CorrectionE2EValidationError(
            f"CHUNK_CONTINUITY_FAILED:{chunk_numbers}"
        )

    starts = [int(row["page_start"]) for row in rows]
    ends = [int(row["page_end"]) for row in rows]
    if starts != sorted(starts) or ends != sorted(ends):
        raise CorrectionE2EValidationError("PAGE_ORDER_FAILED")
    if any(start > end for start, end in zip(starts, ends)):
        raise CorrectionE2EValidationError("PAGE_RANGE_FAILED")
    if any(not row["text"].strip() for row in rows):
        raise CorrectionE2EValidationError("EMPTY_CSV_TEXT")
    return len(files), len(rows)


def validate_result(
    result: dict[str, Any],
    *,
    expected_mode: str,
    expected_source_files: Iterable[str],
    selected_pdf: str | None = None,
) -> dict[str, Any]:
    if not isinstance(result, dict) or result.get("status") != "PASS":
        raise CorrectionE2EValidationError("PIPELINE_RESULT_NOT_PASS")

    mode = result.get("input_mode", result.get("selection_mode"))
    if mode != expected_mode:
        raise CorrectionE2EValidationError(
            f"INPUT_MODE_MISMATCH:{mode}:{expected_mode}"
        )

    expected = list(expected_source_files)
    sources = result.get("sources")
    if not isinstance(sources, list):
        raise CorrectionE2EValidationError("SOURCES_NOT_ARRAY")
    actual = [str(source.get("source_file", "")) for source in sources]
    if actual != expected:
        raise CorrectionE2EValidationError(
            f"SOURCE_SET_MISMATCH:{actual}:{expected}"
        )
    if result.get("pdf_count") != len(expected):
        raise CorrectionE2EValidationError("PDF_COUNT_MISMATCH")

    if expected_mode == "PDF_FILE":
        if len(sources) != 1:
            raise CorrectionE2EValidationError("SINGLE_PDF_INPUT_COUNT_NOT_ONE")
        selected = result.get("selected_pdf", result.get("selected_pdf_file"))
        if selected_pdf is not None and str(selected) != str(selected_pdf):
            raise CorrectionE2EValidationError("SELECTED_PDF_MISMATCH")

    csv_file_count = 0
    csv_row_count = 0
    for source in sources:
        file_count, row_count = _validate_source_csvs(source)
        csv_file_count += file_count
        csv_row_count += row_count

    events = result.get("events")
    if events is not None:
        if not isinstance(events, list) or not events:
            raise CorrectionE2EValidationError("EVENTS_INVALID")
        stages = [event.get("stage") for event in events if isinstance(event, dict)]
        if "SELECTION_START" not in stages or "COMPLETE" not in stages:
            raise CorrectionE2EValidationError("PROGRESS_EVENT_CHAIN_INCOMPLETE")

    return {
        "status": "PASS",
        "input_mode": expected_mode,
        "source_count": len(sources),
        "csv_file_count": csv_file_count,
        "csv_row_count": csv_row_count,
        "utf8_sig": "PASS",
        "required_columns": "PASS",
        "chunk_continuity": "PASS",
        "page_order": "PASS",
        "error_event_contract": "PASS" if events is not None else "NOT_ASSERTED",
        "semantic_validation": False,
        "gpt_call": False,
        "database_write": False,
    }
