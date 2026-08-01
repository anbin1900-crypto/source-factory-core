# SLOT 06 — SF_028 P0 WAVE 01 INTEGRATION AND WAVE 02 GATE

WORKER_ID: `SLOT_06_SF028_P0_WAVE01_INTEGRATION_WORKER`
TASK_ID: `SF_028_P0_WAVE_01_INTEGRATION_AND_WAVE_02_GATE`
WORKER_FUNCTION_CLASS: `INTEGRATION_WORKER / GATE_COMMANDER_ASSISTANT`
REPORT_TO: `SF_028_P0_COMMANDER`
MODE: `REPORT_ONLY / READ_ONLY_INTAKE / NO_SOURCE_EXECUTION / NO_PROMOTION`

## Authority

- Commander intake report commit: `66837a43fc30ce4a6b1218d8989fbc64cbba16f6`
- Wave 1 dispatch commit: `fcf596b10b4e002767e885c522435a32781d3998`
- Staging V2 authority commit: `49d348af6d8adb0f7ca6d7b529752ee73ab099c2`

Required result commits:

```text
SLOT_01 50a3edebe77f7b70a621bc288436ffe6537ce62b
SLOT_02 657ccc8bdd447b498f325a0cf5dcc028da65ba96
SLOT_03 f8827318c4e1891094ddaf801000c4a583b65012
SLOT_04 dd1ea5baa2cbf4b8125b0c2774457058e72e6cae
SLOT_05 712716971cf6e98f0f0dd71dc51a2db301e3c546
```

## Required intake checks

1. Read all five classification JSON artifacts from the commits above.
2. Verify exactly 12 candidates per slot.
3. Verify exactly 60 unique Source IDs across all slots.
4. Verify cross-slot duplicate Source ID count is zero.
5. Verify aggregate classification equals:

```text
DIRECT_REUSE=19
ADAPTER_REQUIRED=28
PROJECT_BOUND=6
EXACT_DUPLICATE=1
SUPERSEDED=4
SANITIZE_REQUIRED=1
REJECTED=1
TOTAL=60
```

6. Preserve these exact material findings:
   - `PCAGENT-AUTO-SRC-004213`: `SANITIZE_REQUIRED`, invalid regex syntax, no promotion.
   - `PCAGENT-AUTO-SRC-000530`: `REJECTED`, undefined export surface, no promotion.
   - `PCAGENT-AUTO-SRC-000535`: `EXACT_DUPLICATE` of canonical `src/queue/pythonProcessRunner.js`, no-copy.
7. Do not convert `DIRECT_REUSE` into promoted status. They are V1 static candidates only.

## Required outputs

Create append-only artifacts:

```text
state/SF_028_P0_WAVE_01_INTEGRATED_CLASSIFICATION_LEDGER.json
state/SF_028_P0_WAVE_01_DIRECT_REUSE_V2_FIXTURE_QUEUE.json
state/SF_028_P0_WAVE_01_ADAPTER_BACKLOG.json
state/SF_028_P0_WAVE_01_NONPROMOTION_LEDGER.json
reports/sf028_p0_wave01_integration_<timestamp>/WORKER_REPORT_SLOT_06.md
```

### Integrated ledger requirements

Each of 60 entries must preserve:

- source_id
- source result commit
- slot
- file name
- SHA-256
- actual function
- classification
- verification level
- external effects
- duplicate/superseded relation
- risks
- next action

### DIRECT_REUSE fixture queue

Include exactly 19 candidates unless intake proves a count error. Each item must remain:

```text
current_state: V1_STATIC_ACCEPTED
next_state: V2_FIXTURE_REQUIRED
promotion_status: NOT_PROMOTED
```

### Adapter backlog

Include exactly 28 candidates with adapter domain such as:

```text
PATH_IDENTITY
STORAGE
PROCESS_EXECUTION
PROMPT_CONTRACT_V2_1_2
SIX_SLOT_DEPENDENCY
BROWSER_PROFILE
LEGACY_STAGE_LAYOUT
```

### Nonpromotion ledger

Include:

- PROJECT_BOUND 6
- EXACT_DUPLICATE 1
- SUPERSEDED 4
- SANITIZE_REQUIRED 1
- REJECTED 1

Total: 13.

## Gate rule

Use terminal:

```text
SF_028_P0_WAVE_01_CLOSED_OPEN_WAVE_02
```

only if:

- all five result commits readable
- 60 unique Source IDs
- aggregate counts exactly match
- no source execution/modification/external effect
- material findings preserved
- no candidate is marked officially promoted

Otherwise use:

```text
SF_028_P0_WAVE_01_PARTIAL_HOLD_REINSPECTION
SF_028_P0_WAVE_01_FAIL_BOUNDARY_VIOLATION
```

## Forbidden

- source execution
- source modification
- dependency installation
- runtime/service start
- GitHub Ready or merge
- official reusable-source promotion
- Active Core OLD_ROOT deletion
- Wave 2 PASS claim before this gate completes

## Report minimum

```text
WORKER_REPORT_START
worker_id: SLOT_06_SF028_P0_WAVE01_INTEGRATION_WORKER
task_id: SF_028_P0_WAVE_01_INTEGRATION_AND_WAVE_02_GATE
result_commits_intaked:
slot_counts:
unique_source_id_count:
cross_slot_duplicate_count:
classification_counts:
material_findings_preserved:
integrated_files_created:
source_execution_count: 0
source_modification_count: 0
external_effect_count: 0
promotion_count: 0
wave_02_gate: OPEN | HOLD
terminal_status:
WORKER_REPORT_END
```