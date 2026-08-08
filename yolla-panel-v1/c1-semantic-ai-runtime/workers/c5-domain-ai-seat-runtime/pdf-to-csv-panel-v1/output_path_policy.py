"""Deterministic output path and CSV chunk filename policy.

This module is intentionally independent of the panel shell. It converts the
authoritative source inventory sequence and source-relative PDF path into
Windows-safe, deterministic output directories and chunk file names.

The policy never silently normalizes path traversal, duplicate inventory
entries, broken sequence numbers, or colliding output paths. Such inputs fail
closed with a stable error code.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from pathlib import PurePosixPath
import re
import unicodedata
from typing import Iterable, Sequence

SCHEMA_VERSION = "PDF_TO_CSV_OUTPUT_NAMING_CONTRACT_V1"
DEFAULT_SEQUENCE_WIDTH = 8
MAX_SEQUENCE_VALUE = 99_999_999
MAX_SAFE_COMPONENT_LENGTH = 80
MAX_SOURCE_DIR_COMPONENT_LENGTH = 160
DEFAULT_MAX_OUTPUT_RELATIVE_CHARS = 240

_WINDOWS_INVALID_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_WINDOWS_DRIVE_RE = re.compile(r"^[A-Za-z]:")
_WHITESPACE_RE = re.compile(r"\s+")
_RESERVED_WINDOWS_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


class OutputPathPolicyError(ValueError):
    """Fail-closed policy error with a stable machine-readable code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


@dataclass(frozen=True)
class SourceOutputPlan:
    schema_version: str
    source_no: int
    source_relative_path: str
    source_parent_relative_path: str
    source_file: str
    source_stem: str
    source_path_sha256: str
    output_relative_dir: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class ChunkOutputPlan:
    schema_version: str
    source_no: int
    source_relative_path: str
    source_path_sha256: str
    chunk_no: int
    page_start: int
    page_end: int
    output_relative_dir: str
    csv_filename: str
    output_relative_path: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _fail(code: str, message: str) -> None:
    raise OutputPathPolicyError(code, message)


def _nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def normalize_source_relative_path(source_relative_path: str) -> PurePosixPath:
    """Return a canonical NFC-normalized POSIX relative PDF path.

    Backslashes are accepted as input separators for Windows inventory data.
    Absolute paths, drive paths, UNC paths, traversal, empty paths, and
    non-PDF files are rejected instead of silently rewritten.
    """

    if not isinstance(source_relative_path, str):
        _fail("SOURCE_PATH_TYPE_INVALID", "source_relative_path must be str")
    if "\x00" in source_relative_path:
        _fail("SOURCE_PATH_NUL", "source path contains NUL")
    raw = _nfc(source_relative_path.strip()).replace("\\", "/")
    if not raw:
        _fail("SOURCE_PATH_EMPTY", "source relative path is empty")
    if raw.startswith("/") or raw.startswith("//") or _WINDOWS_DRIVE_RE.match(raw):
        _fail("SOURCE_PATH_ABSOLUTE", f"absolute path is not allowed: {source_relative_path!r}")

    normalized_parts: list[str] = []
    for part in raw.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            _fail("SOURCE_PATH_TRAVERSAL", f"parent traversal is not allowed: {source_relative_path!r}")
        normalized = _nfc(part)
        if normalized in ("", ".", ".."):
            _fail("SOURCE_PATH_COMPONENT_INVALID", f"invalid path component: {part!r}")
        normalized_parts.append(normalized)

    if not normalized_parts:
        _fail("SOURCE_PATH_EMPTY", "source relative path has no components")

    path = PurePosixPath(*normalized_parts)
    if path.suffix.casefold() != ".pdf":
        _fail("SOURCE_NOT_PDF", f"source file must end with .pdf: {path.as_posix()}")
    return path


def safe_windows_component(value: str, *, max_length: int = MAX_SAFE_COMPONENT_LENGTH) -> str:
    """Create a deterministic Windows-safe preview component.

    The source path digest remains the uniqueness authority. This preview is
    human-readable and may therefore be lossy; any lossy transformation is
    disambiguated by the source digest in the final source directory.
    """

    if not isinstance(value, str):
        _fail("COMPONENT_TYPE_INVALID", "component must be str")
    if max_length < 24:
        _fail("COMPONENT_MAX_LENGTH_TOO_SMALL", "max_length must be at least 24")

    original = _nfc(value)
    candidate = _WHITESPACE_RE.sub(" ", original)
    candidate = _WINDOWS_INVALID_RE.sub("_", candidate).strip().rstrip(" .")
    if not candidate:
        candidate = "_"

    base_name = candidate.split(".", 1)[0].upper()
    if base_name in _RESERVED_WINDOWS_NAMES:
        candidate = f"_{candidate}"

    if len(candidate) > max_length:
        suffix = hashlib.sha256(original.encode("utf-8")).hexdigest()[:12]
        keep = max_length - len(suffix) - 2
        candidate = f"{candidate[:keep].rstrip(' .')}--{suffix}"

    candidate = candidate.rstrip(" .") or "_"
    if len(candidate) > max_length:
        _fail("COMPONENT_LENGTH_INTERNAL_ERROR", "safe component length exceeded")
    if _WINDOWS_INVALID_RE.search(candidate):
        _fail("COMPONENT_SANITIZATION_INTERNAL_ERROR", "unsafe character remained")
    if candidate.endswith((" ", ".")):
        _fail("COMPONENT_SANITIZATION_INTERNAL_ERROR", "unsafe trailing character remained")
    return candidate


