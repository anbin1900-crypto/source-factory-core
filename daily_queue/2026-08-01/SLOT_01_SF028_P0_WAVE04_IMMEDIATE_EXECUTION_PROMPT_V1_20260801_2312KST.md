# SLOT 01 — SF_028 P0 WAVE 04 IMMEDIATE CLASSIFICATION

WORKER_ID: `SLOT_01_SF028_P0_WAVE4_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_04_SLOT_01_CLASSIFICATION`
WORKER_FUNCTION_CLASS: `SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER`
STATUS: `START_NOW`

## Authority

- batch: `5a1cc5be0f884ae3d7938c137b443433a0c8e5f2`
- Drive file ID: `1OtaH7K-GvONtTXvLLpBqtaFcmOgfQWMt`
- ZIP: `SF028_P0_EXTRACT_20260801_062137_WAVE_04_SLOT_01.zip`
- size: `43964`
- SHA-256: `018e62d52a313588dc16ca7f3bf2e6fc25b306c2125a17328b731ed52e6d79ed`
- expected candidates: `12`

Execute the common batch contract exactly. Read and classify all 12 sources; do not execute or modify source. Publish append-only:

```text
reports/sf028_p0_wave04_slot01_<timestamp>/CLASSIFICATION_RESULTS_SLOT_01.json
reports/sf028_p0_wave04_slot01_<timestamp>/WORKER_REPORT_SLOT_01.md
```

The JSON must contain exactly 12 unique assigned Source IDs. Any blocker must still produce a terminal report with exact evidence.
