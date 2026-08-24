#!/usr/bin/env python3
"""SF_028 Source Factory Active Core Migration.

Reads an existing Source Factory tree without modifying or deleting it, derives the
runtime-reachable source set from RUN_SF4_SAFE_PANEL_ONLY.bat, copies only active
source/config assets into a new root, validates the result, explains every copied
file's role, and optionally publishes report-only evidence to GitHub.

Python standard library only. Intended for Windows 10/11 with Python 3.9+.
"""
from __future__ import annotations

import argparse
import ast
import datetime as dt
import hashlib
import json
import os
import py_compile
import re
import shutil
import subprocess
import sys
import tempfile
import traceback
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Iterator, Optional

SCRIPT_VERSION = "2.0.0"
WORKER_ID = "SF_028_ACTIVE_CORE_MIGRATION_WORKER_01"
TASK_ID = "SF_028_SOURCE_FACTORY_ACTIVE_CORE_MIGRATION"
DEFAULT_REPO = "anbin1900-crypto/source-factory-core"
DEFAULT_BRANCH = "agent/sf-028-active-core-migration"

FORBIDDEN_DIR_NAMES = {
    ".git", "node_modules", "reports", "daily_queue", "staging", "__pycache__",
    ".pytest_cache", ".mypy_cache", ".ruff_cache",
}
FORBIDDEN_FILE_RE = re.compile(r"(?i)(?:026.*one[-_]?flow|one[-_]?flow.*026)|\.(?:pyc|pyo)$")
TEXT_SUFFIXES = {
    ".bat", ".cmd", ".ps1", ".py", ".js", ".cjs", ".mjs", ".json", ".html",
    ".htm", ".css", ".md", ".txt", ".yaml", ".yml", ".toml", ".ini", ".xml",
}
SOURCE_SUFFIXES = TEXT_SUFFIXES | {".svg"}
PATH_SUFFIXES = {
    ".bat", ".cmd", ".ps1", ".py", ".js", ".cjs", ".mjs", ".json", ".html",
    ".htm", ".css", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp",
    ".woff", ".woff2", ".ttf", ".map", ".wasm", ".node", ".dll", ".exe", ".txt",
    ".md", ".yaml", ".yml", ".toml",
}
JS_EXTENSIONS = ["", ".js", ".cjs", ".mjs", ".json", ".node"]

CONSTITUTION_FILES = [
    "00_AI_SUPER_BOOT_v2_1_2_COMPACT.md",
    "01_COMPACT_RULE_SCHEMA_v2_1_2.json",
    "02_WORKER_COMMANDER_CONTRACTS_COMPACT_v2_1_2.md",
    "03_STAGE4_AUTOMATION_CONTRACT_COMPACT_v2_1_2.md",
    "04_COMPACT_INSTALL_AND_REFERENCE_MAP_v2_1_2.json",
    "FINAL_COMPACT_MANIFEST_v2_1_2.json",
    "V2_1_2_COMPACT_UPDATE_REPORT.md",
]
MANDATORY_RELATIVE_FILES = [
    "src/queue/local_claim_store.py",
    "src/queue/terminal_receipt_store.py",
    "src/queue/local_worker_lifecycle.py",
    "src/queue/dailyQueueReader.js",
    "src/queue/pythonProcessRunner.js",
    "src/pc_agent/local_command_runner.py",
    "src/pc_agent/local_pc_agent_mvp.py",
    "src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json",
    "src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js",
    "src/gpt_browser_bridge/buttonHandlers.js",
    "src/gpt_browser_bridge/diagnostics.js",
    "src/gpt_browser_bridge/fileNameSafe.js",
    "src/gpt_browser_bridge/stage1SelfCheck.js",
]
REPORT_NAMES = [
    "ACTIVE_CORE_MANIFEST.json",
    "MIGRATION_COPY_REPORT.json",
    "VERIFY_ACTIVE_CORE_REPORT.json",
    "DELETE_OLD_ROOT_READY_REPORT.md",
    "WORKER_REPORT_SF028.md",
    "SOURCE_ROLE_ANALYSIS.json",
    "SOURCE_ROLE_ANALYSIS.md",
    "RUNTIME_DEPENDENCY_GRAPH.json",
    "GITHUB_PUBLISH_REPORT.json",
]


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def local_run_id() -> str:
    return "SF028_ACTIVE_CORE_" + dt.datetime.now().strftime("%Y%m%d_%H%M%S")


def norm_rel(value: str | Path) -> str:
    text = str(value).replace("\\", "/")
    text = re.sub(r"^\./", "", text)
    return text.strip("/")


