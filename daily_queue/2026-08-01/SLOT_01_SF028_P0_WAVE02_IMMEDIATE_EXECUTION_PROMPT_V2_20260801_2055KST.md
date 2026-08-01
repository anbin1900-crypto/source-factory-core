# SLOT 01 — SF_028 P0 WAVE 02 IMMEDIATE EXECUTION PROMPT V2

WORKER_ID: `SLOT_01_SF028_P0_WAVE2_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_02_SLOT_01_CLASSIFICATION`
STATUS: `START_NOW`
BATCH_COMMIT: `d2b6d94cd94c64e906816e70681a0393f2d7d218`
SUPERSEDES_START_HOLD: `fd30b73ac43afab764863738f095064e4a474942`

## Assigned package

- Drive file ID: `1QWNOtKLWF3tdCMv8t1_SAkpGh28Egh-d`
- File: `SF028_P0_EXTRACT_20260801_062137_WAVE_02_SLOT_01.zip`
- Size: `58902`
- SHA-256: `2082f546b0f2432dd6dbdda133484cec12bd5e000fc28b45d9b46ffc80cde28b`
- Expected candidates: `12`

## Mission

Read the actual 12 source files, verify package and per-source identity, and produce evidence-backed static reuse classification. Work in parallel with SLOT 02~05 while SLOT 06 integrates Wave 1.

## Boundaries

No source execution, source modification, dependency installation, runtime/service start, promotion, Ready, Merge, or OLD_ROOT deletion.

## Output

- `reports/sf028_p0_wave02_slot01_<timestamp>/CLASSIFICATION_RESULTS_SLOT_01.json`
- `reports/sf028_p0_wave02_slot01_<timestamp>/WORKER_REPORT_SLOT_01.md`

JSON must contain exactly 12 unique assigned Source IDs and one allowed primary classification per candidate. Publish a blocker report even if work cannot complete.

SUCCESS TERMINAL: `SF_028_P0_WAVE02_SLOT01_CLASSIFICATION_PASS`
