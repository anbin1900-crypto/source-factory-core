# SLOT 05 — SF_028 P0 WAVE 04 IMMEDIATE CLASSIFICATION

WORKER_ID: `SLOT_05_SF028_P0_WAVE4_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_04_SLOT_05_CLASSIFICATION`
WORKER_FUNCTION_CLASS: `SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER`
STATUS: `START_NOW`

## Authority

- batch: `5a1cc5be0f884ae3d7938c137b443433a0c8e5f2`
- Drive file ID: `1ymGgYjIyveH191lI6ugaRDN229ew5tpM`
- ZIP: `SF028_P0_EXTRACT_20260801_062137_WAVE_04_SLOT_05.zip`
- size: `46095`
- SHA-256: `575a2ce19c504ee25a214b86fc7a51d99a3d4b126e6c15d5534b92c7bf3dfecc`
- expected candidates: `12`

Execute the common batch contract exactly. Read and classify all 12 sources; do not execute or modify source. Publish append-only:

```text
reports/sf028_p0_wave04_slot05_<timestamp>/CLASSIFICATION_RESULTS_SLOT_05.json
reports/sf028_p0_wave04_slot05_<timestamp>/WORKER_REPORT_SLOT_05.md
```

The JSON must contain exactly 12 unique assigned Source IDs. Any blocker must still produce a terminal report with exact evidence.
