"""Quota-safe deterministic scheduler for adapter execution plans."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping


def _parse_time(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _stable_sha(payload: Mapping[str, Any]) -> str:
    body = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def plan_quota_schedule(
    package: Mapping[str, Any],
    window_start: str | datetime,
    requested_run_count: int = 3,
) -> dict[str, Any]:
    if requested_run_count <= 0:
        raise ValueError("REQUESTED_RUN_COUNT_MUST_BE_POSITIVE")
    quota = package["quota"]
    schedule = package["schedule"]
    start = _parse_time(window_start)

    rpm_interval = max(1, (60 + quota["requests_per_minute"] - 1) // quota["requests_per_minute"])
    minimum_interval = max(int(quota["minimum_interval_seconds"]), rpm_interval)
    cadence_seconds = max(int(schedule["cadence_minutes"]) * 60, minimum_interval)
    daily_cap = int(quota["requests_per_day"])
    scheduled_count = min(requested_run_count, daily_cap)

    runs = [
        (start + timedelta(seconds=cadence_seconds * index)).isoformat().replace("+00:00", "Z")
        for index in range(scheduled_count)
    ]
    plan = {
        "schema_version": "QUOTA_SCHEDULE_PLAN_V1",
        "package_id": package["package_id"],
        "adapter_id": package["adapter_id"],
        "window_start": start.isoformat().replace("+00:00", "Z"),
        "requested_run_count": requested_run_count,
        "scheduled_run_count": scheduled_count,
        "requests_per_minute": int(quota["requests_per_minute"]),
        "requests_per_day": daily_cap,
        "minimum_interval_seconds": minimum_interval,
        "cadence_seconds": cadence_seconds,
        "next_run_at": runs[0],
        "scheduled_runs": runs,
        "quota_limit_exceeded": False,
        "network_call_count": 0,
    }
    plan["plan_sha256"] = _stable_sha(plan)
    return plan
