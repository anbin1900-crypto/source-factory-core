# Source Factory P0 src_import Promotion Package V2

generated_at: 2026-07-31T01:25:51.9727219+09:00
staging_dir: E:\YOLLA\source-factory-core\_staging\p0_core_import_20260730_174852
candidate_csv: E:\YOLLA\source-factory-core\_staging\p0_core_import_20260730_174852\reports\SF_CORE_FINAL_P0_PROMOTION_CANDIDATES.csv

## Summary

| Item | Count |
|---|---:|
| Total candidate rows | 137 |
| Unique candidate keys | 65 |
| Copied to src_import | 65 |
| Skipped | 0 |
| SHA mismatch | 0 |

## Category Counts

| Category | Count |
|---|---:|
| P0_DAILY_QUEUE_RUNNER | 17 |
| P0_GPT_BROWSER_BRIDGE | 24 |
| P0_PC_AGENT_ROUTING_CORE | 24 |

## Policy

- This package copies files into src_import/, not src/.
- Commander review is required before runtime core promotion.
- Original SHA and copied SHA must match.
- Duplicate candidates are deduplicated by sha256 + file_name + category.
