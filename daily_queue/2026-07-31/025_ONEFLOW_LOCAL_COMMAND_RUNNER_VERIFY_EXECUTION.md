# 025 One-flow Local Command Runner Verify Execution

## Objective

Validate the local allowlisted command runner that captures stdout, stderr, exit_code, and forbidden-effect counters for the future PC Agent MVP execution loop.

## Preconditions

- 024B status must be `PASS_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_READY_FOR_025`.
- This stage must not send prompts, launch browsers, start PC Agent service, call external APIs, transmit middleware data, mutate remote queue state, or deploy production.

## Command

```powershell
$Root = "E:\YOLLA\source-factory-core"

Set-Location $Root

git pull

py -3 "$Root\tools\source_factory_oneflow_local_command_runner_verify_and_push.py" --root $Root
```

Fallback if `py -3` is unavailable:

```powershell
python "E:\YOLLA\source-factory-core\tools\source_factory_oneflow_local_command_runner_verify_and_push.py" --root "E:\YOLLA\source-factory-core"
```

## Expected terminal output

```text
SOURCE_FACTORY_ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY_AND_PUSH_COMPLETE
Status=PASS_LOCAL_COMMAND_RUNNER_VERIFY_AND_PUSH_DONE
```

## Expected gate status

```text
PASS_ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY_READY_FOR_026
```
