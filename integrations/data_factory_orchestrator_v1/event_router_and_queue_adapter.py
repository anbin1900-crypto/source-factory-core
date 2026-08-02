#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

BRIDGE_SCHEMA = "YOLLA_SOURCE_FACTORY_PC_AGENT_BRIDGE_V1"
PIPELINE_SCHEMA = "YOLLA_DATA_FACTORY_PIPELINE_V1"
TERMINAL_STATES = {"DUPLICATE_EXCLUDED", "SEARCH_READBACK_PASS"}
PIPELINE_ORDER = [
    "RECEIVED",
    "HASHING",
    "ARCHIVED",
    "SPLIT_QUEUED",
    "SPLIT_COMPLETE",
    "GPT_STRUCTURING",
    "SCHEMA_VALIDATED",
    "COMBINE_QUEUED",
    "COMBINED",
    "SEARCH_READBACK_PASS",
]
QUEUED_STAGE_BY_STATE = {
    "SPLIT_QUEUED": "SPLIT",
    "GPT_STRUCTURING": "GPT_STRUCTURING",
    "COMBINE_QUEUED": "COMBINE",
}
STATE_AFTER_RESULT = {
    "SPLIT_QUEUED": "SPLIT_COMPLETE",
    "GPT_STRUCTURING": "SCHEMA_VALIDATED",
    "COMBINE_QUEUED": "COMBINED",
}
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,160}$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_id(value: str, field: str) -> str:
    text = str(value).strip()
    if not _SAFE_ID.fullmatch(text):
        raise ValueError(f"INVALID_{field.upper()}:{text!r}")
    return text


def write_json_atomic(path: Path, value: Any, *, exclusive: bool = False) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
    temp = path.with_name(path.name + f".tmp-{os.getpid()}-{time.time_ns()}")
    mode = "xb" if exclusive else "wb"
    with temp.open(mode) as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    if exclusive and path.exists():
        temp.unlink(missing_ok=True)
        raise FileExistsError(str(path))
    os.replace(temp, path)
    return {"path": str(path), "sha256": sha256_bytes(data), "size_bytes": len(data)}


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON_OBJECT_REQUIRED:{path}")
    return value


@dataclass(frozen=True)
class Identity:
    project_id: str
    source_id: str
    execution_id: str
    cycle_id: str
    idempotency_key: str
    artifact_pointer: str

    def as_dict(self) -> dict[str, str]:
        return {
            "project_id": self.project_id,
            "source_id": self.source_id,
            "execution_id": self.execution_id,
            "cycle_id": self.cycle_id,
            "idempotency_key": self.idempotency_key,
            "artifact_pointer": self.artifact_pointer,
        }


class IsolationViolation(RuntimeError):
    pass


