# Source Factory Selected P0 Core Source Staging

generated_at: 2026-07-30T17:48:56.8265337+09:00
inventory_run_dir: .\runs\local_source_inventory_20260730_172125
output_root: ._staging\p0_core_import_20260730_174852

## Summary

| Item | Count |
|---|---:|
| Selected rows | 240 |
| Copied files | 240 |
| Skipped files | 0 |
| Copy failures | 0 |

## Category Counts

| Category | Count |
|---|---:|
| P0_DAILY_QUEUE_RUNNER | 80 |
| P0_GPT_BROWSER_BRIDGE | 80 |
| P0_PC_AGENT_ROUTING_CORE | 80 |

## Policy

- This is staging only, not final src promotion.
- Review staged files before moving them to src/.
- Do not stage BLOCK_REVIEW or DRIVE_POINTER files.
- Run static checks before promotion.
