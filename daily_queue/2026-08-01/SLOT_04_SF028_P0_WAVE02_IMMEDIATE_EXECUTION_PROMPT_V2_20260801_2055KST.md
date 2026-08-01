# SLOT 04 — SF_028 P0 WAVE 02 IMMEDIATE EXECUTION PROMPT V2

WORKER_ID: `SLOT_04_SF028_P0_WAVE2_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_02_SLOT_04_CLASSIFICATION`
STATUS: `START_NOW`
BATCH_COMMIT: `d2b6d94cd94c64e906816e70681a0393f2d7d218`
SUPERSEDES_START_HOLD: `c37f78f5df8caf71c3e4a46706f75b9fe1499f0d`

## Assigned package

- Drive file ID: `1VxhpLD2sYP8JeSpQQegYtblpH2M-lPHM`
- File: `SF028_P0_EXTRACT_20260801_062137_WAVE_02_SLOT_04.zip`
- Size: `48984`
- SHA-256: `d1c189d1374a5de0dc0e3fddc3f2556744ea02f6c7f9da62aa62d313a493999e`
- Expected candidates: `12`

## Mission

Read the actual 12 source files, verify package and per-source identity, and produce evidence-backed static reuse classification. Work in parallel with SLOT 01, 02, 03, and 05 while SLOT 06 integrates Wave 1.

## Boundaries

No source execution, source modification, dependency installation, runtime/service start, promotion, Ready, Merge, or OLD_ROOT deletion.

## Output

- `reports/sf028_p0_wave02_slot04_<timestamp>/CLASSIFICATION_RESULTS_SLOT_04.json`
- `reports/sf028_p0_wave02_slot04_<timestamp>/WORKER_REPORT_SLOT_04.md`

JSON must contain exactly 12 unique assigned Source IDs and one allowed primary classification per candidate. Publish a blocker report even if work cannot complete.

SUCCESS TERMINAL: `SF_028_P0_WAVE02_SLOT04_CLASSIFICATION_PASS`
