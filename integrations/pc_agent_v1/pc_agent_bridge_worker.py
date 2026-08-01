#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO

SCHEMA_VERSION = "YOLLA_SOURCE_FACTORY_PC_AGENT_BRIDGE_V1"
RUNTIME_SCHEMA_VERSION = "YOLLA_PC_AGENT_BRIDGE_RUNTIME_V1"
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
    control: Path
    runtime: Path
    recovery: Path


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
        control=resolved / "control",
        runtime=resolved / "runtime",
        recovery=resolved / "recovery",
    )
    for item in (
        values.requests, values.processing, values.processed, values.results,
        values.failed, values.attempts, values.control, values.runtime, values.recovery,
    ):
        item.mkdir(parents=True, exist_ok=True)
    return values


class SingletonFileLock:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.handle: BinaryIO | None = None
        self.locked = False

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.path.open("a+b")
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
            os.fsync(handle.fileno())
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (OSError, BlockingIOError):
            handle.close()
            return False
        self.handle = handle
        self.locked = True
        metadata = {
            "schema_version": RUNTIME_SCHEMA_VERSION,
            "object_type": "WORKER_LOCK_OWNER",
            "pid": os.getpid(),
            "host": socket.gethostname(),
            "acquired_at": now_iso(),
            "production": False,
        }
        payload = json.dumps(metadata, ensure_ascii=False, sort_keys=True).encode("utf-8")
        handle.seek(1)
        handle.truncate()
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
        return True

    def release(self) -> None:
        if not self.handle:
            return
        try:
            self.handle.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        finally:
            self.handle.close()
            self.handle = None
            self.locked = False

    def __enter__(self) -> "SingletonFileLock":
        if not self.acquire():
            raise RuntimeError("DUPLICATE_WORKER_INSTANCE")
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self.release()


def unique_destination(directory: Path, name: str, suffix: str) -> Path:
    candidate = directory / name
    if not candidate.exists():
        return candidate
    stem = Path(name).stem
    extension = Path(name).suffix
    return directory / f"{stem}.{suffix}-{time.time_ns()}{extension}"


