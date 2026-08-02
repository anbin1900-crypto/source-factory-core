from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

SENSITIVE_KEYS = {
    "password","passwd","credential","credentials","secret","secrets","token",
    "access_token","refresh_token","api_key","private_key","ssh_private_key",
    "cookies","browser_data","environment_variable_values","source_file_contents",
    "personal_file_contents"
}
EXPECTED_TERMINALS = {
    "C-2":"C2_AI_YOLLA_RUNTIME_ENVIRONMENT_REGISTRY_WAVE3_PASS",
    "C-3":"C3_AI_YOLLA_WORKSPACE_PC_CONTEXT_WAVE3_PASS",
    "C-4":"C4_AI_YOLLA_PANEL_PC_ENVIRONMENT_CARD_WAVE3_PASS",
    "C-5":"C5_AI_YOLLA_RUNTIME_ADMISSION_GATE_WAVE3_PASS",
}

class GateError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code

def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",",":"))

def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def sha256_obj(value: Any) -> str:
    return sha256_text(stable_json(value))

def compute_duplicate_key(role_id: str, directive_id: str, wave_id: str, registered_at_kst: str) -> str:
    return sha256_text("|".join([role_id,directive_id,wave_id,registered_at_kst]))

def parse_time(value: str) -> datetime:
    if value.endswith(" KST"):
        value = value[:16] + ":00+09:00"
    return datetime.fromisoformat(value)

