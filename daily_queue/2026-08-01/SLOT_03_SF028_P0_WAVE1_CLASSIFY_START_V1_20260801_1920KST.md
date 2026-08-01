# SLOT 03 — SF_028 P0 WAVE 1 CLASSIFICATION START V1

WORKER_ID: SLOT_03_SF028_P0_WAVE1_CLASSIFICATION_WORKER
ASSIGNMENT_ID: SF028-P0-W01-S03-20260801-1920KST
TASK_ID: SF_028_P0_WAVE_01_SLOT_03_CLASSIFICATION
WORKER_FUNCTION_CLASS: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
REPORT_TO: SOURCE_FACTORY_SF028_INTEGRATION_COMMANDER
MODE: READ_ONLY_SOURCE_REVIEW / NO_EXECUTION / NO_PROMOTION

## AUTHORITY

- commander order: `75d816984ef29bdc7fc9c2bd9e29899c485b9642`
- Wave 1 dispatch: `fcf596b10b4e002767e885c522435a32781d3998`
- staging V2 authority: `49d348af6d8adb0f7ca6d7b529752ee73ab099c2`
- Drive file ID: `1cMY3OXo8NiOm6CTQkty8k3nbqDV26JHT`
- Slot ZIP SHA-256: `c5f184c16c306559f0e30cc19dedaf7e0c37b5e8b817b1e49bd47d61fb3181c4`
- Slot ZIP size: `50875`
- embedded `SLOT_MANIFEST.json` is source identity authority

## EXACT SOURCE IDS

1. `PCAGENT-AUTO-SRC-000881`
2. `PCAGENT-AUTO-SRC-000499`
3. `PCAGENT-AUTO-SRC-000529`
4. `PCAGENT-AUTO-SRC-000536`
5. `PCAGENT-AUTO-SRC-000543`
6. `PCAGENT-AUTO-SRC-000552`
7. `PCAGENT-AUTO-SRC-000637`
8. `PCAGENT-AUTO-SRC-000645`
9. `PCAGENT-AUTO-SRC-000650`
10. `PCAGENT-AUTO-SRC-000655`
11. `PCAGENT-AUTO-SRC-000660`
12. `PCAGENT-AUTO-SRC-000687`

## WORK

Read the exact Drive Slot ZIP and embedded manifest. Verify 12 unique Source IDs and inspect actual source files without execution.

For each candidate record actual function, inputs/outputs, functions/classes, dependencies, external effects, project coupling, duplicate/superseded relation, risks, verification level and next action.

Use exactly one primary classification:

`DIRECT_REUSE | ADAPTER_REQUIRED | REFERENCE_ONLY | PROJECT_BOUND | EXACT_DUPLICATE | SUPERSEDED | SANITIZE_REQUIRED | REJECTED | REINSPECTION_REQUIRED`

Verification level:

`V0_INVENTORY | V1_STATIC | V2_FIXTURE | V3_INTEGRATION | V4_CROSS_PROJECT`

This assignment normally ends at V1_STATIC. Do not run source or install dependencies.

## OUTPUT

Create append-only:

- `reports/sf028_p0_wave01_slot03_<timestamp>/CLASSIFICATION_RESULTS_SLOT_03.json`
- `reports/sf028_p0_wave01_slot03_<timestamp>/WORKER_REPORT_SLOT_03.md`

The JSON must contain exactly 12 unique Source IDs and no extras.

## TERMINAL

- `SF_028_P0_WAVE01_SLOT03_CLASSIFICATION_PASS`
- `SF_028_P0_WAVE01_SLOT03_CLASSIFICATION_YELLOW`
- `SF_028_P0_WAVE01_SLOT03_CLASSIFICATION_FAIL`

## FORBIDDEN

source execution, source modification, runtime/service start, external API/browser/middleware, promotion, Ready, Merge, OLD_ROOT deletion.
