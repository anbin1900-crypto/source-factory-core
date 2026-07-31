# SLOT 01 — 026 HOTFIX R3 Minimal receipt_save_invocation_count Field Fix

ISSUED_AT_KST: 2026-08-01T03:44+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BATCH_ID: SF_026_HOTFIX_R3_MINIMAL_FIELD_FIX_AND_REINTAKE_20260801_0344
WORKER_ID: SOURCE_FACTORY_SLOT_01
TASK_ID: SF_026_HOTFIX_R3_SLOT_01_MINIMAL_RECEIPT_SAVE_INVOCATION_FIELD_FIX
WORKER_FUNCTION_CLASS: CORE_PATCH_WORKER
MODE: MINIMAL_SOURCE_PATCH_ONLY / REPORT_ONLY_RESULT / NO_026_EXECUTION / NO_SERVICE / NO_EXTERNAL_EFFECT
CURRENT_GATE: 026_HOLD

## Intake

Read and preserve these authorities:

- R3 batch: daily_queue/2026-08-01/SF_026_HOTFIX_R3_MINIMAL_FIELD_FIX_AND_REINTAKE_BATCH.md
- R2 SLOT 01 FAIL result: a6c9a8238274a3a1ba384120c32ce5fc2c3d6ad2
- R1 implementation source commit: 42b1f29b276f603cd793f930b79346700bbbe551
- Current source: src/pc_agent/local_pc_agent_mvp.py

## Required minimal patch

Patch only src/pc_agent/local_pc_agent_mvp.py.

Add explicit observability fields only:

1. In rejected claim return object:
   - receipt_save_invocation_count: 0
2. In accepted/happy-path result object:
   - receipt_save_invocation_count: 2

Do not change the claim-before-command logic except for the explicit field addition.
Do not alter command execution order.
Do not alter canonical command registry.
Do not alter terminal receipt validation.
Do not alter negative verifier.

## Required verification

After patch, publish an append-only result report with:

- exact source commit
- exact source blob SHA for src/pc_agent/local_pc_agent_mvp.py
- py_compile PASS
- static rejected-path order PASS
- rejected path has command_invocation_count 0
- rejected path has receipt_save_invocation_count 0
- accepted path has command_invocation_count 1
- accepted path has receipt_save_invocation_count 2
- no 026 one-flow verifier execution
- no service/external effect

Permitted terminal statuses:

- SLOT_01_R3_MINIMAL_FIELD_FIX_PASS
- SLOT_01_R3_MINIMAL_FIELD_FIX_FAIL

## Prohibitions

- Do not run 026 one-flow verifier.
- Do not start PC Agent service.
- Do not send GPT prompts.
- Do not launch browser automation.
- Do not call external APIs.
- Do not transmit middleware data.
- Do not deploy production.
- Do not mark Ready or merge.
- Do not claim Commander authorization.

## Output

Post one append-only WORKER_REPORT under reports/slot_01_026_hotfix_r3_minimal_field_fix_<timestamp>/WORKER_REPORT_SLOT_01_R3.md.
