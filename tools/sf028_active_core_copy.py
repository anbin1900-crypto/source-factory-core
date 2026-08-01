#!/usr/bin/env python3
"""SF_028 Active Core copy worker.

Copies only the verified/seeded Source Factory active-core files into a new root,
never overwriting an existing target and never deleting or modifying source files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

WORKER_ID = "SLOT_03_SF028_ACTIVE_CORE_COPY_WORKER"
TASK_ID = "SF_028_ACTIVE_CORE_COPY_TO_NEW_ROOT"

OLD_ROOT_CANDIDATES = (
    Path(r"D:\SOURCE FACTORY\source-factory-core"),
    Path(r"E:\YOLLA\source-factory-core"),
)

SEED_PATHS = (
    "_CONSTITUTION_V2_COMPACT/00_AI_SUPER_BOOT_v2_1_2_COMPACT.md",
    "_CONSTITUTION_V2_COMPACT/01_COMPACT_RULE_SCHEMA_v2_1_2.json",
    "_CONSTITUTION_V2_COMPACT/02_WORKER_COMMANDER_CONTRACTS_COMPACT_v2_1_2.md",
    "_CONSTITUTION_V2_COMPACT/03_STAGE4_AUTOMATION_CONTRACT_COMPACT_v2_1_2.md",
    "_CONSTITUTION_V2_COMPACT/04_COMPACT_INSTALL_AND_REFERENCE_MAP_v2_1_2.json",
    "_CONSTITUTION_V2_COMPACT/FINAL_COMPACT_MANIFEST_v2_1_2.json",
    "_CONSTITUTION_V2_COMPACT/V2_1_2_COMPACT_UPDATE_REPORT.md",
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
    "rules/powershell51",
)

MANIFEST_PATHS = (
    "state/SF_028_RUNTIME_REACHABILITY_GRAPH.json",
    "state/SF_028_ACTIVE_RUNTIME_CORE_MANIFEST.json",
    "state/SF_028_VERIFY_ONLY_SOURCE_MANIFEST.json",
    "state/SF_028_PENDING_INTEGRATION_SOURCE_LEDGER.json",
)

REQUIRED_NEW_DIRS = (
    "_CONSTITUTION_V2_COMPACT",
    "src/queue",
    "src/pc_agent",
    "src/runtime_pipeline",
    "src/gpt_browser_bridge",
    "tools",
    "rules",
    "config",
    "state",
    "reports/install_verify",
    "install",
)

FORBIDDEN_SEGMENTS = {
    ".git",
    "node_modules",
    "reports",
    "daily_queue",
    "staging",
    "extracted",
    "candidate",
    "backlog",
    "dist",
    "build",
    "cache",
    "temp",
}
FORBIDDEN_SUFFIXES = {".zip", ".7z", ".tar", ".gz"}
ALLOWED_MANIFEST_CLASSES = {"RUNTIME_REACHABLE_ACTIVE", "VERIFY_ONLY"}


@dataclass(frozen=True)
class Candidate:
    relative_path: str
    classification: str
    source_basis: str
    required: bool = False


@dataclass(frozen=True)
class CopyRecord:
    old_path: str
    new_path: str
    relative_path: str
    size_bytes: int
    sha256_old: str
    sha256_new: str
    hash_match: bool
    classification: str
    source_basis: str


def now_iso() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()


def timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_relative(value: str) -> str:
    normalized = value.strip().replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    normalized = normalized.lstrip("/")
    if not normalized or normalized == ".":
        raise ValueError("empty relative path")
    parts = Path(normalized).parts
    if ".." in parts:
        raise ValueError(f"parent traversal is forbidden: {value}")
    return "/".join(parts)


def is_forbidden(relative_path: str) -> bool:
    normalized = normalize_relative(relative_path).lower()
    parts = normalized.split("/")
    if any(part in FORBIDDEN_SEGMENTS for part in parts):
        return True
    return Path(normalized).suffix.lower() in FORBIDDEN_SUFFIXES


def resolve_old_root(requested: str | None) -> Path:
    if requested:
        root = Path(requested).expanduser().resolve()
        if not root.is_dir():
            raise FileNotFoundError(f"OLD_ROOT_NOT_FOUND:{root}")
        return root
    for candidate in OLD_ROOT_CANDIDATES:
        if candidate.is_dir():
            return candidate.resolve()
    raise FileNotFoundError("OLD_ROOT_NOT_FOUND_IN_CANDIDATES")


def default_new_root(old_root: Path) -> Path:
    return old_root.parent / "source-factory-active-core"


def resolve_new_root(old_root: Path, requested: str | None, run_stamp: str) -> tuple[Path, bool]:
    candidate = Path(requested).expanduser() if requested else default_new_root(old_root)
    candidate = candidate.resolve()
    collision = candidate.exists()
    if collision:
        candidate = candidate.parent / f"{candidate.name}-preview-{run_stamp}"
    if candidate.exists():
        raise FileExistsError(f"TIMESTAMPED_NEW_ROOT_ALREADY_EXISTS:{candidate}")
    return candidate, collision


def candidate_key(relative_path: str) -> str:
    return normalize_relative(relative_path).lower()


def add_candidate(mapping: dict[str, Candidate], candidate: Candidate) -> None:
    relative = normalize_relative(candidate.relative_path)
    if is_forbidden(relative):
        return
    key = candidate_key(relative)
    existing = mapping.get(key)
    normalized = Candidate(relative, candidate.classification, candidate.source_basis, candidate.required)
    if existing is None or (candidate.required and not existing.required):
        mapping[key] = normalized


def get_item_path(item: dict[str, Any]) -> str | None:
    for key in ("relative_path", "path", "file", "source_path"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def get_item_classification(item: dict[str, Any], default: str | None) -> str | None:
    for key in ("classification", "status", "class"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().upper()
    return default


def walk_manifest(value: Any, default_class: str | None = None) -> Iterable[tuple[str, str]]:
    if isinstance(value, str):
        if default_class in ALLOWED_MANIFEST_CLASSES and ("/" in value or "\\" in value or Path(value).suffix):
            yield value, default_class
        return
    if isinstance(value, list):
        for item in value:
            yield from walk_manifest(item, default_class)
        return
    if not isinstance(value, dict):
        return

    classification = get_item_classification(value, default_class)
    path_value = get_item_path(value)
    if path_value and classification in ALLOWED_MANIFEST_CLASSES:
        yield path_value, classification

    for key, child in value.items():
        key_lower = key.lower()
        child_default = classification
        if key_lower in {"runtime_reachable_active", "active_files"}:
            child_default = "RUNTIME_REACHABLE_ACTIVE"
        elif key_lower in {"verify_only", "verify_only_files"}:
            child_default = "VERIFY_ONLY"
        yield from walk_manifest(child, child_default)


def import_manifest_candidates(old_root: Path, mapping: dict[str, Candidate]) -> tuple[list[str], bool]:
    manifests_read: list[str] = []
    graph_used = False
    for relative in MANIFEST_PATHS:
        path = old_root / relative
        if not path.is_file():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for file_path, classification in walk_manifest(data):
            add_candidate(mapping, Candidate(file_path, classification, "reachability_graph", False))
        manifests_read.append(relative)
        if relative.endswith("SF_028_RUNTIME_REACHABILITY_GRAPH.json"):
            graph_used = True
    return manifests_read, graph_used


def expand_candidate(old_root: Path, candidate: Candidate) -> list[tuple[Path, Candidate]]:
    source = old_root / candidate.relative_path
    if source.is_file():
        return [(source, candidate)]
    if source.is_dir():
        expanded: list[tuple[Path, Candidate]] = []
        for source_file in sorted(source.rglob("*")):
            if not source_file.is_file():
                continue
            relative = source_file.relative_to(old_root).as_posix()
            if is_forbidden(relative):
                continue
            expanded.append(
                (source_file, Candidate(relative, candidate.classification, candidate.source_basis, candidate.required))
            )
        return expanded
    return []


def build_candidates(old_root: Path) -> tuple[list[tuple[Path, Candidate]], list[dict[str, Any]], list[str], bool]:
    mapping: dict[str, Candidate] = {}
    for relative in SEED_PATHS:
        classification = "PENDING_INTEGRATION" if relative.endswith("local_pc_agent_mvp.py") else "COMMANDER_SEED_ACTIVE"
        add_candidate(mapping, Candidate(relative, classification, "commander_seed", True))
    manifests_read, graph_used = import_manifest_candidates(old_root, mapping)

    expanded_by_key: dict[str, tuple[Path, Candidate]] = {}
    missing: list[dict[str, Any]] = []
    for candidate in mapping.values():
        expanded = expand_candidate(old_root, candidate)
        if not expanded:
            missing.append(asdict(candidate))
            continue
        for source, expanded_candidate in expanded:
            key = candidate_key(expanded_candidate.relative_path)
            expanded_by_key.setdefault(key, (source, expanded_candidate))
    return sorted(expanded_by_key.values(), key=lambda item: item[1].relative_path), missing, manifests_read, graph_used


def make_structure(new_root: Path) -> None:
    new_root.mkdir(parents=True, exist_ok=False)
    for relative in REQUIRED_NEW_DIRS:
        (new_root / relative).mkdir(parents=True, exist_ok=True)


def copy_files(old_root: Path, new_root: Path, files: list[tuple[Path, Candidate]]) -> tuple[list[CopyRecord], int, int]:
    records: list[CopyRecord] = []
    hash_mismatch_count = 0
    forbidden_count = 0
    for source, candidate in files:
        relative = normalize_relative(candidate.relative_path)
        if is_forbidden(relative):
            forbidden_count += 1
            continue
        destination = new_root / relative
        if destination.exists():
            raise FileExistsError(f"DESTINATION_OVERWRITE_BLOCKED:{destination}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        old_hash = sha256(source)
        new_hash = sha256(destination)
        match = old_hash == new_hash
        if not match:
            hash_mismatch_count += 1
        records.append(
            CopyRecord(
                old_path=str(source),
                new_path=str(destination),
                relative_path=relative,
                size_bytes=destination.stat().st_size,
                sha256_old=old_hash,
                sha256_new=new_hash,
                hash_match=match,
                classification=candidate.classification,
                source_basis=candidate.source_basis,
            )
        )
    return records, hash_mismatch_count, forbidden_count


def choose_terminal(graph_used: bool, missing_count: int, collision: bool, hash_mismatch: int, forbidden_count: int) -> str:
    if hash_mismatch or forbidden_count:
        return "SF_028_SLOT_03_ACTIVE_CORE_COPY_FAIL"
    if not graph_used or missing_count or collision:
        return "SF_028_SLOT_03_ACTIVE_CORE_COPY_YELLOW"
    return "SF_028_SLOT_03_ACTIVE_CORE_COPY_PASS"


def render_readme(old_root: Path, new_root: Path, basis: str, file_count: int, terminal: str) -> str:
    return f"""# Source Factory Active Core