def recover_processing(paths: BridgePaths) -> dict[str, Any]:
    actions: list[dict[str, Any]] = []
    for request_path in sorted(paths.processing.glob("*.json")):
        try:
            request = json.loads(request_path.read_text(encoding="utf-8"))
            work_id = str(request.get("work_id", request_path.stem))
        except Exception as error:
            destination = unique_destination(paths.failed, request_path.name, "recovery-invalid")
            os.replace(request_path, destination)
            actions.append({
                "status": "INVALID_PROCESSING_REQUEST_QUARANTINED",
                "source": str(request_path),
                "destination": str(destination),
                "error": f"{type(error).__name__}:{error}",
            })
            continue

        result_path = paths.results / f"{work_id}.json"
        if result_path.exists():
            destination = unique_destination(paths.processed, request_path.name, "recovery-result-exists")
            os.replace(request_path, destination)
            actions.append({
                "status": "RESULT_EXISTS_ARCHIVED",
                "work_id": work_id,
                "source": str(request_path),
                "destination": str(destination),
                "result_path": str(result_path),
            })
            continue

        queued_path = paths.requests / request_path.name
        if queued_path.exists():
            queued_hash = sha256_bytes(queued_path.read_bytes())
            processing_hash = sha256_bytes(request_path.read_bytes())
            destination = unique_destination(paths.processed, request_path.name, "recovery-queue-duplicate")
            os.replace(request_path, destination)
            actions.append({
                "status": "QUEUE_COPY_ALREADY_EXISTS_ARCHIVED",
                "work_id": work_id,
                "source": str(request_path),
                "destination": str(destination),
                "queued_path": str(queued_path),
                "hash_equal": queued_hash == processing_hash,
            })
            continue

        os.replace(request_path, queued_path)
        actions.append({
            "status": "REQUEUED_FROM_PROCESSING",
            "work_id": work_id,
            "source": str(request_path),
            "destination": str(queued_path),
        })

    receipt = {
        "schema_version": RUNTIME_SCHEMA_VERSION,
        "object_type": "STARTUP_RECOVERY_RECEIPT",
        "worker_pid": os.getpid(),
        "host": socket.gethostname(),
        "action_count": len(actions),
        "requeued_count": sum(item["status"] == "REQUEUED_FROM_PROCESSING" for item in actions),
        "result_exists_archived_count": sum(item["status"] == "RESULT_EXISTS_ARCHIVED" for item in actions),
        "queue_duplicate_archived_count": sum(item["status"] == "QUEUE_COPY_ALREADY_EXISTS_ARCHIVED" for item in actions),
        "invalid_quarantined_count": sum(item["status"] == "INVALID_PROCESSING_REQUEST_QUARANTINED" for item in actions),
        "actions": actions,
        "completed_at": now_iso(),
        "production": False,
    }
    receipt_name = f"RECOVERY-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}-{os.getpid()}.json"
    write_json_atomic(paths.recovery / receipt_name, receipt)
    write_json_atomic(paths.runtime / "last_recovery.json", receipt)
    return receipt


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
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def extract_structured_result(stdout: str) -> dict[str, Any] | None:
    prefix = "YOLLA_RESULT_JSON="
    for line in reversed(stdout.splitlines()):
        if line.startswith(prefix):
            value = json.loads(line[len(prefix):])
            if not isinstance(value, dict):
                raise ValueError("YOLLA_RESULT_JSON_NOT_OBJECT")
            if value.get("production") is not False:
                raise ValueError("STRUCTURED_RESULT_PRODUCTION_MUST_BE_FALSE")
            return value
    return None


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
    structured_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    structured = structured_result or {}
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
        "outputs": structured.get("outputs", []),
        "artifacts": structured.get("artifacts", []),
        "database_receipt": structured.get("database_receipt"),
        "github_commit": structured.get("github_commit"),
        "github_comment": structured.get("github_comment"),
        "structured_result": structured,
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
        structured_result = extract_structured_result(completed.stdout) if completed.returncode == 0 else None
        return build_result(
            request,
            final_status=final_status,
            exit_code=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
            started_at=started_at,
            completed_at=now_iso(),
            structured_result=structured_result,
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
            "production": False,
        }
        archive = unique_destination(paths.processed, request_path.name, "duplicate-result")
        os.replace(request_path, archive)
        duplicate["request_archive"] = str(archive)
        write_json_atomic(
            paths.attempts / f"{work_id}-{request.get('attempt_id', 'attempt')}-duplicate-{time.time_ns()}.json",
            {
                "schema_version": RUNTIME_SCHEMA_VERSION,
                "object_type": "DUPLICATE_SUPPRESSION_RECEIPT",
                "work_id": work_id,
                "attempt_id": request.get("attempt_id"),
                "result_path": str(result_path),
                "request_archive": str(archive),
                "status": "DUPLICATE_RESULT_ALREADY_EXISTS",
                "completed_at": now_iso(),
                "production": False,
            },
        )
        return duplicate

    result = execute_request(request)
    result_receipt = write_json_atomic(result_path, result)
    archive_dir = paths.processed if result["final_status"] == "PASS" else paths.failed
    archive_path = unique_destination(archive_dir, request_path.name, "attempt")
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
        "production": False,
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


def heartbeat(paths: BridgePaths, state: str, processed_count: int, recovery: dict[str, Any]) -> None:
    write_json_atomic(
        paths.runtime / "heartbeat.json",
        {
            "schema_version": RUNTIME_SCHEMA_VERSION,
            "object_type": "WORKER_HEARTBEAT",
            "state": state,
            "pid": os.getpid(),
            "host": socket.gethostname(),
            "processed_count": processed_count,
            "recovery_action_count": recovery.get("action_count", 0),
            "updated_at": now_iso(),
            "production": False,
        },
    )


