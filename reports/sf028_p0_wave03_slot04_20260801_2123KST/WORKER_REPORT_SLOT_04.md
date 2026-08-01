# SLOT 04 — SF_028 P0 Wave 3 Classification Report

GENERATED_AT_KST: 2026-08-01T21:23:00+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
OBSERVED_HEAD_BEFORE_PUBLISH: `61a01df401e357b013cb4fc18d141dc370ac4c85`
TASK_ID: `SF_028_P0_WAVE_03_SLOT_04_CLASSIFICATION`
WORKER_ID: `SLOT_04_SF028_P0_WAVE3_CLASSIFICATION_WORKER`

## Authority and package

Wave 2 was closed and Wave 3 opened by `61a01df401e357b013cb4fc18d141dc370ac4c85`. The Wave 3 batch `e162e6018a709bbae470604fef9b431673764e8a` and SLOT 04 prompt `79940d4732f507b7e7d323ff04b0a17d92d783ef` authorize immediate read-only classification.

- Drive file ID: `1jDogRPIBu-rWIKnQodnPUiRR23bR_77D`
- ZIP: `SF028_P0_EXTRACT_20260801_062137_WAVE_03_SLOT_04.zip`
- expected/observed size: `38147 / 38147`
- expected/observed SHA-256: `c319a2aed3b4420b97f95275e1dca201b2e438b0462f8ed364e4c38aa7d2cd9b`
- embedded manifest item count: `12`
- unique Source IDs: `12`
- missing/unexpected Source IDs: `0 / 0`
- packaged SHA-256 mismatches: `0`
- packaged Git blob SHA-1 mismatches: `0`
- JavaScript static syntax parse: `11/12 PASS`
- syntax failure: `PCAGENT-AUTO-SRC-005275`
- source execution/modification/dependency installation/external effect: `0 / 0 / 0 / 0`

## Classification summary

- `ADAPTER_REQUIRED`: 4
- `DIRECT_REUSE`: 1
- `PROJECT_BOUND`: 2
- `REJECTED`: 1
- `SUPERSEDED`: 4

Total: `12`

The one `DIRECT_REUSE` entry remains `V1_STATIC_ONLY / NOT_PROMOTED / V2_FIXTURE_REQUIRED`.

## Candidate decisions

| Source ID | File | Classification | Verification |
|---|---|---|---|
| `PCAGENT-AUTO-SRC-000565` | `stage2ResultView.js` | `PROJECT_BOUND` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000577` | `statusCodes.js` | `DIRECT_REUSE` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000668` | `stage4PromptAutomationDashboard.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-005275` | `stage4AutoMaterializeAndValidate.js` | `REJECTED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000824` | `gptPreload.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-003290` | `buttonHandlers.js` | `SUPERSEDED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-003593` | `stage3PanelAttach.js` | `SUPERSEDED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-003874` | `main.js` | `SUPERSEDED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-003888` | `stage35MenuCommands.js` | `SUPERSEDED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-003895` | `stage35SignalSlot.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-003952` | `stage35MenuCommands.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-004089` | `stage4HardWindowControl.js` | `PROJECT_BOUND` | `V1_STATIC` |

## Material findings

1. `PCAGENT-AUTO-SRC-005275 / stage4AutoMaterializeAndValidate.js`
   - The packaged file is only 327 bytes.
   - It ends inside the `CONTENT_END` string literal.
   - `node --check` fails at line 13.
   - Decision: `REJECTED`; complete authoritative source recovery is required.

2. `PCAGENT-AUTO-SRC-004089 / stage4HardWindowControl.js`
   - The leading block registers Electron app listeners and a 1.5-second interval at require time.
   - `install()` then monkeypatches `electron.BrowserWindow` and creates another permanent interval.
   - Errors are broadly swallowed and worker identity is inferred from creation order.
   - Decision: `PROJECT_BOUND`; importing it as a reusable library is unsafe.

