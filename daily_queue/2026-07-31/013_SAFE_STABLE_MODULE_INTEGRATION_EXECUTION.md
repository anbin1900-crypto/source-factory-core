# 013 Safe Stable Module Integration Execution

## 목적

012에서 PASS한 `src/integration_candidates/`의 런타임 후보를 안정 `src/` 경로로 안전 적용한다.

## 핵심 정책

- 기존 안정 `src/` 파일은 절대 덮어쓰지 않는다.
- 대상 파일이 없으면 복사한다.
- 대상 파일이 이미 있고 SHA가 같으면 no-op 처리한다.
- 대상 파일이 이미 있고 SHA가 다르면 conflict report만 남기고 overwrite하지 않는다.
- OPS 후보는 런타임 src로 복사하지 않고 reference로만 기록한다.

## 실행 위치

```powershell
Set-Location "E:\YOLLA\source-factory-core"
```

## 실행 명령

```powershell
git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\tools\source_factory_apply_safe_stable_module_integration_v1.ps1 `
  -StableCandidateDir ".\src\integration_candidates\p0_stable_candidate_20260731_015516" `
  -OpsCandidateDir ".\ops_integration_candidates\p0_ops_candidate_20260731_015516"
```

## PASS 기대값

```text
SOURCE_FACTORY_STABLE_MODULE_INTEGRATION_V1_COMPLETE
Status=PASS_STABLE_MODULE_INTEGRATION_READY_FOR_014
RuntimeCandidates=9
ShaMismatch=0
Conflicts=0
Unmapped=0
```

## 성공 후 commit/push

```powershell
git add .\src .\reports

git commit -m "apply safe stable module integration from P0 candidates"

git push
```

## YELLOW 처리

다음 중 하나라도 발생하면 push 전에 멈추고 보고한다.

```text
Conflicts > 0
Unmapped > 0
ShaMismatch > 0
```
