# 004 Selected P0 Core Source Staging Execution

## 목적

003 P0 Staging Plan에서 선별된 240개 후보를 바로 `src/`에 승격하지 않고 `_staging/`으로만 복사한다.

이 단계는 다음을 수행한다.

```text
SF_CORE_P0_STAGING_PLAN.csv 읽기
→ BLOCK_REVIEW / DRIVE_POINTER 제외
→ 선별 P0 후보만 _staging/p0_core_import_*/source_files 로 복사
→ SHA readback
→ STAGED_SOURCE_MANIFEST 생성
→ WORKER_REPORT_004 생성
```

## 실행 위치

```powershell
E:\YOLLA\source-factory-core
```

## 실행 명령

```powershell
git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\tools\source_factory_stage_selected_core_sources.ps1 -InventoryRunDir ".\runs\local_source_inventory_20260730_172125"
```

## 성공 출력

```text
SOURCE_FACTORY_SELECTED_P0_CORE_SOURCE_STAGING_COMPLETE
OutputRoot=._staging\p0_core_import_...
SelectedRows=...
CopiedCount=...
SkippedCount=...
ManifestCsv=...
```

## 성공 후 업로드

파일 수와 크기가 과도하지 않으면 다음을 실행한다.

```powershell
git add .\_staging

git commit -m "stage selected P0 source factory core sources"

git push
```

## 주의

- 이 단계는 final promotion이 아니다.
- `_staging/`은 검토용이다.
- `BLOCK_REVIEW` 파일은 복사하면 안 된다.
- `DRIVE_POINTER_ONLY` 파일은 Google Drive 대상으로만 남긴다.
- 다음 005 단계에서 static check 및 승격 계획을 만든다.
