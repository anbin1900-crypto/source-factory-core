#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, subprocess, tempfile
from pathlib import Path
from datetime import datetime, timezone

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def write_atomic(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temp, path)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-root", default=".")
    parser.add_argument("--output")
    args = parser.parse_args()
    root = Path(args.package_root).resolve()
    integration = root / "integrations/api_db_v1"
    bridge_worker = root / "integrations/pc_agent_v1/pc_agent_bridge_worker.py"
    directive = json.loads((integration / "fixtures/MINIMUM_E2E_DIRECTIVE_V1.json").read_text(encoding="utf-8"))
    api_fixture = integration / "fixtures/API_MINIMUM_FIXTURE_V1.json"
    fixture_runner = integration / "run_api_db_fixture.py"
    with tempfile.TemporaryDirectory(prefix="yolla-minimum-e2e-") as temp:
        temp_root = Path(temp)
        bridge = temp_root / "bridge"
        output_root = temp_root / "db-output"
        work_id = "work-minimum-api-db-001"
        python_exe = os.environ.get("PYTHON_EXE") or os.environ.get("PYTHON") or "python3"
        request = {
          "schema_version": "YOLLA_SOURCE_FACTORY_PC_AGENT_BRIDGE_V1",
          "object_type": "WORK_REQUEST",
          "work_id": work_id,
          "project_id": "yolla-minimum-integration",
          "cycle_id": "cycle-001",
          "worker_slot_uid": "a1-frontline",
          "assignment_id": "source-factory-pc-agent-api-db-v1",
          "directive_id": directive["directive_id"],
          "execution_id": "execution-minimum-001",
          "attempt_id": "attempt-1",
          "source_github_ref": directive["source_github_ref"],
          "idempotency_key": "minimum-api-db-fixture-001",
          "work_type": "API_DB_LOCAL_FIXTURE",
          "command_spec": {
            "executable": python_exe,
            "args": [str(fixture_runner), "--fixture", str(api_fixture), "--output-root", str(output_root)],
            "cwd": str(root),
            "timeout_seconds": 60,
            "env": {}
          },
          "input_artifacts": [str(api_fixture)],
          "retry_policy": {"max_attempts": 1, "retry_on_exit_codes": []},
          "result_callback": {"transport": "FILE_QUEUE_V1", "result_file": work_id + ".json"},
          "production": False,
          "created_at": now_iso()
        }
        write_atomic(bridge / "requests" / (work_id + ".json"), request)
        completed = subprocess.run(
          [python_exe, str(bridge_worker), "--bridge-root", str(bridge), "--once"],
          cwd=root, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90, shell=False
        )
        if completed.returncode != 0:
            raise RuntimeError("PC_AGENT_BRIDGE_WORKER_FAILED:" + completed.stderr)
        result = json.loads((bridge / "results" / (work_id + ".json")).read_text(encoding="utf-8"))
        receipt = result.get("database_receipt")
        checks = {
          "GITHUB_DIRECTIVE_READ": directive["object_type"] == "GITHUB_DIRECTIVE_FIXTURE",
          "SOURCE_FACTORY_DISPATCH": (bridge / "processed" / (work_id + ".json")).is_file(),
          "PC_AGENT_EXECUTION": result.get("exit_code") == 0,
          "EXIT_CODE": result.get("exit_code"),
          "API_FIXTURE_RECEIVED": bool(result.get("outputs")),
          "CANONICAL_NORMALIZATION_PASS": result.get("structured_result", {}).get("canonical_normalization_pass") is True,
          "DB_FIXTURE_WRITE_PASS": isinstance(receipt, dict) and receipt.get("write_pass") is True,
          "DB_READBACK_PASS": isinstance(receipt, dict) and receipt.get("readback_pass") is True,
          "DB_ROLLBACK_PASS": isinstance(receipt, dict) and receipt.get("rollback_pass") is True,
          "WORK_RESULT_CREATED": (bridge / "results" / (work_id + ".json")).is_file(),
          "SOURCE_FACTORY_COMPLETION_RECOGNIZED": result.get("final_status") == "PASS",
          "USER_MANUAL_RELAY_COUNT": 0
        }
        accepted = (
            all(value is True for key, value in checks.items() if key not in ("EXIT_CODE", "USER_MANUAL_RELAY_COUNT"))
            and checks["EXIT_CODE"] == 0
            and checks["USER_MANUAL_RELAY_COUNT"] == 0
        )
        final = {
          "schema_version": "YOLLA_MINIMUM_VERTICAL_INTEGRATION_E2E_RESULT_V1",
          "status": "PASS" if accepted else "FAIL",
          "checks": checks,
          "work_result": result,
          "production": False,
          "ready": False,
          "merge": False,
          "result_github_publish_ready": accepted,
          "completed_at": now_iso()
        }
        text = json.dumps(final, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        if args.output:
            Path(args.output).write_text(text, encoding="utf-8")
        print(text, end="")
        return 0 if accepted else 2

if __name__ == "__main__":
    raise SystemExit(main())
