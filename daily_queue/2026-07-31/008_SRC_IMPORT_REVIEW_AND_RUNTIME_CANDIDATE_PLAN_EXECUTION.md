# 008 SRC_IMPORT Review and Runtime Candidate Plan Execution

## Purpose

007B copied the deduplicated P0 source candidates into `src_import/`. 008 reviews that import and separates the files into review buckets before any final `src/` runtime promotion.

## Input

Latest successful 007B folder:

```text
src_import/p0_core_import_v2_20260731_012550
```

Expected summary from 007B:

```text
Total candidate rows: 137
Unique candidate keys: 65
Copied to src_import: 65
Skipped: 0
SHA mismatch: 0
```

## Execution

Run from repository root:

```powershell
git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\tools\source_factory_src_import_review_and_candidate_plan.ps1 -SrcImportDir ".\src_import\p0_core_import_v2_20260731_012550"
```

## Expected output

```text
SOURCE_FACTORY_SRC_IMPORT_REVIEW_PLAN_COMPLETE
CopiedToReview=65
Missing=0
ShaMismatch=0
```

The script will create a new folder under:

```text
src_candidate/p0_runtime_review_<timestamp>/
```

Buckets:

```text
runtime_candidate/          # JS/PY runtime source candidates for 009
ops_candidate/              # BAT/YML/PS1 operational candidates
metadata_reference/          # currently not used by this script
manual_review/               # ambiguous items
claims/evidence_reference/   # evidence-like files if present
```

Actual generated buckets are controlled by the script decisions:

```text
SRC_READY_REVIEW
OPS_READY_REVIEW
DOCS_PROMPT_REFERENCE_ONLY
EVIDENCE_REFERENCE_ONLY
MANUAL_REVIEW_REQUIRED
```

## Commit

After successful execution:

```powershell
git add .\src_candidate

git commit -m "add src import review and runtime candidate plan"

git push
```

## Gate

008 does not promote files into final runtime `src/` paths. 009 may promote only `SRC_READY_REVIEW` items, after Commander review.
