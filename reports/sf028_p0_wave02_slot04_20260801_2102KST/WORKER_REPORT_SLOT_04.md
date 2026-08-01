# SLOT 04 — SF_028 P0 Wave 2 Classification Report

GENERATED_AT_KST: 2026-08-01T21:02:31+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
OBSERVED_HEAD_BEFORE_PUBLISH: `ed07471ebc99d9e1e0332018648902aea4a8ccce`
TASK_ID: `SF_028_P0_WAVE_02_SLOT_04_CLASSIFICATION`
WORKER_ID: `SLOT_04_SF028_P0_WAVE2_CLASSIFICATION_WORKER`

## Authority and package

Wave 1 was closed and Wave 2 opened by `7381089ec627267f9155bc7e5c39784734651097`. The immediate Wave 2 batch `d2b6d94cd94c64e906816e70681a0393f2d7d218` and SLOT 04 prompt `d7dc14317f61fe95fe4fed24a2f3a05b01dbb827` superseded the previous HOLD prompt.

- Drive file ID: `1VxhpLD2sYP8JeSpQQegYtblpH2M-lPHM`
- ZIP: `SF028_P0_EXTRACT_20260801_062137_WAVE_02_SLOT_04.zip`
- expected/observed size: `48984 / 48984`
- expected/observed SHA-256: `d1c189d1374a5de0dc0e3fddc3f2556744ea02f6c7f9da62aa62d313a493999e`
- embedded manifest item count: `12`
- unique Source IDs: `12`
- missing/unexpected Source IDs: `0 / 0`
- packaged file SHA-256 mismatches: `0`
- packaged Git blob SHA-1 mismatches: `0`
- JavaScript static syntax parse: `12/12 PASS`
- undefined export-surface findings: `0`
- source execution/modification/dependency installation/external effect: `0 / 0 / 0 / 0`

## Classification summary

- `DIRECT_REUSE`: 3
- `ADAPTER_REQUIRED`: 6
- `PROJECT_BOUND`: 1
- `SUPERSEDED`: 2
- total: 12

All `DIRECT_REUSE` entries remain `V1_STATIC_ONLY / NOT_PROMOTED / V2_FIXTURE_REQUIRED`.

## Candidate decisions

| Source ID | File | Classification | Verification |
|---|---|---|---|
| `PCAGENT-AUTO-SRC-000835` | `main.js` | `SUPERSEDED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-003306` | `assembleController.js` | `PROJECT_BOUND` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-004048` | `stage4DownloadResourceModel.js` | `DIRECT_REUSE` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-004053` | `stage4LaoRecordBatchModel.js` | `DIRECT_REUSE` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-004058` | `stage4ProjectPanelStateModel.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-004077` | `stage4BatchRunReportModel.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-004215` | `patchRequestConflictSorter.js` | `DIRECT_REUSE` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-004223` | `greenOutputAssemblyQueue.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-004229` | `redFixRequestGenerator.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-004234` | `panelRecordExecutionStore.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-005280` | `executionResultCollector.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000555` | `stage2IpcHandlers.js` | `SUPERSEDED` | `V1_STATIC` |

## Material findings

1. `PCAGENT-AUTO-SRC-000835 / main.js`
   - Source identity is a rollback/rollback evidence path.
   - Electron lifecycle and Stage 3 IPC registration occur at module load.
   - It uses the legacy `D:\SOURCE FACTORY\browsers\<worker>\raw_outputs` layout.
   - `sf:collect-full-output` remains a placeholder.
   - Decision: `SUPERSEDED`, historical shell reference only.

2. `PCAGENT-AUTO-SRC-003306 / assembleController.js`
   - The file contains an original guarded assembler and an appended runtime-fix implementation.
   - The appended implementation replaces `module.exports.assembleGenerated`.
   - Its path resolvers omit the original inside-root and forbidden-root guards.
   - It invokes a Python assembler and relies on the legacy generated/assembled layout.
   - Decision: `PROJECT_BOUND`.

