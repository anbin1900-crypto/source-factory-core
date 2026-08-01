# SLOT 06 — SF_028 P0 WAVE 02 INTEGRATION AND WAVE 03 GATE

WORKER_ID: `SLOT_06_SF028_P0_WAVE02_INTEGRATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_02_INTEGRATION_AND_WAVE_03_GATE`
WORKER_FUNCTION_CLASS: `INTEGRATION_WORKER / GATE_COMMANDER_ASSISTANT`
STATUS: `QUEUED_AFTER_CURRENT_SLOT06_ASSIGNMENT`
MODE: `REPORT_ONLY / READ_ONLY_INTAKE / NO_SOURCE_EXECUTION / NO_PROMOTION`

## Start condition

Begin immediately after the current SLOT 06 V2 fixture/canonical-plan assignment publishes a terminal report. Do not abandon or overwrite that current assignment.

## Authority

- Commander Wave 2 intake commit: `eb95c41c3447e3a661ec47438437e65783624aab`
- Wave 2 result commits:

```text
SLOT_01 cca2fd7c252bb9a333a090df647df7149e004c01
SLOT_02 8cbd6e58681be6f1b6f2948744f2a011bae63ac8
SLOT_03 675251c317ff7ddf3e1243c96e6db83a638227f2
SLOT_04 5d5891b50361247247be3f073e50e1a9342fec98
SLOT_05 4b01a729b79e7aef4187ee2e48714041184bbb47
```

## Required checks

- exactly 12 candidates per slot
- exactly 60 unique Source IDs
- cross-slot duplicate Source ID count 0
- aggregate classification exactly:

```text
DIRECT_REUSE=29
ADAPTER_REQUIRED=17
PROJECT_BOUND=9
SUPERSEDED=3
REFERENCE_ONLY=1
SANITIZE_REQUIRED=1
TOTAL=60
```

- preserve `PCAGENT-AUTO-SRC-004214` as SANITIZE_REQUIRED/no-promotion
- preserve `PCAGENT-AUTO-SRC-005280` false-PASS risk and V2 fixture requirement
- keep every DIRECT_REUSE item as V1_STATIC_ACCEPTED / V2_FIXTURE_REQUIRED / NOT_PROMOTED

## Required outputs

```text
state/SF_028_P0_WAVE_02_INTEGRATED_CLASSIFICATION_LEDGER.json
state/SF_028_P0_WAVE_02_DIRECT_REUSE_V2_FIXTURE_QUEUE.json
state/SF_028_P0_WAVE_02_ADAPTER_BACKLOG.json
state/SF_028_P0_WAVE_02_NONPROMOTION_LEDGER.json
reports/sf028_p0_wave02_integration_<timestamp>/WORKER_REPORT_SLOT_06.md
```

## Gate terminal

Use `SF_028_P0_WAVE_02_CLOSED_OPEN_WAVE_03` only if all checks pass. Wave 3 classification may already be running under the maximum-parallel pipeline policy; this gate controls integration, promotion, and closure, not read-only classification start.

## Forbidden

- source execution or modification
- dependency installation
- runtime/service start
- official promotion, Ready, or Merge
- OLD_ROOT deletion