3. `PCAGENT-AUTO-SRC-003290 / buttonHandlers.js`
   - This 996-line renderer mixes worker controls, clipboard, dynamic DOM creation, and legacy Commander-only Stage 2 actions.
   - The current Active Core has a different, narrower `src/gpt_browser_bridge/buttonHandlers.js` implementation.
   - Decision: `SUPERSEDED`; no-copy over the current canonical file.

4. Stage 3.5 menu variants
   - `PCAGENT-AUTO-SRC-003888` is the earlier routing-hotfix registry with aliases and explicit unknown routing.
   - `PCAGENT-AUTO-SRC-003952` is the later operator-ready variant but removes alias normalization and explicit unknown routing.
   - Both retain fixed Worker 01–05 and legacy Stage 2 DB actions.
   - Decisions: earlier variant `SUPERSEDED`; later variant `ADAPTER_REQUIRED`.

5. `PCAGENT-AUTO-SRC-000577 / statusCodes.js`
   - Pure immutable state vocabulary with no I/O or runtime effects.
   - Decision: `DIRECT_REUSE` at V1 only; deterministic-clock and lifecycle fixtures remain required.

## Boundaries

- source execution: NOT_RUN
- source modification: NONE
- dependency installation: NOT_RUN
- runtime/service/browser/external API: NOT_RUN
- promotion/Ready/Merge: NOT_RUN
- OLD_ROOT deletion: NOT_RUN
- external effect count: 0

WORKER_REPORT_START
worker_id: SLOT_04_SF028_P0_WAVE3_CLASSIFICATION_WORKER
task_id: SF_028_P0_WAVE_03_SLOT_04_CLASSIFICATION
worker_function_class: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
batch_id: SF_028_P0_WAVE03_SLOT01_TO_SLOT05_IMMEDIATE_EXECUTION_BATCH_V1_20260801_2110KST
wave_02_gate_open_commit: 61a01df401e357b013cb4fc18d141dc370ac4c85
slot_prompt_commit: 79940d4732f507b7e7d323ff04b0a17d92d783ef
source_identity_authority: embedded SLOT_MANIFEST.json
drive_file_id: 1jDogRPIBu-rWIKnQodnPUiRR23bR_77D
zip_sha256_status: PASS
expected_source_count: 12
classified_source_count: 12
unique_source_id_count: 12
classification_summary:
  DIRECT_REUSE: 1
  ADAPTER_REQUIRED: 4
  PROJECT_BOUND: 2
  SUPERSEDED: 4
  REJECTED: 1
files_created:
  - reports/sf028_p0_wave03_slot04_20260801_2123KST/CLASSIFICATION_RESULTS_SLOT_04.json
  - reports/sf028_p0_wave03_slot04_20260801_2123KST/WORKER_REPORT_SLOT_04.md
files_modified: []
tests_run:
  - Drive ZIP metadata/size readback: PASS
  - ZIP SHA-256 verification: PASS
  - embedded manifest and exact Source ID set: PASS
  - packaged source SHA-256 and Git blob SHA-1: PASS_12_OF_12
  - node static syntax check: PASS_11_OF_12 / FAIL_1_TRUNCATED_SOURCE
  - static symbols/dependencies/effects/lineage review: PASS
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
  - one truncated syntax-invalid candidate is rejected
  - Electron hard-window control has require-time global side effects
  - legacy Stage 2/3/3.5 UI and main-process sources remain nonpromotable
  - four candidates require current compact contract adapters
  - direct-reuse candidate still requires V2 fixtures
next_needed: SLOT_06_WAVE03_INTAKE_AND_TARGETED_COMPLETE_SOURCE_RECOVERY_FOR_PCAGENT_AUTO_SRC_005275
terminal_status: SF_028_P0_WAVE03_SLOT04_CLASSIFICATION_PASS
WORKER_REPORT_END
