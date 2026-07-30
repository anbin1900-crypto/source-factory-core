# Source Factory Stable Integration Candidate V1

generated_at: 2026-07-31T01:55:16.3662288+09:00
runtime_import_dir: E:\YOLLA\source-factory-core\src\runtime_import\p0_runtime_import_20260731_013239
ops_import_dir: E:\YOLLA\source-factory-core\ops_import\p0_ops_import_20260731_013239
stable_candidate_root: E:\YOLLA\source-factory-core\src\integration_candidates\p0_stable_candidate_20260731_015516
ops_candidate_root: E:\YOLLA\source-factory-core\ops_integration_candidates\p0_ops_candidate_20260731_015516

## Summary

| Item | Count |
|---|---:|
| Runtime input files | 9 |
| Runtime stable candidates | 9 |
| OPS input files | 2 |
| OPS reference candidates | 2 |
| Queue runtime candidates | 2 |
| GPT browser bridge runtime candidates | 4 |
| PC agent runtime candidates | 3 |
| Filename collisions handled | 0 |
| SHA mismatch | 0 |

## Status

PASS_STABLE_INTEGRATION_CANDIDATE_READY_FOR_012

## Policy

- This stage copies files to src/integration_candidates/, not final stable runtime modules.
- Existing src files are not overwritten.
- Hash prefixes are removed from candidate filenames when safe.
- 012 must run syntax verify again against stable candidate paths.
- Final module merge requires Commander approval after 012 PASS.
