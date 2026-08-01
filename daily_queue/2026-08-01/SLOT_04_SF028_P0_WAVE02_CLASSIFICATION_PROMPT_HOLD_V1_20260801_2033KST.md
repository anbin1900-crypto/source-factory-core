# SLOT 04 — SF_028 P0 WAVE 02 CLASSIFICATION / HOLD

WORKER_ID: `SLOT_04_SF028_P0_WAVE2_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_02_SLOT_04_CLASSIFICATION`
STATUS: `HOLD_PENDING_SF_028_P0_WAVE_01_CLOSED_OPEN_WAVE_02`
BATCH_COMMIT: `767f853030e5fc6f0b6841206f5d51058425fe70`

Do not start until Wave 1 SLOT 06 publishes the exact open terminal.

## Package

- Drive file ID: `1VxhpLD2sYP8JeSpQQegYtblpH2M-lPHM`
- file: `SF028_P0_EXTRACT_20260801_062137_WAVE_02_SLOT_04.zip`
- size: `48984`
- SHA-256: `d1c189d1374a5de0dc0e3fddc3f2556744ea02f6c7f9da62aa62d313a493999e`

Assigned Source IDs:

```text
PCAGENT-AUTO-SRC-000835
PCAGENT-AUTO-SRC-003306
PCAGENT-AUTO-SRC-004048
PCAGENT-AUTO-SRC-004053
PCAGENT-AUTO-SRC-004058
PCAGENT-AUTO-SRC-004077
PCAGENT-AUTO-SRC-004215
PCAGENT-AUTO-SRC-004223
PCAGENT-AUTO-SRC-004229
PCAGENT-AUTO-SRC-004234
PCAGENT-AUTO-SRC-005280
PCAGENT-AUTO-SRC-000555
```

After gate open, verify ZIP/manifest/source hashes and statically inspect all 12 sources. Record function, I/O, symbols, dependencies, external effects, coupling, duplicate/superseded relation, classification, verification level, evidence, risks and next action.

No source execution or mutation; no dependency installation, runtime, promotion, Ready, Merge or OLD_ROOT deletion.

Outputs:

```text
reports/sf028_p0_wave02_slot04_<timestamp>/CLASSIFICATION_RESULTS_SLOT_04.json
reports/sf028_p0_wave02_slot04_<timestamp>/WORKER_REPORT_SLOT_04.md
```

Terminal: `SF_028_P0_WAVE02_SLOT04_CLASSIFICATION_PASS`