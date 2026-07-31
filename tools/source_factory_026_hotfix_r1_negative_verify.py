#!/usr/bin/env python3
"""Negative-only verifier for Source Factory 026 HOTFIX R1.

This verifier is deliberately local and fixture-only. It does not invoke the 026
one-flow verifier, mutate a remote queue, send prompts, launch a browser, start a
PC Agent service, call external APIs, transmit middleware data, or deploy.

Final execution requires exact SLOT 01/02/03 commit SHAs. The verifier checks that
each commit is an ancestor of the local HEAD before importing production modules.
All writes are confined to the selected report directory.
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, MutableMapping, Sequence

sys.dont_write_bytecode = True
os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")

SCHEMA_VERSION = "SOURCE_FACTORY_026_HOTFIX_R1_NEGATIVE_VERIFY_V1"
REQUIRED_UPSTREAM_SLOTS = ("slot_01", "slot_02", "slot_03")
SHA40_RE = re.compile(r"^[0-9a-f]{40}$")
FORBIDDEN_COUNTER_FIELDS = (
    "prompt_send_count",
    "browser_launch_count",
    "pc_agent_service_start_count",
    "external_api_call_count",
    "middleware_transmission_count",
    "production_deploy_count",
)


class VerificationFailure(AssertionError):
    """Raised for an observed contract failure."""


def now_kst_compact() -> str:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y%m%d_%H%M%S")
    except Exception:
        return datetime.now().strftime("%Y%m%d_%H%M%S")


def to_dict(value: Any) -> Dict[str, Any]:
    if dataclasses.is_dataclass(value):
        return dataclasses.asdict(value)
    if isinstance(value, Mapping):
        return dict(value)
    if hasattr(value, "__dict__"):
        return dict(vars(value))
    return {"value": str(value)}


def status_of(value: Any) -> str:
    return str(to_dict(value).get("status", ""))


def assert_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise VerificationFailure(f"{label}: expected={expected!r}, actual={actual!r}")


def assert_true(condition: bool, label: str) -> None:
    if not condition:
        raise VerificationFailure(label)


def load_module(module_name: str, path: Path) -> Any:
    if not path.is_file():
        raise FileNotFoundError(f"required module missing: {path}")
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def run_git(repo_root: Path, args: Sequence[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo_root), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
        check=False,
    )


def verify_upstream_commits(repo_root: Path, commits: Mapping[str, str]) -> Dict[str, Any]:
    observations: Dict[str, Any] = {}
    head_result = run_git(repo_root, ["rev-parse", "HEAD"])
    if head_result.returncode != 0:
        raise VerificationFailure(f"git HEAD unavailable: {head_result.stderr.strip()}")
    head = head_result.stdout.strip()

    for slot in REQUIRED_UPSTREAM_SLOTS:
        sha = str(commits.get(slot, "")).strip().lower()
        if not SHA40_RE.fullmatch(sha):
            raise VerificationFailure(f"{slot} exact 40-character commit SHA required")
        exists = run_git(repo_root, ["cat-file", "-e", f"{sha}^{{commit}}"])
        ancestor = run_git(repo_root, ["merge-base", "--is-ancestor", sha, head])
        observations[slot] = {
            "commit": sha,
            "exists": exists.returncode == 0,
            "ancestor_of_head": ancestor.returncode == 0,
        }
        if exists.returncode != 0:
            raise VerificationFailure(f"{slot} commit not present locally: {sha}")
        if ancestor.returncode != 0:
            raise VerificationFailure(f"{slot} commit is not an ancestor of HEAD: {sha}")

    return {"head": head, "slots": observations}


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def snapshot_tree(repo_root: Path, excluded_roots: Iterable[Path]) -> Dict[str, str]:
    excluded = [path.resolve() for path in excluded_roots]
    snapshot: Dict[str, str] = {}
    for path in repo_root.rglob("*"):
        resolved = path.resolve()
        if any(is_relative_to(resolved, root) for root in excluded):
            continue
        if ".git" in path.parts or "__pycache__" in path.parts:
            continue
        if path.is_file():
            snapshot[path.relative_to(repo_root).as_posix()] = file_digest(path)
    return snapshot


def compare_snapshots(before: Mapping[str, str], after: Mapping[str, str]) -> Dict[str, List[str]]:
    before_keys = set(before)
    after_keys = set(after)
    return {
        "created": sorted(after_keys - before_keys),
        "deleted": sorted(before_keys - after_keys),
        "modified": sorted(key for key in before_keys & after_keys if before[key] != after[key]),
    }


def record_case(name: str, callback: Callable[[], Dict[str, Any]]) -> Dict[str, Any]:
    try:
        detail = callback()
        return {"name": name, "status": "PASS", "detail": detail}
    except Exception as exc:
        return {
            "name": name,
            "status": "FAIL",
            "error_type": type(exc).__name__,
            "error": str(exc),
        }


class SpyCommandRunner:
    def __init__(self) -> None:
        self.invocation_count = 0

    def execute(self, _spec: Any) -> Dict[str, Any]:
        self.invocation_count += 1
        return {
            "status": "SPY_COMMAND_SHOULD_NOT_RUN",
            "command_id": "SPY",
            "argv": [],
            "exit_code": 99,
            "stdout": "",
            "stderr": "unexpected spy invocation",
            "duration_ms": 0,
            "timeout_seconds": 0,
            "forbidden_effect_counters": {field: 0 for field in FORBIDDEN_COUNTER_FIELDS},
        }


class SpyReceiptStore:
    def __init__(self, delegate: Any) -> None:
        self.delegate = delegate
        self.save_invocation_count = 0

    def save_terminal_receipt(self, receipt: Dict[str, Any]) -> Dict[str, Any]:
        self.save_invocation_count += 1
        return self.delegate.save_terminal_receipt(receipt)

    def list_receipts(self) -> List[Dict[str, Any]]:
        return self.delegate.list_receipts()


def instantiate_command_runner(command_module: Any) -> Any:
    runner_cls = command_module.LocalCommandRunner
    try:
        return runner_cls(["LOCAL_PYTHON_VERSION_CHECK"])
    except TypeError:
        return runner_cls()


def replace_spec(spec: Any, **changes: Any) -> Any:
    if dataclasses.is_dataclass(spec):
        return dataclasses.replace(spec, **changes)
    payload = to_dict(spec)
    payload.update(changes)
    return type(spec)(**payload)


def valid_receipt() -> Dict[str, Any]:
    return {
        "schema_version": "SOURCE_FACTORY_TERMINAL_WORKER_RECEIPT_V1",
        "status": "DRY_RUN_PC_AGENT_LOCAL_COMMAND_COMPLETED",
        "worker_id": "SOURCE_FACTORY_NEGATIVE_FIXTURE_WORKER",
        "task_id": "SF_026_R1_NEGATIVE_FIXTURE",
        "assignment_id": "ASSIGNMENT-SF026-R1-NEGATIVE",
        "claim_key": "CLAIM-SF026-R1-NEGATIVE",
        "queue_id": "QUEUE-SF026-R1-NEGATIVE",
        "project_code": "SOURCE_FACTORY",
        "outputs": [],
        "verification": {"dry_run_only": True},
        "blockers": [],
        "forbidden_effect_counters": {field: 0 for field in FORBIDDEN_COUNTER_FIELDS},
    }


def run_duplicate_claim_case(modules: Mapping[str, Any], work_dir: Path) -> Dict[str, Any]:
    claim_store = modules["claim"].LocalClaimStore(work_dir / "duplicate_claim_store.json")
    receipt_delegate = modules["receipt"].TerminalReceiptStore(work_dir / "duplicate_receipt_store.json")
    receipt_store = SpyReceiptStore(receipt_delegate)
    command_runner = SpyCommandRunner()

    queue_item = {
        "queue_id": "QUEUE-SF026-DUPLICATE",
        "project_code": "SOURCE_FACTORY",
        "target_stage": "SF_026_R1_NEGATIVE_FIXTURE",
    }
    assignment = {
        "assignment_id": "ASSIGNMENT-SF026-DUPLICATE",
        "worker_id": "SOURCE_FACTORY_NEGATIVE_FIXTURE_WORKER",
        "target_stage": "SF_026_R1_NEGATIVE_FIXTURE",
    }
    seeded = claim_store.try_claim(
        queue_id=queue_item["queue_id"],
        assignment_id=assignment["assignment_id"],
        worker_id=assignment["worker_id"],
    )
    before_claim_count = len(claim_store.list_claims())
    before_receipt_count = len(receipt_store.list_receipts())

    command_spec = modules["command"].build_python_version_command()
    result = modules["mvp"].run_local_pc_agent_mvp(
        queue_item=queue_item,
        assignment=assignment,
        claim_store=claim_store,
        command_runner=command_runner,
        command_spec=command_spec,
        receipt_store=receipt_store,
    )
    payload = to_dict(result)

    assert_equal(status_of(seeded), "ACCEPTED_FIRST_CLAIM", "preseed claim")
    assert_equal(payload.get("claim_attempt_status"), "REJECTED_DUPLICATE_CLAIM", "first claim status")
    assert_equal(payload.get("command_status"), "NOT_RUN_CLAIM_REJECTED", "command status")
    assert_equal(command_runner.invocation_count, 0, "spy command invocation count")
    assert_equal(receipt_store.save_invocation_count, 0, "receipt save invocation count")
    assert_equal(len(claim_store.list_claims()), before_claim_count, "claim store count")
    assert_equal(len(receipt_store.list_receipts()), before_receipt_count, "receipt store count")
    assert_equal(int(payload.get("external_side_effect_count", -1)), 0, "external side effect count")

    if "command_invocation_count" in payload:
        assert_equal(int(payload["command_invocation_count"]), 0, "reported command invocation count")
    if "receipt_save_status" in payload:
        assert_equal(payload["receipt_save_status"], "NOT_RUN_CLAIM_REJECTED", "receipt save status")

    return {
        "result_status": payload.get("status"),
        "claim_attempt_status": payload.get("claim_attempt_status"),
        "command_status": payload.get("command_status"),
        "spy_command_invocations": command_runner.invocation_count,
        "receipt_save_invocations": receipt_store.save_invocation_count,
        "claim_store_count_before": before_claim_count,
        "claim_store_count_after": len(claim_store.list_claims()),
        "receipt_store_count_before": before_receipt_count,
        "receipt_store_count_after": len(receipt_store.list_receipts()),
    }


def run_command_rejection_cases(command_module: Any) -> Dict[str, Any]:
    runner = instantiate_command_runner(command_module)
    canonical = command_module.build_python_version_command()
    original_run = command_module.subprocess.run
    subprocess_invocations: List[List[str]] = []

    def forbidden_subprocess(*args: Any, **_kwargs: Any) -> Any:
        subprocess_invocations.append(list(args[0]) if args else [])
        raise VerificationFailure("subprocess reached during rejection case")

    try:
        command_module.subprocess.run = forbidden_subprocess
        mismatched = replace_spec(canonical, argv=[sys.executable, "-c", "print('mismatch')"])
        mismatch_result = runner.execute(mismatched)
        assert_equal(status_of(mismatch_result), "REJECTED_COMMAND_SPEC_MISMATCH", "mismatch status")
        assert_equal(len(subprocess_invocations), 0, "mismatch subprocess invocation count")

        unknown = replace_spec(canonical, command_id="UNKNOWN_COMMAND_ID")
        unknown_result = runner.execute(unknown)
        unknown_status = status_of(unknown_result)
        assert_true(
            unknown_status in {"REJECTED_COMMAND_NOT_ALLOWLISTED", "REJECTED_UNKNOWN_COMMAND_ID"},
            f"unknown command status not explicit: {unknown_status}",
        )
        assert_equal(len(subprocess_invocations), 0, "unknown subprocess invocation count")
    finally:
        command_module.subprocess.run = original_run

    return {
        "mismatch_status": status_of(mismatch_result),
        "unknown_status": status_of(unknown_result),
        "subprocess_invocation_count": len(subprocess_invocations),
    }


def assert_structured_launch_failure(result: Any, expected_hint: str) -> Dict[str, Any]:
    payload = to_dict(result)
    status = str(payload.get("status", ""))
    assert_true(status.startswith("FAIL_"), f"launch failure status must start FAIL_: {status}")
    assert_equal(int(payload.get("exit_code", 0)), -1, "launch failure exit code")
    assert_true(bool(str(payload.get("stderr", "")).strip()), "launch failure stderr must be nonblank")
    normalized = status.replace("-", "_").upper()
    if expected_hint == "FILE_NOT_FOUND":
        assert_true(
            "FILE" in normalized and ("NOT_FOUND" in normalized or "OS_ERROR" in normalized or "OSERROR" in normalized),
            f"FileNotFoundError status not explicit: {status}",
        )
    else:
        assert_true(
            "OS_ERROR" in normalized or "OSERROR" in normalized or "LAUNCH" in normalized,
            f"OSError status not explicit: {status}",
        )
    return {"status": status, "exit_code": payload.get("exit_code"), "stderr": payload.get("stderr")}


def run_launch_failure_cases(command_module: Any) -> Dict[str, Any]:
    runner = instantiate_command_runner(command_module)
    canonical = command_module.build_python_version_command()
    original_run = command_module.subprocess.run

    try:
        def raise_not_found(*_args: Any, **_kwargs: Any) -> Any:
            raise FileNotFoundError("fixture executable not found")

        command_module.subprocess.run = raise_not_found
        not_found = runner.execute(canonical)
        not_found_detail = assert_structured_launch_failure(not_found, "FILE_NOT_FOUND")

        def raise_oserror(*_args: Any, **_kwargs: Any) -> Any:
            raise OSError("fixture launch denied")

        command_module.subprocess.run = raise_oserror
        os_error = runner.execute(canonical)
        os_error_detail = assert_structured_launch_failure(os_error, "OS_ERROR")
    finally:
        command_module.subprocess.run = original_run

    return {"file_not_found": not_found_detail, "os_error": os_error_detail}


def run_receipt_validation_cases(receipt_module: Any, work_dir: Path) -> Dict[str, Any]:
    store = receipt_module.TerminalReceiptStore(work_dir / "receipt_validation_store.json")
    observations: Dict[str, Any] = {}

    def reject_case(name: str, mutate: Callable[[MutableMapping[str, Any]], None]) -> None:
        receipt = valid_receipt()
        mutate(receipt)
        before = len(store.list_receipts())
        result = store.save_terminal_receipt(receipt)
        after = len(store.list_receipts())
        assert_equal(status_of(result), "REJECTED_INVALID_TERMINAL_RECEIPT", f"{name} status")
        assert_equal(after, before, f"{name} store count")
        problems = to_dict(result).get("problems", [])
        assert_true(isinstance(problems, list) and len(problems) > 0, f"{name} problems missing")
        observations[name] = {"status": status_of(result), "problems": problems, "stored_delta": after - before}

    reject_case("missing_queue_id", lambda receipt: receipt.pop("queue_id", None))
    reject_case("blank_assignment_id", lambda receipt: receipt.__setitem__("assignment_id", "   "))
    reject_case("blank_claim_key", lambda receipt: receipt.__setitem__("claim_key", ""))

    def remove_counter(receipt: MutableMapping[str, Any]) -> None:
        counters = dict(receipt["forbidden_effect_counters"])
        counters.pop("external_api_call_count")
        receipt["forbidden_effect_counters"] = counters

    reject_case("missing_forbidden_counter", remove_counter)

    def nonzero_counter(receipt: MutableMapping[str, Any]) -> None:
        counters = dict(receipt["forbidden_effect_counters"])
        counters["external_api_call_count"] = 1
        receipt["forbidden_effect_counters"] = counters

    reject_case("nonzero_forbidden_counter", nonzero_counter)

    valid = valid_receipt()
    first = store.save_terminal_receipt(valid)
    second = store.save_terminal_receipt(valid)
    assert_equal(status_of(first), "ACCEPTED_TERMINAL_RECEIPT", "valid receipt first save")
    assert_equal(status_of(second), "REJECTED_DUPLICATE_TERMINAL_RECEIPT", "valid receipt duplicate save")
    assert_equal(len(store.list_receipts()), 1, "valid receipt final store count")
    observations["valid_first_duplicate_second"] = {
        "first_status": status_of(first),
        "second_status": status_of(second),
        "stored_count": len(store.list_receipts()),
    }
    return observations


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Source Factory 026 HOTFIX R1 negative verifier")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--slot-01-commit", required=True)
    parser.add_argument("--slot-02-commit", required=True)
    parser.add_argument("--slot-03-commit", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    output_dir = (args.output_dir or (repo_root / "reports" / f"slot_04_026_hotfix_r1_negative_verify_{now_kst_compact()}")).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    result: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "status": "FAIL_NEGATIVE_VERIFY",
        "repo_root": str(repo_root),
        "output_dir": str(output_dir),
        "oneflow_026_invocation_count": 0,
        "remote_queue_mutation_count": 0,
        "external_side_effect_count": 0,
        "upstream_commits": {
            "slot_01": args.slot_01_commit.lower(),
            "slot_02": args.slot_02_commit.lower(),
            "slot_03": args.slot_03_commit.lower(),
        },
        "cases": [],
    }

    before = snapshot_tree(repo_root, [output_dir])
    try:
        result["upstream_intake"] = verify_upstream_commits(repo_root, result["upstream_commits"])
        modules = {
            "claim": load_module("sf026_claim_store", repo_root / "src" / "queue" / "local_claim_store.py"),
            "receipt": load_module("sf026_receipt_store", repo_root / "src" / "queue" / "terminal_receipt_store.py"),
            "command": load_module("sf026_command_runner", repo_root / "src" / "pc_agent" / "local_command_runner.py"),
            "mvp": load_module("sf026_local_pc_agent_mvp", repo_root / "src" / "pc_agent" / "local_pc_agent_mvp.py"),
        }

        with tempfile.TemporaryDirectory(prefix="fixture_", dir=output_dir) as temp_name:
            work_dir = Path(temp_name)
            result["cases"] = [
                record_case("preseeded_duplicate_claim_no_command_no_receipt", lambda: run_duplicate_claim_case(modules, work_dir)),
                record_case("canonical_mismatch_and_unknown_no_subprocess", lambda: run_command_rejection_cases(modules["command"])),
                record_case("command_launch_failures_structured", lambda: run_launch_failure_cases(modules["command"])),
                record_case("terminal_receipt_validation_and_dedupe", lambda: run_receipt_validation_cases(modules["receipt"], work_dir)),
            ]

        after = snapshot_tree(repo_root, [output_dir])
        mutation = compare_snapshots(before, after)
        result["unexpected_mutation_observation"] = mutation
        mutation_count = sum(len(items) for items in mutation.values())
        result["unexpected_mutation_count"] = mutation_count
        all_cases_pass = all(case.get("status") == "PASS" for case in result["cases"])
        result["status"] = "PASS_NEGATIVE_VERIFY" if all_cases_pass and mutation_count == 0 else "FAIL_NEGATIVE_VERIFY"
    except Exception as exc:
        result["fatal_error"] = {"type": type(exc).__name__, "message": str(exc)}
        after = snapshot_tree(repo_root, [output_dir])
        result["unexpected_mutation_observation"] = compare_snapshots(before, after)
        result["unexpected_mutation_count"] = sum(
            len(items) for items in result["unexpected_mutation_observation"].values()
        )

    result_path = output_dir / "negative_verify_result.json"
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("status") == "PASS_NEGATIVE_VERIFY" else 1


if __name__ == "__main__":
    raise SystemExit(main())
