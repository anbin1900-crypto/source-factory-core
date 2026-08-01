# SLOT 02 — SF_028 P0 WAVE 1 CLASSIFICATION START V1

WORKER_ID: SLOT_02_SF028_P0_WAVE1_CLASSIFICATION_WORKER
ASSIGNMENT_ID: SF028-P0-W01-S02-20260801-1920KST
TASK_ID: SF_028_P0_WAVE_01_SLOT_02_CLASSIFICATION
WORKER_FUNCTION_CLASS: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
REPORT_TO: SOURCE_FACTORY_SF028_INTEGRATION_COMMANDER
MODE: READ_ONLY_SOURCE_REVIEW / NO_EXECUTION / NO_PROMOTION

## AUTHORITY

- commander order: `75d816984ef29bdc7fc9c2bd9e29899c485b9642`
- Wave 1 dispatch: `fcf596b10b4e002767e885c522435a32781d3998`
- staging V2 authority: `49d348af6d8adb0f7ca6d7b529752ee73ab099c2`
- Drive file ID: `1IodVUISow4PdCDZelS-D6dKyWvFbzHrx`
- Slot ZIP SHA-256: `b678d60a4238aa1bc4f897dd9cabbf98c58ecdf714aea2e425b1b400cbd55214`
- Slot ZIP size: `46311`
- embedded `SLOT_MANIFEST.json` is source identity authority

## EXACT SOURCE IDS

1. `PCAGENT-AUTO-SRC-000684`
2. `PCAGENT-AUTO-SRC-000490`
3. `PCAGENT-AUTO-SRC-000528`
4. `PCAGENT-AUTO-SRC-000535`
5. `PCAGENT-AUTO-SRC-000540`
6. `PCAGENT-AUTO-SRC-000550`
7. `PCAGENT-AUTO-SRC-000636`
8. `PCAGENT-AUTO-SRC-000644`
9. `PCAGENT-AUTO-SRC-000649`
10. `PCAGENT-AUTO-SRC-000654`
11. `PCAGENT-AUTO-SRC-000659`
12. `PCAGENT-AUTO-SRC-000664`

## WORK

Read the exact Drive Slot ZIP and embedded manifest. Verify 12 unique Source IDs and inspect the actual source files without executing them.

For each candidate record actual function, inputs/outputs, principal functions/classes, dependencies, external effects, project coupling, duplicate or replacement relation, risks, verification level and next action.

Use exactly one primary classification:

`DIRECT_REUSE | ADAPTER_REQUIRED | REFERENCE_ONLY | PROJECT_BOUND | EXACT_DUPLICATE | SUPERSEDED | SANITIZE_REQUIRED | REJECTED | REINSPECTION_REQUIRED`

Verification level:

`V0_INVENTORY | V1_STATIC | V2_FIXTURE | V3_INTEGRATION | V4_CROSS_PROJECT`

This assignment normally ends at V1_STATIC. Do not run source or install dependencies.

## OUTPUT

Create append-only:

- `reports/sf028_p0_wave01_slot02_<timestamp>/CLASSIFICATION_RESULTS_SLOT_02.json`
- `reports/sf028_p0_wave01_slot02_<timestamp>/WORKER_REPORT_SLOT_02.md`

The JSON must contain exactly 12 unique Source IDs and no extras.

## TERMINAL

- `SF_028_P0_WAVE01_SLOT02_CLASSIFICATION_PASS`
- `SF_028_P0_WAVE01_SLOT02_CLASSIFICATION_YELLOW`
- `SF_028_P0_WAVE01_SLOT02_CLASSIFICATION_FAIL`

## FORBIDDEN

source execution, source modification, runtime/service start, external API/browser/middleware, promotion, Ready, Merge, OLD_ROOT deletion.
