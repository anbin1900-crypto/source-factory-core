# SLOT 05 — SF_028 P0 WAVE 02 IMMEDIATE EXECUTION PROMPT V2

WORKER_ID: `SLOT_05_SF028_P0_WAVE2_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_02_SLOT_05_CLASSIFICATION`
STATUS: `START_NOW`
BATCH_COMMIT: `d2b6d94cd94c64e906816e70681a0393f2d7d218`
SUPERSEDES_START_HOLD: `4ca3e71cc4870f48a1325c312d255e6704493953`

## Assigned package

- Drive file ID: `1RX4pVcWw9jBE0POZOkTNHI0xzqelM_yH`
- File: `SF028_P0_EXTRACT_20260801_062137_WAVE_02_SLOT_05.zip`
- Size: `52715`
- SHA-256: `5e498a8ab4e1213b1094fb02574b15fcae990cfd01a87ca30b475b9a6479314f`
- Expected candidates: `12`

## Mission

Read the actual 12 source files, verify package and per-source identity, and produce evidence-backed static reuse classification. Work in parallel with SLOT 01~04 while SLOT 06 integrates Wave 1.

## Boundaries

No source execution, source modification, dependency installation, runtime/service start, promotion, Ready, Merge, or OLD_ROOT deletion.

## Output

- `reports/sf028_p0_wave02_slot05_<timestamp>/CLASSIFICATION_RESULTS_SLOT_05.json`
- `reports/sf028_p0_wave02_slot05_<timestamp>/WORKER_REPORT_SLOT_05.md`

JSON must contain exactly 12 unique assigned Source IDs and one allowed primary classification per candidate. Publish a blocker report even if work cannot complete.

SUCCESS TERMINAL: `SF_028_P0_WAVE02_SLOT05_CLASSIFICATION_PASS`
