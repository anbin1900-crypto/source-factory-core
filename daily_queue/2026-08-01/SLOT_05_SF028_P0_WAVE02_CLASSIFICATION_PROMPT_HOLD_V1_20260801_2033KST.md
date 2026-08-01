# SLOT 05 — SF_028 P0 WAVE 02 CLASSIFICATION / HOLD

WORKER_ID: `SLOT_05_SF028_P0_WAVE2_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_02_SLOT_05_CLASSIFICATION`
STATUS: `HOLD_PENDING_SF_028_P0_WAVE_01_CLOSED_OPEN_WAVE_02`
BATCH_COMMIT: `767f853030e5fc6f0b6841206f5d51058425fe70`

Do not start until Wave 1 SLOT 06 publishes the exact open terminal.

## Package

- Drive file ID: `1RX4pVcWw9jBE0POZOkTNHI0xzqelM_yH`
- file: `SF028_P0_EXTRACT_20260801_062137_WAVE_02_SLOT_05.zip`
- size: `52715`
- SHA-256: `5e498a8ab4e1213b1094fb02574b15fcae990cfd01a87ca30b475b9a6479314f`

Assigned Source IDs:

```text
PCAGENT-AUTO-SRC-000836
PCAGENT-AUTO-SRC-003309
PCAGENT-AUTO-SRC-004049
PCAGENT-AUTO-SRC-004054
PCAGENT-AUTO-SRC-004060
PCAGENT-AUTO-SRC-004078
PCAGENT-AUTO-SRC-004218
PCAGENT-AUTO-SRC-004224
PCAGENT-AUTO-SRC-004230
PCAGENT-AUTO-SRC-004235
PCAGENT-AUTO-SRC-005281
PCAGENT-AUTO-SRC-000557
```

After gate open, verify ZIP/manifest/source hashes and statically inspect all 12 sources. Record function, I/O, symbols, dependencies, external effects, coupling, duplicate/superseded relation, classification, verification level, evidence, risks and next action.

No execution, mutation, dependency installation, runtime, promotion, Ready, Merge or OLD_ROOT deletion.

Outputs:

```text
reports/sf028_p0_wave02_slot05_<timestamp>/CLASSIFICATION_RESULTS_SLOT_05.json
reports/sf028_p0_wave02_slot05_<timestamp>/WORKER_REPORT_SLOT_05.md
```

Terminal: `SF_028_P0_WAVE02_SLOT05_CLASSIFICATION_PASS`