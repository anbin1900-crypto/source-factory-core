# Source Factory Core P0 Staging Plan

generated_at: 2026-07-30T17:45:59.7085054+09:00
inventory_run_dir: .\runs\local_source_inventory_20260730_172125

## Summary

| Item | Count |
|---|---:|
| Total rows | 5903 |
| P0 core candidates | 2940 |
| Selected for first staging plan | 240 |
| Blocked review queue | 1242 |
| Drive pointer only | 196 |
| Review for reuse / docs | 1419 |

## Selected by Category

| Category | Count |
|---|---:|
| P0_DAILY_QUEUE_RUNNER | 80 |
| P0_GPT_BROWSER_BRIDGE | 80 |
| P0_PC_AGENT_ROUTING_CORE | 80 |

## Policy

- This script creates a staging plan only.
- It does not copy source files.
- Manual review is required before committing staged source.
- Public repository exposure must be checked before source upload.
- Blocked files must not be promoted until reviewed.