3. `PCAGENT-AUTO-SRC-004058 / stage4ProjectPanelStateModel.js`
   - It embeds `lao_batches` and `taera_batches` directly in Project Panel state.
   - Current Source Factory ownership treats Lao as an adjunct to Worker/Commander windows rather than a Project Panel-owned component.
   - `validateProjectPanelState` records a non-object error but continues direct property access.
   - Decision: `ADAPTER_REQUIRED`.

4. `PCAGENT-AUTO-SRC-005280 / executionResultCollector.js`
   - `summarizeExecutionResults` reports PASS whenever blocking count is zero.
   - An empty list or a list containing only `NOT_RUN`/`SKIP` can therefore report PASS without verified execution.
   - IDs use a non-cryptographic hash and normalized records retain unbounded raw input.
   - Decision: `ADAPTER_REQUIRED`.

## Direct-reuse fixture queue candidates

- `PCAGENT-AUTO-SRC-004048`: pure download-resource/approval model; test invalid URL/type, executable approval, and deterministic identity.
- `PCAGENT-AUTO-SRC-004053`: pure Lao record-batch model; test identity, unsaved guard, duplicate source units, and injected save evidence.
- `PCAGENT-AUTO-SRC-004215`: pure patch conflict sorter; test exact anchors, missing/unsafe targets, dependencies, and stable ordering.

No candidate was promoted, copied into Active Core, marked Ready, merged, or executed.

WORKER_REPORT_START
worker_id: SLOT_04_SF028_P0_WAVE2_CLASSIFICATION_WORKER
task_id: SF_028_P0_WAVE_02_SLOT_04_CLASSIFICATION
worker_function_class: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
batch_id: SF_028_P0_WAVE02_SLOT01_TO_SLOT05_IMMEDIATE_EXECUTION_BATCH_V2_20260801_2055KST
wave_01_gate_open_commit: 7381089ec627267f9155bc7e5c39784734651097
slot_prompt_commit: d7dc14317f61fe95fe4fed24a2f3a05b01dbb827
source_identity_authority: embedded SLOT_MANIFEST.json
drive_file_id: 1VxhpLD2sYP8JeSpQQegYtblpH2M-lPHM
zip_sha256_status: PASS
expected_source_count: 12
classified_source_count: 12
unique_source_id_count: 12
classification_summary:
  DIRECT_REUSE: 3
  ADAPTER_REQUIRED: 6
  PROJECT_BOUND: 1
  SUPERSEDED: 2
files_created:
  - reports/sf028_p0_wave02_slot04_20260801_2102KST/CLASSIFICATION_RESULTS_SLOT_04.json
  - reports/sf028_p0_wave02_slot04_20260801_2102KST/WORKER_REPORT_SLOT_04.md
files_modified: []
tests_run:
  - Drive ZIP metadata/size readback: PASS
  - ZIP SHA-256 verification: PASS
  - embedded manifest and exact Source ID set: PASS
  - packaged source SHA-256 and Git blob SHA-1: PASS_12_OF_12
  - node static syntax check: PASS_12_OF_12
  - static symbols/dependencies/effects/path/status review: PASS
tests_not_run:
  - source runtime execution: NOT_RUN_BY_CONTRACT
  - dependency installation: NOT_RUN_BY_CONTRACT
  - V2 fixtures/integration: NOT_RUN_V1_SCOPE
source_execution_count: 0
source_modification_count: 0
dependency_installation_count: 0
external_effect_count: 0
promotion_count: 0
class_contract_status: COMPLIANT_READ_ONLY_V1_STATIC
priority_0_status: COMPLIANT_NO_SOURCE_MODIFICATION
known_risks:
  - rollback Electron shell and legacy Stage 2 IPC remain nonpromotable
  - assembler runtime fix bypasses original path guards
  - six candidates require compact contract/storage/status adapters
  - direct-reuse candidates still require V2 fixtures
next_needed: SLOT_06_WAVE02_INTAKE_AND_V2_FIXTURE_QUEUE_UPDATE
terminal_status: SF_028_P0_WAVE02_SLOT04_CLASSIFICATION_PASS
WORKER_REPORT_END