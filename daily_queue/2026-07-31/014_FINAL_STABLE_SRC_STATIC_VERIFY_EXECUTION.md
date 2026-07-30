# 014 Final Stable SRC Static Verify Execution

## Purpose

Verify the final stable runtime source files after 013 safe stable module integration.

This stage does not modify runtime source files. It writes verification reports only.

## Preconditions

- 013 safe stable module integration completed.
- `src/queue`, `src/gpt_browser_bridge`, and `src/pc_agent_routing` contain the 9 stable runtime files.
- `node` is available for JavaScript syntax checks.
- `python` or `py` is available for Python compile checks.

## Execute on NOTEX

Run from PowerShell:

```powershell
$Root = "E:\YOLLA\source-factory-core"

Set-Location $Root

git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

& "$Root\tools\source_factory_final_stable_src_static_verify_v1.ps1" -RepositoryRoot $Root
```

## Expected PASS output

```text
SOURCE_FACTORY_FINAL_STABLE_SRC_STATIC_VERIFY_V1_COMPLETE
Status=PASS_FINAL_STABLE_SRC_STATIC_VERIFY_READY_FOR_015
StableRuntimeFiles=9
Pass=9
Fail=0
Missing=0
```

## Push result

```powershell
git add .\reports

git commit -m "add final stable src static verify result"

git push
```

## Gate

015 closure may proceed only when:

```text
FAIL=0
Missing=0
Status=PASS_FINAL_STABLE_SRC_STATIC_VERIFY_READY_FOR_015
```
