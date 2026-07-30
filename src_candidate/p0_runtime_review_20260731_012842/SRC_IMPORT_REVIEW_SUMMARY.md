# Source Factory src_import Review and Runtime Candidate Plan

generated_at: 2026-07-31T01:28:43.1935614+09:00
src_import_dir: E:\YOLLA\source-factory-core\src_import\p0_core_import_v2_20260731_012550
manifest_csv: E:\YOLLA\source-factory-core\src_import\p0_core_import_v2_20260731_012550\PROMOTED_SOURCE_MANIFEST_V2.csv

## Summary

| Item | Count |
|---|---:|
| Manifest rows | 65 |
| Copied to review folders | 65 |
| Missing source files | 0 |
| SHA mismatch | 0 |
| SRC ready review | 9 |
| OPS ready review | 2 |
| Docs/prompt reference only | 36 |
| Evidence reference only | 18 |
| Manual review required | 0 |

## Decision Counts

| Decision | Count |
|---|---:|
| DOCS_PROMPT_REFERENCE_ONLY | 36 |
| EVIDENCE_REFERENCE_ONLY | 18 |
| OPS_READY_REVIEW | 2 |
| SRC_READY_REVIEW | 9 |

## Category / Decision Counts

| Category + Decision | Count |
|---|---:|
| P0_DAILY_QUEUE_RUNNER, DOCS_PROMPT_REFERENCE_ONLY | 14 |
| P0_DAILY_QUEUE_RUNNER, EVIDENCE_REFERENCE_ONLY | 1 |
| P0_DAILY_QUEUE_RUNNER, SRC_READY_REVIEW | 2 |
| P0_GPT_BROWSER_BRIDGE, DOCS_PROMPT_REFERENCE_ONLY | 12 |
| P0_GPT_BROWSER_BRIDGE, EVIDENCE_REFERENCE_ONLY | 6 |
| P0_GPT_BROWSER_BRIDGE, OPS_READY_REVIEW | 2 |
| P0_GPT_BROWSER_BRIDGE, SRC_READY_REVIEW | 4 |
| P0_PC_AGENT_ROUTING_CORE, DOCS_PROMPT_REFERENCE_ONLY | 10 |
| P0_PC_AGENT_ROUTING_CORE, EVIDENCE_REFERENCE_ONLY | 11 |
| P0_PC_AGENT_ROUTING_CORE, SRC_READY_REVIEW | 3 |

## Policy

- This stage does not promote files into final src/ runtime paths.
- SRC_READY_REVIEW files are only candidates for 009 runtime promotion.
- DOCS_PROMPT_REFERENCE_ONLY files belong in docs/examples/prompt archives, not runtime src/.
- EVIDENCE_REFERENCE_ONLY files must not be imported as runtime source.
- SHA mismatch must be 0 before 009.
