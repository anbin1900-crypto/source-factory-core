# SF_028 COMMANDER RESEQUENCE — ACTIVE CORE HOLD / P0 WAVE 1 START V1

GENERATED_AT_KST: 2026-08-01T19:20:00+09:00
COMMANDER_ID: SOURCE_FACTORY_SF028_INTEGRATION_COMMANDER
BATCH_ID: SF_028_COMMANDER_RESEQUENCE_ACTIVE_CORE_HOLD_AND_P0_WAVE1_START_V1_20260801_1920KST
REPO: anbin1900-crypto/source-factory-core
CONSTITUTION_VERSION: 2.1.2-COMPACT
MODE: COMMAND_AND_CONTROL / APPEND_ONLY / NO_RUNTIME_EXECUTION

## AUTHORITY INTAKE

Active Core Migration batch:
- batch commit: `a8e0c105e2cbf1d7b06530e86d43f368599a0a38`
- SLOT 01 result: `1f8688d630efbc4fb2b181ec7471fcb206b104a6`
- SLOT 01 terminal: `SF_028_SLOT_01_SIZE_AUDIT_YELLOW`
- SLOT 01 blocker: user Windows `D:`/`E:` drives are not mounted in the connected worker runtime
- SLOT 06 checkpoint: `930bb47733e4272857720dbd6ac778fb79233680`
- SLOT 06 terminal: `SF_028_ACTIVE_CORE_MIGRATION_GATE_YELLOW_REVIEW_NEEDED`
- SLOT 06 result is a precondition-missing checkpoint, not migration closure

P0 classification authority:
- Wave 1 dispatch commit: `fcf596b10b4e002767e885c522435a32781d3998`
- staging authority correction: `49d348af6d8adb0f7ca6d7b529752ee73ab099c2`
- candidate count: 60 for Wave 1
- execution slots: SLOT 01~05, 12 candidates each
- SLOT 06: integration only after five actual worker result commits

## COMMANDER DECISION

### Track A — Active Core Migration

Status: `HOLD_LOCAL_PC_EVIDENCE`

- SLOT 01 YELLOW is accepted as an environment blocker, not a PASS.
- SLOT 06 YELLOW is accepted only as an early checkpoint.
- Do not rerun SLOT 06 before SLOT 01~05 authoritative results exist.
- Do not start SLOT 03 copy or SLOT 05 verify from incomplete evidence.
- OLD_ROOT deletion remains prohibited.
- A local Windows read-only audit package is required to replace SLOT 01 null measurements.

### Track B — P0 Reusable Source Classification

Status: `WAVE_01_OPEN_READ_ONLY_CLASSIFICATION`

- SLOT 01~05 start in parallel.
- Each slot consumes its exact Drive Slot ZIP and embedded `SLOT_MANIFEST.json`.
- Each slot classifies exactly 12 candidates.
- Source files must not be executed.
- No source modification, promotion, merge, runtime opening, or production action.
- Results are append-only WORKER_REPORT artifacts and GitHub commits.

## PHYSICAL CONCURRENCY

`MAX_TOTAL_AGENT_RUNS=5`

The five available execution slots are assigned to P0 Wave 1 because this track has complete, worker-accessible Drive artifacts. Active Core Migration remains on HOLD until local PC evidence exists. This prevents double-booking and prevents workers from claiming local filesystem PASS without D-drive access.

## SLOT ASSIGNMENTS

- SLOT 01 prompt: `daily_queue/2026-08-01/SLOT_01_SF028_P0_WAVE1_CLASSIFY_START_V1_20260801_1920KST.md`
- SLOT 02 prompt: `daily_queue/2026-08-01/SLOT_02_SF028_P0_WAVE1_CLASSIFY_START_V1_20260801_1920KST.md`
- SLOT 03 prompt: `daily_queue/2026-08-01/SLOT_03_SF028_P0_WAVE1_CLASSIFY_START_V1_20260801_1920KST.md`
- SLOT 04 prompt: `daily_queue/2026-08-01/SLOT_04_SF028_P0_WAVE1_CLASSIFY_START_V1_20260801_1920KST.md`
- SLOT 05 prompt: `daily_queue/2026-08-01/SLOT_05_SF028_P0_WAVE1_CLASSIFY_START_V1_20260801_1920KST.md`
- SLOT 06 hold: `daily_queue/2026-08-01/SLOT_06_SF028_P0_WAVE1_INTEGRATION_HOLD_V1_20260801_1920KST.md`

## REQUIRED PER-CANDIDATE DECISION

Use exactly one primary classification:

- `DIRECT_REUSE`
- `ADAPTER_REQUIRED`
- `REFERENCE_ONLY`
- `PROJECT_BOUND`
- `EXACT_DUPLICATE`
- `SUPERSEDED`
- `SANITIZE_REQUIRED`
- `REJECTED`
- `REINSPECTION_REQUIRED`

Also record:

- actual function
- inputs and outputs
- dependencies
- external effects
- project coupling
- duplicate or replacement relation
- verification level `V0`~`V4`
- evidence
- next action

## WAVE 1 CLOSURE GATE

SLOT 06 may start only after five actual result commits exist and each result contains 12 decisions with no duplicate or missing Source ID.

Valid next terminal after intake:

- `SF_028_P0_WAVE_01_CLOSED_OPEN_WAVE_02`
- `SF_028_P0_WAVE_01_PARTIAL_HOLD_REINSPECTION`
- `SF_028_P0_WAVE_01_FAIL_BOUNDARY_VIOLATION`

## FORBIDDEN

- OLD_ROOT delete
- source execution
- source modification
- PC Agent service start
- 026 verifier execution
- external API, browser automation, middleware, production deploy
- candidate promotion
- Ready or Merge
- SLOT 06 premature gate rerun

TERMINAL_STATUS: `SF_028_COMMANDER_RESEQUENCE_APPLIED_P0_WAVE_01_OPEN`