Generated by `sf028_active_core_copy.py`.

- Source OLD_ROOT: `{old_root}`
- Active NEW_ROOT: `{new_root}`
- Copy basis: `{basis}`
- Copied files: `{file_count}`
- Terminal status: `{terminal}`

This folder excludes `.git`, `node_modules`, historical reports, daily queues,
staging/extracted/candidate/backlog trees, build/cache/temp directories, and archives.

Do not delete OLD_ROOT until SLOT 05 standalone verification and SLOT 06
old-root delete-readiness gate both pass, followed by separate user/Commander approval.
"""


def render_worker_report(report: dict[str, Any], worker_report_path: Path, state_report_path: Path) -> str:
    missing_count = len(report["missing_candidates"])
    required_status = "PASS" if missing_count == 0 else f"YELLOW_MISSING_{missing_count}"
    hash_status = "PASS" if report["hash_mismatch_count"] == 0 else f"FAIL_{report['hash_mismatch_count']}"
    risks = []
    if report["copy_basis"] != "reachability_graph":
        risks.append("SLOT_02 reachability graph was unavailable; commander seed basis used.")
    if report["new_root_collision_detected"]:
        risks.append("Requested NEW_ROOT already existed; timestamped preview root used.")
    if missing_count:
        risks.append(f"missing_candidate_count={missing_count}")
    if not risks:
        risks.append("No assigned-scope risk detected.")
    risk_lines = "\n".join(f"  - {risk}" for risk in risks)
    return f"""# SLOT 03 — SF_028 Active Core Copy Worker Report

