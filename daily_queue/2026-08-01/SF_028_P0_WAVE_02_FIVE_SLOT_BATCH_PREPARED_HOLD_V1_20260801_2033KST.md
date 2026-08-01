# SF_028 P0 WAVE 02 — FIVE SLOT BATCH PREPARED / HOLD

BATCH_ID: `SF_028_P0_WAVE_02_FIVE_SLOT_BATCH_PREPARED_HOLD_V1_20260801_2033KST`
CONSTITUTION_VERSION: `2.1.2-COMPACT`
MODE: `BATCH_FIRST_PROMPT_PREPARATION / SEQUENTIAL_SEND_ALLOWED`
CURRENT_STATUS: `HOLD_PENDING_WAVE_01_SLOT06_CLOSURE`

## Gate authority

Wave 2 may start only after SLOT 06 publishes:

```text
terminal_status: SF_028_P0_WAVE_01_CLOSED_OPEN_WAVE_02
```

Active SLOT 06 prompt commit:

```text
6f740ca7c19a8911616ef39c393270eaa98b1c46
```

Until then, all Wave 2 prompts are prepared but not executable.

## Common boundaries

- read actual source files from assigned Drive Slot ZIP
- verify ZIP name, size and SHA-256
- verify embedded SLOT_MANIFEST and 12 per-source hashes
- static inspection only
- no source execution
- no source modification
- no dependency installation
- no promotion/Ready/Merge
- no runtime/service start
- no OLD_ROOT deletion

## Required per-candidate decision

- actual function
- inputs and outputs
- principal functions/classes
- dependencies
- external effects
- project coupling
- duplicate/superseded relation
- one primary classification
- verification level
- evidence, risks and next action

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

## Slot map

| SLOT | Drive file ID | ZIP SHA-256 | Size | Count | Prompt |
|---|---|---|---:|---:|---|
| 01 | `1QWNOtKLWF3tdCMv8t1_SAkpGh28Egh-d` | `2082f546b0f2432dd6dbdda133484cec12bd5e000fc28b45d9b46ffc80cde28b` | 58902 | 12 | `SLOT_01_SF028_P0_WAVE02_CLASSIFICATION_PROMPT_HOLD_V1_20260801_2033KST.md` |
| 02 | `1fRQoytttA2RF3NwipNNryqIdlVWkVKsy` | `2f019cfc068f4df69981faeac289845b3ddd6d5ef91873005195327b82eba661` | 55645 | 12 | `SLOT_02_SF028_P0_WAVE02_CLASSIFICATION_PROMPT_HOLD_V1_20260801_2033KST.md` |
| 03 | `1XCRxPdV9N4bI6DCxZu1wV5wnqRRZYYCU` | `14131bb795f3f3cb44c82f0ed87794c824937d8f98125ed08c78bd26fa74429f` | 55955 | 12 | `SLOT_03_SF028_P0_WAVE02_CLASSIFICATION_PROMPT_HOLD_V1_20260801_2033KST.md` |
| 04 | `1VxhpLD2sYP8JeSpQQegYtblpH2M-lPHM` | `d1c189d1374a5de0dc0e3fddc3f2556744ea02f6c7f9da62aa62d313a493999e` | 48984 | 12 | `SLOT_04_SF028_P0_WAVE02_CLASSIFICATION_PROMPT_HOLD_V1_20260801_2033KST.md` |
| 05 | `1RX4pVcWw9jBE0POZOkTNHI0xzqelM_yH` | `5e498a8ab4e1213b1094fb02574b15fcae990cfd01a87ca30b475b9a6479314f` | 52715 | 12 | `SLOT_05_SF028_P0_WAVE02_CLASSIFICATION_PROMPT_HOLD_V1_20260801_2033KST.md` |

## Output contract

Each slot publishes append-only:

```text
reports/sf028_p0_wave02_slot0X_<timestamp>/CLASSIFICATION_RESULTS_SLOT_0X.json
reports/sf028_p0_wave02_slot0X_<timestamp>/WORKER_REPORT_SLOT_0X.md
```

Each JSON must contain exactly 12 unique assigned Source IDs.

SLOT 06 Wave 2 integration remains unassigned until all five Wave 2 results exist.