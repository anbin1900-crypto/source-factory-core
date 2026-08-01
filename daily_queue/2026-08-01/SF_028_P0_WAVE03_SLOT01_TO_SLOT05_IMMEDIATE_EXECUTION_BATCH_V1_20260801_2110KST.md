# SF_028 P0 WAVE 03 — SLOT 01~05 IMMEDIATE EXECUTION BATCH

BATCH_ID: `SF_028_P0_WAVE03_SLOT01_TO_SLOT05_IMMEDIATE_EXECUTION_BATCH_V1_20260801_2110KST`
CONSTITUTION_VERSION: `2.1.2-COMPACT`
CURRENT_STATUS: `START_NOW`
PIPELINE_MODE: `MAX_PARALLEL_OVERLAP`

## Authority

- maximum-parallel policy: `8b90fb4f9ded9a9f03875b6d01f05c37c15b250d`
- Wave 2 Commander intake: `eb95c41c3447e3a661ec47438437e65783624aab`
- Wave 3 classification start is independent of Wave 2 SLOT 06 closure.
- Wave 3 promotion/integrated closure remains gated.

## Slot packages

| SLOT | Drive file ID | ZIP SHA-256 | Size | Count |
|---|---|---|---:|---:|
| 01 | `1AXlYdsAWNbYMl2K-vtqDX4vN-riiS_R2` | `d002b08aa2757d319e8d5ed49a53a28d7b34cd7253e4b8c0862d1d2a9564384f` | 52278 | 12 |
| 02 | `1O1TEv84cyLRS1Y7cLG495GqG7fQjBMAG` | `7a1838be0d8605819943b694b20ae7776a972c7ae2de494b9e3c8da22015682e` | 48636 | 12 |
| 03 | `1U-ycN2xkayVSJUo9uW6pafhXdrOb9AmR` | `3e909ee2e989a621256f8bf26012eedc7f520d17140766de8749d64e730dacab` | 51291 | 12 |
| 04 | `1jDogRPIBu-rWIKnQodnPUiRR23bR_77D` | `c319a2aed3b4420b97f95275e1dca201b2e438b0462f8ed364e4c38aa7d2cd9b` | 38147 | 12 |
| 05 | `1Tr-es3GljWHZAEdsIODxmF4dTZw9Ecx-` | `7e8f402a425deaf8a09bd9024d8803c53e16d88bf5956b843e338392503bff8e` | 38445 | 12 |

## Common work

Each worker must:

1. download only its assigned ZIP;
2. verify ZIP name, size, SHA-256 and embedded `SLOT_MANIFEST.json`;
3. verify 12 unique assigned Source IDs and all per-source hashes;
4. read actual source contents;
5. assign exactly one classification per candidate;
6. record function, I/O, symbols, dependencies, external effects, coupling, lineage, verification level, evidence, risk and next action;
7. publish one JSON result and one WORKER_REPORT.

Allowed classifications:

```text
DIRECT_REUSE
ADAPTER_REQUIRED
REFERENCE_ONLY
PROJECT_BOUND
EXACT_DUPLICATE
SUPERSEDED
SANITIZE_REQUIRED
REJECTED
REINSPECTION_REQUIRED
```

## Boundaries

- static inspection only
- no source execution
- no source modification
- no dependency installation
- no runtime/service/browser/external API start
- no official promotion, Ready, or Merge
- no OLD_ROOT deletion

## Output paths

```text
reports/sf028_p0_wave03_slot0X_<timestamp>/CLASSIFICATION_RESULTS_SLOT_0X.json
reports/sf028_p0_wave03_slot0X_<timestamp>/WORKER_REPORT_SLOT_0X.md
```

Failure or inability must still publish a terminal report with the exact reason.