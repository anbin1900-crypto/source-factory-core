# SF_028 P0 Wave 02 — SLOT 05 Static Classification

REPORTED_AT_KST: 2026-08-01T20:57+09:00
OBSERVED_MAIN_HEAD_BEFORE_REPORT: `ed07471ebc99d9e1e0332018648902aea4a8ccce`
PROMPT_COMMIT: `6ccee6934e4c707e943adb4e09b8ed3fe3fc8b46`
WAVE_01_GATE_COMMIT: `7381089ec627267f9155bc7e5c39784734651097`

## Result

`SF_028_P0_WAVE02_SLOT05_CLASSIFICATION_PASS`

- Drive ZIP ID/size/SHA-256: PASS (`1RX4pVcWw9jBE0POZOkTNHI0xzqelM_yH`, 52715 bytes, `5e498a8ab4e1213b1094fb02574b15fcae990cfd01a87ca30b475b9a6479314f`)
- Embedded manifest: expected 12 / packaged 12 / unique Source IDs 12 / extras 0 / missing 0
- Per-source raw SHA-256: 12/12 MATCH; unique source SHA-256 count 12
- Review mode: source text static inspection only; execution/import/dependency installation not performed
- Promotion status: 0 promoted; all candidates remain `V1_STATIC`

## Decisions

| Source ID | File | Classification | Finding / next action |
|---|---|---|---|
| `PCAGENT-AUTO-SRC-000836` | `gptPreload.js` | `PROJECT_BOUND` | Electron preload exposing a broad `sfApi` IPC surface. Keep in Electron profile; allowlist/version channels and run mocked IPC V2 fixtures. |
| `PCAGENT-AUTO-SRC-003309` | `createFilesController.js` | `ADAPTER_REQUIRED` | Scans raw outputs and runs a Python extractor with legacy root/layout assumptions. Bind canonical RUN_SCRIPT, exact script hash, preview/apply and temp-directory V2. |
| `PCAGENT-AUTO-SRC-004049` | `stage4FileBatchModel.js` | `DIRECT_REUSE` | Pure FILE_BATCH model/serializer that marks execution-like items for approval instead of running them. Run V2 dedupe/approval/serialization/clock fixtures. |
| `PCAGENT-AUTO-SRC-004054` | `stage4LaoSaveClearGuard.js` | `DIRECT_REUSE` | Pure Lao save/clear guard protecting saved records and gating unsaved-buffer discard. Run V2 saved/unsaved/delete/discard matrix. |
| `PCAGENT-AUTO-SRC-004060` | `stage4SourceUnitModel.js` | `DIRECT_REUSE` | Pure SOURCE_UNIT model, validation transition and ID-reuse checker. Run V2 ID/path/transition/malformed fixtures. |
| `PCAGENT-AUTO-SRC-004078` | `stage4DuplicatePathConflictDetector.js` | `DIRECT_REUSE` | Pure direct/patch/report path-conflict detector. Run cross-platform path/case/core/multi-owner V2 fixtures. |
| `PCAGENT-AUTO-SRC-004218` | `SlimProjectPanelControlView.js` | `PROJECT_BOUND` | DOM renderer with fixed Project Panel stations and renderer binding. Rebind current panel identity/state and run DOM/accessibility V2. |
| `PCAGENT-AUTO-SRC-004224` | `panelCommandParser.js` | `DIRECT_REUSE` | Parse-only `@@@` command/route detector; executable commands are marked, not run. Run valid/malformed/quoted/ambiguous V2 corpus. |
| `PCAGENT-AUTO-SRC-004230` | `runtimePartialAssemblyClassifier.js` | `DIRECT_REUSE` | Pure heuristic runtime/partial classifier with configurable context. Run labeled Active Core corpus and threshold V2. |
| `PCAGENT-AUTO-SRC-004235` | `taeoRawOutputStore.js` | `ADAPTER_REQUIRED` | JSONL writer with local path effects and embedded W54 identity wrapper. Split model/storage and add canonical path, locking, redaction and identity V2. |
| `PCAGENT-AUTO-SRC-005281` | `workerFileOwnershipChecker.js` | `ADAPTER_REQUIRED` | Pure checker but fixed core basenames and legacy worker identity omit current slot/assignment epoch. Bind v2.1.2 identity and authoritative `owned_paths`; run glob/traversal V2. |
| `PCAGENT-AUTO-SRC-000557` | `windowManager.js` | `PROJECT_BOUND` | Electron BrowserWindow/shared-session manager with legacy root and registry. Keep in desktop profile; compare Safe Panel, harden web preferences and mock Electron V2. |

## Summary

- `DIRECT_REUSE`: 6 — pure models, guards, parsers, conflict detector and runtime classifier; all require V2 fixtures before promotion.
- `ADAPTER_REQUIRED`: 3 — process/file adapters and current worker-identity binding are required.
- `PROJECT_BOUND`: 3 — Electron preload/window manager and Project Panel DOM view remain profile-specific.
- Assigned-package Source ID duplicates: 0; source SHA duplicates: 0; official promotion: 0.

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
worker_id: SLOT_05_SF028_P0_WAVE2_CLASSIFICATION_WORKER
assignment_id: NOT_SPECIFIED_IN_PROMPT
task_id: SF_028_P0_WAVE_02_SLOT_05_CLASSIFICATION
worker_function_class: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
observed_main_head_before_report: ed07471ebc99d9e1e0332018648902aea4a8ccce
authority_commits: prompt=6ccee6934e4c707e943adb4e09b8ed3fe3fc8b46; wave1_gate=7381089ec627267f9155bc7e5c39784734651097; batch=d2b6d94cd94c64e906816e70681a0393f2d7d218
files_created: reports/sf028_p0_wave02_slot05_20260801_2057KST/CLASSIFICATION_RESULTS_SLOT_05.json; reports/sf028_p0_wave02_slot05_20260801_2057KST/WORKER_REPORT_SLOT_05.md
files_modified: []
classification_counts: DIRECT_REUSE=6; ADAPTER_REQUIRED=3; PROJECT_BOUND=3; OTHER=0; TOTAL=12
tests_run: Drive metadata/size/SHA; embedded manifest parse/identity; source SHA 12/12; static source review 12/12
tests_not_run: source execution/import; dependency install; V2/V3 tests; Electron/browser/runtime
source_execution_count: 0
source_modification_count: 0
dependency_installation_count: 0
runtime_service_start_count: 0
external_effect_count: 0
promotion_count: 0
class_contract_status: PASS_READ_ONLY_V1_STATIC_CLASSIFICATION
priority_0_status: COMPLIANT
known_risks: legacy Electron/IPC/root coupling; process/file adapters; W54 wrapper lineage; current slot_uid/assignment_id ownership binding pending; V2 fixtures pending
next_needed: SLOT_06_WAVE2_INTAKE_OR_COMMANDER_NEXT_WAVE_DECISION
terminal_status: SF_028_P0_WAVE02_SLOT05_CLASSIFICATION_PASS
WORKER_REPORT_END
