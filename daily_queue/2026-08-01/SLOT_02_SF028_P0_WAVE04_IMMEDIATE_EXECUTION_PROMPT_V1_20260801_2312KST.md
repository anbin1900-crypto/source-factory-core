# SLOT 02 — SF_028 P0 WAVE 04 IMMEDIATE CLASSIFICATION

WORKER_ID: `SLOT_02_SF028_P0_WAVE4_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_04_SLOT_02_CLASSIFICATION`
WORKER_FUNCTION_CLASS: `SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER`
STATUS: `START_NOW`

## Authority

- batch: `5a1cc5be0f884ae3d7938c137b443433a0c8e5f2`
- Drive file ID: `12GtYgmvcNkKbu3i6wiykNpQAEosxB7jT`
- ZIP: `SF028_P0_EXTRACT_20260801_062137_WAVE_04_SLOT_02.zip`
- size: `50196`
- SHA-256: `b910906f62ae520071b49f0e6b521386e5169b4bb3e1da7559cf71a2ace8af42`
- expected candidates: `12`

Execute the common batch contract exactly. Read and classify all 12 sources; do not execute or modify source. Publish append-only:

```text
reports/sf028_p0_wave04_slot02_<timestamp>/CLASSIFICATION_RESULTS_SLOT_02.json
reports/sf028_p0_wave04_slot02_<timestamp>/WORKER_REPORT_SLOT_02.md
```

The JSON must contain exactly 12 unique assigned Source IDs. Any blocker must still produce a terminal report with exact evidence.
