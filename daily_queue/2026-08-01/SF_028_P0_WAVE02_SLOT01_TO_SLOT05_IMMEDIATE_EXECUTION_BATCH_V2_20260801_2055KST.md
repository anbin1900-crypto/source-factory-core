# SF_028 P0 WAVE 02 — SLOT 01~05 IMMEDIATE EXECUTION BATCH V2

BATCH_ID: `SF_028_P0_WAVE02_SLOT01_TO_SLOT05_IMMEDIATE_EXECUTION_BATCH_V2_20260801_2055KST`
CONSTITUTION_VERSION: `2.1.2-COMPACT`
STATUS: `ACTIVE_IMMEDIATE_EXECUTION`
SUPERSEDES_FOR_CLASSIFICATION_START:
- `SF_028_P0_WAVE_02_FIVE_SLOT_BATCH_PREPARED_HOLD_V1_20260801_2033KST.md`
- all prior Wave 2 HOLD language

## Commander order

SLOT 06 is excluded from this batch. SLOT 01~05 shall start Wave 2 source classification immediately and in parallel.

Wave 1 SLOT 06 integration may continue concurrently. Prior-wave closure is not a dependency for read-only classification. It remains a dependency only for promotion, integrated closure, Ready, Merge, runtime authority, and canonical asset publication.

## Common boundaries

- Read the assigned Google Drive Slot ZIP and embedded `SLOT_MANIFEST.json`.
- Verify ZIP name, byte size, SHA-256, count 12, unique Source IDs 12, and per-source hashes.
- Inspect actual source content statically.
- Do not execute source code.
- Do not modify source files.
- Do not install dependencies.
- Do not start runtime, service, browser automation, middleware, or external API work.
- Do not promote, mark Ready, merge, or delete OLD_ROOT.

## Required per-candidate decision

For each of 12 candidates report:

- source_id, file name, SHA-256
- actual function
- inputs and outputs
- principal functions/classes
- dependencies
- external effects
- Source Factory coupling
- duplicate/superseded relationship
- exactly one classification
- verification level
- evidence, risks, restrictions, next action

Allowed classifications:

`DIRECT_REUSE`, `ADAPTER_REQUIRED`, `REFERENCE_ONLY`, `PROJECT_BOUND`, `EXACT_DUPLICATE`, `SUPERSEDED`, `SANITIZE_REQUIRED`, `REJECTED`, `REINSPECTION_REQUIRED`.

## Slot map

| SLOT | Drive file ID | ZIP SHA-256 | Size | Count | Authoritative prompt |
|---|---|---|---:|---:|---|
| 01 | `1QWNOtKLWF3tdCMv8t1_SAkpGh28Egh-d` | `2082f546b0f2432dd6dbdda133484cec12bd5e000fc28b45d9b46ffc80cde28b` | 58902 | 12 | `SLOT_01_SF028_P0_WAVE02_IMMEDIATE_EXECUTION_PROMPT_V2_20260801_2055KST.md` |
| 02 | `1fRQoytttA2RF3NwipNNryqIdlVWkVKsy` | `2f019cfc068f4df69981faeac289845b3ddd6d5ef91873005195327b82eba661` | 55645 | 12 | `SLOT_02_SF028_P0_WAVE02_IMMEDIATE_EXECUTION_PROMPT_V2_20260801_2055KST.md` |
| 03 | `1XCRxPdV9N4bI6DCxZu1wV5wnqRRZYYCU` | `14131bb795f3f3cb44c82f0ed87794c824937d8f98125ed08c78bd26fa74429f` | 55955 | 12 | `SLOT_03_SF028_P0_WAVE02_IMMEDIATE_EXECUTION_PROMPT_V2_20260801_2055KST.md` |
| 04 | `1VxhpLD2sYP8JeSpQQegYtblpH2M-lPHM` | `d1c189d1374a5de0dc0e3fddc3f2556744ea02f6c7f9da62aa62d313a493999e` | 48984 | 12 | `SLOT_04_SF028_P0_WAVE02_IMMEDIATE_EXECUTION_PROMPT_V2_20260801_2055KST.md` |
| 05 | `1RX4pVcWw9jBE0POZOkTNHI0xzqelM_yH` | `5e498a8ab4e1213b1094fb02574b15fcae990cfd01a87ca30b475b9a6479314f` | 52715 | 12 | `SLOT_05_SF028_P0_WAVE02_IMMEDIATE_EXECUTION_PROMPT_V2_20260801_2055KST.md` |

## Required output

Each slot must publish append-only:

- `reports/sf028_p0_wave02_slot0X_<timestamp>/CLASSIFICATION_RESULTS_SLOT_0X.json`
- `reports/sf028_p0_wave02_slot0X_<timestamp>/WORKER_REPORT_SLOT_0X.md`

Each JSON must contain exactly 12 unique assigned Source IDs. Even if work cannot be completed, publish a terminal report with the exact blocker and no fabricated PASS.

TERMINAL FOR SUCCESS: `SF_028_P0_WAVE02_SLOT0X_CLASSIFICATION_PASS`
