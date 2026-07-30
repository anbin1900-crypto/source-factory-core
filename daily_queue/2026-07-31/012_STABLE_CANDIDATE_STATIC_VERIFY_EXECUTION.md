# 012 Stable Candidate Static Verify Execution

## Purpose

Verify the stable integration candidates created by 011 before any final module merge.

This stage does not overwrite existing stable runtime modules.

## Preconditions

- 011 status: PASS_STABLE_INTEGRATION_CANDIDATE_READY_FOR_012
- Stable candidate root exists:
  - `src/integration_candidates/p0_stable_candidate_20260731_015516`
- OPS candidate root exists:
  - `ops_integration_candidates/p0_ops_candidate_20260731_015516`

## Execute

Run from repository root:

```powershell
git pull

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\tools\source_factory_stable_candidate_static_verify_v1.ps1 `
  -StableCandidateDir ".\src\integration_candidates\p0_stable_candidate_20260731_015516" `
  -OpsCandidateDir ".\ops_integration_candidates\p0_ops_candidate_20260731_015516"
```

## Expected terminal status

```text
SOURCE_FACTORY_STABLE_CANDIDATE_STATIC_VERIFY_V1_COMPLETE
Status=PASS_STABLE_CANDIDATE_STATIC_VERIFY_READY_FOR_013
RuntimeFiles=9
RuntimePass=9
RuntimeFail=0
```

## Commit

```powershell
git add .\reports

git commit -m "add stable candidate static verify result"

git push
```

## Gate

013 final module merge is not allowed unless 012 RuntimeFail is 0.