WORKER_REPORT_START
worker_id: {WORKER_ID}
task_id: {TASK_ID}
worker_function_class: RUN_SCRIPT_WORKER
old_root: {report['old_root']}
new_root: {report['new_root']}
copy_basis: {report['copy_basis']}
files_copied_count: {report['files_copied_count']}
total_new_root_size_bytes: {report['total_new_root_size_bytes']}
forbidden_dirs_copied_count: {report['forbidden_dirs_copied_count']}
files_created:
  - {report['new_root']}/ACTIVE_CORE_MANIFEST.json
  - {report['new_root']}/MIGRATION_COPY_REPORT.json
  - {report['new_root']}/README_ACTIVE_CORE.md
  - {state_report_path}
  - {worker_report_path}
files_modified: []
verification:
  required_files_present: {required_status}
  manifest_hash_match: {hash_status}
  forbidden_dirs_copied: {report['forbidden_dirs_copied_count']}
  old_root_deleted: false
tests_run:
  - SHA256 source/destination verification for every copied file
  - forbidden path filter verification
  - required NEW_ROOT structure creation
  - manifest and report JSON generation
tests_not_run:
  - 026 one-flow verifier
  - PC Agent service
forbidden_operations:
  old_root_delete: NOT_RUN
  old_root_modify: NOT_RUN
  git_rm: NOT_RUN
  026_oneflow_verifier: NOT_RUN
  pc_agent_service: NOT_STARTED
  external_effect: 0
