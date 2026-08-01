# SLOT 01 — SF_028 P0 WAVE 1 CLASSIFICATION START V1

WORKER_ID: SLOT_01_SF028_P0_WAVE1_CLASSIFICATION_WORKER
ASSIGNMENT_ID: SF028-P0-W01-S01-20260801-1920KST
TASK_ID: SF_028_P0_WAVE_01_SLOT_01_CLASSIFICATION
WORKER_FUNCTION_CLASS: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
REPORT_TO: SOURCE_FACTORY_SF028_INTEGRATION_COMMANDER
MODE: READ_ONLY_SOURCE_REVIEW / NO_EXECUTION / NO_PROMOTION

## AUTHORITY

- commander order: `75d816984ef29bdc7fc9c2bd9e29899c485b9642`
- Wave 1 dispatch: `fcf596b10b4e002767e885c522435a32781d3998`
- staging V2 authority: `49d348af6d8adb0f7ca6d7b529752ee73ab099c2`
- Drive file ID: `1yu9gjvWad6XbgF4Z5PZcuPMmaChjzLKz`
- Slot ZIP SHA-256: `7ae5119ce6cd9d3c2dfef352d82964b0ef767dabec76c9cefa17705ae974e766`
- Slot ZIP size: `43715`
- embedded `SLOT_MANIFEST.json` is source identity authority

## EXACT SOURCE IDS

1. `PCAGENT-AUTO-SRC-000683`
2. `PCAGENT-AUTO-SRC-004213`
3. `PCAGENT-AUTO-SRC-000527`
4. `PCAGENT-AUTO-SRC-000533`
5. `PCAGENT-AUTO-SRC-000539`
6. `PCAGENT-AUTO-SRC-000549`
7. `PCAGENT-AUTO-SRC-000635`
8. `PCAGENT-AUTO-SRC-000643`
9. `PCAGENT-AUTO-SRC-000648`
10. `PCAGENT-AUTO-SRC-000653`
11. `PCAGENT-AUTO-SRC-000658`
12. `PCAGENT-AUTO-SRC-000663`

## WORK

Download/read the exact Slot ZIP. Verify ZIP name, SHA-256 when possible, embedded manifest count=12, and Source IDs. Read the actual source files without executing them.

For every candidate record:

- actual function
- principal functions/classes and inputs/outputs
- imports/dependencies
- file/process/network/database/external effects
- Source Factory-specific coupling
- duplicate/superseded evidence inside the slot or known baseline
- primary classification
- verification level reached
- risks/restrictions
- next action

Primary classification must be exactly one of:

`DIRECT_REUSE | ADAPTER_REQUIRED | REFERENCE_ONLY | PROJECT_BOUND | EXACT_DUPLICATE | SUPERSEDED | SANITIZE_REQUIRED | REJECTED | REINSPECTION_REQUIRED`

Verification level:

`V0_INVENTORY | V1_STATIC | V2_FIXTURE | V3_INTEGRATION | V4_CROSS_PROJECT`

This assignment normally ends at V1_STATIC. Do not run source or install dependencies.

## OUTPUT

Create append-only:

- `reports/sf028_p0_wave01_slot01_<timestamp>/CLASSIFICATION_RESULTS_SLOT_01.json`
- `reports/sf028_p0_wave01_slot01_<timestamp>/WORKER_REPORT_SLOT_01.md`

The JSON must contain exactly 12 unique Source IDs and no extras.

## TERMINAL

- `SF_028_P0_WAVE01_SLOT01_CLASSIFICATION_PASS`
- `SF_028_P0_WAVE01_SLOT01_CLASSIFICATION_YELLOW`
- `SF_028_P0_WAVE01_SLOT01_CLASSIFICATION_FAIL`

## FORBIDDEN

source execution, source modification, runtime/service start, external API/browser/middleware, promotion, Ready, Merge, OLD_ROOT deletion.
