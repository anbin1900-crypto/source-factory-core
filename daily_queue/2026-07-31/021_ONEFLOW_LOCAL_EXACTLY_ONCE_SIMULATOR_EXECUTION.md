# 021 One-flow Local Exactly-Once Simulator Execution

## Purpose

Validate local exactly-once behavior before any remote queue mutation is enabled.

This stage consumes the latest 020 claim/receipt contract and simulates:

1. First claim attempt: ACCEPTED
2. Second claim attempt with same queue_id + assignment_id + worker_id: DUPLICATE_REJECTED
3. Terminal receipt skeleton required fields: present

## Prohibited Effects

This stage does not:

- reserve or mutate a remote queue item
- send GPT prompts
- launch browser automation
- start PC Agent service
- call external APIs
- transmit middleware data
- deploy production

## Local Command

```powershell
$Root = "E:\YOLLA\source-factory-core"

Set-Location $Root

git pull

& "$Root\tools\run_oneflow_local_exactly_once_simulator_and_push.ps1" -RepositoryRoot $Root
```

## Expected Output

```text
SOURCE_FACTORY_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_COMPLETE
Status=PASS_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_READY_FOR_022
Latest020Status=PASS_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_READY_FOR_021
ClaimRecordStatus=PASS_QUEUE_CLAIM_DRY_RUN_CONTRACT
SimulationStatus=PASS_LOCAL_EXACTLY_ONCE_SIMULATION
FirstClaimAttempt=ACCEPTED_FIRST_CLAIM
SecondClaimAttempt=REJECTED_DUPLICATE_CLAIM
TerminalRequiredFieldsPresent=True
MissingTerminalFields=0
MissingRequiredFiles=0

SOURCE_FACTORY_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_AND_PUSH_COMPLETE
Status=PASS_LOCAL_EXACTLY_ONCE_SIMULATOR_AND_PUSH_DONE
```

## Gate

022 may proceed only when the remote report status is:

```text
PASS_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_READY_FOR_022
```
