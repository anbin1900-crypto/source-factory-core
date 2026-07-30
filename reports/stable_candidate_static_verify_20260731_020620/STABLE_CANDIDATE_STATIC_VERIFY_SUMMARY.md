# Source Factory Stable Candidate Static Verify V1

generated_at: 2026-07-31T02:06:20.5636916+09:00
stable_candidate_dir: E:\YOLLA\source-factory-core\src\integration_candidates\p0_stable_candidate_20260731_015516
ops_candidate_dir: E:\YOLLA\source-factory-core\ops_integration_candidates\p0_ops_candidate_20260731_015516

## Summary

| Item | Count |
|---|---:|
| Runtime candidate files | 9 |
| Runtime PASS | 9 |
| Runtime FAIL | 0 |
| Runtime SKIP | 0 |
| JavaScript files | 6 |
| Python files | 3 |
| OPS reference files | 2 |

## Status

PASS_STABLE_CANDIDATE_STATIC_VERIFY_READY_FOR_013

## Policy

- JavaScript files are checked with node --check.
- Python files are checked with python -m py_compile or py -m py_compile fallback.
- OPS files are counted as references and not imported as runtime source.
- 013 final module merge may proceed only when Runtime FAIL is 0.