def read_text(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp949", "mbcs" if os.name == "nt" else "latin-1"):
        try:
            return data.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode("utf-8", errors="replace")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def write_json(path: Path, value: Any) -> None:
    write_text(path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def path_is_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def is_forbidden_relative(rel: str | Path) -> bool:
    rel_text = norm_rel(rel)
    parts = [p.lower() for p in Path(rel_text).parts]
    if any(part in FORBIDDEN_DIR_NAMES for part in parts):
        return True
    return bool(FORBIDDEN_FILE_RE.search(Path(rel_text).name))


def iter_files(root: Path, *, include_forbidden: bool = False) -> Iterator[Path]:
    if not root.exists():
        return
    for current, dirs, files in os.walk(root, topdown=True, followlinks=False):
        current_path = Path(current)
        if not include_forbidden:
            dirs[:] = [d for d in dirs if d.lower() not in FORBIDDEN_DIR_NAMES]
        for name in files:
            p = current_path / name
            try:
                rel = p.relative_to(root)
            except ValueError:
                continue
            if include_forbidden or not is_forbidden_relative(rel):
                yield p


def tree_size_and_count(root: Path) -> tuple[int, int]:
    total = 0
    count = 0
    if not root.exists():
        return total, count
    for current, dirs, files in os.walk(root, topdown=True, followlinks=False):
        for name in files:
            p = Path(current) / name
            try:
                total += p.stat().st_size
                count += 1
            except OSError:
                pass
    return total, count


def run_command(args: list[str], cwd: Optional[Path] = None, timeout: int = 300) -> dict[str, Any]:
    try:
        cp = subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        return {
            "command": args,
            "cwd": str(cwd) if cwd else None,
            "returncode": cp.returncode,
            "stdout": cp.stdout[-12000:],
            "stderr": cp.stderr[-12000:],
        }
    except FileNotFoundError as exc:
        return {"command": args, "cwd": str(cwd) if cwd else None, "returncode": None, "error": str(exc)}
    except subprocess.TimeoutExpired as exc:
        return {"command": args, "cwd": str(cwd) if cwd else None, "returncode": None, "error": f"timeout: {exc}"}


@dataclass
class Selection:
    source: Path
    destination_rel: str
    reasons: set[str] = field(default_factory=set)
    inbound_from: set[str] = field(default_factory=set)


class MigrationError(RuntimeError):
    pass


class Migrator:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.old_root = Path(args.old_root).resolve()
        self.entry_bat = Path(args.entry_bat).resolve()
        self.new_root = Path(args.new_root).resolve()
        self.destination_base = self.new_root.parent
        self.run_id = args.run_id or local_run_id()
        self.started_at = utc_now()
        self.selection: dict[str, Selection] = {}
        self.source_to_destinations: dict[str, set[str]] = defaultdict(set)
        self.required_destinations: set[str] = set()
        self.missing_required: list[dict[str, Any]] = []
        self.unresolved_references: list[dict[str, Any]] = []
        self.external_dependencies: dict[str, set[str]] = defaultdict(set)
        self.dependency_edges: set[tuple[str, str, str]] = set()
        self.archive_path: Optional[Path] = None
        self.candidate_dir: Optional[Path] = None
        self.safe_dir: Optional[Path] = None
        self.safe_main: Optional[Path] = None
        self.batch_variables: dict[str, str] = {}
        self.copy_failures: list[dict[str, Any]] = []
        self.generated_files: list[str] = []
        self.validation_by_file: dict[str, dict[str, Any]] = defaultdict(dict)
        self.events: list[dict[str, Any]] = []
        self.old_root_size_bytes: Optional[int] = None
        self.old_root_file_count: Optional[int] = None
        self.filename_index: Optional[dict[str, list[Path]]] = None
        self.github_report: dict[str, Any] = {
            "requested": bool(args.publish_github),
            "repository": args.github_repo,
            "branch": args.github_branch,
            "status": "NOT_RUN",
        }

    def log(self, message: str, **extra: Any) -> None:
        event = {"at": utc_now(), "message": message, **extra}
        self.events.append(event)
        print(message, flush=True)

    def preflight(self) -> None:
        self.log(f"[SF_028] run_id={self.run_id}")
        self.log(f"[READ_ONLY_OLD_ROOT] {self.old_root}")
        self.log(f"[ENTRY_BAT] {self.entry_bat}")
        self.log(f"[NEW_ROOT] {self.new_root}")
        if not self.old_root.is_dir():
            raise MigrationError(f"OLD_ROOT not found: {self.old_root}")
        if not self.entry_bat.is_file():
            raise MigrationError(f"Entry BAT not found: {self.entry_bat}")
        if not path_is_under(self.entry_bat, self.old_root):
            raise MigrationError("Entry BAT is outside OLD_ROOT")
        if path_is_under(self.new_root, self.old_root) or path_is_under(self.old_root, self.new_root):
            raise MigrationError("NEW_ROOT and OLD_ROOT must be separate trees")
        self.destination_base.mkdir(parents=True, exist_ok=True)
        if self.new_root.exists() and any(self.new_root.iterdir()):
            if not self.args.archive_existing:
                raise MigrationError(f"NEW_ROOT is not empty: {self.new_root}")
            stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
            archive = self.destination_base / f"SF_028_INCOMPLETE_{stamp}"
            counter = 1
            while archive.exists():
                archive = self.destination_base / f"SF_028_INCOMPLETE_{stamp}_{counter}"
                counter += 1
            self.new_root.rename(archive)
            self.archive_path = archive
            self.log(f"[ARCHIVED_INCOMPLETE] {archive}")
        self.new_root.mkdir(parents=True, exist_ok=True)

    def add_selection(self, source: Path, destination_rel: str, reason: str, inbound_from: Optional[str] = None, required: bool = False) -> None:
        try:
            source = source.resolve()
        except OSError:
            return
        destination_rel = norm_rel(destination_rel)
        if not source.is_file():
            return
        if not path_is_under(source, self.old_root):
            return
        if is_forbidden_relative(destination_rel) or is_forbidden_relative(source.relative_to(self.old_root)):
            return
        sel = self.selection.get(destination_rel)
        if sel is None:
            sel = Selection(source=source, destination_rel=destination_rel)
            self.selection[destination_rel] = sel
        elif sel.source != source:
            # Prefer the first authoritative source and record the ambiguity.
            self.unresolved_references.append({
                "type": "DESTINATION_COLLISION",
                "destination": destination_rel,
                "kept": str(sel.source),
                "ignored": str(source),
            })
            return
        sel.reasons.add(reason)
        if inbound_from:
            sel.inbound_from.add(inbound_from)
        self.source_to_destinations[str(source).lower()].add(destination_rel)
        if required:
            self.required_destinations.add(destination_rel)

    def add_tree(self, source_dir: Path, reason: str) -> int:
        count = 0
        if not source_dir.is_dir() or not path_is_under(source_dir, self.old_root):
            return count
        for p in iter_files(source_dir):
            rel = norm_rel(p.relative_to(self.old_root))
            self.add_selection(p, rel, reason)
            count += 1
        return count

    def find_file(self, canonical_rel: str) -> Optional[Path]:
        rel_path = Path(canonical_rel.replace("/", os.sep))
        candidates = [
            self.old_root / rel_path,
            self.old_root / "source-factory-core" / rel_path,
            self.old_root / "src" / rel_path if not canonical_rel.startswith("src/") else self.old_root / rel_path,
        ]
        if canonical_rel.startswith("_CONSTITUTION_V2_COMPACT/"):
            name = Path(canonical_rel).name
            candidates += [
                self.old_root / name,
                self.old_root / "source-factory-core" / name,
                self.old_root / "source-factory-core" / "_CONSTITUTION_V2_COMPACT" / name,
            ]
        seen: set[str] = set()
        for p in candidates:
            key = str(p).lower()
            if key not in seen and p.is_file():
                return p
            seen.add(key)
        # Filename fallback uses one pruned index for the entire 4.7 GB tree.
        if self.filename_index is None:
            self.log("[INDEX] building one-time filename index (forbidden trees pruned)")
            index: dict[str, list[Path]] = defaultdict(list)
            for indexed_path in iter_files(self.old_root):
                bucket = index[indexed_path.name.lower()]
                if len(bucket) < 50:
                    bucket.append(indexed_path)
            self.filename_index = dict(index)
            self.log(f"[INDEX] unique_names={len(self.filename_index)}")
        name = Path(canonical_rel).name.lower()
        matches = list(self.filename_index.get(name, []))
        if not matches:
            return None
        matches.sort(key=lambda p: (len(p.relative_to(self.old_root).parts), len(str(p))))
        return matches[0]

    @staticmethod
    def expand_batch_vars(text: str, variables: dict[str, str], current_dir: Path, script_dir: Path) -> str:
        expanded = text.replace("%~dp0", str(script_dir) + os.sep).replace("%~DP0", str(script_dir) + os.sep)
        expanded = re.sub(r"(?i)%CD%", lambda _m: str(current_dir), expanded)
        for _ in range(8):
            prior = expanded
            def repl(match: re.Match[str]) -> str:
                key = match.group(1).upper()
                return variables.get(key, match.group(0))
            expanded = re.sub(r"%([A-Za-z_][A-Za-z0-9_]*)%", repl, expanded)
            if expanded == prior:
                break
        return expanded

    def parse_entry_bat(self) -> None:
        text = read_text(self.entry_bat)
        current_dir = self.entry_bat.parent
        variables: dict[str, str] = {
            "ROOT": str(self.old_root),
            "OLD_ROOT": str(self.old_root),
            "SOURCE_FACTORY_ROOT": str(self.old_root),
            "SF_ROOT": str(self.old_root),
        }
        script_dir = self.entry_bat.parent
        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.lower().startswith(("rem ", "::")):
                continue
            expanded = self.expand_batch_vars(line, variables, current_dir, script_dir)
            match = re.match(r'(?i)^set\s+"?([A-Za-z_][A-Za-z0-9_]*)=(.*?)"?\s*$', expanded)
            if match:
                key = match.group(1).upper()
                value = match.group(2).strip().strip('"')
                variables[key] = self.expand_batch_vars(value, variables, current_dir, script_dir)
                continue
            match = re.match(r'(?i)^(?:cd(?:\s+/d)?|pushd)\s+(.+?)\s*$', expanded)
            if match:
                raw_dir = match.group(1).strip().strip('"')
                p = Path(raw_dir) if Path(raw_dir).is_absolute() else current_dir / raw_dir
                if p.is_dir() and path_is_under(p, self.old_root):
                    current_dir = p.resolve()
        self.batch_variables = variables
        cand = variables.get("CAND")
        safe = variables.get("SAFE")
        if cand:
            p = Path(cand)
            if p.is_dir() and path_is_under(p, self.old_root):
                self.candidate_dir = p.resolve()
        if safe:
            p = Path(safe)
            if p.is_dir() and path_is_under(p, self.old_root):
                self.safe_dir = p.resolve()
        # Resolve the explicit safe_panel_main.js invocation.
        safe_main_match = re.search(r'(?i)(?:electron(?:\.cmd|\.exe)?|npx\s+electron)\s+"?([^"\r\n]+?\.js)"?(?:\s|>|$)', self.expand_batch_vars(text, variables, current_dir, script_dir))
        if safe_main_match:
            p = Path(safe_main_match.group(1).strip())
            if p.is_file() and path_is_under(p, self.old_root):
                self.safe_main = p.resolve()
        if self.safe_main is None and self.safe_dir is not None:
            p = self.safe_dir / "safe_panel_main.js"
            if p.is_file():
                self.safe_main = p.resolve()
        self.log(f"[ENTRY_ANALYSIS] CAND={self.candidate_dir} SAFE={self.safe_dir} MAIN={self.safe_main}")

    def select_seeds(self) -> None:
        entry_rel = norm_rel(self.entry_bat.relative_to(self.old_root))
        self.add_selection(self.entry_bat, entry_rel, "runtime_entry_bat", required=True)
        self.parse_entry_bat()
        if self.safe_dir:
            count = self.add_tree(self.safe_dir, "safe_panel_runtime_bundle")
            self.log(f"[SELECT] safe panel bundle files={count}")
        if self.safe_main:
            self.add_selection(self.safe_main, norm_rel(self.safe_main.relative_to(self.old_root)), "electron_main_entry", required=True)
        if self.candidate_dir:
            for name in ("package.json", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"):
                p = self.candidate_dir / name
                if p.is_file():
                    self.add_selection(p, norm_rel(p.relative_to(self.old_root)), "runtime_package_seed", required=(name == "package.json"))
        for name in CONSTITUTION_FILES:
            canonical = f"_CONSTITUTION_V2_COMPACT/{name}"
            source = self.find_file(canonical)
            if source:
                self.add_selection(source, canonical, "compact_constitution_required", required=True)
            else:
                self.missing_required.append({"canonical_path": canonical, "reason": "NOT_FOUND"})
        for canonical in MANDATORY_RELATIVE_FILES:
            source = self.find_file(canonical)
            if source:
                self.add_selection(source, canonical, "sf028_mandatory_runtime_support", required=True)
            else:
                self.missing_required.append({"canonical_path": canonical, "reason": "NOT_FOUND"})
        rules_dir = self.old_root / "rules" / "powershell51"
        if not rules_dir.is_dir():
            alt = self.old_root / "source-factory-core" / "rules" / "powershell51"
            rules_dir = alt if alt.is_dir() else rules_dir
        if rules_dir.is_dir():
            count = self.add_tree(rules_dir, "powershell51_current_rules")
            self.log(f"[SELECT] powershell51 rule files={count}")
        else:
            self.missing_required.append({"canonical_path": "rules/powershell51", "reason": "DIRECTORY_NOT_FOUND"})
        self.select_tools()

    def select_tools(self) -> None:
        tool_roots = [self.old_root / "tools", self.old_root / "source-factory-core" / "tools"]
        roots = [r for r in tool_roots if r.is_dir()]
        if not roots:
            self.missing_required.append({"canonical_path": "tools", "reason": "DIRECTORY_NOT_FOUND"})
            return
        selected_count = 0
        for root in roots:
            for p in iter_files(root):
                name = p.name.lower()
                rel_from_tools = p.relative_to(root)
                include = False
                reason = ""
                if p.suffix.lower() == ".py" and name.startswith("source_factory_oneflow_") and "026" not in name:
                    include = True
                    reason = "current_oneflow_tool_candidate"
                elif any(token in name for token in ("verify", "install")) and p.suffix.lower() in SOURCE_SUFFIXES:
                    include = True
                    reason = "verify_install_tool_candidate"
                if include:
                    dest = norm_rel(Path("tools") / rel_from_tools)
                    self.add_selection(p, dest, reason)
                    selected_count += 1
        self.log(f"[SELECT] verified-tool candidates={selected_count}")

    def resolve_local_spec(self, origin: Path, spec: str) -> Optional[Path]:
        spec = spec.strip().strip('"\'`')
        spec = re.sub(r"[?#].*$", "", spec)
        if not spec or spec.startswith(("http://", "https://", "data:", "node:", "mailto:", "javascript:")):
            return None
        spec = spec.replace("file://", "")
        # On Windows, Path correctly handles rooted drive strings while running on Windows.
        candidate = Path(spec)
        bases: list[Path]
        if candidate.is_absolute():
            bases = [candidate]
        else:
            bases = [origin.parent / candidate]
            if self.candidate_dir:
                bases.append(self.candidate_dir / candidate)
            bases.append(self.old_root / candidate)
        extensions = [""]
        if not candidate.suffix:
            extensions += [".js", ".cjs", ".mjs", ".json", ".py", ".html", ".css", ".ps1", ".bat", ".cmd"]
        for base in bases:
            for ext in extensions:
                p = Path(str(base) + ext)
                if p.is_file() and path_is_under(p, self.old_root) and not is_forbidden_relative(p.relative_to(self.old_root)):
                    return p.resolve()
            if base.is_dir():
                for index_name in ("index.js", "index.cjs", "index.mjs", "__init__.py", "package.json"):
                    p = base / index_name
                    if p.is_file() and path_is_under(p, self.old_root):
                        return p.resolve()
        return None

    def parse_dependencies(self, origin: Path) -> list[tuple[Path, str]]:
        suffix = origin.suffix.lower()
        if suffix not in TEXT_SUFFIXES and suffix != ".svg":
            return []
        try:
            text = read_text(origin)
        except OSError as exc:
            self.unresolved_references.append({"origin": str(origin), "type": "READ_ERROR", "detail": str(exc)})
            return []
        specs: list[tuple[str, str]] = []
        if suffix in {".js", ".cjs", ".mjs"}:
            patterns = [
                (r"\brequire\s*\(\s*['\"]([^'\"]+)['\"]\s*\)", "js_require"),
                (r"\bfrom\s+['\"]([^'\"]+)['\"]", "js_import_from"),
                (r"\bimport\s*\(\s*['\"]([^'\"]+)['\"]\s*\)", "js_dynamic_import"),
                (r"\bimport\s+['\"]([^'\"]+)['\"]", "js_import_side_effect"),
                (r"\b(?:loadFile|loadURL|setIcon)\s*\(\s*['\"]([^'\"]+)['\"]", "electron_asset"),
                (r"\bpreload\s*:\s*(?:path\.join\([^)]*?['\"]([^'\"]+)['\"]|['\"]([^'\"]+)['\"])", "electron_preload"),
            ]
            for pattern, kind in patterns:
                for m in re.finditer(pattern, text):
                    value = next((g for g in m.groups() if g), "")
                    specs.append((value, kind))
        elif suffix == ".py":
            try:
                tree = ast.parse(text, filename=str(origin))
                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        for alias in node.names:
                            specs.append((alias.name.replace(".", os.sep), "python_import"))
                    elif isinstance(node, ast.ImportFrom):
                        module = (node.module or "").replace(".", os.sep)
                        prefix = os.sep.join([".."] * max(node.level - 1, 0))
                        if node.level:
                            specs.append((str(Path(prefix) / module) if module else prefix or ".", "python_from_import"))
                        elif module:
                            specs.append((module, "python_from_import"))
                    elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                        val = node.value.strip()
                        if Path(val).suffix.lower() in PATH_SUFFIXES or ("/" in val or "\\" in val):
                            specs.append((val, "python_string_path"))
            except SyntaxError as exc:
                self.unresolved_references.append({"origin": str(origin), "type": "PYTHON_PARSE_ERROR", "detail": str(exc)})
        elif suffix in {".html", ".htm", ".css", ".svg"}:
            for pattern, kind in [
                (r"(?i)(?:src|href)\s*=\s*['\"]([^'\"]+)['\"]", "web_asset"),
                (r"(?i)url\(\s*['\"]?([^'\")]+)", "css_asset"),
            ]:
                specs.extend((m.group(1), kind) for m in re.finditer(pattern, text))
        elif suffix == ".json":
            try:
                obj = json.loads(text)
                def walk(v: Any, key: str = "") -> None:
                    if isinstance(v, dict):
                        for k, child in v.items():
                            walk(child, str(k))
                    elif isinstance(v, list):
                        for child in v:
                            walk(child, key)
                    elif isinstance(v, str):
                        if key in {"main", "preload", "entry", "file", "path", "script"} or Path(v).suffix.lower() in PATH_SUFFIXES:
                            specs.append((v, f"json_{key or 'path'}"))
                walk(obj)
                if origin.name == "package.json":
                    for group in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
                        for dep in (obj.get(group) or {}):
                            self.external_dependencies[dep].add(norm_rel(origin.relative_to(self.old_root)))
            except json.JSONDecodeError:
                pass
        elif suffix in {".bat", ".cmd", ".ps1"}:
            for quoted in re.findall(r"['\"]([^'\"]+)['\"]", text):
                if Path(quoted).suffix.lower() in PATH_SUFFIXES or "\\" in quoted or "/" in quoted:
                    specs.append((quoted, "script_path"))
            for m in re.finditer(r"(?i)(?:-File|call|python(?:\.exe)?|py(?:\.exe)?|node(?:\.exe)?)\s+([^\s>]+)", text):
                specs.append((m.group(1).strip('"\''), "script_exec"))
        # Generic path strings help catch renderer resources and contract files.
        for m in re.finditer(r"['\"]([^'\"\r\n]{1,300})['\"]", text):
            val = m.group(1).strip()
            if Path(val).suffix.lower() in PATH_SUFFIXES and not val.startswith(("http:", "https:", "data:")):
                specs.append((val, "generic_path_literal"))
        resolved: list[tuple[Path, str]] = []
        seen: set[tuple[str, str]] = set()
        for spec, kind in specs:
            if not spec:
                continue
            local = self.resolve_local_spec(origin, spec)
            if local:
                key = (str(local).lower(), kind)
                if key not in seen:
                    resolved.append((local, kind))
                    seen.add(key)
            else:
                # Classify bare JS/Python module names as external rather than unresolved local paths.
                if re.match(r"^[A-Za-z0-9_@][A-Za-z0-9_@./-]*$", spec) and not spec.startswith((".", "/", "\\")) and not Path(spec).suffix:
                    module = spec.split("/")[0] if not spec.startswith("@") else "/".join(spec.split("/")[:2])
                    self.external_dependencies[module].add(norm_rel(origin.relative_to(self.old_root)))
                elif Path(spec).suffix.lower() in PATH_SUFFIXES or spec.startswith((".", "/", "\\")):
                    self.unresolved_references.append({
                        "origin": norm_rel(origin.relative_to(self.old_root)),
                        "reference": spec,
                        "kind": kind,
                    })
        return resolved

    def expand_dependency_closure(self) -> None:
        queue: deque[str] = deque(sorted(self.selection))
        processed: set[str] = set()
        while queue:
            dest_rel = queue.popleft()
            if dest_rel in processed:
                continue
            processed.add(dest_rel)
            selection = self.selection.get(dest_rel)
            if selection is None:
                continue
            for dep, kind in self.parse_dependencies(selection.source):
                dep_dest = norm_rel(dep.relative_to(self.old_root))
                if is_forbidden_relative(dep_dest):
                    continue
                self.dependency_edges.add((dest_rel, dep_dest, kind))
                prior = dep_dest in self.selection
                self.add_selection(dep, dep_dest, f"dependency:{kind}", inbound_from=dest_rel)
                if not prior and dep_dest in self.selection:
                    queue.append(dep_dest)
        self.log(f"[DEPENDENCY_CLOSURE] selected={len(self.selection)} edges={len(self.dependency_edges)} unresolved={len(self.unresolved_references)}")

    def copy_selected(self) -> None:
        for rel, sel in sorted(self.selection.items()):
            dst = self.new_root / Path(rel)
            try:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(sel.source, dst)
            except Exception as exc:  # noqa: BLE001
                self.copy_failures.append({"source": str(sel.source), "destination": str(dst), "error": str(exc)})
        self.log(f"[COPY] copied={len(self.selection) - len(self.copy_failures)} failures={len(self.copy_failures)}")

    def generate_runtime_files(self) -> None:
        if not self.candidate_dir or not self.safe_main:
            return
        candidate_rel = norm_rel(self.candidate_dir.relative_to(self.old_root)).replace("/", "\\")
        safe_main_rel = norm_rel(self.safe_main.relative_to(self.old_root)).replace("/", "\\")
        safe_dir_rel = norm_rel(self.safe_main.parent.relative_to(self.old_root)).replace("/", "\\")
        launcher = f'''@echo off
setlocal EnableExtensions
title Source Factory Active Core SAFE Panel
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\\" set "ROOT=%ROOT:~0,-1%"
set "CAND=%ROOT%\\{candidate_rel}"
set "SAFE=%ROOT%\\{safe_dir_rel}"
set "MAIN=%ROOT%\\{safe_main_rel}"
set "LOGROOT=%ROOT%\\_ACTIVE_CORE_LOGS"
set "LOG=%LOGROOT%\\RUN_SF4_ACTIVE_CORE_SAFE_PANEL_LAST.log"
if not exist "%LOGROOT%" mkdir "%LOGROOT%"
(
  echo ==================================================
  echo Source Factory Active Core SAFE Panel
  echo ROOT=%ROOT%
  echo CAND=%CAND%
  echo MAIN=%MAIN%
  echo ==================================================
) > "%LOG%"
if not exist "%MAIN%" (
  echo [FAIL] Missing Electron main: %MAIN%
  echo [FAIL] Missing Electron main: %MAIN% >> "%LOG%"
  exit /b 21
)
cd /d "%CAND%"
if exist "node_modules\\.bin\\electron.cmd" (
  call "node_modules\\.bin\\electron.cmd" "%MAIN%" >> "%LOG%" 2>&1
) else (
  call npx --no-install electron "%MAIN%" >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo [DEPENDENCY_REQUIRED] Run INSTALL_ACTIVE_CORE_DEPENDENCIES.ps1 first.
    echo [DEPENDENCY_REQUIRED] Run INSTALL_ACTIVE_CORE_DEPENDENCIES.ps1 first. >> "%LOG%"
    exit /b 22
  )
)
endlocal
'''
        launcher_path = self.new_root / "RUN_SF4_ACTIVE_CORE_SAFE_PANEL.bat"
        write_text(launcher_path, launcher)
        self.generated_files.append(norm_rel(launcher_path.relative_to(self.new_root)))
        install_ps = f'''$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Candidate = Join-Path $Root '{candidate_rel.replace('\\', '/')}'
$Package = Join-Path $Candidate 'package.json'
if (-not (Test-Path -LiteralPath $Package)) {{ throw "package.json missing: $Package" }}
Set-Location -LiteralPath $Candidate
if (Test-Path -LiteralPath (Join-Path $Candidate 'package-lock.json')) {{
  npm ci
}} else {{
  npm install
}}
Write-Host 'ACTIVE CORE DEPENDENCIES INSTALLED'
Write-Host 'Run RUN_SF4_ACTIVE_CORE_SAFE_PANEL.bat'
'''
        install_path = self.new_root / "INSTALL_ACTIVE_CORE_DEPENDENCIES.ps1"
        write_text(install_path, install_ps)
        self.generated_files.append(norm_rel(install_path.relative_to(self.new_root)))
        readme = f"""# Source Factory Active Core Runtime

- Original root: `{self.old_root}` (read-only; not deleted)
- Active root: `{self.new_root}`
- Runtime entry: `RUN_SF4_ACTIVE_CORE_SAFE_PANEL.bat`
- Dependency install seed: `{candidate_rel}\\package.json`

`node_modules` is deliberately not migrated. Install dependencies once by running:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& \"{self.new_root}\\INSTALL_ACTIVE_CORE_DEPENDENCIES.ps1\"
```

Then run `RUN_SF4_ACTIVE_CORE_SAFE_PANEL.bat`.
"""
        readme_path = self.new_root / "ACTIVE_CORE_RUN_INSTRUCTIONS.md"
        write_text(readme_path, readme)
        self.generated_files.append(norm_rel(readme_path.relative_to(self.new_root)))

    def infer_role(self, rel: str, source_path: Path, reasons: Iterable[str]) -> tuple[str, str, str]:
        lower = rel.lower()
        name = Path(rel).name.lower()
        reason_text = " ".join(sorted(reasons)).lower()
        if name.endswith((".bat", ".cmd")) and ("run_" in name or "launcher" in reason_text):
            return "RUNTIME_LAUNCHER", "Starts the local Source Factory runtime or a validation workflow.", "startup"
        if name in {"package.json", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"}:
            return "DEPENDENCY_SEED", "Defines reproducible Node/Electron dependencies and package entry metadata.", "install"
        if "safe_panel_main" in name or (name.endswith(("main.js", "main.cjs")) and "safe_panel" in lower):
            return "ELECTRON_MAIN", "Creates and coordinates the SAFE Panel Electron main process.", "runtime-main"
        if "preload" in name:
            return "ELECTRON_PRELOAD", "Exposes a controlled bridge from Electron main/IPC to renderer code.", "runtime-preload"
        if name.endswith(("renderer.js", "renderer.cjs", "renderer.mjs")) or "renderer" in lower:
            return "ELECTRON_RENDERER", "Implements SAFE Panel renderer UI behavior and event binding.", "runtime-renderer"
        if "queue" in lower or any(x in name for x in ("claim_store", "receipt_store", "lifecycle")):
            return "QUEUE_AND_LIFECYCLE", "Persists local queue claims, receipts, or worker lifecycle state.", "runtime-support"
        if "pc_agent" in lower or "command_runner" in name:
            return "PC_AGENT_COMPONENT", "Defines local command execution or PC Agent orchestration without starting the service during migration.", "runtime-support"
        if "runtime_pipeline" in lower:
            return "RUNTIME_PIPELINE", "Defines or registers Source Factory runtime pipeline stages and contracts.", "runtime-support"
        if "gpt_browser_bridge" in lower or any(x in name for x in ("buttonhandlers", "diagnostics", "filenamesafe", "stage1selfcheck")):
            return "GPT_BROWSER_BRIDGE", "Connects SAFE Panel controls, diagnostics, and browser-facing helper behavior.", "runtime-bridge"
        if "_constitution_v2_compact" in lower:
            return "COMPACT_CONSTITUTION", "Provides compact Source Factory operating contracts and machine-readable rules.", "configuration"
        if lower.startswith("rules/powershell51/"):
            return "POWERSHELL51_RULE", "Provides PowerShell 5.1 compatibility and execution rules.", "configuration"
        if lower.startswith("tools/"):
            return "VERIFICATION_OR_INSTALL_TOOL", "Provides verified one-flow, install, or validation automation retained for active-core operation.", "tooling"
        if name.endswith(".json"):
            return "RUNTIME_CONFIG_OR_CONTRACT", "Supplies machine-readable configuration, schema, or runtime contract data.", "configuration"
        if name.endswith((".html", ".htm")):
            return "RENDERER_DOCUMENT", "Defines renderer document structure loaded by the SAFE Panel.", "runtime-renderer"
        if name.endswith(".css"):
            return "RENDERER_STYLE", "Defines visual layout and presentation for the SAFE Panel renderer.", "runtime-renderer"
        if name.endswith((".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".woff", ".woff2", ".ttf")):
            return "RUNTIME_ASSET", "Provides an image, icon, or font loaded by the active runtime.", "runtime-asset"
        if name.endswith(".py"):
            return "PYTHON_RUNTIME_HELPER", "Provides a Python helper reached by the runtime or retained active-core tooling.", "runtime-support"
        if name.endswith((".js", ".cjs", ".mjs")):
            return "JAVASCRIPT_RUNTIME_MODULE", "Provides a JavaScript module reached from the Electron/Node runtime dependency graph.", "runtime-support"
        if name.endswith((".md", ".txt")):
            return "OPERATION_REFERENCE", "Documents active-core operation, rules, or generated evidence.", "documentation"
        return "RUNTIME_RESOURCE", "Provides a resource selected by the runtime dependency closure.", "runtime-resource"

    def validate(self) -> dict[str, Any]:
        required_missing = [rel for rel in sorted(self.required_destinations) if not (self.new_root / rel).is_file()]
        required_missing.extend(item["canonical_path"] for item in self.missing_required)
        json_results: list[dict[str, Any]] = []
        python_results: list[dict[str, Any]] = []
        js_results: list[dict[str, Any]] = []
        syntax_temp = Path(tempfile.mkdtemp(prefix="sf028_pycompile_"))
        node = shutil.which("node")
        try:
            for p in iter_files(self.new_root):
                rel = norm_rel(p.relative_to(self.new_root))
                suffix = p.suffix.lower()
                if suffix == ".json" and p.name not in REPORT_NAMES:
                    try:
                        json.loads(read_text(p))
                        status = {"path": rel, "pass": True}
                    except Exception as exc:  # noqa: BLE001
                        status = {"path": rel, "pass": False, "error": str(exc)}
                    json_results.append(status)
                    self.validation_by_file[rel]["json_parse"] = status["pass"]
                elif suffix == ".py":
                    try:
                        cfile = syntax_temp / (hashlib.sha1(rel.encode()).hexdigest() + ".pyc")
                        py_compile.compile(str(p), cfile=str(cfile), doraise=True)
                        status = {"path": rel, "pass": True}
                    except Exception as exc:  # noqa: BLE001
                        status = {"path": rel, "pass": False, "error": str(exc)}
                    python_results.append(status)
                    self.validation_by_file[rel]["python_compile"] = status["pass"]
                elif suffix in {".js", ".cjs", ".mjs"}:
                    if node:
                        cmd = run_command([node, "--check", str(p)], timeout=60)
                        status = {"path": rel, "pass": cmd.get("returncode") == 0, "stderr": cmd.get("stderr", "")}
                    else:
                        status = {"path": rel, "pass": None, "error": "node executable not found"}
                    js_results.append(status)
                    self.validation_by_file[rel]["js_syntax"] = status["pass"]
        finally:
            shutil.rmtree(syntax_temp, ignore_errors=True)

        forbidden_found: list[str] = []
        for current, dirs, files in os.walk(self.new_root):
            p = Path(current)
            rel_dir = norm_rel(p.relative_to(self.new_root)) if p != self.new_root else ""
            if rel_dir and is_forbidden_relative(rel_dir):
                forbidden_found.append(rel_dir)
            for name in files:
                rel = norm_rel((p / name).relative_to(self.new_root))
                if is_forbidden_relative(rel):
                    forbidden_found.append(rel)
        hash_entries: list[dict[str, Any]] = []
        manifest_excludes = set(REPORT_NAMES)
        for p in sorted(iter_files(self.new_root), key=lambda x: norm_rel(x.relative_to(self.new_root)).lower()):
            rel = norm_rel(p.relative_to(self.new_root))
            if rel in manifest_excludes:
                continue
            hash_entries.append({"path": rel, "size_bytes": p.stat().st_size, "sha256": sha256_file(p)})
        # Hash verification is performed by recomputing every entry immediately.
        hash_mismatches: list[dict[str, str]] = []
        for item in hash_entries:
            p = self.new_root / item["path"]
            actual = sha256_file(p) if p.is_file() else "MISSING"
            if actual != item["sha256"]:
                hash_mismatches.append({"path": item["path"], "expected": item["sha256"], "actual": actual})
        package_seeds = [item["path"] for item in hash_entries if Path(item["path"]).name == "package.json"]
        electron_installed = False
        if self.candidate_dir:
            candidate_rel = self.candidate_dir.relative_to(self.old_root)
            electron_installed = (self.new_root / candidate_rel / "node_modules" / ".bin" / "electron.cmd").is_file()
        json_pass = all(item["pass"] for item in json_results) if json_results else True
        python_pass = all(item["pass"] for item in python_results) if python_results else True
        js_pass = bool(js_results) and all(item["pass"] is True for item in js_results)
        verify = {
            "object_type": "SF028_VERIFY_ACTIVE_CORE_REPORT",
            "schema_version": "2.0.0",
            "run_id": self.run_id,
            "generated_at": utc_now(),
            "old_root": str(self.old_root),
            "new_root": str(self.new_root),
            "old_root_deleted": False,
            "required_files_present": len(required_missing) == 0,
            "required_files_missing": sorted(set(required_missing)),
            "json_parse": {"pass": json_pass, "checked": len(json_results), "failures": [x for x in json_results if not x["pass"]]},
            "python_compile": {"pass": python_pass, "checked": len(python_results), "failures": [x for x in python_results if not x["pass"]]},
            "js_syntax": {
                "pass": js_pass,
                "checked": len(js_results),
                "node_found": bool(node),
                "failures_or_not_run": [x for x in js_results if x["pass"] is not True],
            },
            "manifest_hash": {"pass": not hash_mismatches, "checked": len(hash_entries), "mismatches": hash_mismatches},
            "forbidden_copied_dirs_count": len(forbidden_found),
            "forbidden_copied_paths": sorted(set(forbidden_found)),
            "copy_failures": self.copy_failures,
            "package_seed_present": bool(package_seeds),
            "package_seed_paths": package_seeds,
            "node_modules_copied": False,
            "runtime_dependency_state": "INSTALLED" if electron_installed else "INSTALL_REQUIRED",
            "runtime_launch_ready": electron_installed,
            "source_seed_ready": False,
            "new_root_ready": False,
        }
        core_pass = (
            verify["required_files_present"]
            and json_pass
            and python_pass
            and js_pass
            and verify["manifest_hash"]["pass"]
            and verify["forbidden_copied_dirs_count"] == 0
            and not self.copy_failures
            and verify["package_seed_present"]
        )
        verify["source_seed_ready"] = core_pass
        verify["new_root_ready"] = core_pass
        return {"verify": verify, "hash_entries": hash_entries}

    def build_role_analysis(self, hash_entries: list[dict[str, Any]]) -> dict[str, Any]:
        inbound: dict[str, list[dict[str, str]]] = defaultdict(list)
        outbound: dict[str, list[dict[str, str]]] = defaultdict(list)
        for src, dst, kind in sorted(self.dependency_edges):
            outbound[src].append({"to": dst, "kind": kind})
            inbound[dst].append({"from": src, "kind": kind})
        hash_map = {x["path"]: x for x in hash_entries}
        files: list[dict[str, Any]] = []
        all_paths = sorted(set(hash_map) | set(self.generated_files), key=str.lower)
        for rel in all_paths:
            sel = self.selection.get(rel)
            src = sel.source if sel else self.new_root / rel
            reasons = sorted(sel.reasons) if sel else ["generated_active_core_runtime_file"]
            role, summary, phase = self.infer_role(rel, src, reasons)
            item = {
                "path": rel,
                "source_path": str(src) if sel else "GENERATED_IN_NEW_ROOT",
                "selection_reasons": reasons,
                "role_class": role,
                "role_summary": summary,
                "execution_phase": phase,
                "size_bytes": hash_map.get(rel, {}).get("size_bytes", (self.new_root / rel).stat().st_size if (self.new_root / rel).is_file() else 0),
                "sha256": hash_map.get(rel, {}).get("sha256", sha256_file(self.new_root / rel) if (self.new_root / rel).is_file() else None),
                "inbound_dependencies": inbound.get(rel, []),
                "outbound_dependencies": outbound.get(rel, []),
                "validation": self.validation_by_file.get(rel, {}),
            }
            files.append(item)
        counts: dict[str, int] = defaultdict(int)
        for item in files:
            counts[item["role_class"]] += 1
        return {
            "object_type": "SF028_SOURCE_ROLE_ANALYSIS",
            "schema_version": "2.0.0",
            "run_id": self.run_id,
            "generated_at": utc_now(),
            "entry_bat": str(self.entry_bat),
            "electron_main": str(self.safe_main) if self.safe_main else None,
            "role_counts": dict(sorted(counts.items())),
            "files": files,
        }

    def write_reports(self, validation: dict[str, Any], role_analysis: dict[str, Any]) -> None:
        verify = validation["verify"]
        hash_entries = validation["hash_entries"]
        total_size = sum(item["size_bytes"] for item in hash_entries)
        if self.args.measure_old_root:
            self.log("[MEASURE] calculating OLD_ROOT size (read-only)")
            self.old_root_size_bytes, self.old_root_file_count = tree_size_and_count(self.old_root)
        reduction = None
        if self.old_root_size_bytes:
            reduction = {
                "bytes_reduced": self.old_root_size_bytes - total_size,
                "percent_reduced": round((1 - total_size / self.old_root_size_bytes) * 100, 4),
            }
        manifest = {
            "object_type": "SF028_ACTIVE_CORE_MANIFEST",
            "schema_version": "2.0.0",
            "run_id": self.run_id,
            "generated_at": utc_now(),
            "worker_id": WORKER_ID,
            "task_id": TASK_ID,
            "old_root": str(self.old_root),
            "entry_bat": str(self.entry_bat),
            "new_root": str(self.new_root),
            "old_root_deleted": False,
            "file_count": len(hash_entries),
            "total_size_bytes": total_size,
            "files": hash_entries,
        }
        copy_report = {
            "object_type": "SF028_MIGRATION_COPY_REPORT",
            "schema_version": "2.0.0",
            "run_id": self.run_id,
            "generated_at": utc_now(),
            "old_root": str(self.old_root),
            "new_root": str(self.new_root),
            "archived_incomplete_root": str(self.archive_path) if self.archive_path else None,
            "selected_file_count": len(self.selection),
            "generated_file_count": len(self.generated_files),
            "copied_file_count": len(self.selection) - len(self.copy_failures),
            "copy_failures": self.copy_failures,
            "selection": [
                {
                    "source": str(sel.source),
                    "destination": rel,
                    "reasons": sorted(sel.reasons),
                    "inbound_from": sorted(sel.inbound_from),
                }
                for rel, sel in sorted(self.selection.items())
            ],
            "missing_required_sources": self.missing_required,
            "unresolved_references": self.unresolved_references,
            "external_dependencies": {k: sorted(v) for k, v in sorted(self.external_dependencies.items())},
            "forbidden_operations": {
                "old_root_delete": "NOT_RUN",
                "old_root_modify": "NOT_RUN",
                "026_oneflow_verifier": "NOT_RUN",
                "pc_agent_service": "NOT_STARTED",
                "gpt_browser_external_api_middleware_production_deploy": "NOT_RUN",
                "node_modules_copy": "NOT_RUN",
            },
            "events": self.events,
        }
        dep_graph = {
            "object_type": "SF028_RUNTIME_DEPENDENCY_GRAPH",
            "schema_version": "2.0.0",
            "run_id": self.run_id,
            "entry": norm_rel(self.entry_bat.relative_to(self.old_root)),
            "electron_main": norm_rel(self.safe_main.relative_to(self.old_root)) if self.safe_main else None,
            "nodes": sorted(set(self.selection) | set(self.generated_files)),
            "edges": [{"from": a, "to": b, "kind": k} for a, b, k in sorted(self.dependency_edges)],
            "external_dependencies": {k: sorted(v) for k, v in sorted(self.external_dependencies.items())},
            "unresolved_references": self.unresolved_references,
        }
        delete_ready = bool(verify["source_seed_ready"])
        delete_md = f"""# SF_028 DELETE OLD ROOT READY REPORT

- Run ID: `{self.run_id}`
- OLD_ROOT: `{self.old_root}`
- NEW_ROOT: `{self.new_root}`
- OLD_ROOT deleted: **false**
- DELETE_OLD_ROOT_READY: **{str(delete_ready).lower()}**

## Gate evidence

1. Required files present: `{verify['required_files_present']}`
2. Manifest SHA-256 match: `{verify['manifest_hash']['pass']}`
3. Python py_compile: `{verify['python_compile']['pass']}`
4. JSON parse: `{verify['json_parse']['pass']}`
5. JavaScript syntax: `{verify['js_syntax']['pass']}`
6. Forbidden copied paths: `{verify['forbidden_copied_dirs_count']}`
7. Install package seed present: `{verify['package_seed_present']}`
8. Runtime dependencies: `{verify['runtime_dependency_state']}`
9. Runtime launch ready now: `{verify['runtime_launch_ready']}`

`DELETE_OLD_ROOT_READY=true` means the active-core source and install seed passed the migration gate. The worker does not delete OLD_ROOT. Commander approval remains required. Because `node_modules` is intentionally excluded, runtime launch requires the generated dependency-install step unless dependencies are already installed separately.
"""
        role_md_lines = [
            "# SF_028 Source Role Analysis",
            "",
            f"Run ID: `{self.run_id}`",
            "",
            "| Path | Role | Phase | Purpose |",
            "|---|---|---|---|",
        ]
        for item in role_analysis["files"]:
            purpose = item["role_summary"].replace("|", "\\|")
            role_md_lines.append(f"| `{item['path']}` | `{item['role_class']}` | `{item['execution_phase']}` | {purpose} |")
        role_md = "\n".join(role_md_lines) + "\n"
        terminal = "SF_028_ACTIVE_CORE_MIGRATION_PASS" if verify["source_seed_ready"] else "SF_028_ACTIVE_CORE_MIGRATION_FAIL"
        report_file_lines = "\n".join(f"  - {name}" for name in REPORT_NAMES)
        worker_report = f"""WORKER_REPORT_START
worker_id: {WORKER_ID}
task_id: {TASK_ID}
old_root: {self.old_root}
new_root: {self.new_root}
files_copied_count: {len(self.selection) - len(self.copy_failures)}
total_new_root_size_bytes: {total_size}
old_root_size_bytes: {self.old_root_size_bytes if self.old_root_size_bytes is not None else 'NOT_MEASURED'}
size_reduction_estimate: {json.dumps(reduction, ensure_ascii=False) if reduction else 'NOT_AVAILABLE'}
files_created:
{report_file_lines}
files_modified:
  - NONE_IN_OLD_ROOT
verification:
  required_files_present: {str(verify['required_files_present']).lower()}
  json_parse: {str(verify['json_parse']['pass']).lower()}
  python_compile: {str(verify['python_compile']['pass']).lower()}
  js_syntax: {str(verify['js_syntax']['pass']).lower()}
  manifest_hash: {str(verify['manifest_hash']['pass']).lower()}
  forbidden_dirs_copied: {verify['forbidden_copied_dirs_count']}
delete_old_root_ready: {str(delete_ready).lower()}
old_root_deleted: false
tests_run:
  - required file presence
  - JSON parse
  - Python py_compile
  - JavaScript node --check
  - manifest SHA-256 recomputation
  - forbidden path scan
tests_not_run:
  - 026 one-flow verifier
  - PC Agent service
  - Electron runtime launch
  - external API or middleware
forbidden_operations:
  old_root_delete: NOT_RUN
  production_source_modify: NOT_RUN
  pc_agent_service: NOT_STARTED
  external_effect: GITHUB_REPORT_ONLY_IF_PUBLISHED
class_contract_status: {'PASS' if verify['source_seed_ready'] else 'FAIL'}
priority_0_status: PASS_OLD_ROOT_UNMODIFIED
known_risks:
  - static dependency analysis can miss paths constructed entirely at runtime; full SAFE directory is therefore retained
  - node_modules is forbidden from migration, so npm dependency installation is required before standalone Electron launch
  - unresolved_reference_count={len(self.unresolved_references)}
next_needed: {'Commander deletion approval after reviewing GitHub and local reports.' if delete_ready else 'Correct missing or failed validation items and rerun SF_028.'}
WORKER_REPORT_END

{terminal}
"""
        write_json(self.new_root / "ACTIVE_CORE_MANIFEST.json", manifest)
        write_json(self.new_root / "MIGRATION_COPY_REPORT.json", copy_report)
        write_json(self.new_root / "VERIFY_ACTIVE_CORE_REPORT.json", verify)
        write_text(self.new_root / "DELETE_OLD_ROOT_READY_REPORT.md", delete_md)
        write_text(self.new_root / "WORKER_REPORT_SF028.md", worker_report)
        write_json(self.new_root / "SOURCE_ROLE_ANALYSIS.json", role_analysis)
        write_text(self.new_root / "SOURCE_ROLE_ANALYSIS.md", role_md)
        write_json(self.new_root / "RUNTIME_DEPENDENCY_GRAPH.json", dep_graph)

    def publish_reports_to_github(self) -> None:
        if not self.args.publish_github:
            self.github_report["status"] = "NOT_REQUESTED"
            write_json(self.new_root / "GITHUB_PUBLISH_REPORT.json", self.github_report)
            return
        gh = shutil.which("gh")
        git = shutil.which("git")
        if not gh or not git:
            self.github_report.update({"status": "NOT_RUN_TOOL_MISSING", "gh_found": bool(gh), "git_found": bool(git)})
            write_json(self.new_root / "GITHUB_PUBLISH_REPORT.json", self.github_report)
            return
        auth = run_command([gh, "auth", "status"], timeout=60)
        self.github_report["auth_check"] = auth
        if auth.get("returncode") != 0:
            self.github_report["status"] = "NOT_RUN_GH_NOT_AUTHENTICATED"
            write_json(self.new_root / "GITHUB_PUBLISH_REPORT.json", self.github_report)
            return
        publish_root = self.destination_base / "_sf028_github_publish" / self.run_id
        if publish_root.exists():
            shutil.rmtree(publish_root)
        publish_root.parent.mkdir(parents=True, exist_ok=True)
        clone = run_command([
            gh, "repo", "clone", self.args.github_repo, str(publish_root), "--",
            "--branch", self.args.github_branch, "--single-branch", "--depth", "1",
        ], timeout=300)
        self.github_report["clone"] = clone
        if clone.get("returncode") != 0:
            self.github_report["status"] = "CLONE_FAILED"
            write_json(self.new_root / "GITHUB_PUBLISH_REPORT.json", self.github_report)
            return
        report_dir = publish_root / "state" / "sf028-active-core-migration" / self.run_id
        report_dir.mkdir(parents=True, exist_ok=True)
        for name in REPORT_NAMES:
            src = self.new_root / name
            if src.is_file() and name != "GITHUB_PUBLISH_REPORT.json":
                shutil.copy2(src, report_dir / name)
        worker_source = Path(__file__).resolve()
        worker_repo_path = publish_root / "tools" / "sf028_active_core_migrate.py"
        worker_repo_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(worker_source, worker_repo_path)
        pointer = {
            "object_type": "SF028_ACTIVE_CORE_LATEST_POINTER",
            "run_id": self.run_id,
            "path": f"state/sf028-active-core-migration/{self.run_id}",
            "generated_at": utc_now(),
            "old_root": str(self.old_root),
            "new_root": str(self.new_root),
            "old_root_deleted": False,
        }
        write_json(publish_root / "state" / "sf028-active-core-migration" / "LATEST.json", pointer)
        add = run_command([git, "add", "state/sf028-active-core-migration", "tools/sf028_active_core_migrate.py"], cwd=publish_root)
        commit = run_command([git, "commit", "-m", f"record SF028 active core migration {self.run_id}"], cwd=publish_root)
        push = run_command([git, "push", "origin", self.args.github_branch], cwd=publish_root, timeout=300)
        self.github_report.update({"git_add": add, "git_commit": commit, "git_push": push})
        if push.get("returncode") == 0:
            head = run_command([git, "rev-parse", "HEAD"], cwd=publish_root)
            self.github_report.update({
                "status": "PUBLISHED",
                "commit": (head.get("stdout") or "").strip(),
                "repository_path": f"state/sf028-active-core-migration/{self.run_id}",
            })
        else:
            self.github_report["status"] = "PUSH_FAILED"
        write_json(self.new_root / "GITHUB_PUBLISH_REPORT.json", self.github_report)

    def finalize_terminal(self) -> str:
        verify_path = self.new_root / "VERIFY_ACTIVE_CORE_REPORT.json"
        verify = json.loads(read_text(verify_path)) if verify_path.is_file() else {}
        local_pass = bool(verify.get("source_seed_ready"))
        github_ok = (not self.args.publish_github) or self.github_report.get("status") == "PUBLISHED"
        if local_pass and github_ok:
            terminal = "SF_028_ACTIVE_CORE_MIGRATION_PASS"
        elif local_pass:
            terminal = "SF_028_ACTIVE_CORE_MIGRATION_YELLOW_REVIEW_NEEDED"
        else:
            terminal = "SF_028_ACTIVE_CORE_MIGRATION_FAIL"
        write_text(self.new_root / "SF028_TERMINAL.txt", terminal + "\n")
        return terminal

    def run(self) -> int:
        self.preflight()
        self.select_seeds()
        self.expand_dependency_closure()
        self.copy_selected()
        self.generate_runtime_files()
        validation = self.validate()
        role_analysis = self.build_role_analysis(validation["hash_entries"])
        self.write_reports(validation, role_analysis)
        self.publish_reports_to_github()
        terminal = self.finalize_terminal()
        self.log(f"[{terminal}]")
        self.log(f"[REPORT] {self.new_root / 'WORKER_REPORT_SF028.md'}")
        self.log(f"[ROLE_ANALYSIS] {self.new_root / 'SOURCE_ROLE_ANALYSIS.md'}")
        self.log(f"[GITHUB] {self.github_report.get('status')}")
        return 0 if terminal == "SF_028_ACTIVE_CORE_MIGRATION_PASS" else (2 if terminal.endswith("YELLOW_REVIEW_NEEDED") else 1)


def write_failure_report(args: argparse.Namespace, exc: BaseException) -> None:
    new_root = Path(args.new_root)
    try:
        new_root.mkdir(parents=True, exist_ok=True)
        detail = {
            "object_type": "SF028_FATAL_ERROR",
            "generated_at": utc_now(),
            "worker_id": WORKER_ID,
            "task_id": TASK_ID,
            "old_root": args.old_root,
            "new_root": args.new_root,
            "old_root_deleted": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
        write_json(new_root / "SF028_FATAL_ERROR.json", detail)
        write_text(new_root / "SF028_TERMINAL.txt", "SF_028_ACTIVE_CORE_MIGRATION_FAIL\n")
    except Exception:
        pass


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Migrate Source Factory active runtime core without touching OLD_ROOT.")
    parser.add_argument("--old-root", default=r"D:\SOURCE FACTORY")
    parser.add_argument("--entry-bat", default=r"D:\SOURCE FACTORY\RUN_SF4_SAFE_PANEL_ONLY.bat")
    parser.add_argument("--new-root", default=r"E:\SOURCE FACTORY\source-factory-active-core")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--archive-existing", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--measure-old-root", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--publish-github", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--github-repo", default=DEFAULT_REPO)
    parser.add_argument("--github-branch", default=DEFAULT_BRANCH)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return Migrator(args).run()
    except KeyboardInterrupt:
        print("[INTERRUPTED] OLD_ROOT was not deleted or modified.", file=sys.stderr)
        return 130
    except Exception as exc:  # noqa: BLE001
        write_failure_report(args, exc)
        print(f"[SF_028_ACTIVE_CORE_MIGRATION_FAIL] {exc}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
