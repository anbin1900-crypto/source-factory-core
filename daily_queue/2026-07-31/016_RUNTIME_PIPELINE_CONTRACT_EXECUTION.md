# 016 Runtime Pipeline Contract Execution

## Directive

Build the Source Factory Runtime Pipeline Contract from the 015 stable core closure.

## Preconditions

- 015 status: `PASS_STABLE_CORE_P0_CLOSURE`
- Final stable runtime source files exist in `src/`
- No production overwrite is allowed
- No external API, browser automation, GPT automation, PC Agent execution, or deployment is allowed in this step

## Command

Run from `E:\YOLLA\source-factory-core`:

```powershell
$Root = "E:\YOLLA\source-factory-core"

Set-Location $Root

git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

& "$Root\tools\source_factory_build_runtime_pipeline_contract_v1.ps1" -RepositoryRoot $Root
```

## Expected PASS Output

```text
SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1_COMPLETE
Status=PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017
StableRuntimeSources=9
MissingStableRuntimeSources=0
GeneratedContractFiles=4
JsonParseStatus=PASS_JSON_PARSE
```

`RegistryNodeCheckStatus` may be `PASS_NODE_CHECK` if Node is available. If Node is unavailable, `SKIP_NODE_NOT_FOUND` is accepted at this stage because this stage is a contract builder, not runtime execution.

## Generated Files

- `src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json`
- `src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js`
- `examples/gas_station_portal_pipeline/GAS_STATION_PORTAL_QUEUE_EXAMPLE.json`
- `examples/gas_station_portal_pipeline/README.md`
- `reports/runtime_pipeline_contract_<timestamp>/...`

## Commit

```powershell
git add .\src\runtime_pipeline .\examples\gas_station_portal_pipeline .\reports

git commit -m "add runtime pipeline contract from stable core"

git push
```

## Pass Criteria

- Missing stable runtime source files = 0
- JSON parse status = `PASS_JSON_PARSE`
- No production overwrite
- No external side effects
- Contract status = `PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017`
