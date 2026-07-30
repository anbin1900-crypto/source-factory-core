#!/usr/bin/env python3
"""Local allowlisted command runner for Source Factory PC Agent preparation.

This module executes only explicit argv allowlist commands. It never uses shell=True,
never calls GPT/browser/middleware APIs, and is intended for local receipt capture only.
"""
from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

FORBIDDEN_EFFECT_COUNTERS = {
    "prompt_send_count": 0,
    "browser_launch_count": 0,
    "pc_agent_service_start_count": 0,
    "external_api_call_count": 0,
    "middleware_transmission_count": 0,
    "production_deploy_count": 0,
}


@dataclass(frozen=True)
class LocalCommandSpec:
    command_id: str
    argv: List[str]
    cwd: Optional[str] = None
    timeout_seconds: int = 30
    expected_exit_code: int = 0
    effect: str = "local_command_only_no_external_effects"


@dataclass(frozen=True)
class LocalCommandResult:
    status: str
    command_id: str
    argv: List[str]
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int
    timeout_seconds: int
    forbidden_effect_counters: Dict[str, int]


class LocalCommandRunner:
    """Runs allowlisted local commands and returns structured receipts."""

    def __init__(self, allowed_command_ids: List[str]):
        self.allowed_command_ids = set(allowed_command_ids)

    def execute(self, spec: LocalCommandSpec) -> LocalCommandResult:
        if spec.command_id not in self.allowed_command_ids:
            return LocalCommandResult(
                status="REJECTED_COMMAND_NOT_ALLOWLISTED",
                command_id=spec.command_id,
                argv=list(spec.argv),
                exit_code=-1,
                stdout="",
                stderr="command_id is not allowlisted",
                duration_ms=0,
                timeout_seconds=spec.timeout_seconds,
                forbidden_effect_counters=dict(FORBIDDEN_EFFECT_COUNTERS),
            )
        if not spec.argv:
            return LocalCommandResult(
                status="REJECTED_EMPTY_ARGV",
                command_id=spec.command_id,
                argv=[],
                exit_code=-1,
                stdout="",
                stderr="argv must not be empty",
                duration_ms=0,
                timeout_seconds=spec.timeout_seconds,
                forbidden_effect_counters=dict(FORBIDDEN_EFFECT_COUNTERS),
            )

        cwd = str(Path(spec.cwd).resolve()) if spec.cwd else None
        started = time.monotonic()
        try:
            completed = subprocess.run(
                list(spec.argv),
                cwd=cwd,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=spec.timeout_seconds,
                shell=False,
            )
            duration_ms = int((time.monotonic() - started) * 1000)
            status = "PASS_LOCAL_COMMAND_EXECUTION" if completed.returncode == spec.expected_exit_code else "FAIL_LOCAL_COMMAND_EXIT_CODE"
            return LocalCommandResult(
                status=status,
                command_id=spec.command_id,
                argv=list(spec.argv),
                exit_code=int(completed.returncode),
                stdout=completed.stdout.strip(),
                stderr=completed.stderr.strip(),
                duration_ms=duration_ms,
                timeout_seconds=spec.timeout_seconds,
                forbidden_effect_counters=dict(FORBIDDEN_EFFECT_COUNTERS),
            )
        except subprocess.TimeoutExpired as exc:
            duration_ms = int((time.monotonic() - started) * 1000)
            return LocalCommandResult(
                status="FAIL_LOCAL_COMMAND_TIMEOUT",
                command_id=spec.command_id,
                argv=list(spec.argv),
                exit_code=-1,
                stdout=(exc.stdout or "").strip() if isinstance(exc.stdout, str) else "",
                stderr=(exc.stderr or "").strip() if isinstance(exc.stderr, str) else "timeout",
                duration_ms=duration_ms,
                timeout_seconds=spec.timeout_seconds,
                forbidden_effect_counters=dict(FORBIDDEN_EFFECT_COUNTERS),
            )


def build_python_version_command() -> LocalCommandSpec:
    return LocalCommandSpec(
        command_id="LOCAL_PYTHON_VERSION_CHECK",
        argv=[sys.executable, "--version"],
        timeout_seconds=15,
        expected_exit_code=0,
    )


def command_result_to_dict(result: LocalCommandResult) -> Dict[str, Any]:
    return asdict(result)


__all__ = [
    "FORBIDDEN_EFFECT_COUNTERS",
    "LocalCommandSpec",
    "LocalCommandResult",
    "LocalCommandRunner",
    "build_python_version_command",
    "command_result_to_dict",
]