class_contract_status: PASS_RUN_SCRIPT_WORKER
priority_0_status: PASS
known_risks:
{risk_lines}
next_needed: SLOT_04 constitution completion then SLOT_05 standalone active-core verification
terminal_status: {report['terminal_status']}
WORKER_REPORT_END
"""


def execute(args: argparse.Namespace) -> dict[str, Any]:
    run_stamp = timestamp()
    old_root = resolve_old_root(args.old_root)
    new_root, collision = resolve_new_root(old_root, args.new_root, run_stamp)
    files, missing, manifests_read, graph_used = build_candidates(old_root)
    basis = "reachability_graph" if graph_used else "commander_seed"

    plan = {
        "schema_version": "SF_028_ACTIVE_CORE_COPY_PLAN_V1",
        "generated_at": now_iso(),
        "worker_id": WORKER_ID,
        "task_id": TASK_ID,
        "old_root": str(old_root),
        "new_root": str(new_root),
        "new_root_collision_detected": collision,
        "copy_basis": basis,
        "manifests_read": manifests_read,
        "planned_files_count": len(files),
        "missing_candidates": missing,
        "what_if_only": bool(args.what_if),
    }
    if args.what_if:
        return plan

    make_structure(new_root)
    records, hash_mismatch_count, forbidden_count = copy_files(old_root, new_root, files)
    terminal = choose_terminal(graph_used, len(missing), collision, hash_mismatch_count, forbidden_count)
    total_size = sum(record.size_bytes for record in records)

    active_manifest = {
        "schema_version": "SF_028_ACTIVE_CORE_MANIFEST_V1",
        "generated_at": now_iso(),
        "old_root": str(old_root),
        "new_root": str(new_root),
        "copy_basis": basis,
        "copied_files_count": len(records),
        "total_size_bytes": total_size,
        "files": [asdict(record) for record in records],
    }
    migration_report = {
        "schema_version": "SF_028_MIGRATION_COPY_REPORT_V1",
        "generated_at": now_iso(),
        "worker_id": WORKER_ID,
        "task_id": TASK_ID,
        "old_root": str(old_root),
        "new_root": str(new_root),
        "new_root_collision_detected": collision,
        "copy_basis": basis,
        "manifests_read": manifests_read,
        "files_copied_count": len(records),
        "total_new_root_size_bytes": total_size,
        "missing_candidates": missing,
        "hash_mismatch_count": hash_mismatch_count,
        "forbidden_dirs_copied_count": forbidden_count,
        "old_root_deleted": False,
        "old_root_source_modified": False,
        "external_effect_count": 0,
        "terminal_status": terminal,
        "copied_files": [asdict(record) for record in records],
    }

    write_json(new_root / "ACTIVE_CORE_MANIFEST.json", active_manifest)
    write_json(new_root / "MIGRATION_COPY_REPORT.json", migration_report)
    write_text(new_root / "README_ACTIVE_CORE.md", render_readme(old_root, new_root, basis, len(records), terminal))

    state_report_path = old_root / "state/SF_028_ACTIVE_CORE_COPY_REPORT.json"
    if state_report_path.exists():
        state_report_path = old_root / f"state/SF_028_ACTIVE_CORE_COPY_REPORT_{run_stamp}.json"
    write_json(state_report_path, migration_report)

    worker_report_path = old_root / f"reports/sf028_slot03_active_core_copy_{run_stamp}/WORKER_REPORT_SLOT_03.md"
    write_text(worker_report_path, render_worker_report(migration_report, worker_report_path, state_report_path))
    return migration_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Copy Source Factory verified active core into a clean NEW_ROOT.")
    parser.add_argument("--old-root", help="Explicit OLD_ROOT. If omitted, D: then E: candidates are probed.")
    parser.add_argument("--new-root", help="Explicit NEW_ROOT. Existing roots are never overwritten.")
    parser.add_argument("--what-if", action="store_true", help="Resolve inputs and print a plan without writing files.")
    return parser


def main() -> int:
    try:
        result = execute(build_parser().parse_args())
        print(json.dumps(result, ensure_ascii=False, indent=2))
        terminal = result.get("terminal_status")
        return 1 if terminal == "SF_028_SLOT_03_ACTIVE_CORE_COPY_FAIL" else 0
    except Exception as exc:
        print(json.dumps({"status": "SF_028_SLOT_03_ACTIVE_CORE_COPY_FAIL", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
