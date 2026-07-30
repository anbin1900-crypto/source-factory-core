# 017 Runtime Pipeline Smoke Verify Execution

## 목적

016에서 생성된 Runtime Pipeline Contract를 실제 실행 전 dry-run 방식으로 검증한다.

이 단계는 다음을 실행하지 않는다.

- GPT 자동 실행
- Browser 자동화
- PC Agent service 실행
- 외부 API 호출
- production deploy

## 검증 대상

- `src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json`
- `src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js`
- `examples/gas_station_portal_pipeline/GAS_STATION_PORTAL_QUEUE_EXAMPLE.json`
- 9개 stable runtime source

## 실행 명령

```powershell
$Root = "E:\YOLLA\source-factory-core"

Set-Location $Root

git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

& "$Root\tools\source_factory_runtime_pipeline_smoke_verify_v1.ps1" -RepositoryRoot $Root
```

## 성공 기준

```text
SOURCE_FACTORY_RUNTIME_PIPELINE_SMOKE_VERIFY_V1_COMPLETE
Status=PASS_RUNTIME_PIPELINE_SMOKE_VERIFY_READY_FOR_018
Missing=0
JsonParseStatus=PASS_JSON_PARSE
RegistryRequireStatus=PASS_REQUIRE
RegistryListStatus=PASS_LIST_RUNTIME_SOURCE_PATHS
RegistryPathResolveStatus=PASS_RESOLVE_RUNTIME_PATH
```

## 성공 후 push

```powershell
git add .\reports

git commit -m "add runtime pipeline smoke verify result"

git push
```

## 다음 단계

018은 smoke verify PASS 이후에만 진행한다.
