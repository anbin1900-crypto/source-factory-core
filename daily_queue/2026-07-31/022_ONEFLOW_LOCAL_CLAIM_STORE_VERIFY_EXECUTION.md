# 022 One-flow Local Claim Store Verify Execution

## Objective

Create and verify a stable local exactly-once claim store module after 021B local exactly-once simulator PASS.

## Execution

Run one Python file only. No PowerShell wrapper is required.

```powershell
$Root = "E:\YOLLA\source-factory-core"
Set-Location $Root
git pull
python "$Root\tools\source_factory_oneflow_local_claim_store_verify_and_push.py" --root $Root
```

If `python` is unavailable but the Windows launcher exists:

```powershell
py -3 "E:\YOLLA\source-factory-core\tools\source_factory_oneflow_local_claim_store_verify_and_push.py" --root "E:\YOLLA\source-factory-core"
```

## Expected PASS

```text
SOURCE_FACTORY_ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_COMPLETE
Status=PASS_ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_READY_FOR_023
Latest021BStatus=PASS_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_READY_FOR_022
CompileStatus=PASS_PY_COMPILE
ImportStatus=PASS_IMPORT_LOCAL_CLAIM_STORE
FirstClaimAttempt=ACCEPTED_FIRST_CLAIM
SecondClaimAttempt=REJECTED_DUPLICATE_CLAIM
DuplicatePolicyStatus=PASS_DUPLICATE_REJECTED
MissingRequiredFiles=0
SOURCE_FACTORY_ONEFLOW_LOCAL_CLAIM_STORE_VERIFY_AND_PUSH_COMPLETE
Status=PASS_LOCAL_CLAIM_STORE_VERIFY_AND_PUSH_DONE
```

## Scope

This stage validates a stable local claim store only. It does not reserve or mutate a remote queue item. It does not send prompts, launch browsers, start PC Agent, call external APIs, transmit middleware data, or deploy production.
