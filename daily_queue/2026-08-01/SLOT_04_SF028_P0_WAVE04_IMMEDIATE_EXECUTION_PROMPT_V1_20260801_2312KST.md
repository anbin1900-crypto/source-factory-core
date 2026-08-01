# SLOT 04 — SF_028 P0 WAVE 04 IMMEDIATE CLASSIFICATION

WORKER_ID: `SLOT_04_SF028_P0_WAVE4_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_04_SLOT_04_CLASSIFICATION`
WORKER_FUNCTION_CLASS: `SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER`
STATUS: `START_NOW`

## Authority

- batch: `5a1cc5be0f884ae3d7938c137b443433a0c8e5f2`
- Drive file ID: `17c9mZgizzX2d2OuskgS4CmAGhhZ7IKuw`
- ZIP: `SF028_P0_EXTRACT_20260801_062137_WAVE_04_SLOT_04.zip`
- size: `57184`
- SHA-256: `6b925225013eaa3639032eba69cfff2833e05084f1492fbf3d0680951157f24a`
- expected candidates: `12`

Execute the common batch contract exactly. Read and classify all 12 sources; do not execute or modify source. Publish append-only:

```text
reports/sf028_p0_wave04_slot04_<timestamp>/CLASSIFICATION_RESULTS_SLOT_04.json
reports/sf028_p0_wave04_slot04_<timestamp>/WORKER_REPORT_SLOT_04.md
```

The JSON must contain exactly 12 unique assigned Source IDs. Any blocker must still produce a terminal report with exact evidence.
