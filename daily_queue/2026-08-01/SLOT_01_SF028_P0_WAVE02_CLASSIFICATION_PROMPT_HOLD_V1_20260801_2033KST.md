# SLOT 01 — SF_028 P0 WAVE 02 CLASSIFICATION / HOLD

WORKER_ID: `SLOT_01_SF028_P0_WAVE2_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_02_SLOT_01_CLASSIFICATION`
STATUS: `HOLD_PENDING_SF_028_P0_WAVE_01_CLOSED_OPEN_WAVE_02`
BATCH_COMMIT: `767f853030e5fc6f0b6841206f5d51058425fe70`

Do not start until Wave 1 SLOT 06 publishes the exact open terminal.

## Package

- Drive file ID: `1QWNOtKLWF3tdCMv8t1_SAkpGh28Egh-d`
- file: `SF028_P0_EXTRACT_20260801_062137_WAVE_02_SLOT_01.zip`
- size: `58902`
- SHA-256: `2082f546b0f2432dd6dbdda133484cec12bd5e000fc28b45d9b46ffc80cde28b`

Assigned Source IDs:

```text
PCAGENT-AUTO-SRC-000690
PCAGENT-AUTO-SRC-000838
PCAGENT-AUTO-SRC-003317
PCAGENT-AUTO-SRC-004050
PCAGENT-AUTO-SRC-004055
PCAGENT-AUTO-SRC-004061
PCAGENT-AUTO-SRC-004079
PCAGENT-AUTO-SRC-004219
PCAGENT-AUTO-SRC-004226
PCAGENT-AUTO-SRC-004231
PCAGENT-AUTO-SRC-004236
PCAGENT-AUTO-SRC-000883
```

## Work after gate opens

Verify ZIP/manifest/source hashes, inspect 12 actual source files, and record function, I/O, symbols, dependencies, external effects, coupling, duplicate/superseded relation, primary classification, verification level, evidence, risks and next action.

Static inspection only. No source execution, mutation, dependency installation, runtime, promotion, Ready, Merge or OLD_ROOT deletion.

Outputs:

```text
reports/sf028_p0_wave02_slot01_<timestamp>/CLASSIFICATION_RESULTS_SLOT_01.json
reports/sf028_p0_wave02_slot01_<timestamp>/WORKER_REPORT_SLOT_01.md
```

Terminal after valid completion:

```text
SF_028_P0_WAVE02_SLOT01_CLASSIFICATION_PASS
```