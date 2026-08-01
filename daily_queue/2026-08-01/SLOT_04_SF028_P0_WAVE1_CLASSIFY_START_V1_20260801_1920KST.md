# SLOT 04 — SF_028 P0 WAVE 1 CLASSIFICATION START V1

WORKER_ID: SLOT_04_SF028_P0_WAVE1_CLASSIFICATION_WORKER
ASSIGNMENT_ID: SF028-P0-W01-S04-20260801-1920KST
TASK_ID: SF_028_P0_WAVE_01_SLOT_04_CLASSIFICATION
WORKER_FUNCTION_CLASS: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
REPORT_TO: SOURCE_FACTORY_SF028_INTEGRATION_COMMANDER
MODE: READ_ONLY_SOURCE_REVIEW / NO_EXECUTION / NO_PROMOTION

## AUTHORITY

- commander order: `75d816984ef29bdc7fc9c2bd9e29899c485b9642`
- Wave 1 dispatch: `fcf596b10b4e002767e885c522435a32781d3998`
- staging V2 authority: `49d348af6d8adb0f7ca6d7b529752ee73ab099c2`
- Drive file ID: `1CzILtMNBcx0o3K5G7dQ62s5Vm8ck3GZj`
- Slot ZIP SHA-256: `a16b2ae1e1f8c4c91b424b278793e7b34bb2417dd5c9cecc2d96633fb907f99c`
- Slot ZIP size: `47392`
- embedded `SLOT_MANIFEST.json` is source identity authority

## EXACT SOURCE IDS

1. `PCAGENT-AUTO-SRC-004211`
2. `PCAGENT-AUTO-SRC-000525`
3. `PCAGENT-AUTO-SRC-000530`
4. `PCAGENT-AUTO-SRC-000537`
5. `PCAGENT-AUTO-SRC-000547`
6. `PCAGENT-AUTO-SRC-000587`
7. `PCAGENT-AUTO-SRC-000638`
8. `PCAGENT-AUTO-SRC-000646`
9. `PCAGENT-AUTO-SRC-000651`
10. `PCAGENT-AUTO-SRC-000656`
11. `PCAGENT-AUTO-SRC-000661`
12. `PCAGENT-AUTO-SRC-000688`

## WORK

Read the exact Drive Slot ZIP and embedded manifest. Verify 12 unique Source IDs and inspect actual source files without execution.

For each candidate record actual function, inputs/outputs, principal functions/classes, dependencies, external effects, project coupling, duplicate or replacement relation, risks, verification level and next action.

Use exactly one primary classification:

`DIRECT_REUSE | ADAPTER_REQUIRED | REFERENCE_ONLY | PROJECT_BOUND | EXACT_DUPLICATE | SUPERSEDED | SANITIZE_REQUIRED | REJECTED | REINSPECTION_REQUIRED`

Verification level:

`V0_INVENTORY | V1_STATIC | V2_FIXTURE | V3_INTEGRATION | V4_CROSS_PROJECT`

This assignment normally ends at V1_STATIC. Do not run source or install dependencies.

## OUTPUT

Create append-only:

- `reports/sf028_p0_wave01_slot04_<timestamp>/CLASSIFICATION_RESULTS_SLOT_04.json`
- `reports/sf028_p0_wave01_slot04_<timestamp>/WORKER_REPORT_SLOT_04.md`

The JSON must contain exactly 12 unique Source IDs and no extras.

## TERMINAL

- `SF_028_P0_WAVE01_SLOT04_CLASSIFICATION_PASS`
- `SF_028_P0_WAVE01_SLOT04_CLASSIFICATION_YELLOW`
- `SF_028_P0_WAVE01_SLOT04_CLASSIFICATION_FAIL`

## FORBIDDEN

source execution, source modification, runtime/service start, external API/browser/middleware, promotion, Ready, Merge, OLD_ROOT deletion.
