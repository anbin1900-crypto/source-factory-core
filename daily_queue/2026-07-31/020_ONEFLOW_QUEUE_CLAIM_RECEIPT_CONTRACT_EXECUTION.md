# 020 One-flow Queue Claim Receipt Contract Execution

## Purpose

Validate the Source Factory exactly-once queue claim and terminal receipt contract before any live GPT, browser, PC Agent, external API, middleware transmission, or production deployment is enabled.

## Mode

DRY_RUN_ONLY / CONTRACT_VERIFY_ONLY / NO_REMOTE_QUEUE_CLAIM / NO_PROMPT_SEND / NO_BROWSER_LAUNCH / NO_PC_AGENT_SERVICE_START / NO_EXTERNAL_API / NO_MIDDLEWARE_TRANSMISSION / NO_PRODUCTION_DEPLOY

## Command

```powershell
$Root = "E:\YOLLA\source-factory-core"

Set-Location $Root

git pull

& "$Root\tools\run_oneflow_queue_claim_receipt_contract_and_push.ps1" -RepositoryRoot $Root
```

## Expected Output

```text
SOURCE_FACTORY_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_COMPLETE
Status=PASS_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_READY_FOR_021
Latest019Status=PASS_ONEFLOW_QUEUE_DISPATCH_DRY_RUN_READY_FOR_020
DispatchReceiptStatus=PASS_QUEUE_DISPATCH_DRY_RUN_RECEIPT
AssignmentStatus=PASS_ASSIGNMENT_CONSUMED
ClaimRecordStatus=PASS_QUEUE_CLAIM_DRY_RUN_CONTRACT
TerminalRequiredFieldsPresent=True
MissingExpectedReceiptFields=0
MissingRequiredFiles=0

SOURCE_FACTORY_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_AND_PUSH_COMPLETE
Status=PASS_LOCAL_QUEUE_CLAIM_RECEIPT_CONTRACT_AND_PUSH_DONE
```

## Generated Report Files

```text
reports/oneflow_queue_claim_receipt_contract_<timestamp>/ONEFLOW_QUEUE_CLAIM_RECORD_DRY_RUN.json
reports/oneflow_queue_claim_receipt_contract_<timestamp>/ONEFLOW_TERMINAL_RECEIPT_SKELETON.json
reports/oneflow_queue_claim_receipt_contract_<timestamp>/ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_DECISION.json
reports/oneflow_queue_claim_receipt_contract_<timestamp>/ONEFLOW_QUEUE_CLAIM_RECEIPT_FILE_LEDGER.csv
reports/oneflow_queue_claim_receipt_contract_<timestamp>/ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_SUMMARY.md
reports/oneflow_queue_claim_receipt_contract_<timestamp>/WORKER_REPORT_020.md
```

## Gate

021 may proceed only when the summary status is:

```text
PASS_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_READY_FOR_021
```
