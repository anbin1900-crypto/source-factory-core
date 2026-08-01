# SLOT 01 — SF_028 P0 Wave 3 Classification Report

GENERATED_AT_KST: 2026-08-01T21:23:30+09:00
WORKER_ID: SLOT_01_SF028_P0_WAVE3_CLASSIFICATION_WORKER
TASK_ID: SF_028_P0_WAVE_03_SLOT_01_CLASSIFICATION
WORKER_FUNCTION_CLASS: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
MODE: READ_ONLY_SOURCE_REVIEW / NO_EXECUTION / NO_PROMOTION

## Terminal

`SF_028_P0_WAVE03_SLOT01_CLASSIFICATION_PASS`

This terminal means the exact 12-candidate Wave 3 SLOT 01 classification package is complete. It does not promote a candidate or authorize runtime use.

## Authority

- Wave 2 close / Wave 3 open: `61a01df401e357b013cb4fc18d141dc370ac4c85`
- Wave 3 batch: `e162e6018a709bbae470604fef9b431673764e8a`
- SLOT 01 prompt: `007dbb410f890c99478579192221622af57f8c72`
- Drive file ID: `1AXlYdsAWNbYMl2K-vtqDX4vN-riiS_R2`
- Classification JSON commit: `bb12aee365dc52d1983d12c202d48b56de8d2701`

## Package verification

- File: `SF028_P0_EXTRACT_20260801_062137_WAVE_03_SLOT_01.zip`
- Size: `52,278 bytes` — PASS
- SHA-256: `d002b08aa2757d319e8d5ed49a53a28d7b34cd7253e4b8c0862d1d2a9564384f` — PASS
- Embedded manifest parse: PASS
- Manifest candidate count: `12`
- Unique assigned Source IDs: `12`
- Per-source SHA-256 and size verification: `12/12 PASS`
- JavaScript syntax-only parse: `12/12 PASS`
- Source runtime execution: `0`
- Dependency installation: `0`

## Classification summary

- DIRECT_REUSE: 2
- ADAPTER_REQUIRED: 2
- PROJECT_BOUND: 5
- SUPERSEDED: 3
- All other classifications: 0
- Promotion count: 0

## Material findings

1. `PCAGENT-AUTO-SRC-005287 / runNodeCheckWrapper.js`
   - `DIRECT_REUSE`
   - Generic structured `node --check` wrapper with timeout and batch support.
   - Requires V2 fixtures for path, timeout, missing binary, and partial failure.

2. `PCAGENT-AUTO-SRC-003904 / stage35SignalProtocol.js`
   - `DIRECT_REUSE`
   - Pure create/validate/acknowledge/current-state signal model with no I/O.
   - Remains V1 static only and is not promoted.

3. `PCAGENT-AUTO-SRC-000674 / promptPackageVersionManager.js`
   - `ADAPTER_REQUIRED`
   - Core model is reusable, but defaults still reference `v2.1.0-COMPACT` and a legacy target stage.

4. `PCAGENT-AUTO-SRC-003878 / gptPreload.js`
   - `ADAPTER_REQUIRED`
   - ContextBridge pattern is usable, but the broad legacy IPC channel set must be rebound to the exact current API/IPC/button contract.

5. Legacy UI-bound candidates
   - `PCAGENT-AUTO-SRC-000560`, `000568`, `000583`, `003739`, `003955`
   - Classified `PROJECT_BOUND` because they auto-bind legacy Stage 2/3/3.5 DOM, fixed worker identities, popup globals, or preload APIs.

6. Superseded lineage
   - `PCAGENT-AUTO-SRC-003279`: Stage 1 renderer superseded by later renderer/runtime generations.
   - `PCAGENT-AUTO-SRC-003322`: earlier Stage 2 button handler superseded by the later Stage3 dispatch-write-fix lineage.
   - `PCAGENT-AUTO-SRC-003891`: earlier Stage3.5 popup manager superseded by the later operator-ready `PCAGENT-AUTO-SRC-003955` version.

Detailed per-candidate functions, I/O, symbols, dependencies, external effects, coupling, lineage, evidence, risks, and next actions are recorded in `CLASSIFICATION_RESULTS_SLOT_01.json`.

## Boundaries

- Source execution: NOT_RUN
- Source modification: NONE
- Dependency installation: NOT_RUN
- Runtime/service/browser/external API start: NOT_RUN
- Official promotion/Ready/Merge: NOT_RUN
- OLD_ROOT deletion: NOT_RUN
- External effect count: 0

WORKER_REPORT_START
worker_id: SLOT_01_SF028_P0_WAVE3_CLASSIFICATION_WORKER
assignment_id: SF028-P0-W03-S01-20260801-2110KST
task_id: SF_028_P0_WAVE_03_SLOT_01_CLASSIFICATION
worker_function_class: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
source_count: 12
unique_source_id_count: 12
classification_counts:
  DIRECT_REUSE: 2
  ADAPTER_REQUIRED: 2
  PROJECT_BOUND: 5
  SUPERSEDED: 3
files_created:
  - reports/sf028_p0_wave03_slot01_20260801_2123/CLASSIFICATION_RESULTS_SLOT_01.json
  - reports/sf028_p0_wave03_slot01_20260801_2123/WORKER_REPORT_SLOT_01.md
files_modified: []
tests_run:
  - Drive ZIP metadata readback: PASS
  - ZIP SHA-256: PASS
  - manifest/source identity and hash check: PASS_12_OF_12
  - static source inspection: PASS_12_OF_12
  - node --check: PASS_12_OF_12
tests_not_run:
  - source runtime execution: NOT_RUN_BY_CONTRACT
  - dependency installation: NOT_RUN_BY_CONTRACT
  - V2 fixture/integration verification: NOT_RUN_BY_SCOPE
class_contract_status: COMPLIANT_READ_ONLY_STATIC_CLASSIFICATION
priority_0_status: COMPLIANT
known_risks:
  - DIRECT_REUSE remains V1 static only and is not promoted.
  - Legacy Stage 1/2/3 renderer components are project-bound or superseded.
  - gptPreload requires exact current IPC contract adaptation.
  - promptPackageVersionManager defaults are not current v2.1.2 authority.
next_needed: SLOT_06_WAVE_03_INTAKE_AFTER_ALL_FIVE_SLOT_RESULTS
terminal_status: SF_028_P0_WAVE03_SLOT01_CLASSIFICATION_PASS
WORKER_REPORT_END
