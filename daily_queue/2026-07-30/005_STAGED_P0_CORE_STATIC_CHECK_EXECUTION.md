# 005 Staged P0 Core Static Check Execution

## 목적

004에서 `_staging/p0_core_import_*`에 복사된 240개 P0 후보를 바로 `src/`로 승격하지 않고, 먼저 SHA·정적 검사를 수행한다.

## 실행 위치

```powershell
E:\YOLLA\source-factory-core
```

## 실행 명령

```powershell
git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\tools\source_factory_staged_core_static_check.ps1 -StagingDir ".\_staging\p0_core_import_20260730_174852"
```

## 성공 문구

```text
SOURCE_FACTORY_STAGED_CORE_STATIC_CHECK_COMPLETE
StagingDir=...
TotalResults=...
ResultsCsv=...
```

## 성공 후 업로드

```powershell
git add .\_staging\p0_core_import_20260730_174852

git commit -m "add staged P0 core static check result"

git push
```

## 산출물

```text
_staging/p0_core_import_*/reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS.md
_staging/p0_core_import_*/reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS.json
_staging/p0_core_import_*/reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS.csv
_staging/p0_core_import_*/WORKER_REPORT_005.md
```

## 정책

- 이 단계는 static check일 뿐이며 `src/` 승격이 아니다.
- `PROMOTION_CANDIDATE`는 최종 승인 상태가 아니다.
- `BLOCKED_STATIC_OR_SHA`는 승격 금지다.
- `SKIP_*` 항목은 수동 검토가 필요하다.
