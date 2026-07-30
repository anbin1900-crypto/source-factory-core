# 024 One-flow Local Worker Lifecycle Verify Execution

## Purpose

Validate the local Source Factory worker lifecycle after the terminal receipt store is ready.

This stage binds:

1. Gas Station Portal queue example intake
2. local exactly-once claim store
3. local terminal receipt store
4. local worker lifecycle dry-run module
5. duplicate claim and duplicate terminal receipt rejection

## Forbidden Effects

This stage must not:

- mutate a remote queue item
- send prompts
- launch a browser
- start a PC Agent service
- call external APIs
- transmit middleware data
- deploy production

## Command

```powershell
$Root = "E:\YOLLA\source-factory-core"

Set-Location $Root

git pull

py -3 "$Root\tools\source_factory_oneflow_local_worker_lifecycle_verify_and_push.py" --root $Root
```

If `py -3` is unavailable:

```powershell
python "E:\YOLLA\source-factory-core\tools\source_factory_oneflow_local_worker_lifecycle_verify_and_push.py" --root "E:\YOLLA\source-factory-core"
```

## Expected Terminal Status

```text
SOURCE_FACTORY_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_AND_PUSH_COMPLETE
Status=PASS_LOCAL_WORKER_LIFECYCLE_VERIFY_AND_PUSH_DONE
```

## PASS Gate

025 may proceed only when the report status is:

```text
PASS_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_READY_FOR_025
```
