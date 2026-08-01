# SLOT 06 — SF_028 P0 WAVE 1 INTEGRATION HOLD V1

WORKER_ID: SLOT_06_SF028_P0_WAVE1_INTEGRATION_WORKER
ASSIGNMENT_ID: SF028-P0-W01-S06-HOLD-20260801-1920KST
TASK_ID: SF_028_P0_WAVE_01_INTEGRATION_AND_NEXT_GATE
WORKER_FUNCTION_CLASS: INTEGRATION_WORKER / GATE_COMMANDER_ASSISTANT
REPORT_TO: SOURCE_FACTORY_SF028_INTEGRATION_COMMANDER
MODE: HOLD / NO_PREMATURE_INTAKE / NO_RUNTIME_EXECUTION

## AUTHORITY

- commander order: `75d816984ef29bdc7fc9c2bd9e29899c485b9642`
- Wave 1 dispatch: `fcf596b10b4e002767e885c522435a32781d3998`
- staging V2 authority: `49d348af6d8adb0f7ca6d7b529752ee73ab099c2`

## HOLD CONDITION

Do not perform integration until all five actual classification result commits exist:

- SLOT 01: exactly 12 decisions
- SLOT 02: exactly 12 decisions
- SLOT 03: exactly 12 decisions
- SLOT 04: exactly 12 decisions
- SLOT 05: exactly 12 decisions

Prompt commits, Drive upload commits, prior Active Core Migration reports, or empty/missing-result reports do not satisfy this condition.

## REQUIRED INTAKE CHECKS AFTER RELEASE

1. Five result commits exist.
2. Each JSON parses.
3. Each has exactly 12 unique Source IDs.
4. Union has exactly 60 unique Source IDs.
5. IDs equal the authoritative Wave 1 dispatch set.
6. Every candidate has one primary classification.
7. Evidence and verification level are present.
8. No source execution or forbidden external effect occurred.
9. Cross-slot duplicate/superseded conflicts are reconciled.
10. Reinspection candidates are isolated without blocking safe closures.

## EXPECTED OUTPUT AFTER RELEASE

- `state/SF_028_P0_WAVE_01_INTEGRATED_CLASSIFICATION_LEDGER.json`
- `state/SF_028_P0_WAVE_01_REINSPECTION_LEDGER.json`
- `reports/sf028_p0_wave01_integration_<timestamp>/WORKER_REPORT_SLOT_06.md`

## VALID TERMINAL AFTER RELEASE

- `SF_028_P0_WAVE_01_CLOSED_OPEN_WAVE_02`
- `SF_028_P0_WAVE_01_PARTIAL_HOLD_REINSPECTION`
- `SF_028_P0_WAVE_01_FAIL_BOUNDARY_VIOLATION`

## CURRENT TERMINAL

`SF_028_P0_WAVE_01_SLOT06_HOLD_WAITING_FIVE_RESULTS`

## FORBIDDEN

premature integration, invented results, source execution, promotion, runtime/service start, Ready, Merge, OLD_ROOT deletion.
