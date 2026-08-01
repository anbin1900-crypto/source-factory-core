# SLOT 03 — SF_028 P0 WAVE 04 IMMEDIATE CLASSIFICATION

WORKER_ID: `SLOT_03_SF028_P0_WAVE4_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_04_SLOT_03_CLASSIFICATION`
WORKER_FUNCTION_CLASS: `SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER`
STATUS: `START_NOW`

## Authority

- batch: `5a1cc5be0f884ae3d7938c137b443433a0c8e5f2`
- Drive file ID: `1ODzXGrP9RVeRLBPnP8MXZw-SpouI-SC8`
- ZIP: `SF028_P0_EXTRACT_20260801_062137_WAVE_04_SLOT_03.zip`
- size: `61644`
- SHA-256: `1421cec489e6ddde1e047bf5471371aef848173b48589f36b78852b4b1a68bf4`
- expected candidates: `12`

Execute the common batch contract exactly. Read and classify all 12 sources; do not execute or modify source. Publish append-only:

```text
reports/sf028_p0_wave04_slot03_<timestamp>/CLASSIFICATION_RESULTS_SLOT_03.json
reports/sf028_p0_wave04_slot03_<timestamp>/WORKER_REPORT_SLOT_03.md
```

The JSON must contain exactly 12 unique assigned Source IDs. Any blocker must still produce a terminal report with exact evidence.
