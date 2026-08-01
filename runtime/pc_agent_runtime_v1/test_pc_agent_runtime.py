#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temp, path)


def wait_for(predicate, timeout: float, message: str) -> Any:
    deadline = time.monotonic() + timeout
    last: Any = None
    while time.monotonic() < deadline:
        try:
            last = predicate()
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            last = None
        if last:
            return last
        time.sleep(0.1)
    raise AssertionError(f"TIMEOUT:{message}:last={last!r}")


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    value = json.loads(path.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else None


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_request(work_id: str, counter_path: Path) -> dict[str, Any]:
    code = (
        "import json,pathlib;"
        f"p=pathlib.Path({str(counter_path)!r});"
        "n=int(p.read_text() if p.exists() else '0')+1;"
        "p.write_text(str(n));"
        "print('YOLLA_RESULT_JSON='+json.dumps({'status':'PASS','counter':n,'production':False},sort_keys=True))"
    )
    return {
        "schema_version": "YOLLA_SOURCE_FACTORY_PC_AGENT_BRIDGE_V1",
        "object_type": "WORK_REQUEST",
        "work_id": work_id,
        "project_id": "runtime-test",
        "cycle_id": "cycle-001",
        "worker_slot_uid": "pc-agent-runtime",
        "assignment_id": "runtime-v1",
        "directive_id": "A1-PC-AGENT-RUNTIME-V1-TEST",
        "execution_id": "execution-001",
        "attempt_id": "attempt-001",
        "idempotency_key": "runtime-test:" + work_id,
        "source_github_ref": "source-factory-core@runtime-v1",
        "command_spec": {
            "executable": sys.executable,
            "args": ["-c", code],
            "cwd": str(counter_path.parent),
            "env": {},
            "timeout_seconds": 30,
        },
        "production": False,
    }


def build_config(root: Path, source_root: Path) -> tuple[Path, Path, Path, Path]:
    install_root = root / "install"
    state_root = root / "state"
    bridge_root = root / "bridge"
    install_root.mkdir(parents=True)
    supervisor = source_root / "runtime" / "pc_agent_runtime_v1" / "pc_agent_runtime_supervisor.py"
    worker = source_root / "integrations" / "pc_agent_v1" / "pc_agent_bridge_worker.py"
    config = {
        "schema_version": "YOLLA_PC_AGENT_WINDOWS_RUNTIME_CONFIG_V1",
        "runtime_id": "YOLLA-PC-AGENT-RUNTIME-V1",
        "version": "1.0.0-20260802",
        "install_root": str(install_root),
        "state_root": str(state_root),
        "bridge_root": str(bridge_root),
        "python_exe": sys.executable,
        "supervisor_path": str(supervisor),
        "worker_path": str(worker),
        "worker_poll_seconds": 0.05,
        "supervisor_policy": {
            "heartbeat_interval_seconds": 0.2,
            "worker_heartbeat_stale_seconds": 5,
            "worker_start_timeout_seconds": 10,
            "worker_stop_timeout_seconds": 5,
            "restart_backoff_seconds": [0.1, 0.2, 0.5],
            "restart_burst_window_seconds": 30,
            "restart_burst_limit": 20,
        },
        "production": False,
        "ready": False,
        "merge": False,
    }
    config_path = install_root / "runtime.json"
    atomic_json(config_path, config)
    return config_path, state_root, bridge_root, supervisor


def start_supervisor(config: Path, supervisor: Path) -> subprocess.Popen[str]:
    return subprocess.Popen(
        [sys.executable, "-X", "utf8", str(supervisor), "--config", str(config)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def wait_running(state_root: Path, bridge_root: Path) -> dict[str, Any]:
    def check() -> dict[str, Any] | None:
        status = read_json(state_root / "runtime" / "status.json")
        worker = read_json(bridge_root / "runtime" / "heartbeat.json")
        if status and worker and status.get("state") == "RUNNING" and status.get("worker_pid"):
            return status
        return None
    return wait_for(check, 20, "runtime running")


def stop_supervisor(process: subprocess.Popen[str], state_root: Path) -> tuple[str, str]:
    control = state_root / "control" / "stop.request"
    control.parent.mkdir(parents=True, exist_ok=True)
    control.write_text("stop\n", encoding="utf-8")
    stdout, stderr = process.communicate(timeout=20)
    assert process.returncode == 0, (process.returncode, stdout, stderr)
    return stdout, stderr


def test_runtime(source_root: Path) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="pc-agent-runtime-v1-") as temp:
        root = Path(temp)
        config, state_root, bridge_root, supervisor = build_config(root, source_root)

        validated = subprocess.run(
            [sys.executable, "-X", "utf8", str(supervisor), "--config", str(config), "--validate-config"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        assert validated.returncode == 0, validated.stderr

        recovered_counter = root / "recovered-counter.txt"
        recovered = make_request("runtime-recovered-001", recovered_counter)
        atomic_json(bridge_root / "processing" / "runtime-recovered-001.json", recovered)

        process = start_supervisor(config, supervisor)
        first = wait_running(state_root, bridge_root)
        first_worker_pid = int(first["worker_pid"])

        recovered_result = wait_for(
            lambda: read_json(bridge_root / "results" / "runtime-recovered-001.json"),
            20,
            "processing recovery result",
        )
        assert recovered_result["final_status"] == "PASS"
        assert recovered_counter.read_text(encoding="utf-8") == "1"

        second = start_supervisor(config, supervisor)
        second_stdout, second_stderr = second.communicate(timeout=10)
        assert second.returncode == 73, (second.returncode, second_stdout, second_stderr)

        counter = root / "counter.txt"
        request = make_request("runtime-request-001", counter)
        request_path = bridge_root / "requests" / "runtime-request-001.json"
        atomic_json(request_path, request)
        result_path = bridge_root / "results" / "runtime-request-001.json"
        result = wait_for(lambda: read_json(result_path), 20, "controlled result")
        assert result["final_status"] == "PASS"
        assert result["structured_result"]["counter"] == 1
        result_sha_before = file_sha(result_path)

        atomic_json(request_path, request)
        wait_for(
            lambda: (bridge_root / "processed" / "runtime-request-001.json").is_file() and not request_path.exists(),
            10,
            "duplicate archived",
        )
        time.sleep(0.5)
        assert counter.read_text(encoding="utf-8") == "1"
        assert file_sha(result_path) == result_sha_before

        worker_stop = bridge_root / "control" / "stop.request"
        worker_stop.parent.mkdir(parents=True, exist_ok=True)
        worker_stop.write_text("restart\n", encoding="utf-8")

        def restarted() -> dict[str, Any] | None:
            status = read_json(state_root / "runtime" / "status.json")
            if not status:
                return None
            pid = status.get("worker_pid")
            if pid and int(pid) != first_worker_pid and int(status.get("worker_restart_count", 0)) >= 2:
                return status
            return None

        restart_status = wait_for(restarted, 20, "worker restart after exit")
        assert int(restart_status["worker_pid"]) != first_worker_pid

        stop_supervisor(process, state_root)
        shutdown_receipts = list((state_root / "receipts").glob("shutdown-*.json"))
        assert shutdown_receipts
        shutdown = read_json(shutdown_receipts[-1])
        assert shutdown and shutdown["exit_code"] == 0
        assert shutdown["graceful_worker_stop"] is True

        final_status = read_json(state_root / "runtime" / "status.json")
        assert final_status and final_status["state"] == "STOPPED"
        return {
            "schema_version": "YOLLA_PC_AGENT_WINDOWS_RUNTIME_TEST_RESULT_V1",
            "status": "PASS",
            "config_validation": "PASS",
            "supervisor_singleton": "PASS",
            "startup_processing_recovery": "PASS",
            "controlled_request_execution": "PASS",
            "duplicate_suppression": "PASS",
            "duplicate_execution_count": 0,
            "worker_restart_after_exit": "PASS",
            "graceful_stop": "PASS",
            "shutdown_receipt": "PASS",
            "production": False,
            "ready": False,
            "merge": False,
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", default=".")
    parser.add_argument("--output")
    args = parser.parse_args()
    result = test_runtime(Path(args.source_root).resolve())
    text = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
    print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
