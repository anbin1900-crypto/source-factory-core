# SF_028 P0 Wave 03 — SLOT 05 Static Classification

REPORTED_AT_KST: 2026-08-01T21:27:56+09:00
OBSERVED_MAIN_HEAD_BEFORE_REPORT: `61a01df401e357b013cb4fc18d141dc370ac4c85`
PROMPT_COMMIT: `b0d3730000691ffef946b6fb4c633137a73568a9`
BATCH_COMMIT: `e162e6018a709bbae470604fef9b431673764e8a`
WAVE_02_GATE_COMMIT: `61a01df401e357b013cb4fc18d141dc370ac4c85`

## Result

`SF_028_P0_WAVE03_SLOT05_CLASSIFICATION_PASS`

- Drive ZIP ID/size/SHA-256: PASS (`1Tr-es3GljWHZAEdsIODxmF4dTZw9Ecx-`, 38445 bytes, `7e8f402a425deaf8a09bd9024d8803c53e16d88bf5956b843e338392503bff8e`)
- Embedded manifest: expected 12 / packaged 12 / unique Source IDs 12 / extras 0 / missing 0
- Per-source raw SHA-256: 12/12 MATCH; unique source SHA-256 count 12
- Review mode: actual source text static inspection only
- Promotion status: 0 promoted; all decisions remain `V1_STATIC`

## Decisions

| Source ID | File | Classification | Finding |
|---|---|---|---|
| `PCAGENT-AUTO-SRC-000567` | `stage3CommanderPanel.js` | `PROJECT_BOUND` | Commander Stage3 DOM panel; fixed workers, D-root baselines and `dryRun:false` sfApi dispatch. |
| `PCAGENT-AUTO-SRC-000578` | `windowRegistry.js` | `ADAPTER_REQUIRED` | Pure registry but fixed seven windows, S1 task IDs and shared GPT partition require v2.1.2 identity binding. |
| `PCAGENT-AUTO-SRC-000669` | `stage4PromptQueueViewModel.js` | `DIRECT_REUSE` | Pure queue/run normalization, progress, warning and action view model; V2 fixtures still required. |
| `PCAGENT-AUTO-SRC-005286` | `runCmdWrapper.js` | `SANITIZE_REQUIRED` | Caller-controlled process spawn uses Windows `shell:true`; no allowlist, effect binding or output cap. |
| `PCAGENT-AUTO-SRC-003277` | `buttonHandlers.js` | `PROJECT_BOUND` | Renderer DOM buttons call sfApi START/STOP/SAVE/RELOAD and clipboard fallback. |
| `PCAGENT-AUTO-SRC-003319` | `main.js` | `PROJECT_BOUND` | Legacy Electron Stage2 bootstrap, fixed D root, seven identities and FULL OUTPUT file writes. |
| `PCAGENT-AUTO-SRC-003692` | `stage3WorkerReturnPanel.js` | `PROJECT_BOUND` | Worker Return DOM panel sends raw output/source/report through legacy sfApi with `dryRun:false`. |
| `PCAGENT-AUTO-SRC-003876` | `stage35ApplicationMenu.js` | `PROJECT_BOUND` | Electron menu routes commands to focused/visible BrowserWindow renderer. |
| `PCAGENT-AUTO-SRC-003889` | `stage35PopupEventAdapter.js` | `SUPERSEDED` | Earlier routing-fix adapter conflicts with the later operator-ready variant using the same global module/events. |
| `PCAGENT-AUTO-SRC-003903` | `stage35SignalLabels.js` | `DIRECT_REUSE` | Pure signal label, display, legend and accessibility helper; exact protocol dependency must accompany it. |
| `PCAGENT-AUTO-SRC-003953` | `stage35PopupEventAdapter.js` | `PROJECT_BOUND` | Later operator-ready popup event bridge; renderer global auto-boot remains profile-specific. |
| `PCAGENT-AUTO-SRC-004090` | `stage4PanelIpcHandlers.js` | `ADAPTER_REQUIRED` | Mixed parser/IPC/materializer reads and writes under fixed Stage4/D-root layout; split and bind manifest roots. |

## Summary

- `DIRECT_REUSE`: 2
- `ADAPTER_REQUIRED`: 2
- `PROJECT_BOUND`: 6
- `SANITIZE_REQUIRED`: 1
- `SUPERSEDED`: 1
- Other classifications: 0
- Total: 12
- Assigned-package Source ID duplicates: 0
- Assigned-package source SHA duplicates: 0
- Official promotion: 0

## Material findings

1. `runCmdWrapper.js` is not promotable in current form. It accepts arbitrary command, args and cwd, and uses Windows `shell:true`. It requires `shell:false`, an immutable allowlist/effect contract, output caps and process-tree termination before V2 fixtures.
2. The two `stage35PopupEventAdapter.js` files install the same global identity and bridge the same event pair with different aliases and boot behavior. The earlier routing-fix variant is `SUPERSEDED`; the operator-ready variant remains `PROJECT_BOUND`.
3. Stage3 panels, renderer button handlers and legacy Electron main are not Active Core direct-copy candidates because they carry fixed identities, D-root paths, DOM/Electron bindings or live downstream operations.

## Boundary compliance

- source execution/import: NOT_RUN
- source modification: NONE
- dependency installation: NOT_RUN
- runtime/service/Electron/browser start: NOT_RUN
- external API/middleware: NOT_RUN
- promotion/Ready/Merge: NOT_RUN
- OLD_ROOT deletion: NOT_RUN
- external effect count: 0

WORKER_REPORT_START
worker_id: SLOT_05_SF028_P0_WAVE3_CLASSIFICATION_WORKER
assignment_id: PACKAGE_ITEM_ASSIGNMENTS_PRESERVED_IN_JSON
task_id: SF_028_P0_WAVE_03_SLOT_05_CLASSIFICATION
worker_function_class: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
observed_main_head_before_report: 61a01df401e357b013cb4fc18d141dc370ac4c85
authority_commits: prompt=b0d3730000691ffef946b6fb4c633137a73568a9; batch=e162e6018a709bbae470604fef9b431673764e8a; wave2_gate=61a01df401e357b013cb4fc18d141dc370ac4c85
files_created:
  - reports/sf028_p0_wave03_slot05_20260801_2127KST/CLASSIFICATION_RESULTS_SLOT_05.json
  - reports/sf028_p0_wave03_slot05_20260801_2127KST/WORKER_REPORT_SLOT_05.md
files_modified: []
classification_counts: DIRECT_REUSE=2; ADAPTER_REQUIRED=2; PROJECT_BOUND=6; SANITIZE_REQUIRED=1; SUPERSEDED=1; OTHER=0; TOTAL=12
tests_run: Drive metadata/size/SHA; manifest parse/identity; source SHA 12/12; static source review 12/12; popup lineage comparison
tests_not_run: source execution/import; dependency installation; V2/V3 tests; Electron/browser/runtime
source_execution_count: 0
source_modification_count: 0
dependency_installation_count: 0
runtime_service_start_count: 0
external_effect_count: 0
promotion_count: 0
class_contract_status: PASS_READ_ONLY_V1_STATIC_CLASSIFICATION
priority_0_status: COMPLIANT
known_risks: arbitrary Windows shell wrapper; legacy D-root/worker identity; Electron/DOM profile coupling; conflicting popup adapter lineage; V2 fixtures pending
next_needed: SLOT_06_WAVE3_INTAKE_OR_COMMANDER_NEXT_WAVE_DECISION
terminal_status: SF_028_P0_WAVE03_SLOT05_CLASSIFICATION_PASS
WORKER_REPORT_END