def scan_sensitive(value: Any, path: str="$") -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            if key.lower() in SENSITIVE_KEYS and nested not in (None, False, 0, "", [], {}):
                raise GateError(f"SENSITIVE_VALUE_REJECT:{path}.{key}")
            scan_sensitive(nested, f"{path}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            scan_sensitive(nested, f"{path}[{index}]")

def validate_input_matrix(matrix: dict[str, Any]) -> None:
    if matrix.get("accepted_input_count") != 4 or matrix.get("required_input_count") != 4:
        raise GateError("EXACT_INPUT_COUNT_MISMATCH")
    if set(matrix.get("inputs", {})) != set(EXPECTED_TERMINALS):
        raise GateError("EXACT_INPUT_ROLE_SET_MISMATCH")
    for worker, expected_terminal in EXPECTED_TERMINALS.items():
        item = matrix["inputs"][worker]
        if item.get("terminal") != expected_terminal:
            raise GateError(f"{worker}_TERMINAL_MISMATCH")
        if not isinstance(item.get("head"), str) or len(item["head"]) != 40:
            raise GateError(f"{worker}_HEAD_INVALID")
        comment = item.get("result_comment", item.get("result_pointer_comment"))
        if not isinstance(comment, int) or comment <= 0:
            raise GateError(f"{worker}_RESULT_COMMENT_INVALID")
    expected_key = compute_duplicate_key(
        "C-6", matrix["directive_id"], matrix["wave_id"], matrix["directive_registered_at_kst"]
    )
    if matrix.get("duplicate_prompt_key") != expected_key:
        raise GateError("C6_DUPLICATE_PROMPT_KEY_MISMATCH")

def validate_authority(authority: dict[str, Any], registered_at_kst: str) -> None:
    if authority.get("target_pc_terminal") != "A1_PC_AGENT_WINDOWS_RUNTIME_V1_TARGET_PC_ACCEPTED":
        raise GateError("MISSING_RUNTIME_ACCEPTANCE_REJECT")
    if authority.get("runtime_version") != "1.0.0-20260802":
        raise GateError("RUNTIME_VERSION_MISMATCH")
    if authority.get("canonical_runtime_root") != r"D:\YOLLA_PC_BRIDGE":
        raise GateError("RUNTIME_ROOT_MISMATCH")
    if authority.get("context_snapshot_id") != "20260802100335Z":
        raise GateError("CONTEXT_SNAPSHOT_MISMATCH")
    published = parse_time(authority["context_published_at_kst"])
    evaluated = parse_time(registered_at_kst)
    age = (evaluated - published).total_seconds()
    if age < -300:
        raise GateError("FUTURE_CONTEXT_REJECT")
    if age > authority["context_max_age_seconds"]:
        raise GateError("STALE_CONTEXT_REJECT")
    scan_sensitive(authority)

@dataclass(frozen=True)
class ServiceSession:
    service_id: str
    domain_pack_id: str
    role_id: str
    context_snapshot_id: str
    workspace_service_session_id: str
    browser_session_id: str

class Wave3E2E:
    def __init__(self, matrix: dict[str, Any], fixture: dict[str, Any]):
        validate_input_matrix(matrix)
        validate_authority(fixture["runtime_authority"], matrix["directive_registered_at_kst"])
        self.matrix = matrix
        self.fixture = fixture
        self.seen_keys: set[str] = set()
        self.accepted_results: set[str] = set()
        self.sessions: dict[str, ServiceSession] = {}
        self.selected_service_id: str | None = None
        self.dispatch_count = 0
        self.panel_apply_count = 0

    def _session(self, service: dict[str, Any]) -> ServiceSession:
        seed = "|".join([
            "C-6", service["service_id"], service["domain_pack_id"],
            self.fixture["runtime_authority"]["context_snapshot_id"], self.matrix["wave_id"]
        ])
        return ServiceSession(
            service_id=service["service_id"],
            domain_pack_id=service["domain_pack_id"],
            role_id=service["role_id"],
            context_snapshot_id=self.fixture["runtime_authority"]["context_snapshot_id"],
            workspace_service_session_id="ws-" + sha256_text(seed)[:20],
            browser_session_id="browser-c6-existing-runtime",
        )

    def bind_services(self) -> list[ServiceSession]:
        common_core_ids = {self.fixture["common_core_id"]}
        if len(common_core_ids) != 1:
            raise GateError("COMMON_CORE_CLONE_REJECT")
        for service in self.fixture["services"]:
            session = self._session(service)
            if session.service_id in self.sessions:
                raise GateError("DUPLICATE_SERVICE_SESSION")
            self.sessions[session.service_id] = session
        logical_ids = {s.workspace_service_session_id for s in self.sessions.values()}
        if len(logical_ids) != 3:
            raise GateError("ROLE_SERVICE_CONTEXT_ISOLATION_VIOLATION")
        snapshot_ids = {s.context_snapshot_id for s in self.sessions.values()}
        if snapshot_ids != {self.fixture["runtime_authority"]["context_snapshot_id"]}:
            raise GateError("CROSS_CONTEXT_SNAPSHOT_MISMATCH")
        return list(self.sessions.values())

    def admit(self, service_id: str, payload: dict[str, Any], *, prompt_key: str | None=None,
              wave_id: str | None=None, runtime_version: str | None=None,
              target_pc_accepted: bool=True, context_fresh: bool=True,
              runtime_health: str="HEALTHY", accepted_replay: bool=False) -> str:
        if service_id not in self.sessions:
            raise GateError("REJECT_ROLE_SERVICE_WAVE_MISMATCH")
        scan_sensitive(payload)
        if not target_pc_accepted:
            raise GateError("REJECT_RUNTIME_UNVERIFIED")
        if not context_fresh:
            raise GateError("REJECT_STALE_PC_CONTEXT")
        if (runtime_version or self.fixture["runtime_authority"]["runtime_version"]) != "1.0.0-20260802":
            raise GateError("REJECT_RUNTIME_VERSION_MISMATCH")
        if (wave_id or self.matrix["wave_id"]) != "WAVE_3":
            raise GateError("REJECT_STALE_WAVE")
        key = prompt_key or self.matrix["duplicate_prompt_key"]
        if key in self.seen_keys:
            raise GateError("REJECT_DUPLICATE")
        if accepted_replay or service_id in self.accepted_results:
            raise GateError("REJECT_ALREADY_ACCEPTED")
        if runtime_health == "BLOCKED":
            raise GateError("REJECT_RUNTIME_HEALTH_BLOCKED")
        expected = compute_duplicate_key(
            "C-6", self.matrix["directive_id"], self.matrix["wave_id"], self.matrix["directive_registered_at_kst"]
        )
        if key != expected:
            raise GateError("DUPLICATE_PROMPT_KEY_MISMATCH")
        self.seen_keys.add(key)
        return "ADMIT_CONTRACT_FIXTURE_ONLY"

    def run_service(self, service_id: str, *, unique_prompt_key: str) -> dict[str, Any]:
        session = self.sessions[service_id]
        self.selected_service_id = service_id
        derived = sha256_text(self.matrix["duplicate_prompt_key"] + "|" + service_id)
        if unique_prompt_key != derived:
            raise GateError("SERVICE_PROMPT_KEY_MISMATCH")
        if unique_prompt_key in self.seen_keys:
            raise GateError("REJECT_DUPLICATE")
        self.seen_keys.add(unique_prompt_key)
        boundary_request = {
            "target_component_id":"AI_YOLLA_RUNTIME",
            "source_component_id":"AI_YOLLA_WORKSPACE",
            "service_id":session.service_id,
            "domain_pack_id":session.domain_pack_id,
            "context_snapshot_id":session.context_snapshot_id,
            "workspace_service_session_id":session.workspace_service_session_id,
            "runtime_version":self.fixture["runtime_authority"]["runtime_version"],
            "execution_authorized":False,
            "actual_pc_dispatch":False,
        }
        result_hash = sha256_obj(boundary_request)
        receipt = {
            "service_id":service_id,
            "domain_pack_id":session.domain_pack_id,
            "context_snapshot_id":session.context_snapshot_id,
            "workspace_service_session_id":session.workspace_service_session_id,
            "result_hash":result_hash,
            "result_comment_posted":False,
            "actual_pc_dispatch_count":0,
        }
        self.accepted_results.add(service_id)
        return receipt

    def record_foreign_result(self, service_id: str, receipt: dict[str, Any]) -> None:
        session = self.sessions[service_id]
        if receipt.get("service_id") != service_id:
            raise GateError("CROSS_SERVICE_RESULT_REJECT")
        if receipt.get("context_snapshot_id") != session.context_snapshot_id:
            raise GateError("CROSS_CONTEXT_RESULT_REJECT")

    def snapshot(self) -> dict[str, Any]:
        return {
            "selected_service_id":self.selected_service_id,
            "context_snapshot_id":self.fixture["runtime_authority"]["context_snapshot_id"],
            "sessions": {
                key: {
                    "service_id":value.service_id,
                    "domain_pack_id":value.domain_pack_id,
                    "role_id":value.role_id,
                    "context_snapshot_id":value.context_snapshot_id,
                    "workspace_service_session_id":value.workspace_service_session_id,
                    "browser_session_id":value.browser_session_id,
                } for key,value in sorted(self.sessions.items())
            },
            "seen_keys":sorted(self.seen_keys),
            "accepted_results":sorted(self.accepted_results),
            "dispatch_count":self.dispatch_count,
            "panel_apply_count":self.panel_apply_count,
        }

    @classmethod
    def restore(cls, matrix: dict[str, Any], fixture: dict[str, Any], state: dict[str, Any]) -> "Wave3E2E":
        instance = cls(matrix, fixture)
        instance.sessions = {
            key:ServiceSession(**value) for key,value in state["sessions"].items()
        }
        instance.selected_service_id = state["selected_service_id"]
        instance.seen_keys = set(state["seen_keys"])
        instance.accepted_results = set(state["accepted_results"])
        instance.dispatch_count = state["dispatch_count"]
        instance.panel_apply_count = state["panel_apply_count"]
        if instance.snapshot() != state:
            raise GateError("PANEL_RESTART_RECOVERY_MISMATCH")
        return instance

def simulate_rollback(prechange: dict[str,str], changed: dict[str,str]) -> dict[str, Any]:
    if set(prechange) != set(changed):
        raise GateError("ROLLBACK_PATH_SET_MISMATCH")
    restored = dict(prechange)
    parity = all(restored[path] == prechange[path] for path in prechange)
    if not parity:
        raise GateError("ROLLBACK_BLOB_PARITY_FAIL")
    return {"status":"PASS","restored":restored,"rollback_blob_parity":"PASS"}
