# 018B One-flow Runtime Pipeline Verify Execution

## Purpose

Replace the fragmented PowerShell + Node dry-run chain with one Python verifier.

This stage verifies:

- Stable runtime source presence
- package.json module mode
- runtime pipeline contract JSON
- Gas Station Portal queue example JSON
- JavaScript syntax by `node --check`
- Python syntax by `py_compile`
- dry-run receipt generation in Python

## Safety

This stage does not run:

- GPT
- browser automation
- PC Agent service
- external API
- middleware transmission
- production deployment

## Command

Run from Windows PowerShell:

```powershell
$Root = "E:\YOLLA\source-factory-core"
Set-Location $Root

git pull

python "$Root\tools\source_factory_oneflow_runtime_pipeline_verify.py" --root $Root
```

## Expected PASS

```text
SOURCE_FACTORY_ONEFLOW_RUNTIME_PIPELINE_VERIFY_COMPLETE
Status=PASS_ONEFLOW_RUNTIME_PIPELINE_VERIFY_READY_FOR_019
Missing=0
PackageType=module
ContractStatus=PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017
QueueProjectCode=GAS_STATION_PORTAL
QueueMode=PROMPT_QUEUE_EXAMPLE_ONLY
StaticCheckFailures=0
DryRunReceiptStatus=PASS_RUNTIME_PIPELINE_DRY_RUN_READY_FOR_019
```

## Push

```powershell
git add .\reports

git commit -m "add Python oneflow runtime pipeline verify result"

git push
```

## Gate

019 may proceed only when:

```text
PASS_ONEFLOW_RUNTIME_PIPELINE_VERIFY_READY_FOR_019
```
