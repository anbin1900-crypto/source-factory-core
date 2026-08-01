# SLOT 06 — SF_028 P0 WAVE 03 INTEGRATION AND WAVE 04 GATE

WORKER_ID: `SLOT_06_SF028_P0_WAVE03_INTEGRATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_03_INTEGRATION_AND_WAVE_04_GATE`
WORKER_FUNCTION_CLASS: `INTEGRATION_WORKER / GATE_COMMANDER_ASSISTANT`
REPORT_TO: `SF_028_P0_COMMANDER`
MODE: `REPORT_ONLY / READ_ONLY_INTAKE / NO_SOURCE_EXECUTION / NO_PROMOTION`

## Authority

- Commander Wave 3 intake: `dcd7a410c1a2cd4105049719d13733185ba42dde`
- Wave 3 batch: `e162e6018a709bbae470604fef9b431673764e8a`
- Wave 2 closure: `61a01df401e357b013cb4fc18d141dc370ac4c85`
- maximum-parallel policy: `8b90fb4f9ded9a9f03875b6d01f05c37c15b250d`

Required result commits:

```text
SLOT_01 bb12aee365dc52d1983d12c202d48b56de8d2701
SLOT_02 d79e96d07f763ac9d539c32f72b8abe6a77b3cd9
SLOT_03 03df7d63d92a6e7da2304857743205aac76c31b4
SLOT_04 309728102aef00da832b4d84593be5c9aab35725
SLOT_05 fff8aab11f8e4736d05db15f919fb8250f631973
```

## Required checks

1. Read all five result JSON artifacts.
2. Verify 12 candidates per slot and 60 unique Source IDs total.
3. Verify cross-slot duplicate Source ID count is zero.
4. Verify aggregate classification exactly:

```text
DIRECT_REUSE=9
ADAPTER_REQUIRED=15
PROJECT_BOUND=22
SUPERSEDED=10
REFERENCE_ONLY=1
SANITIZE_REQUIRED=2
REJECTED=1
TOTAL=60
```

5. Preserve material findings:
   - `PCAGENT-AUTO-SRC-003485`: SANITIZE_REQUIRED, TDZ/module-load defect.
   - `PCAGENT-AUTO-SRC-005275`: REJECTED, truncated source.
   - `PCAGENT-AUTO-SRC-005286`: SANITIZE_REQUIRED, unsafe generic shell/process wrapper.
   - `PCAGENT-AUTO-SRC-004089`: PROJECT_BOUND, require-time Electron side effects.
6. Preserve all 9 DIRECT_REUSE candidates as `V1_STATIC_ACCEPTED / V2_FIXTURE_REQUIRED / NOT_PROMOTED`.

## Required outputs

```text
state/SF_028_P0_WAVE_03_INTEGRATED_CLASSIFICATION_LEDGER.json
state/SF_028_P0_WAVE_03_DIRECT_REUSE_V2_FIXTURE_QUEUE.json
state/SF_028_P0_WAVE_03_ADAPTER_BACKLOG.json
state/SF_028_P0_WAVE_03_NONPROMOTION_LEDGER.json
reports/sf028_p0_wave03_integration_<timestamp>/WORKER_REPORT_SLOT_06.md
```

The integrated ledger must preserve exact immutable result commit, source ID, slot, filename, SHA-256, classification, verification level, effects, lineage, risks and next action for all 60 entries.

## Gate terminal

Use:

```text
SF_028_P0_WAVE_03_CLOSED_OPEN_WAVE_04
```

only when all counts, identities, material findings and zero-effect boundaries pass. Otherwise use:

```text
SF_028_P0_WAVE_03_PARTIAL_HOLD_REINSPECTION
SF_028_P0_WAVE_03_FAIL_BOUNDARY_VIOLATION
```

## Forbidden

- source execution or modification
- dependency installation
- runtime/service/browser/network/API/middleware start
- official reusable-source promotion
- Ready or Merge
- OLD_ROOT deletion

Wave 4 read-only classification may proceed concurrently. This gate controls integrated closure and promotion authority only.
