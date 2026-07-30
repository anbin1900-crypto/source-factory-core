# 001 Source Factory Local Source Inventory Execution

## Purpose

Run a read-only local inventory scan for Source Factory and YOLLA reusable source migration.

This task supports:

- Source Factory reusable core migration
- PC Agent 4 Commander x 6 Worker routing model
- gas station professional portal parallel development
- GitHub source ledger and Google Drive large artifact pointer policy

## Required local roots

Default scan roots:

```text
D:\SOURCE FACTORY
E:\YOLLA
```

## Command

Open PowerShell in the cloned `source-factory-core` repository root and run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\tools\source_factory_local_inventory_scan.ps1
```

Optional explicit roots:

```powershell
.\tools\source_factory_local_inventory_scan.ps1 -Roots "D:\SOURCE FACTORY", "E:\YOLLA"
```

## Outputs

The script writes outputs under:

```text
runs/local_source_inventory_YYYYMMDD_HHMMSS/
```

Required output files:

```text
reports/SF_CORE_SOURCE_INVENTORY_SCAN.md
reports/SF_CORE_SOURCE_INVENTORY_SCAN.json
reports/SF_CORE_SOURCE_INVENTORY_CANDIDATES.csv
reports/SF_CORE_LARGE_ARTIFACT_POINTER_CANDIDATES.json
WORKER_REPORT.md
```

## Upload policy

Small reusable source files:

```text
GitHub source-factory-core
```

Large artifacts / DB / ZIP / evidence bundles:

```text
Google Drive
```

GitHub should record only:

```text
artifact_id
file_name
sha256
size_bytes
drive_path_or_url
storage_status
```

## Commander result expectation

After execution, submit:

```text
WORKER_REPORT.md
SF_CORE_SOURCE_INVENTORY_SCAN.md
SF_CORE_SOURCE_INVENTORY_CANDIDATES.csv
SF_CORE_LARGE_ARTIFACT_POINTER_CANDIDATES.json
```

Do not claim source migration complete until Commander reviews the inventory.
