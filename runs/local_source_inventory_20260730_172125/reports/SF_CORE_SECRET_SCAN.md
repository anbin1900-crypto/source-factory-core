# Source Factory Core Secret Scan and Reuse Classification

generated_at: 2026-07-30T17:43:29.1115043+09:00
inventory_run_dir: .\runs\local_source_inventory_20260730_172125

## Summary

| Item | Count |
|---|---:|
| Total inventory files | 5903 |
| Total classified | 5903 |
| Secret/name-risk findings | 1242 |

## Decision Counts

| Decision | Count |
|---|---:|
| ARCHIVE_OR_IGNORE | 106 |
| BLOCK_REVIEW_NAME_RISK | 1075 |
| BLOCK_REVIEW_SECRET_INDICATOR | 167 |
| DOC_OR_CONFIG_REVIEW | 748 |
| DRIVE_POINTER_ONLY | 196 |
| PROMOTE_TO_CORE_CANDIDATE | 2940 |
| REVIEW_FOR_REUSE | 671 |

## Policy

- Do not upload BLOCK_REVIEW files until manually reviewed.
- Store DRIVE_POINTER_ONLY artifacts in Google Drive and commit only pointer metadata.
- Promote only PROMOTE_TO_CORE_CANDIDATE after secret review and compile/static check.
- Gas station portal examples are reusable examples, not core runtime until reviewed.
