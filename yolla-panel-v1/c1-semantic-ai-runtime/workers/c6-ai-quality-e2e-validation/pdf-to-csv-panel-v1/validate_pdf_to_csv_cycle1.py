from __future__ import annotations

import csv
import hashlib
import io
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, Mapping, Sequence

UTF8_BOM = b"\xef\xbb\xbf"
REQUIRED_COLUMNS = (
    "source_file",
    "source_path",
    "chunk_no",
    "page_start",
    "page_end",
    "text",
)


@dataclass(frozen=True)
class SourceExpectation:
    source_file: str
    source_path: str
    source_text_nonempty: bool

    @property
    def key(self) -> tuple[str, str]:
        return (self.source_file, self.source_path)


@dataclass(frozen=True)
class ValidationFinding:
    code: str
    message: str
    artifact: str | None = None
    row_number: int | None = None
    source_file: str | None = None
    source_path: str | None = None


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    findings: tuple[ValidationFinding, ...]
    artifact_count: int
    row_count: int
    source_count_expected: int
    source_count_covered: int
    nonempty_source_count_expected: int
    nonempty_source_count_covered: int
    canonical_sha256: str

    def to_dict(self) -> dict:
        result = asdict(self)
        result["findings"] = [asdict(item) for item in self.findings]
        return result


def _finding(code: str, message: str, **kwargs) -> ValidationFinding:
    return ValidationFinding(code=code, message=message, **kwargs)


def _strict_int(value: str, *, field: str, artifact: str, row_number: int, findings: list[ValidationFinding]) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        findings.append(_finding(
            "INVALID_INTEGER",
            f"{field} must be an integer",
            artifact=artifact,
            row_number=row_number,
        ))
        return None
    return parsed


def _parse_csv_bytes(name: str, payload: bytes, findings: list[ValidationFinding]) -> list[dict[str, str]]:
    if not payload.startswith(UTF8_BOM):
        findings.append(_finding(
            "UTF8_SIG_BOM_MISSING",
            "CSV artifact must start with the UTF-8-SIG BOM",
            artifact=name,
        ))
        return []
    try:
        text = payload.decode("utf-8-sig", errors="strict")
    except UnicodeDecodeError as exc:
        findings.append(_finding(
            "UTF8_SIG_DECODE_ERROR",
            f"CSV artifact is not valid UTF-8-SIG: {exc}",
            artifact=name,
        ))
        return []

    reader = csv.DictReader(io.StringIO(text, newline=""))
    fieldnames = tuple(reader.fieldnames or ())
    missing = [column for column in REQUIRED_COLUMNS if column not in fieldnames]
    if missing:
        findings.append(_finding(
            "REQUIRED_COLUMNS_MISSING",
            f"Missing required columns: {','.join(missing)}",
            artifact=name,
        ))
        return []
    return [dict(row) for row in reader]


