#!/usr/bin/env python3
"""Local allowlisted command runner for Source Factory PC Agent preparation.

This module executes only immutable canonical registry commands. It never uses
shell=True, never calls GPT/browser/middleware APIs, and is intended for local
receipt capture only.
"""
from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any, Dict, List, Mapping, Optional, Tuple

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


@dataclass(frozen=True)
class _CanonicalCommandSpec:
    command_id: str
    argv: Tuple[str, ...]
    cwd: Optional[str]
    timeout_seconds: int
    expected_exit_code: int
    effect: str


CANONICAL_COMMAND_REGISTRY: Mapping[str, _CanonicalCommandSpec] = MappingProxyType(
    {
        "LOCAL_PYTHON_VERSION_CHECK": _CanonicalCommandSpec(
            command_id="LOCAL_PYTHON_VERSION_CHECK",
            argv=(sys.executable, "--version"),
            cwd=None,
            timeout_seconds=15,
            expected_exit_code=0,
            effect="local_command_only_no_external_effects",
        ),
    }
)


def _spec_mismatches(
    requested: LocalCommandSpec,
    canonical: _CanonicalCommandSpec,
) -> List[str]:
    mismatches: List[str] = []
    if tuple(requested.argv) != canonical.argv:
        mismatches.append("argv")
    if requested.cwd != canonical.cwd:
        mismatches.append("cwd")
    if requested.timeout_seconds != canonical.timeout_seconds:
        mismatches.append("timeout_seconds")
    if requested.expected_exit_code != canonical.expected_exit_code:
        mismatches.append("expected_exit_code")
    if requested.effect != canonical.effect:
        mismatches.append("effect")
    return mismatches


def _rejected_result(
    spec: LocalCommandSpec,
    status: str,
    reason: str,
) -> LocalCommandResult:
    return LocalCommandResult(
        status=status,
        command_id=spec.command_id,
        argv=list(spec.argv),
        exit_code=-1,
        stdout="",
        stderr=reason,
        duration_ms=0,
        timeout_seconds=spec.timeout_seconds,
        forbidden_effect_counters=dict(FORBIDDEN_EFFECT_COUNTERS),
    )


class LocalCommandRunner:
    """Runs exact canonical local commands and returns structured receipts."""

    def __init__(self, allowed_command_ids: List[str]):
        self.allowed_command_ids = frozenset(allowed_command_ids)

    def execute(self, spec: LocalCommandSpec) -> LocalCommandResult:
        if spec.command_id not in self.allowed_command_ids:
            return _rejected_result(
                spec,
                "REJECTED_COMMAND_NOT_ALLOWLISTED",
                "command_id is not allowlisted",
            )

        canonical = CANONICAL_COMMAND_REGISTRY.get(spec.command_id)
        if canonical is None:
            return _rejected_result(
                spec,
                "REJECTED_COMMAND_NOT_ALLOWLISTED",
                "command_id has no canonical registry entry",
            )

        mismatches = _spec_mismatches(spec, canonical)
        if mismatches:
            return _rejected_result(
                spec,
                "REJECTED_COMMAND_SPEC_MISMATCH",
                "canonical command spec mismatch: " + ", ".join(mismatches),
            )

        # Execute registry-owned values after comparison so caller-owned mutable
        # argv cannot be changed between validation and subprocess invocation.
        argv = list(canonical.argv)
        cwd = str(Path(canonical.cwd).resolve()) if canonical.cwd else None
        started = time.monotonic()
        try:
            completed = subprocess.run(
                argv,
                cwd=cwd,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=canonical.timeout_seconds,
                shell=False,
            )
            duration_ms = int((time.monotonic() - started) * 1000)
            status = (
                "PASS_LOCAL_COMMAND_EXECUTION"
                if completed.returncode == canonical.expected_exit_code
                else "FAIL_LOCAL_COMMAND_EXIT_CODE"
            )
            return LocalCommandResult(
                status=status,
                command_id=canonical.command_id,
                argv=argv,
                exit_code=int(completed.returncode),
                stdout=completed.stdout.strip(),
                stderr=completed.stderr.strip(),
                duration_ms=duration_ms,
                timeout_seconds=canonical.timeout_seconds,
                forbidden_effect_counters=dict(FORBIDDEN_EFFECT_COUNTERS),
            )
        except subprocess.TimeoutExpired as exc:
            duration_ms = int((time.monotonic() - started) * 1000)
            return LocalCommandResult(
                status="FAIL_LOCAL_COMMAND_TIMEOUT",
                command_id=canonical.command_id,
                argv=argv,
                exit_code=-1,
                stdout=(exc.stdout or "").strip() if isinstance(exc.stdout, str) else "",
                stderr=(exc.stderr or "").strip() if isinstance(exc.stderr, str) else "timeout",
                duration_ms=duration_ms,
                timeout_seconds=canonical.timeout_seconds,
                forbidden_effect_counters=dict(FORBIDDEN_EFFECT_COUNTERS),
            )
        except FileNotFoundError as exc:
            duration_ms = int((time.monotonic() - started) * 1000)
            return LocalCommandResult(
                status="FAIL_LOCAL_COMMAND_FILE_NOT_FOUND",
                command_id=canonical.command_id,
                argv=argv,
                exit_code=-1,
                stdout="",
                stderr=f"FileNotFoundError: {exc}",
                duration_ms=duration_ms,
                timeout_seconds=canonical.timeout_seconds,
                forbidden_effect_counters=dict(FORBIDDEN_EFFECT_COUNTERS),
            )
        except OSError as exc:
            duration_ms = int((time.monotonic() - started) * 1000)
            return LocalCommandResult(
                status="FAIL_LOCAL_COMMAND_OS_ERROR",
                command_id=canonical.command_id,
                argv=argv,
                exit_code=-1,
                stdout="",
                stderr=f"{type(exc).__name__}: {exc}",
                duration_ms=duration_ms,
                timeout_seconds=canonical.timeout_seconds,
                forbidden_effect_counters=dict(FORBIDDEN_EFFECT_COUNTERS),
            )


def build_python_version_command() -> LocalCommandSpec:
    canonical = CANONICAL_COMMAND_REGISTRY["LOCAL_PYTHON_VERSION_CHECK"]
    return LocalCommandSpec(
        command_id=canonical.command_id,
        argv=list(canonical.argv),
        cwd=canonical.cwd,
        timeout_seconds=canonical.timeout_seconds,
        expected_exit_code=canonical.expected_exit_code,
        effect=canonical.effect,
    )


def command_result_to_dict(result: LocalCommandResult) -> Dict[str, Any]:
    return asdict(result)


__all__ = [
    "FORBIDDEN_EFFECT_COUNTERS",
    "CANONICAL_COMMAND_REGISTRY",
    "LocalCommandSpec",
    "LocalCommandResult",
    "LocalCommandRunner",
    "build_python_version_command",
    "command_result_to_dict",
]
