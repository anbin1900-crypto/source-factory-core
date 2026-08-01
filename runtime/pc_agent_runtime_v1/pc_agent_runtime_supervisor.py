#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, IO


SCHEMA_VERSION = "YOLLA_PC_AGENT_WINDOWS_RUNTIME_STATUS_V1"
RUNTIME_VERSION = "1.0.0-20260802"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
    temp = path.with_name(path.name + f".tmp-{os.getpid()}-{time.time_ns()}")
    with temp.open("xb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp, path)


def append_jsonl(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    return value if isinstance(value, dict) else None


def parse_timestamp(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


class SingleInstanceLock:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.handle: IO[bytes] | None = None

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.path.open("a+b")
        try:
            if os.name == "nt":
                import msvcrt

                handle.seek(0)
                if handle.tell() == 0:
                    handle.write(b"0")
                    handle.flush()
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (OSError, BlockingIOError):
            handle.close()
            return False
        self.handle = handle
        handle.seek(0)
        handle.truncate()
        handle.write(str(os.getpid()).encode("ascii"))
        handle.flush()
        return True

    def release(self) -> None:
        if self.handle is None:
            return
        try:
            if os.name == "nt":
                import msvcrt

                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        finally:
            self.handle.close()
            self.handle = None


@dataclass(frozen=True)
class RuntimeConfig:
    config_path: Path
    install_root: Path
    state_root: Path
    bridge_root: Path
    python_exe: Path
    worker_path: Path
    worker_poll_seconds: float
    heartbeat_interval_seconds: float
    worker_heartbeat_stale_seconds: float
    worker_start_timeout_seconds: float
    worker_stop_timeout_seconds: float
    restart_backoff_seconds: tuple[float, ...]
    restart_burst_window_seconds: float
    restart_burst_limit: int

    @property
    def runtime_dir(self) -> Path:
        return self.state_root / "runtime"

    @property
    def control_dir(self) -> Path:
        return self.state_root / "control"

    @property
    def logs_dir(self) -> Path:
        return self.state_root / "logs"

    @property
    def receipts_dir(self) -> Path:
        return self.state_root / "receipts"

    @property
    def supervisor_heartbeat(self) -> Path:
        return self.runtime_dir / "supervisor-heartbeat.json"

    @property
    def runtime_status(self) -> Path:
        return self.runtime_dir / "status.json"

    @property
    def supervisor_lock(self) -> Path:
        return self.runtime_dir / "supervisor.lock"

    @property
    def supervisor_stop_request(self) -> Path:
        return self.control_dir / "stop.request"

    @property
    def worker_heartbeat(self) -> Path:
        return self.bridge_root / "runtime" / "heartbeat.json"

    @property
    def worker_stop_request(self) -> Path:
        return self.bridge_root / "control" / "stop.request"


def require_path(value: Any, field: str) -> Path:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"CONFIG_FIELD_REQUIRED:{field}")
    return Path(text)


def load_config(path: Path) -> RuntimeConfig:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("CONFIG_NOT_OBJECT")
    policy = raw.get("supervisor_policy", {})
    if not isinstance(policy, dict):
        raise ValueError("SUPERVISOR_POLICY_NOT_OBJECT")
    backoff = tuple(float(v) for v in policy.get("restart_backoff_seconds", [1, 2, 5, 10, 30]))
    if not backoff or any(value < 0 for value in backoff):
        raise ValueError("RESTART_BACKOFF_INVALID")
    config = RuntimeConfig(
        config_path=path.resolve(),
        install_root=require_path(raw.get("install_root"), "install_root").resolve(),
        state_root=require_path(raw.get("state_root"), "state_root").resolve(),
        bridge_root=require_path(raw.get("bridge_root"), "bridge_root").resolve(),
        python_exe=require_path(raw.get("python_exe"), "python_exe").resolve(),
        worker_path=require_path(raw.get("worker_path"), "worker_path").resolve(),
        worker_poll_seconds=float(raw.get("worker_poll_seconds", 0.25)),
        heartbeat_interval_seconds=float(policy.get("heartbeat_interval_seconds", 2)),
        worker_heartbeat_stale_seconds=float(policy.get("worker_heartbeat_stale_seconds", 15)),
        worker_start_timeout_seconds=float(policy.get("worker_start_timeout_seconds", 30)),
        worker_stop_timeout_seconds=float(policy.get("worker_stop_timeout_seconds", 20)),
        restart_backoff_seconds=backoff,
        restart_burst_window_seconds=float(policy.get("restart_burst_window_seconds", 300)),
        restart_burst_limit=int(policy.get("restart_burst_limit", 20)),
    )
    if config.worker_poll_seconds <= 0:
        raise ValueError("WORKER_POLL_SECONDS_INVALID")
    for required in (config.python_exe, config.worker_path):
        if not required.is_file():
            raise FileNotFoundError(str(required))
    if config.restart_burst_limit < 1:
        raise ValueError("RESTART_BURST_LIMIT_INVALID")
    return config


class RuntimeSupervisor:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config
        self.process: subprocess.Popen[bytes] | None = None
        self.worker_stdout: IO[bytes] | None = None
        self.worker_stderr: IO[bytes] | None = None
        self.stop_requested = False
        self.started_at = now_iso()
        self.restart_count = 0
        self.restart_times: deque[float] = deque()
        self.last_worker_exit_code: int | None = None
        self.last_restart_reason: str | None = None
        self.worker_started_monotonic: float | None = None
        self.graceful_worker_stop = True
        self.event_log = config.logs_dir / "runtime-events.jsonl"

    def ensure_layout(self) -> None:
        for path in (
            self.config.runtime_dir,
            self.config.control_dir,
            self.config.logs_dir,
            self.config.receipts_dir,
            self.config.bridge_root,
        ):
            path.mkdir(parents=True, exist_ok=True)
        self.config.supervisor_stop_request.unlink(missing_ok=True)
        self.config.worker_stop_request.unlink(missing_ok=True)

    def event(self, event: str, **values: Any) -> None:
        append_jsonl(self.event_log, {
            "schema_version": SCHEMA_VERSION,
            "event": event,
            "timestamp": now_iso(),
            "supervisor_pid": os.getpid(),
            "worker_pid": self.process.pid if self.process and self.process.poll() is None else None,
            **values,
            "production": False,
        })

    def worker_heartbeat_age(self) -> float | None:
        heartbeat = read_json(self.config.worker_heartbeat)
        if heartbeat is None:
            return None
        timestamp = parse_timestamp(heartbeat.get("timestamp") or heartbeat.get("updated_at"))
        if timestamp is None:
            return None
        return max(0.0, time.time() - timestamp)

    def write_status(self, state: str, reason: str | None = None) -> None:
        status = {
            "schema_version": SCHEMA_VERSION,
            "runtime_version": RUNTIME_VERSION,
            "state": state,
            "reason": reason,
            "timestamp": now_iso(),
            "started_at": self.started_at,
            "supervisor_pid": os.getpid(),
            "worker_pid": self.process.pid if self.process and self.process.poll() is None else None,
            "worker_restart_count": self.restart_count,
            "last_worker_exit_code": self.last_worker_exit_code,
            "last_restart_reason": self.last_restart_reason,
            "worker_heartbeat_age_seconds": self.worker_heartbeat_age(),
            "config_path": str(self.config.config_path),
            "install_root": str(self.config.install_root),
            "state_root": str(self.config.state_root),
            "bridge_root": str(self.config.bridge_root),
            "production": False,
            "ready": False,
            "merge": False,
        }
        atomic_write_json(self.config.runtime_status, status)
        atomic_write_json(self.config.supervisor_heartbeat, status)

    def restart_backoff(self) -> float:
        index = min(max(self.restart_count - 1, 0), len(self.config.restart_backoff_seconds) - 1)
        return self.config.restart_backoff_seconds[index]

    def enforce_restart_burst(self) -> None:
        now = time.monotonic()
        while self.restart_times and now - self.restart_times[0] > self.config.restart_burst_window_seconds:
            self.restart_times.popleft()
        if len(self.restart_times) >= self.config.restart_burst_limit:
            self.event("RESTART_BURST_LIMIT", restart_count=len(self.restart_times))
            self.write_status("DEGRADED", "RESTART_BURST_LIMIT")
            time.sleep(min(60.0, self.config.restart_burst_window_seconds))
            self.restart_times.clear()

    def open_worker_logs(self) -> tuple[IO[bytes], IO[bytes]]:
        self.config.logs_dir.mkdir(parents=True, exist_ok=True)
        stdout = (self.config.logs_dir / "worker-stdout.log").open("ab", buffering=0)
        stderr = (self.config.logs_dir / "worker-stderr.log").open("ab", buffering=0)
        return stdout, stderr

    def spawn_worker(self, reason: str) -> None:
        self.enforce_restart_burst()
        self.config.worker_stop_request.unlink(missing_ok=True)
        stdout, stderr = self.open_worker_logs()
        env = os.environ.copy()
        env.update({
            "PYTHONUTF8": "1",
            "PYTHONIOENCODING": "utf-8",
            "YOLLA_PC_AGENT_BRIDGE_ROOT": str(self.config.bridge_root),
            "YOLLA_PC_AGENT_RUNTIME": "1",
            "YOLLA_PRODUCTION": "0",
        })
        command = [
            str(self.config.python_exe),
            "-X", "utf8",
            str(self.config.worker_path),
            "--bridge-root", str(self.config.bridge_root),
            "--poll-seconds", str(self.config.worker_poll_seconds),
        ]
        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        try:
            process = subprocess.Popen(
                command,
                cwd=str(self.config.install_root),
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                shell=False,
                creationflags=creation_flags,
            )
        except Exception:
            stdout.close()
            stderr.close()
            raise
        self.process = process
        self.worker_stdout = stdout
        self.worker_stderr = stderr
        self.worker_started_monotonic = time.monotonic()
        self.restart_count += 1
        self.restart_times.append(time.monotonic())
        self.last_restart_reason = reason
        self.event("WORKER_STARTED", reason=reason, command=command, restart_count=self.restart_count)
        self.write_status("STARTING", reason)

    def close_worker_logs(self) -> None:
        for handle_name in ("worker_stdout", "worker_stderr"):
            handle = getattr(self, handle_name)
            if handle is not None:
                handle.close()
                setattr(self, handle_name, None)

    def stop_worker(self, graceful: bool) -> None:
        process = self.process
        if process is None:
            return
        if process.poll() is not None:
            self.last_worker_exit_code = process.returncode
            self.close_worker_logs()
            self.process = None
            return
        if graceful:
            self.config.worker_stop_request.parent.mkdir(parents=True, exist_ok=True)
            self.config.worker_stop_request.write_text(now_iso() + "\n", encoding="utf-8")
            deadline = time.monotonic() + self.config.worker_stop_timeout_seconds
            while process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.2)
        if process.poll() is None:
            self.graceful_worker_stop = False
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        self.last_worker_exit_code = process.returncode
        self.event("WORKER_STOPPED", graceful=self.graceful_worker_stop, exit_code=process.returncode)
        self.close_worker_logs()
        self.process = None
        self.worker_started_monotonic = None

    def should_restart_for_heartbeat(self) -> str | None:
        if self.process is None or self.process.poll() is not None:
            return None
        age = self.worker_heartbeat_age()
        if age is None:
            if self.worker_started_monotonic is not None and (
                time.monotonic() - self.worker_started_monotonic > self.config.worker_start_timeout_seconds
            ):
                return "WORKER_HEARTBEAT_START_TIMEOUT"
            return None
        if age > self.config.worker_heartbeat_stale_seconds:
            return "WORKER_HEARTBEAT_STALE"
        return None

    def request_stop(self, *_args: Any) -> None:
        self.stop_requested = True

    def run(self) -> int:
        self.ensure_layout()
        lock = SingleInstanceLock(self.config.supervisor_lock)
        if not lock.acquire():
            self.event("DUPLICATE_SUPERVISOR_INSTANCE")
            self.write_status("BLOCKED", "DUPLICATE_SUPERVISOR_INSTANCE")
            return 73
        signal.signal(signal.SIGINT, self.request_stop)
        if hasattr(signal, "SIGTERM"):
            signal.signal(signal.SIGTERM, self.request_stop)
        self.event("SUPERVISOR_STARTED", runtime_version=RUNTIME_VERSION)
        self.write_status("STARTING", "SUPERVISOR_STARTED")
        final_code = 0
        final_reason = "NORMAL_STOP"
        try:
            self.spawn_worker("SUPERVISOR_START")
            while not self.stop_requested:
                if self.config.supervisor_stop_request.exists():
                    self.stop_requested = True
                    final_reason = "STOP_REQUEST"
                    break
                if self.process is None:
                    self.spawn_worker("WORKER_MISSING")
                elif self.process.poll() is not None:
                    self.last_worker_exit_code = self.process.returncode
                    self.event("WORKER_EXITED", exit_code=self.process.returncode)
                    self.close_worker_logs()
                    self.process = None
                    time.sleep(self.restart_backoff())
                    self.spawn_worker("WORKER_EXIT")
                else:
                    heartbeat_reason = self.should_restart_for_heartbeat()
                    if heartbeat_reason:
                        self.event("WORKER_RESTART_REQUIRED", reason=heartbeat_reason)
                        self.stop_worker(graceful=False)
                        time.sleep(self.restart_backoff())
                        self.spawn_worker(heartbeat_reason)
                self.write_status("RUNNING")
                time.sleep(max(0.2, self.config.heartbeat_interval_seconds))
        except Exception as error:
            final_code = 1
            final_reason = f"{type(error).__name__}:{error}"
            self.event("SUPERVISOR_FAILED", error=final_reason)
            self.write_status("FAILED", final_reason)
        finally:
            try:
                self.stop_worker(graceful=True)
            finally:
                receipt = {
                    "schema_version": "YOLLA_PC_AGENT_WINDOWS_RUNTIME_SHUTDOWN_RECEIPT_V1",
                    "runtime_version": RUNTIME_VERSION,
                    "started_at": self.started_at,
                    "completed_at": now_iso(),
                    "supervisor_pid": os.getpid(),
                    "worker_restart_count": self.restart_count,
                    "last_worker_exit_code": self.last_worker_exit_code,
                    "graceful_worker_stop": self.graceful_worker_stop,
                    "reason": final_reason,
                    "exit_code": final_code,
                    "production": False,
                    "ready": False,
                    "merge": False,
                }
                atomic_write_json(
                    self.config.receipts_dir / f"shutdown-{int(time.time())}-{os.getpid()}.json",
                    receipt,
                )
                self.write_status("STOPPED" if final_code == 0 else "FAILED", final_reason)
                self.event("SUPERVISOR_STOPPED", exit_code=final_code, reason=final_reason)
                lock.release()
        return final_code


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--validate-config", action="store_true")
    parser.add_argument("--print-status", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = load_config(Path(args.config))
    if args.validate_config:
        print(json.dumps({
            "schema_version": "YOLLA_PC_AGENT_WINDOWS_RUNTIME_CONFIG_VALIDATION_V1",
            "accepted": True,
            "config_path": str(config.config_path),
            "python_exe": str(config.python_exe),
            "worker_path": str(config.worker_path),
            "production": False,
        }, ensure_ascii=False, sort_keys=True))
        return 0
    if args.print_status:
        print(json.dumps(read_json(config.runtime_status) or {"state": "NOT_STARTED"}, ensure_ascii=False, sort_keys=True))
        return 0
    return RuntimeSupervisor(config).run()


if __name__ == "__main__":
    raise SystemExit(main())
