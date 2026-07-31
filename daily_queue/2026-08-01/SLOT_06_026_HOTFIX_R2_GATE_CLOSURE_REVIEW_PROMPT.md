# SLOT 06 — 026 HOTFIX R2 Gate Closure Review Prompt

TARGET_SLOT: SLOT_06
WORKER_ID: SOURCE_FACTORY_SLOT_06
BATCH_ID: SF_026_HOTFIX_R2_REDISPATCH_20260801_0224
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
WORKER_FUNCTION_CLASS: INSPECTOR_WORKER
MODE: REPORT_ONLY / READ_ONLY / NO_PRODUCTION_SOURCE_MODIFICATION / NO_026_EXECUTION / NO_SERVICE / NO_EXTERNAL_EFFECT

## Dependency gate

Do not start gate closure review until SLOT 05 publishes a R2 terminal report with exactly one of:

- `PASS_026_HOTFIX_R2_READY_FOR_GATE_REVIEW`
- `YELLOW_026_HOTFIX_R2_NEEDS_SMALL_CONFIRMATION`
- `RED_026_HOTFIX_R2_FIX_REQUIRED`

If no such SLOT 05 R2 terminal report is available, publish BLOCKED_WAITING_SLOT_05_R2 and stop.

## Task after SLOT 05 R2 is available

Read SLOT 05 R2 result commit and verify the whole R2 chain:

1. R2 batch ledger exists.
2. SLOT 01~04 result commits were intaked by SLOT 05.
3. SLOT 05 did not treat prompt commits as result commits.
4. SLOT 05 did not run 026 one-flow verifier.
5. SLOT 05 did not open execution authority.
6. Reported source/fixture evidence supports or blocks 026 gate review.
7. All no-service/no-external/no-production boundaries remain intact.
8. Remaining risks are classified as PASS, YELLOW, or RED.

## Prohibited

- Do not run 026 one-flow verifier.
- Do not start PC Agent service.
- Do not call GPT, launch browser, call external API, transmit middleware data, deploy production, merge, or mark ready.
- Do not modify production source.
- Do not claim Commander authorization or open user execution right.

## Output

Publish a new append-only WORKER_REPORT under `reports/slot_06_026_hotfix_r2_gate_closure_*`.

Your report must include:

- current HEAD observed
- SLOT 05 R2 result commit intaked, or BLOCK reason
- gate closure evidence summary
- explicit no-026-execution statement
- one terminal status from the allowed set below

Allowed terminal statuses:

`PASS_026_HOTFIX_R2_GATE_CLOSURE_REVIEW_READY_FOR_COMMANDER`

`YELLOW_026_HOTFIX_R2_GATE_CLOSURE_NEEDS_CONFIRMATION`

`RED_026_HOTFIX_R2_GATE_CLOSURE_BLOCKED`

`BLOCKED_WAITING_SLOT_05_R2`

Only the Commander may decide whether to open 026 execution after this report.