class BridgeQueueAdapter:
    """Additive adapter over the existing LOCAL_DURABLE_FILE_QUEUE_V1 layout."""

    def __init__(self, bridge_root: Path, package_root: Path | None = None) -> None:
        self.bridge_root = bridge_root.resolve()
        self.package_root = (package_root or Path(__file__).resolve().parents[2]).resolve()
        self.requests = self.bridge_root / "requests"
        self.processing = self.bridge_root / "processing"
        self.results = self.bridge_root / "results"
        self.processed = self.bridge_root / "processed"
        self.failed = self.bridge_root / "failed"
        self.attempts = self.bridge_root / "attempts"
        self.quarantine = self.bridge_root / "quarantine"
        for directory in (
            self.requests,
            self.processing,
            self.results,
            self.processed,
            self.failed,
            self.attempts,
            self.quarantine,
        ):
            directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def work_id(identity: Identity, stage: str) -> str:
        material = f"{identity.project_id}|{identity.execution_id}|{stage}|{identity.idempotency_key}"
        return "df-" + hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]

    def dispatch(self, *, identity: Identity, state: str, stage: str, state_path: Path) -> dict[str, Any]:
        work_id = self.work_id(identity, stage)
        request_path = self.requests / f"{work_id}.json"
        result_path = self.results / f"{work_id}.json"
        worker_script = self.package_root / "integrations" / "data_factory_orchestrator_v1" / "fixture_stage_worker.py"
        request = {
            "schema_version": BRIDGE_SCHEMA,
            "object_type": "WORK_REQUEST",
            "work_id": work_id,
            "project_id": identity.project_id,
            "cycle_id": identity.cycle_id,
            "worker_slot_uid": "A-6-DATA-FACTORY-ORCHESTRATOR",
            "assignment_id": "MASTER-A-GROUP-SHORT-TERM-DATA-FACTORY-CYCLE1-V1-20260802-001",
            "directive_id": "PR142-COMMENT-5153438193-A6",
            "execution_id": identity.execution_id,
            "attempt_id": "attempt-1",
            "source_github_ref": "anbin1900-crypto/source-factory-core:integration/source-factory-pc-agent-api-db-v1",
            "idempotency_key": f"{identity.idempotency_key}:{stage}",
            "work_type": "DATA_FACTORY_STAGE",
            "command_spec": {
                "executable": os.environ.get("PYTHON_EXE") or os.environ.get("PYTHON") or "python3",
                "args": [
                    str(worker_script),
                    "--stage",
                    stage,
                    "--state",
                    str(state_path),
                ],
                "cwd": str(self.package_root),
                "timeout_seconds": 300,
                "env": {},
            },
            "input_artifacts": [identity.artifact_pointer, str(state_path)],
            "retry_policy": {"max_attempts": 3, "retry_on_exit_codes": [1, 2, 75]},
            "result_callback": {"transport": "FILE_QUEUE_V1", "result_file": f"{work_id}.json"},
            "data_factory": {
                "pipeline_schema": PIPELINE_SCHEMA,
                "stage": stage,
                "queued_state": state,
                "source_id": identity.source_id,
                "artifact_pointer": identity.artifact_pointer,
                "fixture_adapter_allowed": True,
            },
            "production": False,
            "created_at": now_iso(),
        }
        if result_path.exists():
            return {"status": "RESULT_ALREADY_AVAILABLE", "request": request, "result_path": str(result_path)}
        if request_path.exists():
            existing = read_json(request_path)
            expected_identity = {
                "work_id": work_id,
                "project_id": identity.project_id,
                "execution_id": identity.execution_id,
                "idempotency_key": f"{identity.idempotency_key}:{stage}",
            }
            mismatches = [
                key for key, expected in expected_identity.items()
                if existing.get(key) != expected
            ]
            if existing.get("data_factory", {}).get("stage") != stage:
                mismatches.append("data_factory.stage")
            if mismatches:
                raise IsolationViolation(f"REQUEST_ID_COLLISION:{work_id}:{','.join(mismatches)}")
            return {"status": "REQUEST_ALREADY_QUEUED", "request": existing, "request_path": str(request_path)}
        receipt = write_json_atomic(request_path, request, exclusive=True)
        return {"status": "QUEUED", "request": request, "request_receipt": receipt}

    def consume_result(self, *, identity: Identity, stage: str) -> dict[str, Any] | None:
        work_id = self.work_id(identity, stage)
        result_path = self.results / f"{work_id}.json"
        if not result_path.exists():
            return None
        result = read_json(result_path)
        expected = {
            "schema_version": BRIDGE_SCHEMA,
            "object_type": "WORK_RESULT",
            "work_id": work_id,
            "project_id": identity.project_id,
            "execution_id": identity.execution_id,
        }
        mismatches = [f"{key}:{result.get(key)!r}!={value!r}" for key, value in expected.items() if result.get(key) != value]
        if result.get("production") is not False:
            mismatches.append("production_must_be_false")
        if mismatches:
            quarantine_path = self.quarantine / f"{work_id}-{time.time_ns()}.json"
            os.replace(result_path, quarantine_path)
            raise IsolationViolation("RESULT_IDENTITY_MISMATCH:" + ",".join(mismatches))
        if result.get("final_status") != "PASS" or int(result.get("exit_code", 1)) != 0:
            return result
        return result

    def write_fixture_result(self, *, identity: Identity, stage: str, outputs: dict[str, Any]) -> dict[str, Any]:
        work_id = self.work_id(identity, stage)
        result_path = self.results / f"{work_id}.json"
        result = {
            "schema_version": BRIDGE_SCHEMA,
            "object_type": "WORK_RESULT",
            "work_id": work_id,
            "project_id": identity.project_id,
            "cycle_id": identity.cycle_id,
            "worker_slot_uid": "A-6-DATA-FACTORY-ORCHESTRATOR",
            "assignment_id": "MASTER-A-GROUP-SHORT-TERM-DATA-FACTORY-CYCLE1-V1-20260802-001",
            "directive_id": "PR142-COMMENT-5153438193-A6",
            "execution_id": identity.execution_id,
            "attempt_id": "attempt-1",
            "source_github_ref": "fixture-adapter",
            "final_status": "PASS",
            "exit_code": 0,
            "stdout": "FIXTURE_ADAPTER_PASS",
            "stderr": "",
            "outputs": outputs.get("outputs", []),
            "artifacts": outputs.get("artifacts", []),
            "structured_result": outputs,
            "external_blocker": None,
            "execution_error": None,
            "started_at": now_iso(),
            "completed_at": now_iso(),
            "production": False,
        }
        if result_path.exists():
            existing = read_json(result_path)
            if existing.get("project_id") != identity.project_id or existing.get("execution_id") != identity.execution_id:
                raise IsolationViolation(f"FIXTURE_RESULT_COLLISION:{work_id}")
            return existing
        write_json_atomic(result_path, result, exclusive=True)
        return result


