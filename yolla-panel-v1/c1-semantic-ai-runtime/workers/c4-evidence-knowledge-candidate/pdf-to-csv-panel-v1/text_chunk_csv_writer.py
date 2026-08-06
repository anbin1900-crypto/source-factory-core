#!/usr/bin/env python3
"""Page-ordered text chunking and UTF-8-SIG CSV output (no semantics/GPT)."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence

COLUMNS = (
    "source_file", "source_path", "chunk_no", "page_start", "page_end", "text",
    "char_start", "char_end", "text_sha256",
)


class ChunkWriterError(ValueError):
    pass


class EmptyTextError(ChunkWriterError):
    pass


@dataclass(frozen=True)
class PageText:
    page_no: int
    text: str


@dataclass(frozen=True)
class Chunk:
    source_file: str
    source_path: str
    chunk_no: int
    page_start: int
    page_end: int
    text: str
    char_start: int
    char_end: int
    text_sha256: str


def _nonempty(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ChunkWriterError(f"{name} must be a non-empty string")
    return value


def normalize_pages(items: Iterable[Mapping[str, Any] | PageText]) -> list[PageText]:
    if isinstance(items, (str, bytes, bytearray, Mapping)):
        raise ChunkWriterError("pages must be an iterable of records")
    pages: list[PageText] = []
    previous = 0
    for index, item in enumerate(items):
        if isinstance(item, PageText):
            page_no, text = item.page_no, item.text
        elif isinstance(item, Mapping):
            if "page_no" not in item and "page_number" not in item:
                raise ChunkWriterError(f"pages[{index}] needs page_no or page_number")
            if "page_no" in item and "page_number" in item and item["page_no"] != item["page_number"]:
                raise ChunkWriterError(f"pages[{index}] page aliases disagree")
            page_no = item.get("page_no", item.get("page_number"))
            if "text" not in item:
                raise ChunkWriterError(f"pages[{index}] needs text")
            text = item["text"]
        else:
            raise ChunkWriterError(f"pages[{index}] must be a record")
        if isinstance(page_no, bool) or not isinstance(page_no, int) or page_no < 1:
            raise ChunkWriterError(f"pages[{index}] page number must be positive integer")
        if not isinstance(text, str):
            raise ChunkWriterError(f"pages[{index}].text must be string")
        if page_no <= previous:
            raise ChunkWriterError("page order must be strictly increasing without duplicates")
        previous = page_no
        pages.append(PageText(page_no, text))
    if not pages:
        raise EmptyTextError("no pages supplied")
    if not any(page.text.strip() for page in pages):
        raise EmptyTextError("all page text is empty or whitespace-only")
    return pages


def chunk_pages(
    items: Iterable[Mapping[str, Any] | PageText], *, source_file: str,
    source_path: str, max_chars: int,
) -> list[Chunk]:
    source_file = _nonempty(source_file, "source_file")
    source_path = _nonempty(source_path, "source_path")
    if isinstance(max_chars, bool) or not isinstance(max_chars, int) or max_chars < 1:
        raise ChunkWriterError("max_chars must be a positive integer")
    chunks: list[Chunk] = []
    for page in normalize_pages(items):
        for start in range(0, len(page.text), max_chars):
            text = page.text[start:start + max_chars]
            if not text:
                continue
            chunks.append(Chunk(
                source_file, source_path, len(chunks) + 1, page.page_no, page.page_no,
                text, start, start + len(text),
                hashlib.sha256(text.encode("utf-8")).hexdigest(),
            ))
    if not chunks or not any(chunk.text.strip() for chunk in chunks):
        raise EmptyTextError("chunking produced no non-whitespace text")
    return chunks


def render_csv_bytes(chunk: Chunk) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerow(asdict(chunk))
    return stream.getvalue().encode("utf-8-sig")


def _safe_name(name: str) -> str:
    if not isinstance(name, str) or not name or Path(name).name != name or "/" in name or "\\" in name:
        raise ChunkWriterError("filename must be a basename")
    if not name.lower().endswith(".csv"):
        raise ChunkWriterError("filename must end with .csv")
    return name


def write_chunks(
    chunks: Sequence[Chunk], *, output_dir: str | os.PathLike[str],
    filename_factory: Callable[[Chunk], str] | None = None, overwrite: bool = False,
) -> list[dict[str, Any]]:
    if not chunks:
        raise EmptyTextError("no chunks supplied")
    factory = filename_factory or (lambda c: f"chunk_{c.chunk_no:06d}.csv")
    root = Path(output_dir)
    plan: list[tuple[Chunk, Path, bytes, str]] = []
    names: set[str] = set()
    for chunk in chunks:
        if not isinstance(chunk, Chunk):
            raise ChunkWriterError("all chunks must be Chunk instances")
        name = _safe_name(factory(chunk))
        key = name.casefold()
        if key in names:
            raise ChunkWriterError(f"duplicate filename: {name}")
        names.add(key)
        target = root / name
        payload = render_csv_bytes(chunk)
        status = "CREATED"
        if target.exists():
            if target.read_bytes() == payload:
                status = "REUSED_IDENTICAL"
            elif not overwrite:
                raise FileExistsError(f"different output exists: {target}")
            else:
                status = "REPLACED"
        plan.append((chunk, target, payload, status))
    root.mkdir(parents=True, exist_ok=True)
    result: list[dict[str, Any]] = []
    for chunk, target, payload, status in plan:
        if status != "REUSED_IDENTICAL":
            fd, temp_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=root)
            try:
                with os.fdopen(fd, "wb") as handle:
                    handle.write(payload)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp_name, target)
            except Exception:
                try:
                    os.unlink(temp_name)
                except FileNotFoundError:
                    pass
                raise
        result.append({
            "chunk_no": chunk.chunk_no,
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
            "filename": target.name,
            "path": str(target),
            "encoding": "UTF-8-SIG",
            "byte_size": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
            "status": status,
        })
    return result


def convert(
    pages: Iterable[Mapping[str, Any] | PageText], *, source_file: str,
    source_path: str, output_dir: str | os.PathLike[str], max_chars: int,
    filename_factory: Callable[[Chunk], str] | None = None, overwrite: bool = False,
) -> dict[str, Any]:
    chunks = chunk_pages(
        pages, source_file=source_file, source_path=source_path, max_chars=max_chars
    )
    files = write_chunks(
        chunks, output_dir=output_dir,
        filename_factory=filename_factory, overwrite=overwrite,
    )
    return {
        "source_file": source_file,
        "source_path": source_path,
        "max_chars": max_chars,
        "chunk_count": len(chunks),
        "page_start": chunks[0].page_start,
        "page_end": chunks[-1].page_end,
        "files": files,
        "semantic_analysis": False,
        "gpt_call": False,
    }


def load_input(path: str | os.PathLike[str]) -> tuple[list[Mapping[str, Any]], dict[str, Any]]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(value, list):
        return value, {}
    if isinstance(value, dict) and isinstance(value.get("pages"), list):
        return value["pages"], {
            key: value[key]
            for key in ("source_file", "source_path")
            if key in value
        }
    raise ChunkWriterError("input JSON must be a list or object with pages")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-json", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--max-chars", required=True, type=int)
    parser.add_argument("--source-file")
    parser.add_argument("--source-path")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)
    try:
        pages, meta = load_input(args.input_json)
        result = convert(
            pages,
            source_file=_nonempty(args.source_file or meta.get("source_file"), "source_file"),
            source_path=_nonempty(args.source_path or meta.get("source_path"), "source_path"),
            output_dir=args.output_dir,
            max_chars=args.max_chars,
            overwrite=args.overwrite,
        )
    except (ChunkWriterError, FileExistsError, OSError, json.JSONDecodeError) as exc:
        import sys
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps({"status": "PASS", **result}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