def _validate_sequence(value: int, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail(f"{field.upper()}_TYPE_INVALID", f"{field} must be int")
    if value < 1 or value > MAX_SEQUENCE_VALUE:
        _fail(
            f"{field.upper()}_OUT_OF_RANGE",
            f"{field} must be between 1 and {MAX_SEQUENCE_VALUE}",
        )
    return value


def _sequence_token(value: int) -> str:
    return f"{value:0{DEFAULT_SEQUENCE_WIDTH}d}"


def _source_digest(path: PurePosixPath) -> str:
    return hashlib.sha256(path.as_posix().encode("utf-8")).hexdigest()


def build_source_output_plan(
    source_relative_path: str,
    source_no: int,
    *,
    max_output_relative_chars: int = DEFAULT_MAX_OUTPUT_RELATIVE_CHARS,
) -> SourceOutputPlan:
    """Build a deterministic source output directory.

    Output layout:
      <sanitized source parent hierarchy>/
      source-00000001--<safe stem>--src-<full source-path SHA-256>/

    The canonical source relative path and sequence are retained in the plan.
    The full SHA-256 prevents sanitized-name collisions; batch planning also
    performs a case-insensitive collision check before any files are written.
    """

    source_no = _validate_sequence(source_no, "source_no")
    if max_output_relative_chars < 100:
        _fail(
            "OUTPUT_PATH_BUDGET_TOO_SMALL",
            "max_output_relative_chars must be at least 100",
        )

    source_path = normalize_source_relative_path(source_relative_path)
    source_path_text = source_path.as_posix()
    digest = _source_digest(source_path)

    parent_parts = tuple(source_path.parent.parts) if source_path.parent != PurePosixPath(".") else ()
    safe_parent_parts = tuple(safe_windows_component(part) for part in parent_parts)
    safe_stem = safe_windows_component(source_path.stem, max_length=64)
    source_dir_name = f"source-{_sequence_token(source_no)}--{safe_stem}--src-{digest}"
    if len(source_dir_name) > MAX_SOURCE_DIR_COMPONENT_LENGTH:
        _fail("SOURCE_DIR_COMPONENT_TOO_LONG", source_dir_name)

    output_dir = PurePosixPath(*safe_parent_parts, source_dir_name)
    output_dir_text = output_dir.as_posix()
    if len(output_dir_text) > max_output_relative_chars:
        _fail(
            "OUTPUT_RELATIVE_PATH_TOO_LONG",
            f"{len(output_dir_text)} characters exceeds {max_output_relative_chars}",
        )

    return SourceOutputPlan(
        schema_version=SCHEMA_VERSION,
        source_no=source_no,
        source_relative_path=source_path_text,
        source_parent_relative_path=(
            source_path.parent.as_posix() if source_path.parent != PurePosixPath(".") else ""
        ),
        source_file=source_path.name,
        source_stem=source_path.stem,
        source_path_sha256=digest,
        output_relative_dir=output_dir_text,
    )


def plan_source_outputs(
    sources: Iterable[tuple[int, str]],
    *,
    require_contiguous_sequence: bool = True,
    max_output_relative_chars: int = DEFAULT_MAX_OUTPUT_RELATIVE_CHARS,
) -> list[SourceOutputPlan]:
    """Plan a full source inventory and reject duplicates or output collisions."""

    entries = list(sources)
    if not entries:
        _fail("SOURCE_INVENTORY_EMPTY", "at least one source PDF is required")

    plans: list[SourceOutputPlan] = []
    seen_source_nos: set[int] = set()
    seen_source_paths: set[str] = set()
    seen_output_dirs: dict[str, str] = {}

    for index, (source_no, source_path) in enumerate(entries, start=1):
        if require_contiguous_sequence and source_no != index:
            _fail(
                "SOURCE_SEQUENCE_NOT_CONTIGUOUS",
                f"entry {index} has source_no={source_no}; expected {index}",
            )
        if source_no in seen_source_nos:
            _fail("DUPLICATE_SOURCE_NO", f"duplicate source_no: {source_no}")

        plan = build_source_output_plan(
            source_path,
            source_no,
            max_output_relative_chars=max_output_relative_chars,
        )
        canonical_casefold = plan.source_relative_path.casefold()
        if canonical_casefold in seen_source_paths:
            _fail(
                "DUPLICATE_SOURCE_PATH",
                f"duplicate source path under Windows semantics: {plan.source_relative_path}",
            )

        output_key = plan.output_relative_dir.casefold()
        if output_key in seen_output_dirs:
            _fail(
                "OUTPUT_DIRECTORY_COLLISION",
                f"{plan.source_relative_path} collides with {seen_output_dirs[output_key]}",
            )

        seen_source_nos.add(source_no)
        seen_source_paths.add(canonical_casefold)
        seen_output_dirs[output_key] = plan.source_relative_path
        plans.append(plan)

    return plans


def build_chunk_output_plan(
    source_plan: SourceOutputPlan,
    chunk_no: int,
    page_start: int,
    page_end: int,
) -> ChunkOutputPlan:
    """Build one deterministic CSV chunk filename and relative output path."""

    if not isinstance(source_plan, SourceOutputPlan):
        _fail("SOURCE_PLAN_TYPE_INVALID", "source_plan must be SourceOutputPlan")
    chunk_no = _validate_sequence(chunk_no, "chunk_no")
    page_start = _validate_sequence(page_start, "page_start")
    page_end = _validate_sequence(page_end, "page_end")
    if page_end < page_start:
        _fail("PAGE_RANGE_REVERSED", f"page_end={page_end} precedes page_start={page_start}")

    safe_stem = safe_windows_component(source_plan.source_stem, max_length=48)
    digest_token = source_plan.source_path_sha256[:16]
    csv_filename = (
        f"source-{_sequence_token(source_plan.source_no)}"
        f"--chunk-{_sequence_token(chunk_no)}"
        f"--pages-{_sequence_token(page_start)}-{_sequence_token(page_end)}"
        f"--{safe_stem}--{digest_token}.csv"
    )
    if len(csv_filename) > 220:
        _fail("CSV_FILENAME_TOO_LONG", f"{len(csv_filename)} characters")
    if _WINDOWS_INVALID_RE.search(csv_filename):
        _fail("CSV_FILENAME_UNSAFE", csv_filename)

    output_path = PurePosixPath(source_plan.output_relative_dir, csv_filename)
    return ChunkOutputPlan(
        schema_version=SCHEMA_VERSION,
        source_no=source_plan.source_no,
        source_relative_path=source_plan.source_relative_path,
        source_path_sha256=source_plan.source_path_sha256,
        chunk_no=chunk_no,
        page_start=page_start,
        page_end=page_end,
        output_relative_dir=source_plan.output_relative_dir,
        csv_filename=csv_filename,
        output_relative_path=output_path.as_posix(),
    )


def plan_chunk_outputs(
    source_plan: SourceOutputPlan,
    chunks: Iterable[tuple[int, int, int]],
    *,
    require_contiguous_sequence: bool = True,
) -> list[ChunkOutputPlan]:
    """Plan ordered chunks for one source and reject sequence/path collisions."""

    entries = list(chunks)
    if not entries:
        _fail("CHUNK_INVENTORY_EMPTY", "at least one chunk is required")

    plans: list[ChunkOutputPlan] = []
    seen_paths: set[str] = set()
    previous_page_start = 0

    for index, (chunk_no, page_start, page_end) in enumerate(entries, start=1):
        if require_contiguous_sequence and chunk_no != index:
            _fail(
                "CHUNK_SEQUENCE_NOT_CONTIGUOUS",
                f"entry {index} has chunk_no={chunk_no}; expected {index}",
            )
        plan = build_chunk_output_plan(source_plan, chunk_no, page_start, page_end)
        if plan.page_start < previous_page_start:
            _fail(
                "PAGE_ORDER_NOT_PRESERVED",
                f"chunk {chunk_no} starts on page {page_start} before prior start {previous_page_start}",
            )
        output_key = plan.output_relative_path.casefold()
        if output_key in seen_paths:
            _fail("CHUNK_OUTPUT_COLLISION", plan.output_relative_path)
        seen_paths.add(output_key)
        previous_page_start = plan.page_start
        plans.append(plan)

    return plans


def validate_batch_output_uniqueness(
    source_plans: Sequence[SourceOutputPlan],
    chunk_plans: Sequence[ChunkOutputPlan],
) -> dict[str, int | bool]:
    """Validate a combined batch before write operations occur."""

    source_dirs = [plan.output_relative_dir.casefold() for plan in source_plans]
    chunk_paths = [plan.output_relative_path.casefold() for plan in chunk_plans]
    if len(source_dirs) != len(set(source_dirs)):
        _fail("OUTPUT_DIRECTORY_COLLISION", "duplicate source output directory")
    if len(chunk_paths) != len(set(chunk_paths)):
        _fail("CHUNK_OUTPUT_COLLISION", "duplicate chunk output path")

    source_keys = {
        (plan.source_no, plan.source_relative_path.casefold(), plan.source_path_sha256)
        for plan in source_plans
    }
    for chunk in chunk_plans:
        key = (chunk.source_no, chunk.source_relative_path.casefold(), chunk.source_path_sha256)
        if key not in source_keys:
            _fail(
                "CHUNK_SOURCE_BINDING_MISSING",
                f"chunk path is not bound to a source plan: {chunk.output_relative_path}",
            )

    return {
        "source_plan_count": len(source_plans),
        "chunk_plan_count": len(chunk_plans),
        "unique_source_output_count": len(set(source_dirs)),
        "unique_chunk_output_count": len(set(chunk_paths)),
        "collision_count": 0,
        "valid": True,
    }
