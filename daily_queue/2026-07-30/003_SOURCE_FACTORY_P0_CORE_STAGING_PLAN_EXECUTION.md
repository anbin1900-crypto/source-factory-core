# 003 Source Factory P0 Core Staging Plan Execution

## Purpose

This task consumes the 002 secret/reuse classification result and creates a safe P0 staging plan for reusable Source Factory core files.

## Current authoritative input

```text
runs/local_source_inventory_20260730_172125/reports/SF_CORE_REUSE_UPLOAD_PLAN.csv
runs/local_source_inventory_20260730_172125/reports/SF_CORE_SECRET_SCAN.md
```

## Required command

Run from repository root:

```powershell
git pull
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\tools\source_factory_core_staging_plan.ps1 -InventoryRunDir ".\runs\local_source_inventory_20260730_172125"
```

## Expected output

```text
SOURCE_FACTORY_CORE_P0_STAGING_PLAN_COMPLETE
InventoryRunDir=...
P0Candidates=...
SelectedStageCount=...
BlockedReviewCount=...
StagingCsv=...
```

## Commit after success

```powershell
git add .\runs\local_source_inventory_20260730_172125

git commit -m "add source factory P0 staging plan"

git push
```

## Policy

- This task creates a plan only.
- It does not copy source files.
- It does not upload source files.
- BLOCK_REVIEW files are not eligible.
- DRIVE_POINTER_ONLY files are excluded from source staging.
- Source copy/upload is a separate 004 task after Commander review.