class DataFactoryOrchestrator:
    def __init__(self, root: Path, *, package_root: Path | None = None) -> None:
        self.root = root.resolve()
        self.package_root = (package_root or Path(__file__).resolve().parents[2]).resolve()
        self.projects_root = self.root / "projects"
        self.bridge = BridgeQueueAdapter(self.root / "source-factory-bridge-v1", self.package_root)
        self.projects_root.mkdir(parents=True, exist_ok=True)

    def _project_root(self, project_id: str) -> Path:
        return self.projects_root / safe_id(project_id, "project_id")

    def _execution_root(self, project_id: str, execution_id: str) -> Path:
        return self._project_root(project_id) / "executions" / safe_id(execution_id, "execution_id")

    def _state_path(self, project_id: str, execution_id: str) -> Path:
        return self._execution_root(project_id, execution_id) / "state.json"

    def _idempotency_path(self, project_id: str, key: str) -> Path:
        return self._project_root(project_id) / "idempotency" / f"{key}.json"

    def _load_state(self, project_id: str, execution_id: str) -> dict[str, Any]:
        return read_json(self._state_path(project_id, execution_id))

    def _identity_from_state(self, state: dict[str, Any]) -> Identity:
        return Identity(
            project_id=safe_id(state["project_id"], "project_id"),
            source_id=safe_id(state["source_id"], "source_id"),
            execution_id=safe_id(state["execution_id"], "execution_id"),
            cycle_id=safe_id(state["cycle_id"], "cycle_id"),
            idempotency_key=safe_id(state["idempotency_key"], "idempotency_key"),
            artifact_pointer=str(state["artifact_pointer"]),
        )

    def _append_event(self, state: dict[str, Any], new_state: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
        identity = self._identity_from_state(state)
        execution_root = self._execution_root(identity.project_id, identity.execution_id)
        events_root = execution_root / "events"
        sequence = int(state.get("event_sequence", 0)) + 1
        event = {
            "schema_version": PIPELINE_SCHEMA,
            "object_type": "DATA_FACTORY_EVENT",
            "event_sequence": sequence,
            "state": new_state,
            **identity.as_dict(),
            "details": details or {},
            "created_at": now_iso(),
            "production": False,
        }
        event_path = events_root / f"{sequence:04d}-{new_state}.json"
        write_json_atomic(event_path, event, exclusive=True)
        state = dict(state)
        state.update({
            "state": new_state,
            "event_sequence": sequence,
            "updated_at": event["created_at"],
            "last_event_path": str(event_path),
            "production": False,
        })
        state.setdefault("history", []).append({"sequence": sequence, "state": new_state, "event_path": str(event_path)})
        write_json_atomic(execution_root / "state.json", state)
        return state

    def start(
        self,
        source_path: Path,
        *,
        project_id: str,
        source_id: str,
        execution_id: str | None = None,
        cycle_id: str = "cycle-1",
    ) -> dict[str, Any]:
        source_path = source_path.resolve()
        if not source_path.is_file():
            raise FileNotFoundError(source_path)
        project_id = safe_id(project_id, "project_id")
        source_id = safe_id(source_id, "source_id")
        cycle_id = safe_id(cycle_id, "cycle_id")
        content_hash = sha256_file(source_path)
        idempotency_key = hashlib.sha256(f"{project_id}|{source_id}|{content_hash}".encode("utf-8")).hexdigest()
        execution_id = safe_id(execution_id or f"exec-{uuid.uuid4().hex[:16]}", "execution_id")
        state_path = self._state_path(project_id, execution_id)
        if state_path.exists():
            return read_json(state_path)

        execution_root = self._execution_root(project_id, execution_id)
        archived_path = self._project_root(project_id) / "artifacts" / content_hash[:2] / f"{content_hash}-{source_path.name}"
        identity = Identity(
            project_id=project_id,
            source_id=source_id,
            execution_id=execution_id,
            cycle_id=cycle_id,
            idempotency_key=idempotency_key,
            artifact_pointer=str(archived_path),
        )
        state = {
            "schema_version": PIPELINE_SCHEMA,
            "object_type": "DATA_FACTORY_EXECUTION_STATE",
            **identity.as_dict(),
            "source_path": str(source_path),
            "source_sha256": content_hash,
            "source_size_bytes": source_path.stat().st_size,
            "state": "INITIALIZING",
            "event_sequence": 0,
            "history": [],
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "production": False,
        }
        execution_root.mkdir(parents=True, exist_ok=True)
        write_json_atomic(state_path, state)
        state = self._append_event(state, "RECEIVED", {"source_path": str(source_path)})
        state = self._append_event(state, "HASHING", {"sha256": content_hash, "size_bytes": source_path.stat().st_size})

        dedupe_path = self._idempotency_path(project_id, idempotency_key)
        if dedupe_path.exists():
            original = read_json(dedupe_path)
            state["duplicate_of_execution_id"] = original["execution_id"]
            write_json_atomic(state_path, state)
            return self._append_event(
                state,
                "DUPLICATE_EXCLUDED",
                {"duplicate_of_execution_id": original["execution_id"], "sha256": content_hash},
            )

        archived_path.parent.mkdir(parents=True, exist_ok=True)
        if not archived_path.exists():
            temp = archived_path.with_name(archived_path.name + f".tmp-{os.getpid()}-{time.time_ns()}")
            shutil.copyfile(source_path, temp)
            if sha256_file(temp) != content_hash:
                temp.unlink(missing_ok=True)
                raise RuntimeError("ARCHIVE_HASH_MISMATCH")
            os.replace(temp, archived_path)
        elif sha256_file(archived_path) != content_hash:
            raise RuntimeError("ARCHIVE_PATH_HASH_CONFLICT")

        write_json_atomic(
            dedupe_path,
            {
                "schema_version": PIPELINE_SCHEMA,
                "object_type": "PROJECT_IDEMPOTENCY_RECORD",
                "project_id": project_id,
                "source_id": source_id,
                "execution_id": execution_id,
                "idempotency_key": idempotency_key,
                "source_sha256": content_hash,
                "artifact_pointer": str(archived_path),
                "created_at": now_iso(),
                "production": False,
            },
            exclusive=True,
        )
        state = self._append_event(state, "ARCHIVED", {"artifact_pointer": str(archived_path), "sha256": content_hash})
        return state

    def _fixture_outputs(self, identity: Identity, stage: str, state: dict[str, Any]) -> dict[str, Any]:
        execution_root = self._execution_root(identity.project_id, identity.execution_id)
        artifact_root = execution_root / "fixture-artifacts"
        artifact_root.mkdir(parents=True, exist_ok=True)
        if stage == "SPLIT":
            source_text = Path(identity.artifact_pointer).read_text(encoding="utf-8", errors="replace")
            midpoint = max(1, len(source_text) // 2)
            parts = [source_text[:midpoint], source_text[midpoint:]]
            paths = []
            for index, part in enumerate(parts, start=1):
                path = artifact_root / f"split-{index:04d}.json"
                write_json_atomic(path, {
                    "schema_version": "YOLLA_DATA_FACTORY_SPLIT_FIXTURE_V1",
                    "project_id": identity.project_id,
                    "source_id": identity.source_id,
                    "execution_id": identity.execution_id,
                    "part_index": index,
                    "content": part,
                    "production": False,
                })
                paths.append(str(path))
            return {"stage": stage, "fixture_adapter": True, "outputs": paths, "artifacts": paths, "part_count": len(paths)}
        if stage == "GPT_STRUCTURING":
            path = artifact_root / "structured-knowledge-object.json"
            write_json_atomic(path, {
                "schema_version": "YOLLA_D_GROUP_FIXTURE_KNOWLEDGE_OBJECT_V1",
                "fixture_only": True,
                "project_id": identity.project_id,
                "source_id": identity.source_id,
                "execution_id": identity.execution_id,
                "source_artifact_pointer": identity.artifact_pointer,
                "evidence": {"sha256": state["source_sha256"], "artifact_pointer": identity.artifact_pointer},
                "knowledge": {"title": identity.source_id, "segments": state.get("stage_outputs", {}).get("SPLIT", {}).get("outputs", [])},
                "production": False,
            })
            return {"stage": stage, "fixture_adapter": True, "outputs": [str(path)], "artifacts": [str(path)], "schema_valid": True}
        if stage == "COMBINE":
            path = artifact_root / "combined-searchable-record.json"
            write_json_atomic(path, {
                "schema_version": "YOLLA_DATA_FACTORY_COMBINED_FIXTURE_V1",
                "project_id": identity.project_id,
                "source_id": identity.source_id,
                "execution_id": identity.execution_id,
                "source_sha256": state["source_sha256"],
                "structured_artifacts": state.get("stage_outputs", {}).get("GPT_STRUCTURING", {}).get("outputs", []),
                "search_key": f"{identity.project_id}:{identity.source_id}:{state['source_sha256']}",
                "production": False,
            })
            return {"stage": stage, "fixture_adapter": True, "outputs": [str(path)], "artifacts": [str(path)], "combined": True}
        raise ValueError(f"UNKNOWN_FIXTURE_STAGE:{stage}")

    def _dispatch_current(self, state: dict[str, Any]) -> dict[str, Any]:
        identity = self._identity_from_state(state)
        current = state["state"]
        if current == "ARCHIVED":
            queued_state, stage = "SPLIT_QUEUED", "SPLIT"
        elif current == "SPLIT_COMPLETE":
            queued_state, stage = "GPT_STRUCTURING", "GPT_STRUCTURING"
        elif current == "SCHEMA_VALIDATED":
            queued_state, stage = "COMBINE_QUEUED", "COMBINE"
        else:
            return state
        state = self._append_event(state, queued_state, {"stage": stage})
        dispatch = self.bridge.dispatch(identity=identity, state=queued_state, stage=stage, state_path=self._state_path(identity.project_id, identity.execution_id))
        state.setdefault("dispatches", {})[stage] = dispatch["status"]
        write_json_atomic(self._state_path(identity.project_id, identity.execution_id), state)
        return state

    def _consume_current(self, state: dict[str, Any], *, fixture: bool) -> dict[str, Any]:
        current = state["state"]
        if current not in QUEUED_STAGE_BY_STATE:
            return state
        identity = self._identity_from_state(state)
        stage = QUEUED_STAGE_BY_STATE[current]
        # A queued state is durable authority. If the request file was lost before
        # a worker claimed it, recreate the same deterministic request on restart.
        self.bridge.dispatch(
            identity=identity,
            state=current,
            stage=stage,
            state_path=self._state_path(identity.project_id, identity.execution_id),
        )
        if fixture and self.bridge.consume_result(identity=identity, stage=stage) is None:
            outputs = self._fixture_outputs(identity, stage, state)
            self.bridge.write_fixture_result(identity=identity, stage=stage, outputs=outputs)
        result = self.bridge.consume_result(identity=identity, stage=stage)
        if result is None:
            return state
        if result.get("final_status") != "PASS" or int(result.get("exit_code", 1)) != 0:
            state["last_failure"] = result
            write_json_atomic(self._state_path(identity.project_id, identity.execution_id), state)
            return state
        stage_outputs = result.get("structured_result", {})
        state.setdefault("stage_outputs", {})[stage] = stage_outputs
        write_json_atomic(self._state_path(identity.project_id, identity.execution_id), state)
        return self._append_event(state, STATE_AFTER_RESULT[current], {"stage": stage, "work_id": result["work_id"], "result_status": "PASS"})

    def _search_readback(self, state: dict[str, Any]) -> dict[str, Any]:
        if state["state"] != "COMBINED":
            return state
        identity = self._identity_from_state(state)
        combined = state.get("stage_outputs", {}).get("COMBINE", {}).get("outputs", [])
        if len(combined) != 1:
            raise RuntimeError("COMBINED_ARTIFACT_COUNT_INVALID")
        record = read_json(Path(combined[0]))
        expected_key = f"{identity.project_id}:{identity.source_id}:{state['source_sha256']}"
        if record.get("search_key") != expected_key:
            raise IsolationViolation("SEARCH_READBACK_KEY_MISMATCH")
        return self._append_event(state, "SEARCH_READBACK_PASS", {"search_key": expected_key, "readback_artifact": combined[0]})

    def run(self, *, project_id: str, execution_id: str, fixture: bool = False, stop_after: str | None = None) -> dict[str, Any]:
        project_id = safe_id(project_id, "project_id")
        execution_id = safe_id(execution_id, "execution_id")
        state = self._load_state(project_id, execution_id)
        for _ in range(32):
            if state["state"] in TERMINAL_STATES or state["state"] == stop_after:
                return state
            previous = state["state"]
            if previous in {"ARCHIVED", "SPLIT_COMPLETE", "SCHEMA_VALIDATED"}:
                state = self._dispatch_current(state)
            elif previous in QUEUED_STAGE_BY_STATE:
                state = self._consume_current(state, fixture=fixture)
            elif previous == "COMBINED":
                state = self._search_readback(state)
            else:
                raise RuntimeError(f"UNRECOVERABLE_STATE:{previous}")
            if state["state"] == previous:
                return state
        raise RuntimeError("PIPELINE_LOOP_LIMIT_EXCEEDED")

    def recover_all(self, *, fixture: bool = False) -> list[dict[str, Any]]:
        recovered: list[dict[str, Any]] = []
        for state_path in sorted(self.projects_root.glob("*/executions/*/state.json")):
            state = read_json(state_path)
            if state.get("state") in TERMINAL_STATES:
                continue
            recovered.append(self.run(project_id=state["project_id"], execution_id=state["execution_id"], fixture=fixture))
        return recovered


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="YOLLA A-6 data factory orchestrator")
    sub = parser.add_subparsers(dest="command", required=True)
    start = sub.add_parser("start")
    start.add_argument("--root", required=True)
    start.add_argument("--source", required=True)
    start.add_argument("--project-id", required=True)
    start.add_argument("--source-id", required=True)
    start.add_argument("--execution-id")
    start.add_argument("--cycle-id", default="cycle-1")
    start.add_argument("--fixture", action="store_true")
    recover = sub.add_parser("recover")
    recover.add_argument("--root", required=True)
    recover.add_argument("--fixture", action="store_true")
    status = sub.add_parser("status")
    status.add_argument("--root", required=True)
    status.add_argument("--project-id", required=True)
    status.add_argument("--execution-id", required=True)
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    args = _build_parser().parse_args(list(argv) if argv is not None else None)
    orchestrator = DataFactoryOrchestrator(Path(args.root))
    if args.command == "start":
        state = orchestrator.start(
            Path(args.source),
            project_id=args.project_id,
            source_id=args.source_id,
            execution_id=args.execution_id,
            cycle_id=args.cycle_id,
        )
        if args.fixture and state["state"] not in TERMINAL_STATES:
            state = orchestrator.run(project_id=state["project_id"], execution_id=state["execution_id"], fixture=True)
        print(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if state["state"] in TERMINAL_STATES else 3
    if args.command == "recover":
        values = orchestrator.recover_all(fixture=args.fixture)
        print(json.dumps(values, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    state = orchestrator._load_state(args.project_id, args.execution_id)
    print(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
