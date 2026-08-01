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

SCHEMA = "YOLLA_SOURCE_FACTORY_PC_AGENT_BRIDGE_V1"


def wait_for(predicate, timeout: float, description: str) -> Any:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.05)
    raise RuntimeError(f"WAIT_TIMEOUT:{description}")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + f".tmp-{os.getpid()}-{time.time_ns()}")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def request(work_id: str, cwd: Path) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA,
        "object_type": "WORK_REQUEST",
        "work_id": work_id,
        "project_id": "source-factory-r11-ci",
        "cycle_id": "R11-CI",
        "worker_slot_uid": "A1-T1-R11-CI",
        "assignment_id": "A1-R11-CI",
        "directive_id": "A1-SF-PCAGENT-R11-ACTIVE-RUNTIME-BOOT-RESTART-RECOVERY-V1-20260802-001",
        "execution_id": f"{work_id}-execution",
        "attempt_id": "attempt-1",
        "source_github_ref": "source-factory-core@integration/source-factory-pc-agent-api-db-v1",
        "idempotency_key": f"{work_id}-idempotency",
        "work_type": "LOCAL_COMMAND",
        "command_spec": {
            "executable": sys.executable,
            "args": [
                "-X", "utf8", "-c",
                "import json; print('YOLLA_RESULT_JSON='+json.dumps({'r11_ci':'PASS','outputs':[],'artifacts':[],'database_receipt':None,'production':False}))",
            ],
            "cwd": str(cwd),
            "timeout_seconds": 30,
            "env": {},
        },
        "input_artifacts": [],
        "retry_policy": {"max_attempts": 1, "retry_on_exit_codes": []},
        "result_callback": {"transport": "FILE_QUEUE_V1", "result_file": f"{work_id}.json"},
        "source_factory": {"source": "R11_CI"},
        "production": False,
        "created_at": "2026-08-02T00:00:00Z",
    }


