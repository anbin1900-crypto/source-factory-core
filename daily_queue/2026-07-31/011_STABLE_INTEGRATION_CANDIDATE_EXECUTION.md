# 011 Stable Integration Candidate Execution

## Objective

Promote the verified runtime import files into isolated stable integration candidate folders without overwriting existing production `src/` modules.

## Inputs

- Runtime import dir: `src/runtime_import/p0_runtime_import_20260731_013239`
- OPS import dir: `ops_import/p0_ops_import_20260731_013239`
- Required prior status: `PASS_RUNTIME_IMPORT_STATIC_VERIFY_READY_FOR_011`

## Run Command

```powershell
git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\tools\source_factory_build_stable_integration_candidate_v1.ps1 `
  -RuntimeImportDir ".\src\runtime_import\p0_runtime_import_20260731_013239" `
  -OpsImportDir ".\ops_import\p0_ops_import_20260731_013239"
```

## Expected Completion

```text
SOURCE_FACTORY_STABLE_INTEGRATION_CANDIDATE_V1_COMPLETE
Status=PASS_STABLE_INTEGRATION_CANDIDATE_READY_FOR_012
RuntimeCandidates=9
OpsCandidates=2
ShaMismatch=0
```

## Commit / Push

```powershell
git add .\src\integration_candidates .\ops_integration_candidates .\reports

git commit -m "add stable integration candidates from runtime import"

git push
```

## Policy

- Do not overwrite existing stable source files.
- Do not merge into final production modules at 011.
- 012 must run syntax/static verification against `src/integration_candidates/`.
- Final module merge requires Commander approval after 012 PASS.
