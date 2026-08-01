# SLOT 04 — SF_028 P0 Wave 1 Classification Report

GENERATED_AT_KST: 2026-08-01T19:49:00+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
OBSERVED_HEAD_BEFORE_PUBLISH: `cbb69df6758ea1ff6f469095bc97fe9cd5e413c4`
ASSIGNMENT_ID: `SF028-P0-W01-S04-20260801-1920KST`

## Result

The exact Drive Slot ZIP was fetched and its embedded `SLOT_MANIFEST.json` was used as source identity authority.

- Drive file ID: `1CzILtMNBcx0o3K5G7dQ62s5Vm8ck3GZj`
- ZIP size: `47392`
- ZIP SHA-256: `a16b2ae1e1f8c4c91b424b278793e7b34bb2417dd5c9cecc2d96633fb907f99c`
- packaged items: `12`
- unique Source IDs: `12`
- missing/unexpected Source IDs: `0 / 0`
- packaged-file hash mismatches: `0`
- JavaScript static syntax parses: `12/12 PASS`
- source executions: `0`
- source modifications: `0`
- external effects: `0`

## Classification summary

- `ADAPTER_REQUIRED`: 6
- `DIRECT_REUSE`: 2
- `PROJECT_BOUND`: 3
- `REJECTED`: 1

## Candidate decisions

| Source ID | File | Primary classification | Verification |
|---|---|---|---|
| `PCAGENT-AUTO-SRC-004211` | `stage4SourceFileBlockParser.js` | `DIRECT_REUSE` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000525` | `assembleController.js` | `PROJECT_BOUND` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000530` | `fileNameSafe.js` | `REJECTED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000537` | `reportStore.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000547` | `stage3ReturnController.js` | `PROJECT_BOUND` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000587` | `stage3DispatchController.js` | `PROJECT_BOUND` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000638` | `stage4DispatchValidationGuard.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000646` | `stage4PromptRunStateModel.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000651` | `stage4TaeoOutputReplayModel.js` | `DIRECT_REUSE` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000656` | `stage4WorkerBatchRunModel.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000661` | `stage4WorkerPromptDeliveryPacket.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000688` | `fileBatchDispatcher.js` | `ADAPTER_REQUIRED` | `V1_STATIC` |

## Principal finding

`PCAGENT-AUTO-SRC-000530` (`fileNameSafe.js`) is rejected at V1_STATIC. The file passes syntax parsing but its `module.exports` references seven identifiers that are not defined:

- `collapseUnderscores`
- `avoidReservedName`
- `limitLength`
- `makeSafeFileName`
- `makeTimestampForFileName`
- `makeSafeTimestampedFileName`
- `isSafeFileName`

The current repository `src/gpt_browser_bridge/fileNameSafe.js` also exposes the same incomplete symbol surface, so it is not evidence of a complete replacement.

## Boundaries

- source execution: NOT_RUN
- dependency installation: NOT_RUN
- source modification: NONE
- runtime/service start: NOT_RUN
- external API/browser/middleware: NOT_RUN
- promotion/Ready/Merge: NOT_RUN
- OLD_ROOT deletion: NOT_RUN
- external effect: 0

WORKER_REPORT_START
worker_id: SLOT_04_SF028_P0_WAVE1_CLASSIFICATION_WORKER
assignment_id: SF028-P0-W01-S04-20260801-1920KST
task_id: SF_028_P0_WAVE_01_SLOT_04_CLASSIFICATION
worker_function_class: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
source_identity_authority: embedded SLOT_MANIFEST.json
drive_file_id: 1CzILtMNBcx0o3K5G7dQ62s5Vm8ck3GZj
zip_sha256_status: PASS
expected_source_count: 12
classified_source_count: 12
unique_source_id_count: 12
classification_summary:
  ADAPTER_REQUIRED: 6
  DIRECT_REUSE: 2
  PROJECT_BOUND: 3
  REJECTED: 1
files_created:
  - reports/sf028_p0_wave01_slot04_20260801_1949KST/CLASSIFICATION_RESULTS_SLOT_04.json
  - reports/sf028_p0_wave01_slot04_20260801_1949KST/WORKER_REPORT_SLOT_04.md
files_modified: []
tests_run:
  - Drive ZIP metadata/size readback: PASS
  - ZIP SHA-256 verification: PASS
  - embedded manifest parse and exact Source ID set verification: PASS
  - 12 packaged-file SHA-256 checks: PASS
  - node static syntax check: PASS_12_OF_12
  - static imports/exports/functions/classes/effects review: PASS
  - repository canonical-name/export searches: COMPLETED
tests_not_run:
  - source runtime execution: NOT_RUN_BY_CONTRACT
  - dependency installation: NOT_RUN_BY_CONTRACT
  - V2 fixture or integration tests: NOT_RUN_V1_SCOPE
class_contract_status: COMPLIANT_READ_ONLY_V1_STATIC
priority_0_status: COMPLIANT_NO_SOURCE_MODIFICATION
known_risks:
  - fileNameSafe.js has seven undefined exports and is rejected pending complete-source recovery
  - six adapter candidates require compact v2.1.2 contract alignment before promotion
  - three Stage 3/assembly controllers remain bound to legacy project paths and write/process behavior
next_needed: SLOT_06_WAVE01_INTAKE_AND_TARGETED_REINSPECTION_OF_PCAGENT_AUTO_SRC_000530
terminal_status: SF_028_P0_WAVE01_SLOT04_CLASSIFICATION_PASS
WORKER_REPORT_END
