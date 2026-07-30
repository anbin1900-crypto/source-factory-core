# 010 Runtime Import Static Verify Execution

## Objective

Verify the 009 runtime import output before any stable src integration.

This step checks only the isolated runtime import folder and ops import references.

## Inputs

- Runtime import folder:
  - `src/runtime_import/p0_runtime_import_20260731_013239`
- OPS import folder:
  - `ops_import/p0_ops_import_20260731_013239`

## Command

Run from `E:\YOLLA\source-factory-core`.

```powershell
git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\tools\source_factory_runtime_import_static_verify_v1.ps1 `
  -RuntimeImportDir ".\src\runtime_import\p0_runtime_import_20260731_013239" `
  -OpsImportDir ".\ops_import\p0_ops_import_20260731_013239"
```

## Expected PASS

```text
SOURCE_FACTORY_RUNTIME_IMPORT_STATIC_VERIFY_COMPLETE
Status=PASS_RUNTIME_IMPORT_STATIC_VERIFY_READY_FOR_011
RuntimeFiles=9
RuntimePass=9
RuntimeFail=0
OpsReferenceFiles=2
```

## Commit after PASS

```powershell
git add .\reports

git commit -m "add runtime import static verify result"

git push
```

## Policy

- Do not promote files into stable `src/` in this step.
- Do not claim runtime integration readiness unless `RuntimeFail=0`.
- OPS files are reference only until a later integration step.
- If Node or Python is missing, stop and report the blocker.
