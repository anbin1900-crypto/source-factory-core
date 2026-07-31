# SF_027 — PC Agent Source Extraction for Commander Automation Batch

ISSUED_AT_KST: 2026-08-01T05:37:00+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
OBSERVED_MAIN_HEAD: eba3cae98e6878cf9e74c179762153994d14d8eb
BATCH_ID: SF_027_PC_AGENT_SOURCE_EXTRACTION_20260801_0537
COMMANDER_ID: SOURCE_FACTORY_SF027_PC_AGENT_SOURCE_EXTRACTION_COMMANDER
TASK_ID: SF_027_PC_AGENT_SOURCE_EXTRACTION_FOR_COMMANDER_AUTOMATION
MODE: REPORT_ONLY / READ_ONLY_EXTRACTION / LEDGER_DRAFT_ALLOWED / NO_RUNTIME_EXECUTION / NO_PRODUCTION_MUTATION / NO_026_EXECUTION
CURRENT_GATE: 026_HOLD
COMMANDER_AUTHORIZATION: NOT_GRANTED

## 1. Purpose

Extract and classify reusable Source Factory assets needed for future PC Agent Commander-intake automation. This batch does not implement new runtime functionality. It creates an evidence-backed candidate ledger and worker extraction reports so Commander decisions do not require rereading the entire repository.

Target automation capabilities:

- latest GitHub commit intake
- WORKER_REPORT discovery
- terminal status extraction
- dependency-gate evaluation
- stale-report detection
- next-dispatch draft generation
- Commander-approved publication only

## 2. Known inventory context

- total inventory observed historically: approximately 5,903
- GitHub candidates: approximately 5,707
- Drive pointers: approximately 196
- promotion candidates: approximately 2,940
- P0 staging selected: approximately 240
- runtime/src import candidates: approximately 65
- stable core: small verified subset

These counts are historical intake context, not new validation results. Workers must report exact current paths, commits, blobs and evidence.

## 3. Execution order

Parallel start:

1. SLOT 01 — queue, claim, receipt and exactly-once extraction
2. SLOT 02 — PC Agent and canonical command runner extraction
3. SLOT 03 — WORKER_REPORT and terminal parser candidate extraction
4. SLOT 04 — inventory, candidate ledger and promotion-tool extraction
5. SLOT 05 — prompt, dispatch and operating-template extraction

Dependent integration:

6. SLOT 06 starts only after exact SLOT 01~05 result commits exist. SLOT 06 integrates the ledger and designs PC Agent automation modes without implementing or running them.

## 4. Ownership boundaries

- SLOT 01 owns `src/queue/` and claim/receipt/lifecycle candidates.
- SLOT 02 owns `src/pc_agent/` and command-runner boundary candidates.
- SLOT 03 owns report-format and parser-design extraction from `reports/` and terminal patterns.
- SLOT 04 owns inventory, staging, promotion, sanitize, blocked and Drive-pointer tooling.
- SLOT 05 owns `daily_queue/` prompt and dispatch template structures.
- SLOT 06 owns integration only and must not duplicate extraction work.

Cross-slot references are allowed. Duplicate ownership is not.

## 5. Candidate record contract

Each candidate must include:

- `source_id`
- exact `path`
- `source_type`
- `reuse_role`
- `current_status`
- `last_known_commit`
- `last_known_blob`
- `risk_flags`
- `dependencies`
- `recommended_owner_slot`
- `next_action`
- evidence reference or reason evidence is pending

Allowed current statuses:

- `stable_core`
- `candidate`
- `needs_review`
- `blocked`
- `drive_pointer`
- `deprecated`

Allowed next actions:

- `reuse_as_is`
- `wrap`
- `inspect`
- `sanitize`
- `block`
- `promote_later`

## 6. Global prohibitions

- no 026 one-flow verifier execution
- no PC Agent service start
- no GPT prompt execution
- no browser automation
- no external API call
- no middleware transmission
- no production deployment
- no Ready transition
- no merge
- no Commander-unauthorized execution right
- no report rewrite or deletion
- no bulk source promotion
- no unsanitized secret, identity, path-leak or sensitive candidate promotion
- no direct GitHub upload of Drive-pointer byte artifacts

## 7. Required outputs

- `state/SF_027_PC_AGENT_AUTOMATION_SOURCE_EXTRACTION_LEDGER.json`
- six append-only worker reports at the paths defined by each slot prompt
- SLOT 06 integrated design report after SLOT 01~05
- exact GitHub result commits for every worker

## 8. Batch terminal state

`SF_027_WORKER_EXTRACTION_DISPATCHED`

This state means extraction work may begin. It does not mean candidate promotion, runtime implementation or 026 execution is authorized.
