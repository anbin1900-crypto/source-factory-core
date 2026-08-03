# A-0 V5.2 Target PC Acceptance Package

This package implements the non-destructive execution contract for `A0-P0-V52-TARGET-PC-ACCEPTANCE`.

It reuses the existing `LOCAL_DURABLE_FILE_QUEUE_V1` and does not create a new PC Agent runtime or transport.

## Files

- `A0_V52_TARGET_PC_ACCEPTANCE_CONTRACT_V1.json`: acceptance, preservation and evidence contract.
- `Invoke-A0V52TargetPcAcceptance.ps1`: Target PC preflight, state backup, launcher observation and receipt writer.
- `A0_V52_OPERATOR_OBSERVATION_TEMPLATE_V1.json`: fail-closed UI/session evidence template.
- `A0_V52_TARGET_PC_WORK_REQUEST_TEMPLATE_V1.json`: existing PC Agent queue request template.
- `validate_a0_v52_target_pc_acceptance.py`: package validator.
- `test_a0_v52_target_pc_acceptance.py`: static safety and contract tests.

## PASS boundary

The PowerShell runner cannot declare `V52_TARGET_PC_SESSION_AND_DUAL_BROWSER_PASS` from filesystem checks alone. Every UI/session check must be true and at least one Target PC evidence path must be supplied through the operator/runtime observation JSON.

Without the observation evidence, an otherwise successful run terminates as:

`V52_TARGET_PC_AUTOMATED_PREFLIGHT_PASS_WAITING_UI_EVIDENCE`

The stable V5 launcher, fixed browser profile, workspace state and cycle ledger are preserved. Production, Ready and Merge remain false.
