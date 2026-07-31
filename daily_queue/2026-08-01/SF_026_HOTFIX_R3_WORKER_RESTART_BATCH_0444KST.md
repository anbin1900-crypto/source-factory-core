# SF 026 HOTFIX R3 — Worker Restart Batch

ISSUED_AT_KST: 2026-08-01T04:44+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
BATCH_ID: SF_026_HOTFIX_R3_WORKER_RESTART_20260801_0444
AUTHORITY_BASIS: USER_RESTART_ORDER
OBSERVED_HEAD_BEFORE_BATCH: bbed4a23b0b7d03a429ef981203569177873e8d4
CURRENT_GATE: 026_HOLD
COMMANDER_AUTHORIZATION: NOT_GRANTED

## Current verified chain

- SLOT 01 R3 result: `09e1d0811731f013876f8170291b3042469f5f9f`
- SLOT 01 terminal: `SLOT_01_R3_MINIMAL_FIELD_FIX_PASS`
- SLOT 01 final source commit: `a465b16ebbbd50763dcbfd63e23d826e2010c8f4`
- SLOT 01 final source blob: `b223dc1a5c0a78221477dd0097126f3ba064bcb2`
- SLOT 02 R2 result: `404e46db7b046a16c32e04128efc7739c11ff280`
- SLOT 03 R2 result: `68a383d1dfe06cdae1217d494321aa23be960c1d`
- SLOT 04 R2 result: `8b9da4c08da9b252cc0227f638ec27c79c2920f5`
- SLOT 05 R3 start release: `bbed4a23b0b7d03a429ef981203569177873e8d4`

## Restart assignment

### SLOT 01

Status: COMPLETE / SUPPORT_STANDBY

- Do not modify source again.
- Preserve exact R3 result and final blob evidence.
- Respond only if SLOT 05 reports a contradiction involving the two invocation-count fields or Python `None` correction.

### SLOT 02

Status: COMPLETE / SUPPORT_STANDBY

- Preserve canonical command registry R2 PASS evidence.
- Do not rerun or modify source unless SLOT 05 identifies a concrete conflict after SLOT 01 R3.

### SLOT 03

Status: COMPLETE / SUPPORT_STANDBY

- Preserve terminal receipt validation R2 PASS evidence.
- Do not rerun or modify source unless SLOT 05 identifies a concrete conflict after SLOT 01 R3.

### SLOT 04

Status: COMPLETE / SUPPORT_STANDBY

- Preserve R2 exact negative verification evidence.
- Be prepared to perform a narrow R3 exact-blob follow-up only if SLOT 05 cannot reconcile the field-only SLOT 01 source drift.
- Do not run 026 one-flow verifier.

### SLOT 05

Status: ACTIVE / START_NOW

- Perform corrected combined intake using exact SLOT 01 R3 and SLOT 02~04 R2 result commits.
- Inspect latest main source, R3 field correction, cross-slot compatibility, drift, no-execution boundaries, and remaining risk.
- Publish exactly one permitted R3 terminal status.

### SLOT 06

Status: WAITING_DEPENDENCY

- Do not start gate closure review before SLOT 05 R3 terminal report exists.
- After SLOT 05 R3, perform gate review only and prepare Commander-facing decision evidence.
- Do not authorize or execute 026.

## Global prohibitions

- No 026 one-flow verifier execution.
- No PC Agent service start.
- No GPT prompt execution.
- No browser automation.
- No external API call.
- No middleware transmission.
- No production deployment.
- No Ready transition.
- No merge.
- No execution authority opening.

## Active sequence

1. SLOT 05 R3 corrected combined intake.
2. SLOT 06 R3 gate closure review.
3. Commander decision.
4. Only after explicit approval: one 026 local MVP dry-run.

NEXT_REQUIRED: SLOT_05_R3_CORRECTED_COMBINED_INTAKE_RESULT
