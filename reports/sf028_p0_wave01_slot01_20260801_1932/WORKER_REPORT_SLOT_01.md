# SLOT 01 — SF_028 P0 Wave 1 Classification Report

GENERATED_AT_KST: 2026-08-01T19:32:00+09:00
WORKER_ID: SLOT_01_SF028_P0_WAVE1_CLASSIFICATION_WORKER
ASSIGNMENT_ID: SF028-P0-W01-S01-20260801-1920KST
TASK_ID: SF_028_P0_WAVE_01_SLOT_01_CLASSIFICATION
WORKER_FUNCTION_CLASS: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
MODE: READ_ONLY_SOURCE_REVIEW / NO_EXECUTION / NO_PROMOTION

## Terminal

`SF_028_P0_WAVE01_SLOT01_CLASSIFICATION_PASS`

This terminal means the requested 12-candidate classification package is complete. It does not mean every candidate is reusable or promoted.

## Authority and package verification

- Commander order: `75d816984ef29bdc7fc9c2bd9e29899c485b9642`
- SLOT 01 start prompt: `f36a4123d0cf57cd798d0b987163e947cd0b7f53`
- Wave 1 dispatch: `fcf596b10b4e002767e885c522435a32781d3998`
- Staging V2 authority: `49d348af6d8adb0f7ca6d7b529752ee73ab099c2`
- Drive file ID: `1yu9gjvWad6XbgF4Z5PZcuPMmaChjzLKz`
- ZIP name: `SF028_P0_EXTRACT_20260801_062137_WAVE_01_SLOT_01.zip` — PASS
- ZIP size: `43715` — PASS
- ZIP SHA-256: `7ae5119ce6cd9d3c2dfef352d82964b0ef767dabec76c9cefa17705ae974e766` — PASS
- Embedded manifest count: `12` — PASS
- Unique assigned Source IDs: `12` — PASS
- Per-source SHA-256/size verification: `12/12 PASS`

## Classification summary

- DIRECT_REUSE: 1
- ADAPTER_REQUIRED: 8
- SUPERSEDED: 2
- SANITIZE_REQUIRED: 1
- Other classifications: 0

## Material finding

`PCAGENT-AUTO-SRC-004213 / stage4SourceFileBlockParser.js` is not loadable as packaged. Static syntax inspection found invalid regular expressions at the omitted-content pattern and error-code normalization pattern. It is classified `SANITIZE_REQUIRED`; no source modification was performed.

The two `SUPERSEDED` candidates are legacy/copy relationships, not deletion authorization:

- `constitutionLoader.js` targets legacy v1 constitution files and is superseded by the current v2.1.2 compact constitution load contract.
- `stage1SelfCheck.js` is an assembled-path copy while the current repository has a canonical `src/gpt_browser_bridge/stage1SelfCheck.js` flow.

## Verification performed

- Drive raw ZIP acquisition: PASS
- ZIP name/size/SHA-256 verification: PASS
- Manifest JSON parse and 12-ID identity verification: PASS
- Raw source SHA-256 and byte-size verification: 12/12 PASS
- Static source review: 12/12 complete
- `node --check` syntax-only parse: 11 PASS, 1 FAIL
- Source execution: 0
- Dependency installation: 0

Detailed per-candidate functions, inputs/outputs, dependencies, effects, coupling, evidence, risk, classification and next action are in `CLASSIFICATION_RESULTS_SLOT_01.json`.

## Boundaries

- Source execution: NOT_RUN
- Source modification: NONE
- Runtime/service start: NOT_RUN
- External API/browser/middleware: NOT_RUN
- Promotion/Ready/Merge: NOT_RUN
- OLD_ROOT deletion: NOT_RUN
- External effect count: 0

WORKER_REPORT_START
worker_id: SLOT_01_SF028_P0_WAVE1_CLASSIFICATION_WORKER
assignment_id: SF028-P0-W01-S01-20260801-1920KST
task_id: SF_028_P0_WAVE_01_SLOT_01_CLASSIFICATION
worker_function_class: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
source_count: 12
unique_source_id_count: 12
classification_counts:
  DIRECT_REUSE: 1
  ADAPTER_REQUIRED: 8
  SUPERSEDED: 2
  SANITIZE_REQUIRED: 1
files_created:
  - reports/sf028_p0_wave01_slot01_20260801_1932/CLASSIFICATION_RESULTS_SLOT_01.json
  - reports/sf028_p0_wave01_slot01_20260801_1932/WORKER_REPORT_SLOT_01.md
files_modified: []
tests_run:
  - Drive ZIP metadata readback: PASS
  - ZIP SHA-256: PASS
  - manifest/source identity and hash check: PASS_12_OF_12
  - static source inspection: PASS_12_OF_12
  - node --check: PASS_11_FAIL_1_KNOWN_SANITIZE_REQUIRED
tests_not_run:
  - source runtime execution: NOT_RUN_BY_CONTRACT
  - dependency installation: NOT_RUN_BY_CONTRACT
  - V2 fixture and integration verification: NOT_RUN_BY_SCOPE
class_contract_status: COMPLIANT_READ_ONLY_STATIC_CLASSIFICATION
priority_0_status: COMPLIANT
known_risks:
  - stage4SourceFileBlockParser.js has two invalid regex literals and cannot load until sanitized.
  - adapter-required models must not be mistaken for complete persistence or transport implementations.
  - manifest duplicate_copy_count is evidence of external copies, not proof of an exact canonical duplicate inside this slot.
next_needed: SLOT_06_WAVE_01_INTAKE_AFTER_ALL_FIVE_SLOT_RESULTS
terminal_status: SF_028_P0_WAVE01_SLOT01_CLASSIFICATION_PASS
WORKER_REPORT_END
