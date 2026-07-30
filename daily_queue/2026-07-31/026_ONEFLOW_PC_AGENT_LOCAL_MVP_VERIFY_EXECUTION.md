# 026 One-flow PC Agent Local MVP Verify Execution

## Purpose

Validate the local PC Agent MVP dry-run chain:

1. Latest 025 local command runner PASS intake
2. Gas Station Portal queue example intake
3. Local exactly-once claim
4. Allowlisted local command execution
5. Terminal receipt save
6. Duplicate claim and duplicate terminal receipt rejection

## Forbidden Effects

- No GPT call
- No browser launch
- No PC Agent service start
- No external API call
- No middleware transmission
- No production deployment
- No remote queue mutation

## Execute

```powershell
$Root = "E:\YOLLA\source-factory-core"

Set-Location $Root

git pull

py -3 "$Root\tools\source_factory_oneflow_pc_agent_local_mvp_verify_and_push.py" --root $Root
```

Fallback:

```powershell
python "E:\YOLLA\source-factory-core\tools\source_factory_oneflow_pc_agent_local_mvp_verify_and_push.py" --root "E:\YOLLA\source-factory-core"
```

## Expected PASS

```text
SOURCE_FACTORY_ONEFLOW_PC_AGENT_LOCAL_MVP_VERIFY_AND_PUSH_COMPLETE
Status=PASS_PC_AGENT_LOCAL_MVP_VERIFY_AND_PUSH_DONE
```
