# Source Factory Staged P0 Core Static Check V3

generated_at: 2026-07-31T00:48:44.8133630+09:00
staging_dir: .\_staging\p0_core_import_20260730_174852

## Summary

| Item | Count |
|---|---:|
| Total checked | 240 |
| Promotion candidates | 137 |
| Blocked or review required | 103 |

## Promotion Decision Counts

| Decision | Count |
|---|---:|
| BLOCKED_SHA_MISMATCH | 102 |
| BLOCKED_STATIC_CHECK | 1 |
| PROMOTION_CANDIDATE | 137 |

## Static Status Counts

| Static Status | Count |
|---|---:|
| FAIL_NODE_CHECK | 1 |
| PASS_JSON_PARSE | 57 |
| PASS_NO_COMPILE_CHECK_REQUIRED | 119 |
| PASS_NODE_CHECK | 60 |
| PASS_PY_COMPILE | 3 |

## Policy

- V3 records per-file static failures and continues.
- PROMOTION_CANDIDATE means eligible for manual review, not final src promotion.
- BLOCKED_STATIC_CHECK files must not be promoted.
