#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "YOLLA_SOURCE_FACTORY_PC_AGENT_BRIDGE_V1"
DEFAULT_BRIDGE_ROOT = Path(os.environ.get(
    "YOLLA_PC_AGENT_BRIDGE_ROOT",
    r"E:\YOLLA\agent\state\source-factory-bridge-v1",
))
ALLOWED_BASENAMES = {
    "python", "python.exe", "python3", "python3.exe",
    "node", "node.exe",
    "powershell", "powershell.exe", "pwsh", "pwsh.exe",
    "cmd", "cmd.exe",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json_atomic(path: Path, value: Any) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True).encode("utf-8") + b"\n"
    temp = path.with_name(path.name + f".tmp-{os.getpid()}-{time.time_ns()}")
    with temp.open("xb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp, path)
    return {"path": str(path), "sha256": sha256_bytes(data), "size_bytes": len(data)}


@dataclass(frozen=True)
class BridgePaths:
    root: Path
    requests: Path
    processing: Path
    processed: Path
    results: Path
    failed: Path
    attempts: Path


def bridge_paths(root: Path) -> BridgePaths:
    resolved = root.resolve()
    values = BridgePaths(
        root=resolved,
        requests=resolved / "requests",
        processing=resolved / "processing",
        processed=resolved / "processed",
        results=resolved / "results",
        failed=resolved / "failed",
        attempts=resolved / "attempts",
    )
    for item in (values.requests, values.processing, values.processed, values.results, values.failed, values.attempts):
        item.mkdir(parents=True, exist_ok=True)
    return values


def validate_request(request: Any) -> list[str]:
    findings: list[str] = []
    if not isinstance(request, dict):
        return ["REQUEST_NOT_OBJECT"]
    if request.get("schema_version") != SCHEMA_VERSION:
        findings.append("SCHEMA_VERSION_INVALID")
    if request.get("object_type") != "WORK_REQUEST":
        findings.append("OBJECT_TYPE_INVALID")
    for field in (
        "work_id", "project_id", "cycle_id", "worker_slot_uid", "assignment_id",
        "directive_id", "execution_id", "attempt_id", "idempotency_key",
    ):
        if not str(request.get(field, "")).strip():
            findings.append(f"MISSING_{field.upper()}")
    command_spec = request.get("command_spec")
    if not isinstance(command_spec, dict):
        findings.append("COMMAND_SPEC_MISSING")
    else:
        executable = str(command_spec.get("executable", "")).strip()
        if not executable:
            findings.append("EXECUTABLE_MISSING")
        elif Path(executable).name.lower() not in ALLOWED_BASENAMES:
            findings.append("EXECUTABLE_NOT_ALLOWLISTED")
        if not isinstance(command_spec.get("args", []), list):
            findings.append("ARGS_NOT_ARRAY")
        timeout = command_spec.get("timeout_seconds", 300)
        try:
            timeout_number = int(timeout)
        except (TypeError, ValueError):
            timeout_number = 0
        if timeout_number < 1 or timeout_number > 3600:
            findings.append("TIMEOUT_OUT_OF_RANGE")
        env = command_spec.get("env", {})
        if not isinstance(env, dict):
            findings.append("ENV_NOT_OBJECT")
        else:
            for key in env:
                if any(token in key.lower() for token in ("secret", "token", "password", "credential")):
                    findings.append("INLINE_SECRET_ENV_KEY_FORBIDDEN")
    if request.get("production") is not False:
        findings.append("PRODUCTION_MUST_BE_FALSE")
    return findings


def scrub_environment(env_input: dict[str, Any]) -> dict[str, str]:
    env = os.environ.copy()
    for key, value in env_input.items():
        name = str(key)
        if any(token in name.lower() for token in ("secret", "token", "password", "credential")):
            raise ValueError(f"INLINE_SECRET_ENV_KEY_FORBIDDEN:{name}")
        env[name] = str(value)
    env["YOLLA_PC_AGENT_BRIDGE_EXECUTION"] = "1"
    env["YOLLA_PRODUCTION"] = "0"
    return env


def build_result(
    request: dict[str, Any],
    *,
    final_status: str,
    exit_code: int,
    stdout: str = "",
    stderr: str = "",
    started_at: str,
    completed_at: str,
    external_blocker: dict[str, Any] | None = None,
    execution_error: str | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "object_type": "WORK_RESULT",
        "work_id": request.get("work_id"),
        "project_id": request.get("project_id"),
        "cycle_id": request.get("cycle_id"),
        "worker_slot_uid": request.get("worker_slot_uid"),
        "assignment_id": request.get("assignment_id"),
        "directive_id": request.get("directive_id"),
        "execution_id": request.get("execution_id"),
        "attempt_id": request.get("attempt_id"),
        "source_github_ref": request.get("source_github_ref", ""),
        "final_status": final_status,
        "exit_code": int(exit_code),
        "stdout": stdout,
        "stderr": stderr,
        "outputs": [],
        "artifacts": [],
        "database_receipt": None,
        "github_commit": None,
        "github_comment": None,
        "external_blocker": external_blocker,
        "execution_error": execution_error,
        "started_at": started_at,
        "completed_at": completed_at,
        "production": False,
    }


def execute_request(request: dict[str, Any]) -> dict[str, Any]:
    started_at = now_iso()
    findings = validate_request(request)
    if findings:
        return build_result(
            request,
            final_status="BLOCKED",
            exit_code=126,
            stderr="WORK_REQUEST_INVALID:" + ",".join(findings),
            started_at=started_at,
            completed_at=now_iso(),
            external_blocker={"code": "WORK_REQUEST_INVALID", "findings": findings},
        )

    command_spec = request["command_spec"]
    executable = str(command_spec["executable"])
    args = [str(item) for item in command_spec.get("args", [])]
    cwd_value = str(command_spec.get("cwd", "")).strip()
    cwd = cwd_value or None
    timeout_seconds = int(command_spec.get("timeout_seconds", 300))

    try:
        completed = subprocess.run(
            [executable, *args],
            cwd=cwd,
            env=scrub_environment(command_spec.get("env", {})),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            shell=False,
            check=False,
        )
        final_status = "PASS" if completed.returncode == 0 else "FAIL"
        return build_result(
            request,
            final_status=final_status,
            exit_code=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
            started_at=started_at,
            completed_at=now_iso(),
        )
    except subprocess.TimeoutExpired as error:
        return build_result(
            request,
            final_status="FAIL",
            exit_code=124,
            stdout=(error.stdout or "") if isinstance(error.stdout, str) else "",
            stderr=(error.stderr or "") if isinstance(error.stderr, str) else "",
            started_at=started_at,
            completed_at=now_iso(),
            execution_error=f"TIMEOUT_AFTER_{timeout_seconds}_SECONDS",
        )
    except FileNotFoundError as error:
        return build_result(
            request,
            final_status="BLOCKED",
            exit_code=127,
            stderr=str(error),
            started_at=started_at,
            completed_at=now_iso(),
            external_blocker={"code": "EXECUTABLE_NOT_FOUND", "executable": executable},
        )
    except Exception as error:
        return build_result(
            request,
            final_status="FAIL",
            exit_code=125,
            stderr=str(error),
            started_at=started_at,
            completed_at=now_iso(),
            execution_error=type(error).__name__,
        )


def process_request_file(request_path: Path, paths: BridgePaths) -> dict[str, Any]:
    request = json.loads(request_path.read_text(encoding="utf-8"))
    work_id = str(request.get("work_id", request_path.stem))
    result_path = paths.results / f"{work_id}.json"
    if result_path.exists():
        duplicate = {
            "status": "DUPLICATE_RESULT_ALREADY_EXISTS",
            "work_id": work_id,
            "result_path": str(result_path),
        }
        archive = paths.processed / request_path.name
        os.replace(request_path, archive)
        return duplicate

    result = execute_request(request)
    result_receipt = write_json_atomic(result_path, result)
    archive_dir = paths.processed if result["final_status"] == "PASS" else paths.failed
    archive_path = archive_dir / request_path.name
    os.replace(request_path, archive_path)
    attempt_receipt = {
        "schema_version": SCHEMA_VERSION,
        "object_type": "WORK_ATTEMPT",
        "work_id": work_id,
        "attempt_id": request.get("attempt_id"),
        "request_archive": str(archive_path),
        "request_sha256": sha256_bytes(canonical_bytes(request)),
        "result_path": str(result_path),
        "result_sha256": result_receipt["sha256"],
        "final_status": result["final_status"],
        "exit_code": result["exit_code"],
        "completed_at": result["completed_at"],
        "production": False,
    }
    write_json_atomic(paths.attempts / f"{work_id}-{request.get('attempt_id', 'attempt')}.json", attempt_receipt)
    return {
        "status": result["final_status"],
        "work_id": work_id,
        "result_path": str(result_path),
        "exit_code": result["exit_code"],
    }


def claim_next(paths: BridgePaths) -> Path | None:
    for request in sorted(paths.requests.glob("*.json")):
        claimed = paths.processing / request.name
        try:
            os.replace(request, claimed)
            return claimed
        except FileNotFoundError:
            continue
        except PermissionError:
            continue
    return None


def run_loop(root: Path, once: bool, poll_seconds: float, max_jobs: int) -> int:
    paths = bridge_paths(root)
    processed_count = 0
    while True:
        request = claim_next(paths)
        if request is None:
            if once:
                break
            time.sleep(max(0.05, poll_seconds))
            continue
        result = process_request_file(request, paths)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        processed_count += 1
        if max_jobs > 0 and processed_count >= max_jobs:
            break
        if once:
            break
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bridge-root", default=str(DEFAULT_BRIDGE_ROOT))
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--poll-seconds", type=float, default=0.25)
    parser.add_argument("--max-jobs", type=int, default=0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    return run_loop(Path(args.bridge_root), args.once, args.poll_seconds, args.max_jobs)


if __name__ == "__main__":
    raise SystemExit(main())
