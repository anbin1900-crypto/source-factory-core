# 007 Final P0 src_import Promotion Package Execution

## Purpose

Promote the 006 final P0 promotion candidates into `src_import/` for Commander review.

This step does not write to final `src/`.

## Preconditions

- 001 Inventory Scan: PASS
- 002 Secret/Reusability Classification: PASS
- 003 P0 Staging Plan: PASS
- 004 Selected P0 Source Staging: PASS
- 005C Static Check V3: PASS
- 006 Final P0 Promotion Plan V2: PASS

Expected 006 result:

```text
Final promotion candidates: 137
Blocked / review required: 103
Removed generated cache files: 3
```

## Command

Run from repository root:

```powershell
git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\tools\source_factory_promote_final_p0_to_src_import.ps1 -StagingDir ".\_staging\p0_core_import_20260730_174852"
```

## Expected output

```text
SOURCE_FACTORY_P0_SRC_IMPORT_PROMOTION_PACKAGE_COMPLETE
OutputRoot=...
TotalCandidates=...
CopiedCount=...
SkippedCount=...
ManifestCsv=...
```

## Push result

```powershell
git add .\src_import

git commit -m "add P0 src import promotion package"

git push
```

## Policy

- Do not move files directly into final `src/`.
- Do not include blocked/review-required files.
- Keep original and copied SHA records.
- Commander review is required before final src promotion.