def validate_pdf_to_csv_cycle1(
    artifacts: Mapping[str, bytes],
    expected_sources: Sequence[SourceExpectation],
) -> ValidationResult:
    findings: list[ValidationFinding] = []
    expected_by_key: dict[tuple[str, str], SourceExpectation] = {}
    for source in expected_sources:
        if not source.source_file or not source.source_path:
            findings.append(_finding(
                "INVALID_SOURCE_EXPECTATION",
                "Expected source_file and source_path must be non-empty",
                source_file=source.source_file,
                source_path=source.source_path,
            ))
            continue
        if source.key in expected_by_key:
            findings.append(_finding(
                "DUPLICATE_SOURCE_EXPECTATION",
                "Duplicate source expectation",
                source_file=source.source_file,
                source_path=source.source_path,
            ))
            continue
        expected_by_key[source.key] = source

    rows_by_source: dict[tuple[str, str], list[tuple[str, int, dict[str, str]]]] = {}
    row_count = 0
    digest = hashlib.sha256()

    for artifact_name in sorted(artifacts):
        payload = artifacts[artifact_name]
        digest.update(artifact_name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(payload)
        rows = _parse_csv_bytes(artifact_name, payload, findings)
        row_count += len(rows)
        for csv_row_number, row in enumerate(rows, start=2):
            source_file = (row.get("source_file") or "").strip()
            source_path = (row.get("source_path") or "").strip()
            key = (source_file, source_path)
            if not source_file or not source_path:
                findings.append(_finding(
                    "SOURCE_IDENTITY_MISSING",
                    "source_file and source_path are required on every row",
                    artifact=artifact_name,
                    row_number=csv_row_number,
                ))
                continue
            if key not in expected_by_key:
                findings.append(_finding(
                    "UNKNOWN_SOURCE",
                    "CSV row references a source not present in the source inventory",
                    artifact=artifact_name,
                    row_number=csv_row_number,
                    source_file=source_file,
                    source_path=source_path,
                ))
            rows_by_source.setdefault(key, []).append((artifact_name, csv_row_number, row))

    for key, source_rows in sorted(rows_by_source.items()):
        ordered = source_rows
        expected_chunk = 1
        previous_page_start: int | None = None
        previous_page_end: int | None = None
        seen_chunks: set[int] = set()

        for artifact_name, csv_row_number, row in ordered:
            chunk_no = _strict_int(
                row.get("chunk_no", ""),
                field="chunk_no",
                artifact=artifact_name,
                row_number=csv_row_number,
                findings=findings,
            )
            page_start = _strict_int(
                row.get("page_start", ""),
                field="page_start",
                artifact=artifact_name,
                row_number=csv_row_number,
                findings=findings,
            )
            page_end = _strict_int(
                row.get("page_end", ""),
                field="page_end",
                artifact=artifact_name,
                row_number=csv_row_number,
                findings=findings,
            )

            if chunk_no is not None:
                if chunk_no in seen_chunks:
                    findings.append(_finding(
                        "DUPLICATE_CHUNK_NUMBER",
                        f"Duplicate chunk_no {chunk_no}",
                        artifact=artifact_name,
                        row_number=csv_row_number,
                        source_file=key[0],
                        source_path=key[1],
                    ))
                seen_chunks.add(chunk_no)
                if chunk_no != expected_chunk:
                    findings.append(_finding(
                        "NONCONTIGUOUS_CHUNK_SEQUENCE",
                        f"Expected chunk_no {expected_chunk}, got {chunk_no}",
                        artifact=artifact_name,
                        row_number=csv_row_number,
                        source_file=key[0],
                        source_path=key[1],
                    ))
                expected_chunk += 1

            if page_start is not None and page_end is not None:
                if page_start < 1 or page_end < 1 or page_start > page_end:
                    findings.append(_finding(
                        "INVALID_PAGE_RANGE",
                        f"Invalid page range {page_start}-{page_end}",
                        artifact=artifact_name,
                        row_number=csv_row_number,
                        source_file=key[0],
                        source_path=key[1],
                    ))
                if previous_page_start is not None and page_start < previous_page_start:
                    findings.append(_finding(
                        "PAGE_ORDER_REGRESSION",
                        f"page_start regressed from {previous_page_start} to {page_start}",
                        artifact=artifact_name,
                        row_number=csv_row_number,
                        source_file=key[0],
                        source_path=key[1],
                    ))
                if previous_page_end is not None and page_end < previous_page_end:
                    findings.append(_finding(
                        "PAGE_ORDER_REGRESSION",
                        f"page_end regressed from {previous_page_end} to {page_end}",
                        artifact=artifact_name,
                        row_number=csv_row_number,
                        source_file=key[0],
                        source_path=key[1],
                    ))
                previous_page_start = page_start
                previous_page_end = page_end

            expectation = expected_by_key.get(key)
            if expectation and expectation.source_text_nonempty and not (row.get("text") or "").strip():
                findings.append(_finding(
                    "NONEMPTY_SOURCE_TEXT_MISSING",
                    "A source declared non-empty produced an empty chunk text",
                    artifact=artifact_name,
                    row_number=csv_row_number,
                    source_file=key[0],
                    source_path=key[1],
                ))

    expected_nonempty = {key for key, value in expected_by_key.items() if value.source_text_nonempty}
    covered = set(rows_by_source).intersection(expected_by_key)
    covered_nonempty = {
        key
        for key in expected_nonempty
        if any((row.get("text") or "").strip() for _, _, row in rows_by_source.get(key, []))
    }
    for key in sorted(expected_nonempty - covered_nonempty):
        findings.append(_finding(
            "NONEMPTY_SOURCE_NOT_COVERED",
            "A source declared non-empty has no non-empty CSV text row",
            source_file=key[0],
            source_path=key[1],
        ))

    if not artifacts:
        findings.append(_finding("NO_CSV_ARTIFACTS", "No CSV artifacts were provided"))

    unique_findings = tuple(dict.fromkeys(findings))
    return ValidationResult(
        valid=not unique_findings,
        findings=unique_findings,
        artifact_count=len(artifacts),
        row_count=row_count,
        source_count_expected=len(expected_by_key),
        source_count_covered=len(covered),
        nonempty_source_count_expected=len(expected_nonempty),
        nonempty_source_count_covered=len(covered_nonempty),
        canonical_sha256=digest.hexdigest(),
    )


def load_artifacts(paths: Iterable[Path]) -> dict[str, bytes]:
    return {str(path): path.read_bytes() for path in paths}