def start_worker(worker: Path, root: Path) -> subprocess.Popen[str]:
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    process = subprocess.Popen(
        [sys.executable, "-X", "utf8", str(worker), "--bridge-root", str(root), "--poll-seconds", "0.05"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        env=env,
    )
    wait_for(lambda: (root / "runtime" / "heartbeat.json").is_file(), 15, "WORKER_HEARTBEAT")
    heartbeat = read_json(root / "runtime" / "heartbeat.json")
    if heartbeat.get("state") != "RUNNING" or int(heartbeat.get("pid", 0)) != process.pid:
        raise RuntimeError(f"HEARTBEAT_INVALID:{heartbeat}")
    return process


def stop_worker(process: subprocess.Popen[str], root: Path) -> tuple[str, str]:
    write_json(root / "control" / "stop.request", {"reason": "R11_CI", "production": False})
    process.wait(timeout=20)
    stdout, stderr = process.communicate()
    if process.returncode != 0:
        raise RuntimeError(f"WORKER_STOP_FAILED:{process.returncode}:{stderr}")
    ack = root / "control" / "stop.ack.json"
    if not ack.is_file():
        raise RuntimeError("STOP_ACK_MISSING")
    shutdown = read_json(root / "runtime" / "last_shutdown.json")
    if shutdown.get("exit_reason") != "STOP_REQUEST":
        raise RuntimeError(f"SHUTDOWN_REASON_INVALID:{shutdown}")
    return stdout, stderr


def create_fake_active_core(package_root: Path, target: Path) -> Path:
    adapter = package_root / "releases" / "SF_REUSABLE_CORE_20260801_175708" / "src" / "shared" / "stage4" / "pcAgentBridgeAdapter.js"
    if not adapter.is_file():
        raise RuntimeError(f"ADAPTER_MISSING:{adapter}")
    adapter_target = target / "src" / "shared" / "stage4" / "pcAgentBridgeAdapter.js"
    adapter_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(adapter, adapter_target)
    handler = target / "safe_panel_v10" / "ipc" / "stage4StationBindingHandlers.js"
    handler.parent.mkdir(parents=True, exist_ok=True)
    handler.write_text(
        """
'use strict';
const path=require('path');
const adapter=require(path.join(__dirname,'..','..','src','shared','stage4','pcAgentBridgeAdapter'));
async function handleStage4DispatchNextPrompt(_event,payload,deps){
  return {ok:true,data:{pc_agent:adapter.dispatchWorkRequest(payload,deps.pcAgentBridgeOptions)}};
}
async function handleStage4RunCheck(_event,payload,deps){
  const read=adapter.readWorkResult(payload,deps.pcAgentBridgeOptions);
  if(!read.available)return {ok:true,data:{status:'pending'}};
  return {ok:true,data:Object.assign({},read.result,{pc_agent_storage:{ok:true}})};
}
module.exports={handleStage4DispatchNextPrompt,handleStage4RunCheck};
""".strip() + "\n",
        encoding="utf-8",
    )
    return target


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-root", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()

    package_root = Path(args.package_root).resolve()
    worker = package_root / "integrations" / "pc_agent_v1" / "pc_agent_bridge_worker.py"
    live_test = package_root / "integrations" / "runtime_acceptance_v1" / "testLiveActiveCoreStage4HandlerBridgeV1.js"
    if not worker.is_file() or not live_test.is_file():
        raise RuntimeError("R11_SOURCE_FILES_MISSING")

    root = Path(tempfile.mkdtemp(prefix="yolla-r11-ci-"))
    checks: dict[str, Any] = {}
    try:
        bridge = root / "bridge"
        process = start_worker(worker, bridge)
        checks["worker_start"] = True

        duplicate = subprocess.run(
            [sys.executable, "-X", "utf8", str(worker), "--bridge-root", str(bridge), "--once"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=20,
        )
        checks["singleton_exit_code"] = duplicate.returncode
        checks["singleton_lock"] = duplicate.returncode == 73 and "DUPLICATE_WORKER_INSTANCE" in duplicate.stdout
        if not checks["singleton_lock"]:
            raise RuntimeError(f"SINGLETON_LOCK_FAILED:{duplicate.returncode}:{duplicate.stdout}:{duplicate.stderr}")

        work_id = "r11-ci-basic"
        request_path = bridge / "requests" / f"{work_id}.json"
        write_json(request_path, request(work_id, root))
        result_path = bridge / "results" / f"{work_id}.json"
        wait_for(result_path.is_file, 20, "BASIC_RESULT")
        result_hash = sha256(result_path)
        result_mtime = result_path.stat().st_mtime_ns
        result = read_json(result_path)
        if result.get("final_status") != "PASS" or int(result.get("exit_code", -1)) != 0:
            raise RuntimeError(f"BASIC_RESULT_INVALID:{result}")
        checks["basic_execution"] = True

        processed_request = bridge / "processed" / f"{work_id}.json"
        wait_for(processed_request.is_file, 10, "PROCESSED_REQUEST")
        write_json(bridge / "requests" / "duplicate.json", request(work_id, root))
        wait_for(lambda: not (bridge / "requests" / "duplicate.json").exists(), 20, "DUPLICATE_CONSUMED")
        wait_for(
            lambda: bool(list((bridge / "attempts").glob(f"{work_id}-*duplicate*.json"))),
            20,
            "DUPLICATE_RECEIPT",
        )
        if sha256(result_path) != result_hash or result_path.stat().st_mtime_ns != result_mtime:
            raise RuntimeError("DUPLICATE_RESULT_MUTATED")
        checks["duplicate_suppression"] = True

        fake_core = create_fake_active_core(package_root, root / "active")
        live = subprocess.run(
            [
                "node", str(live_test),
                "--active-core-root", str(fake_core),
                "--bridge-root", str(bridge),
                "--python", sys.executable,
                "--run-id", "CI001",
                "--timeout-seconds", "30",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=60,
        )
        if live.returncode != 0:
            raise RuntimeError(f"LIVE_HANDLER_FAILED:{live.stdout}:{live.stderr}")
        live_lines = [line for line in live.stdout.splitlines() if line.startswith("{")]
        live_receipt = json.loads(live_lines[-1])
        if live_receipt.get("status") != "PASS":
            raise RuntimeError(f"LIVE_RECEIPT_INVALID:{live_receipt}")
        checks["live_handler_external_worker"] = True

        stop_worker(process, bridge)
        checks["graceful_stop"] = True

        recovery_id = "r11-ci-recovery"
        write_json(bridge / "processing" / f"{recovery_id}.json", request(recovery_id, root))
        once = subprocess.run(
            [sys.executable, "-X", "utf8", str(worker), "--bridge-root", str(bridge), "--once"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=40,
        )
        if once.returncode != 0:
            raise RuntimeError(f"RECOVERY_WORKER_FAILED:{once.stdout}:{once.stderr}")
        recovery_result = bridge / "results" / f"{recovery_id}.json"
        if not recovery_result.is_file():
            raise RuntimeError("RECOVERY_RESULT_MISSING")
        recovery = read_json(bridge / "runtime" / "last_recovery.json")
        matches = [
            item for item in recovery.get("actions", [])
            if item.get("work_id") == recovery_id and item.get("status") == "REQUEUED_FROM_PROCESSING"
        ]
        if len(matches) != 1:
            raise RuntimeError(f"RECOVERY_ACTION_INVALID:{recovery}")
        checks["processing_recovery"] = True

        receipt = {
            "schema_version": "YOLLA_R11_RUNTIME_ACCEPTANCE_CI_RESULT_V1",
            "status": "PASS",
            "checks": checks,
            "production": False,
            "ready": False,
            "merge": False,
        }
        if args.output:
            Path(args.output).write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(receipt, sort_keys=True))
        return 0
    finally:
        shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
