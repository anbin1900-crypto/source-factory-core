from __future__ import annotations

import copy
import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any

SHA40 = re.compile(r"^[0-9a-f]{40}$")
WAVE_RE = re.compile(r"^WAVE_(\d+)$")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def duplicate_key(role_id: str, directive_id: str, wave_id: str, registered_at_kst: str) -> str:
    raw = f"{role_id}|{directive_id}|{wave_id}|{registered_at_kst}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def wave_number(wave_id: str) -> int:
    match = WAVE_RE.fullmatch(str(wave_id or ""))
    if not match:
        raise ValueError("MISSING_OR_INVALID_WAVE")
    return int(match.group(1))


@dataclass
class FixtureRuntimeAdapter:
    runtime_version: str
    dispatch_count: int = 0

    def dispatch(self, envelope: dict[str, Any]) -> dict[str, Any]:
        self.dispatch_count += 1
        return {
            "runtime_version": self.runtime_version,
            "dispatch_mode": "EXACT_CONTRACT_FIXTURE_ONLY",
            "dispatch_index": self.dispatch_count,
            "request_digest": digest(envelope),
            "status": "COMPLETED_FIXTURE"
        }


@dataclass
class AiYollaCommonCore:
    fixture: dict[str, Any]
    runtime: FixtureRuntimeAdapter
    latest_wave: int = 0
    accepted_keys: set[str] = field(default_factory=set)
    completed_keys: set[str] = field(default_factory=set)
    selected_service_id: str | None = None
    sessions: dict[str, dict[str, Any]] = field(default_factory=dict)
    results: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        services = self.fixture.get("services", [])
        if len(services) != 3:
            raise ValueError("EXACT_THREE_SERVICES_REQUIRED")
        if self.fixture.get("common_core_id") != "AI_YOLLA_COMMON_CORE":
            raise ValueError("COMMON_CORE_AUTHORITY_MISMATCH")
        ids = [item["service_id"] for item in services]
        if len(ids) != len(set(ids)):
            raise ValueError("DUPLICATE_SERVICE_ID")
        windows = [item["workspace_window_id"] for item in services]
        browser_sessions = [item["browser_session_id"] for item in services]
        if len(windows) != len(set(windows)) or len(browser_sessions) != len(set(browser_sessions)):
            raise ValueError("WORKSPACE_SESSION_ISOLATION_VIOLATION")
        self._service_map = {item["service_id"]: copy.deepcopy(item) for item in services}

    def _validate_directive(self, directive: dict[str, Any]) -> tuple[int, str]:
        for key in ("role_id", "directive_id", "wave_id", "directive_registered_at_kst"):
            if not directive.get(key):
                raise ValueError("FAIL_CLOSED_MISSING_METADATA")
        number = wave_number(directive["wave_id"])
        computed = duplicate_key(
            directive["role_id"], directive["directive_id"],
            directive["wave_id"], directive["directive_registered_at_kst"]
        )
        if directive.get("duplicate_prompt_key") != computed:
            raise ValueError("DUPLICATE_PROMPT_KEY_MISMATCH")
        return number, computed

    def admit(self, directive: dict[str, Any]) -> str:
        number, key = self._validate_directive(directive)
        if key in self.completed_keys:
            return "REJECT_ALREADY_ACCEPTED"
        if key in self.accepted_keys:
            return "REJECT_DUPLICATE"
        if number < self.latest_wave:
            return "REJECT_STALE_WAVE"
        if number == self.latest_wave and self.latest_wave > 0:
            prior_times = {session["directive_registered_at_kst"] for session in self.sessions.values()}
            if directive["directive_registered_at_kst"] not in prior_times and not directive.get("supersession_pointer"):
                return "REQUIRE_SUPERSESSION_POINTER"
        self.accepted_keys.add(key)
        self.latest_wave = max(self.latest_wave, number)
        return "ACCEPT"

    def execute_service(self, service_id: str, directive: dict[str, Any]) -> dict[str, Any]:
        if service_id not in self._service_map:
            raise ValueError("UNKNOWN_SERVICE")
        decision = self.admit(directive)
        if decision != "ACCEPT":
            return {"decision": decision, "service_id": service_id, "dispatched": False}
        service = copy.deepcopy(self._service_map[service_id])
        session_id = f"{service['browser_session_id']}::{service_id}::WAVE_2"
        session = {
            "service_id": service_id,
            "domain_pack_id": service["domain_pack_id"],
            "role_id": service["role_id"],
            "workspace_window_id": service["workspace_window_id"],
            "browser_session_id": service["browser_session_id"],
            "workspace_service_session_id": session_id,
            "directive_registered_at_kst": directive["directive_registered_at_kst"]
        }
        if any(existing["workspace_service_session_id"] == session_id for existing in self.sessions.values()):
            raise ValueError("CROSS_SERVICE_SESSION_COLLISION")
        self.sessions[service_id] = session
        self.selected_service_id = service_id
        envelope = {
            "platform_id": self.fixture["platform_id"],
            "common_core_id": self.fixture["common_core_id"],
            "service_id": service_id,
            "domain_pack_id": service["domain_pack_id"],
            "role_id": service["role_id"],
            "wave_id": directive["wave_id"],
            "directive_id": directive["directive_id"],
            "directive_registered_at_kst": directive["directive_registered_at_kst"],
            "duplicate_prompt_key": directive["duplicate_prompt_key"]
        }
        receipt = self.runtime.dispatch(envelope)
        result = {
            "service_id": service_id,
            "domain_pack_id": service["domain_pack_id"],
            "workspace_service_session_id": session_id,
            "result_published_at_kst": "2026-08-02 19:25 KST",
            "wave_id": directive["wave_id"],
            "runtime_receipt": receipt,
            "result_digest": digest({"envelope": envelope, "receipt": receipt})
        }
        self.results.setdefault(service_id, []).append(result)
        self.completed_keys.add(directive["duplicate_prompt_key"])
        return {"decision": "ACCEPT", "service_id": service_id, "dispatched": True, "result": result}

    def get_service_results(self, service_id: str) -> list[dict[str, Any]]:
        return copy.deepcopy(self.results.get(service_id, []))

    def snapshot(self) -> dict[str, Any]:
        return {
            "latest_wave": self.latest_wave,
            "accepted_keys": sorted(self.accepted_keys),
            "completed_keys": sorted(self.completed_keys),
            "selected_service_id": self.selected_service_id,
            "sessions": copy.deepcopy(self.sessions),
            "results": copy.deepcopy(self.results),
            "runtime_dispatch_count": self.runtime.dispatch_count
        }

    @classmethod
    def restore(cls, fixture: dict[str, Any], runtime_version: str, state: dict[str, Any]) -> "AiYollaCommonCore":
        runtime = FixtureRuntimeAdapter(runtime_version=runtime_version, dispatch_count=state["runtime_dispatch_count"])
        core = cls(copy.deepcopy(fixture), runtime)
        core.latest_wave = state["latest_wave"]
        core.accepted_keys = set(state["accepted_keys"])
        core.completed_keys = set(state["completed_keys"])
        core.selected_service_id = state["selected_service_id"]
        core.sessions = copy.deepcopy(state["sessions"])
        core.results = copy.deepcopy(state["results"])
        return core


def validate_input_matrix(matrix: dict[str, Any]) -> dict[str, Any]:
    expected = {"C-2", "C-3", "C-4", "C-5"}
    observed = set(matrix.get("inputs", {}))
    checks = {
        "workers_4_of_4": observed == expected,
        "accepted_inputs_4": matrix.get("accepted_inputs") == 4,
        "virtual_pass_zero": matrix.get("virtual_pass_count") == 0,
        "all_heads_sha40": all(SHA40.fullmatch(item.get("head", "")) for item in matrix.get("inputs", {}).values()),
        "all_terminals_pass": all(str(item.get("terminal", "")).endswith("PASS") for item in matrix.get("inputs", {}).values()),
        "a1_runtime_read_only": matrix.get("a1_pc_runtime_authority", {}).get("consumption_mode") == "READ_ONLY_NO_PC_DISPATCH"
    }
    return {"pass": all(checks.values()), "checks": checks}
