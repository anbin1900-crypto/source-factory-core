# SLOT 03 — SF_028 P0 WAVE 02 IMMEDIATE EXECUTION PROMPT V2

WORKER_ID: `SLOT_03_SF028_P0_WAVE2_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_02_SLOT_03_CLASSIFICATION`
STATUS: `START_NOW`
BATCH_COMMIT: `d2b6d94cd94c64e906816e70681a0393f2d7d218`
SUPERSEDES_START_HOLD: `49589fda1f4a45d735ab897d7f5216c1491b962a`

## Assigned package

- Drive file ID: `1XCRxPdV9N4bI6DCxZu1wV5wnqRRZYYCU`
- File: `SF028_P0_EXTRACT_20260801_062137_WAVE_02_SLOT_03.zip`
- Size: `55955`
- SHA-256: `14131bb795f3f3cb44c82f0ed87794c824937d8f98125ed08c78bd26fa74429f`
- Expected candidates: `12`

## Mission

Read the actual 12 source files, verify package and per-source identity, and produce evidence-backed static reuse classification. Work in parallel with SLOT 01, 02, 04, and 05 while SLOT 06 integrates Wave 1.

## Boundaries

No source execution, source modification, dependency installation, runtime/service start, promotion, Ready, Merge, or OLD_ROOT deletion.

## Output

- `reports/sf028_p0_wave02_slot03_<timestamp>/CLASSIFICATION_RESULTS_SLOT_03.json`
- `reports/sf028_p0_wave02_slot03_<timestamp>/WORKER_REPORT_SLOT_03.md`

JSON must contain exactly 12 unique assigned Source IDs and one allowed primary classification per candidate. Publish a blocker report even if work cannot complete.

SUCCESS TERMINAL: `SF_028_P0_WAVE02_SLOT03_CLASSIFICATION_PASS`
