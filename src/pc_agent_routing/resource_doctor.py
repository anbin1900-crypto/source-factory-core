from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class ResourceLimits:
    max_total_agent_runs: int = 5
    max_parallel_light_jobs: int = 5
    max_parallel_source_jobs: int = 3
    max_parallel_build_jobs: int = 2
    max_parallel_browser_jobs: int = 2
    max_parallel_document_jobs: int = 2
    max_parallel_exclusive_runtime_jobs: int = 1

    def to_dict(self):
        return asdict(self)


def adjusted_limits(*, cpu_percent: float, memory_available_gb: float,
                    disk_free_gb: float, exclusive_runtime_active: bool) -> ResourceLimits:
    base = ResourceLimits()
    if exclusive_runtime_active:
        return ResourceLimits(1, 1, 1, 1, 1, 1, 1)
    if cpu_percent >= 90 or memory_available_gb < 4 or disk_free_gb < 20:
        return ResourceLimits(1, 1, 1, 1, 1, 1, 1)
    if cpu_percent >= 75 or memory_available_gb < 8 or disk_free_gb < 50:
        return ResourceLimits(2, 2, 1, 1, 1, 1, 1)
    return base
