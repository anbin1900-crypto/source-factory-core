# 021B One-flow Local Exactly-Once Simulator V2 Execution

## Purpose

021B replaces 021 V1 after filename mismatch was found between the 020 claim/receipt contract outputs and the 021 V1 strict lookup path.

## Preconditions

- 020 result status must be `PASS_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_READY_FOR_021`.
- 020 output files may use either the current names or legacy V1 names:
  - `ONEFLOW_QUEUE_CLAIM_RECORD_DRY_RUN.json`
  - `ONEFLOW_QUEUE_CLAIM_RECORD_DRY_RUN_V1.json`
  - `ONEFLOW_TERMINAL_RECEIPT_SKELETON.json`
  - `ONEFLOW_TERMINAL_RECEIPT_SKELETON_V1.json`

## Local execution

```powershell
$Root = "E:\YOLLA\source-factory-core"
Set-Location $Root
git pull
& "$Root\tools\run_oneflow_local_exactly_once_simulator_v2_and_push.ps1" -RepositoryRoot $Root
```

## Expected output

```text
SOURCE_FACTORY_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_V2_COMPLETE
Status=PASS_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_READY_FOR_022
Latest020Status=PASS_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_READY_FOR_021
ClaimRecordStatus=PASS_QUEUE_CLAIM_DRY_RUN_CONTRACT
SimulationStatus=PASS_LOCAL_EXACTLY_ONCE_SIMULATION
FirstClaimAttempt=ACCEPTED_FIRST_CLAIM
SecondClaimAttempt=REJECTED_DUPLICATE_CLAIM
TerminalRequiredFieldsPresent=True
MissingTerminalFields=0
MissingRequiredFiles=0

SOURCE_FACTORY_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_V2_AND_PUSH_COMPLETE
Status=PASS_LOCAL_EXACTLY_ONCE_SIMULATOR_V2_AND_PUSH_DONE
```

## Scope

This stage is a local simulation only. It does not reserve or mutate a remote queue item. It does not send prompts, launch browsers, start PC Agent, call external APIs, transmit middleware data, or deploy production.