def stop_requested(paths: BridgePaths) -> bool:
    stop_path = paths.control / "stop.request"
    if not stop_path.exists():
        return False
    request_text = ""
    try:
        request_text = stop_path.read_text(encoding="utf-8")
    except Exception:
        request_text = ""
    ack = {
        "schema_version": RUNTIME_SCHEMA_VERSION,
        "object_type": "WORKER_STOP_ACK",
        "pid": os.getpid(),
        "host": socket.gethostname(),
        "request_text": request_text,
        "acknowledged_at": now_iso(),
        "production": False,
    }
    write_json_atomic(paths.control / "stop.ack.json", ack)
    stop_path.unlink(missing_ok=True)
    return True


def run_loop(root: Path, once: bool, poll_seconds: float, max_jobs: int) -> int:
    paths = bridge_paths(root)
    lock = SingletonFileLock(paths.runtime / "worker.lock")
    if not lock.acquire():
        print(json.dumps({
            "schema_version": RUNTIME_SCHEMA_VERSION,
            "status": "BLOCKED",
            "code": "DUPLICATE_WORKER_INSTANCE",
            "bridge_root": str(paths.root),
            "pid": os.getpid(),
            "production": False,
        }, ensure_ascii=False, sort_keys=True))
        return 73

    started_at = now_iso()
    processed_count = 0
    exit_reason = "NORMAL"
    recovery: dict[str, Any] = {}
    identity_path = paths.runtime / "worker.json"
    try:
        recovery = recover_processing(paths)
        identity = {
            "schema_version": RUNTIME_SCHEMA_VERSION,
            "object_type": "WORKER_RUNTIME_IDENTITY",
            "status": "RUNNING",
            "pid": os.getpid(),
            "host": socket.gethostname(),
            "bridge_root": str(paths.root),
            "python_executable": sys.executable,
            "argv": sys.argv,
            "started_at": started_at,
            "singleton_lock": str(paths.runtime / "worker.lock"),
            "production": False,
        }
        write_json_atomic(identity_path, identity)
        heartbeat(paths, "RUNNING", processed_count, recovery)
        print(json.dumps({
            "schema_version": RUNTIME_SCHEMA_VERSION,
            "status": "STARTED",
            "pid": os.getpid(),
            "bridge_root": str(paths.root),
            "recovery_action_count": recovery.get("action_count", 0),
            "production": False,
        }, ensure_ascii=False, sort_keys=True))

        last_heartbeat = 0.0
        while True:
            if stop_requested(paths):
                exit_reason = "STOP_REQUEST"
                break

            now_monotonic = time.monotonic()
            if now_monotonic - last_heartbeat >= 1.0:
                heartbeat(paths, "RUNNING", processed_count, recovery)
                last_heartbeat = now_monotonic

            request = claim_next(paths)
            if request is None:
                if once:
                    exit_reason = "ONCE_NO_REQUEST"
                    break
                time.sleep(max(0.05, poll_seconds))
                continue

            heartbeat(paths, "PROCESSING", processed_count, recovery)
            result = process_request_file(request, paths)
            print(json.dumps(result, ensure_ascii=False, sort_keys=True))
            processed_count += 1
            heartbeat(paths, "RUNNING", processed_count, recovery)

            if max_jobs > 0 and processed_count >= max_jobs:
                exit_reason = "MAX_JOBS"
                break
            if once:
                exit_reason = "ONCE_COMPLETE"
                break

        return 0
    except KeyboardInterrupt:
        exit_reason = "KEYBOARD_INTERRUPT"
        return 0
    finally:
        shutdown = {
            "schema_version": RUNTIME_SCHEMA_VERSION,
            "object_type": "WORKER_SHUTDOWN_RECEIPT",
            "status": "STOPPED",
            "pid": os.getpid(),
            "host": socket.gethostname(),
            "bridge_root": str(paths.root),
            "started_at": started_at,
            "stopped_at": now_iso(),
            "processed_count": processed_count,
            "exit_reason": exit_reason,
            "production": False,
        }
        try:
            write_json_atomic(paths.runtime / "last_shutdown.json", shutdown)
            heartbeat(paths, "STOPPED", processed_count, recovery)
            identity_path.unlink(missing_ok=True)
        finally:
            lock.release()
        print(json.dumps(shutdown, ensure_ascii=False, sort_keys=True))


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
