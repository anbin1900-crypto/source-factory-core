# SLOT 03 — SF_028 P0 WAVE 02 CLASSIFICATION / HOLD

WORKER_ID: `SLOT_03_SF028_P0_WAVE2_CLASSIFICATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_02_SLOT_03_CLASSIFICATION`
STATUS: `HOLD_PENDING_SF_028_P0_WAVE_01_CLOSED_OPEN_WAVE_02`
BATCH_COMMIT: `767f853030e5fc6f0b6841206f5d51058425fe70`

Do not start until Wave 1 SLOT 06 publishes the exact open terminal.

## Package

- Drive file ID: `1XCRxPdV9N4bI6DCxZu1wV5wnqRRZYYCU`
- file: `SF028_P0_EXTRACT_20260801_062137_WAVE_02_SLOT_03.zip`
- size: `55955`
- SHA-256: `14131bb795f3f3cb44c82f0ed87794c824937d8f98125ed08c78bd26fa74429f`

Assigned Source IDs:

```text
PCAGENT-AUTO-SRC-000692
PCAGENT-AUTO-SRC-003287
PCAGENT-AUTO-SRC-003723
PCAGENT-AUTO-SRC-004052
PCAGENT-AUTO-SRC-004057
PCAGENT-AUTO-SRC-004064
PCAGENT-AUTO-SRC-004214
PCAGENT-AUTO-SRC-004222
PCAGENT-AUTO-SRC-004228
PCAGENT-AUTO-SRC-004233
PCAGENT-AUTO-SRC-005279
PCAGENT-AUTO-SRC-000553
```

After gate open, verify ZIP/manifest/source hashes and statically inspect 12 actual source files. Record actual function, I/O, symbols, dependencies, external effects, coupling, duplicate/superseded relation, classification, verification level, evidence, risks and next action.

No source execution or modification; no dependency installation, runtime, promotion, Ready, Merge or OLD_ROOT deletion.

Outputs:

```text
reports/sf028_p0_wave02_slot03_<timestamp>/CLASSIFICATION_RESULTS_SLOT_03.json
reports/sf028_p0_wave02_slot03_<timestamp>/WORKER_REPORT_SLOT_03.md
```

Terminal: `SF_028_P0_WAVE02_SLOT03_CLASSIFICATION_PASS`