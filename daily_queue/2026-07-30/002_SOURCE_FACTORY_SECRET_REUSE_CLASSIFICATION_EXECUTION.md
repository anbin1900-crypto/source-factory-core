# 002 Source Factory Secret and Reuse Classification Execution

## Purpose

Consume the successful local inventory run and produce a safer upload plan before any source files are copied into reusable core folders.

This step is required because the inventory found thousands of GitHub candidates and the repository is currently public. No source bulk upload should happen until secret/name-risk review is complete.

## Input

Latest inventory run by default:

```text
runs/local_source_inventory_*/reports/SF_CORE_SOURCE_INVENTORY_CANDIDATES.csv
```

Known current run:

```text
runs/local_source_inventory_20260730_172125
```

## Command

Run from the repository root:

```powershell
git pull
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\tools\source_factory_secret_reuse_classifier.ps1 -InventoryRunDir ".\runs\local_source_inventory_20260730_172125"
```

## Outputs

```text
runs/local_source_inventory_20260730_172125/reports/SF_CORE_SECRET_SCAN.md
runs/local_source_inventory_20260730_172125/reports/SF_CORE_SECRET_SCAN.json
runs/local_source_inventory_20260730_172125/reports/SF_CORE_REUSE_UPLOAD_PLAN.csv
runs/local_source_inventory_20260730_172125/reports/SF_CORE_REUSE_UPLOAD_PLAN.json
runs/local_source_inventory_20260730_172125/WORKER_REPORT_002.md
```

## Upload after execution

```powershell
git add .\runs\local_source_inventory_20260730_172125

git commit -m "add source factory secret reuse classification result"

git push
```

## Stop rules

Do not upload raw source files yet.

If the report contains BLOCK_REVIEW_SECRET_INDICATOR or BLOCK_REVIEW_NAME_RISK, those files require manual review.

Drive-only artifacts must be moved to Google Drive later and represented in GitHub by pointer metadata only.

## Next

After this step is committed, Commander reviews the reuse upload plan and starts 003 core source staging.
