# SLOT 02 — SF_028 P0 WAVE 02 IMMEDIATE EXECUTION PROMPT V2

WORKER_ID: `SLOT_02_SF028_P0_WAVE2_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_02_SLOT_02_CLASSIFICATION`
STATUS: `START_NOW`
BATCH_COMMIT: `d2b6d94cd94c64e906816e70681a0393f2d7d218`
SUPERSEDES_START_HOLD: `f360c045a9fbff1c11aa8b320e16e44ecdae664e`

## Assigned package

- Drive file ID: `1fRQoytttA2RF3NwipNNryqIdlVWkVKsy`
- File: `SF028_P0_EXTRACT_20260801_062137_WAVE_02_SLOT_02.zip`
- Size: `55645`
- SHA-256: `2f019cfc068f4df69981faeac289845b3ddd6d5ef91873005195327b82eba661`
- Expected candidates: `12`

## Mission

Read the actual 12 source files, verify package and per-source identity, and produce evidence-backed static reuse classification. Work in parallel with SLOT 01, 03, 04, and 05 while SLOT 06 integrates Wave 1.

## Boundaries

No source execution, source modification, dependency installation, runtime/service start, promotion, Ready, Merge, or OLD_ROOT deletion.

## Output

- `reports/sf028_p0_wave02_slot02_<timestamp>/CLASSIFICATION_RESULTS_SLOT_02.json`
- `reports/sf028_p0_wave02_slot02_<timestamp>/WORKER_REPORT_SLOT_02.md`

JSON must contain exactly 12 unique assigned Source IDs and one allowed primary classification per candidate. Publish a blocker report even if work cannot complete.

SUCCESS TERMINAL: `SF_028_P0_WAVE02_SLOT02_CLASSIFICATION_PASS`
