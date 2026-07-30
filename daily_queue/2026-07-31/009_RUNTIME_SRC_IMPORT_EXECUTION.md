# 009 Runtime src Import Execution

## Purpose

Promote only the reviewed runtime source candidates from `src_candidate/` into isolated runtime import paths.

This does not merge files into existing production modules. It creates a safe import layer for 010 normalization.

## Input

Use the latest 008 review directory:

```text
src_candidate/p0_runtime_review_20260731_012842
```

Expected 008 result:

```text
Manifest rows: 65
Copied to review folders: 65
Missing source files: 0
SHA mismatch: 0
SRC_READY_REVIEW: 9
OPS_READY_REVIEW: 2
DOCS_PROMPT_REFERENCE_ONLY: 36
EVIDENCE_REFERENCE_ONLY: 18
MANUAL_REVIEW_REQUIRED: 0
```

## Local execution

Run from repository root:

```powershell
git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\tools\source_factory_promote_runtime_candidates_to_src.ps1 -ReviewDir ".\src_candidate\p0_runtime_review_20260731_012842"
```

## Expected terminal output

```text
SOURCE_FACTORY_RUNTIME_SRC_IMPORT_COMPLETE
Status=PASS_RUNTIME_SRC_IMPORT_READY_FOR_010
RuntimeCandidates=9
RuntimeCopied=9
OpsCandidates=2
OpsCopied=2
Collisions=0
RuntimeShaMismatch=0
OpsShaMismatch=0
```

## Commit and push

```powershell
git add .\src\runtime_import .\ops_import .\reports

git commit -m "add runtime src import from reviewed P0 candidates"

git push
```

## Policy

- Only `runtime_candidate` files enter `src/runtime_import/`.
- `ops_candidate` files enter `ops_import/`, not runtime `src/`.
- Prompt/docs/evidence are intentionally excluded from runtime source.
- 010 will normalize modules, exports, package scripts, and tests.
