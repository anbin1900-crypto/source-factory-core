#!/usr/bin/env python3
"""DNS-only readiness probe for the A-3 Naver public document capture runtime.

This script performs name resolution only. It does not issue HTTP requests,
open browser sessions, use credentials, or persist response payloads.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import platform
import socket
import sys
import time
from typing import Any


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def resolver_summary() -> dict[str, Any]:
    path = pathlib.Path("/etc/resolv.conf")
    nameservers: list[str] = []
    search_domains: list[str] = []
    if path.is_file():
        for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if parts[0] == "nameserver" and len(parts) > 1:
                nameservers.append(parts[1])
            elif parts[0] in {"search", "domain"} and len(parts) > 1:
                search_domains.extend(parts[1:])
    return {
        "source": str(path) if path.is_file() else "UNAVAILABLE",
        "nameservers": nameservers,
        "search_domains": search_domains,
    }


def network_namespace() -> str | None:
    try:
        return os.readlink("/proc/self/ns/net")
    except OSError:
        return None


def resolve_once(host: str, attempt: int) -> dict[str, Any]:
    started = utc_now()
    try:
        records = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
        ips = sorted({record[4][0] for record in records})
        return {
            "attempt": attempt,
            "started_at_utc": started,
            "command_type": "PYTHON_SOCKET_GETADDRINFO",
            "status": "PASS" if ips else "FAIL_NO_ADDRESS",
            "ip_addresses": ips,
            "error_type": None,
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001 - receipt must preserve exact runtime failure
        return {
            "attempt": attempt,
            "started_at_utc": started,
            "command_type": "PYTHON_SOCKET_GETADDRINFO",
            "status": "FAIL",
            "ip_addresses": [],
            "error_type": type(exc).__name__,
            "error": str(exc),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="fin.land.naver.com")
    parser.add_argument("--required-consecutive-passes", type=int, default=2)
    parser.add_argument("--max-attempts", type=int, default=2)
    parser.add_argument("--interval-seconds", type=float, default=1.0)
    parser.add_argument("--output", type=pathlib.Path)
    args = parser.parse_args()

    if args.required_consecutive_passes < 1 or args.max_attempts < args.required_consecutive_passes:
        raise SystemExit("INVALID_PASS_OR_ATTEMPT_COUNT")

    attempts: list[dict[str, Any]] = []
    consecutive_passes = 0
    for attempt_number in range(1, args.max_attempts + 1):
        result = resolve_once(args.host, attempt_number)
        attempts.append(result)
        if result["status"] == "PASS":
            consecutive_passes += 1
        else:
            consecutive_passes = 0
        if consecutive_passes >= args.required_consecutive_passes:
            break
        if attempt_number < args.max_attempts:
            time.sleep(args.interval_seconds)

    receipt = {
        "schema_version": "DNS_RESOLUTION_READINESS_PROBE_RESULT_V1",
        "host": args.host,
        "runtime": {
            "runtime_id": f"{socket.gethostname()}-{platform.system()}-{platform.machine()}-py{sys.version_info.major}{sys.version_info.minor}",
            "hostname": socket.gethostname(),
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "network_namespace": network_namespace(),
            "resolver": resolver_summary(),
        },
        "required_consecutive_passes": args.required_consecutive_passes,
        "observed_consecutive_passes": consecutive_passes,
        "attempts": attempts,
        "status": "PASS" if consecutive_passes >= args.required_consecutive_passes else "FAIL",
        "http_request_sent_count": 0,
        "remote_server_http_contact_count": 0,
        "capture_execution_count": 0,
        "browser_automation_count": 0,
        "completed_at_utc": utc_now(),
    }
    text = json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    print(text, end="")
    return 0 if receipt["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
