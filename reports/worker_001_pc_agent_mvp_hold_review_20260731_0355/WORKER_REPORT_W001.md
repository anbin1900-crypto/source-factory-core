# W001 PC Agent MVP Hold Review Report

GENERATED_AT_KST: 2026-07-31T03:55+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
REVIEWED_HEAD: f2ce77bc74d1573ebf9414cb4c5f8b789636ec1c
PROMPT_COMMIT: d431c98cceb41b4b0c55c4202bb83d0dbd27ccb2

## 1. WORKER_ID / TASK_ID / MODE

- WORKER_ID: SOURCE_FACTORY_WORKER_001
- TASK_ID: SF_W001_PC_AGENT_MVP_HOLD_REVIEW
- MODE: REPORT_ONLY / HOLD_026_EXECUTION / NO_GPT_CALL / NO_BROWSER_LAUNCH / NO_PC_AGENT_SERVICE_START / NO_EXTERNAL_API / NO_MIDDLEWARE_TRANSMISSION / NO_PRODUCTION_DEPLOY

## 2. Intake status

- Worker prompt intake: PASS
- Latest Commander handoff intake: PASS
- Current Commander gate: 026 HOLD
- 024B evidence intake: PASS
- 025 evidence intake: PASS
- 026 preparation artifacts intake: PRESENT
- 026 remote execution-result evidence: NOT_FOUND
- 026 classification: PREPARED_NOT_EXECUTED

## 3. Evidence checked

### 024B

- Result commit: 81d7f131d111bd59da9cfc285867e1d082d8445d
- Status: PASS_ONEFLOW_LOCAL_WORKER_LIFECYCLE_VERIFY_READY_FOR_025
- First claim: ACCEPTED_FIRST_CLAIM
- Duplicate claim: REJECTED_DUPLICATE_CLAIM
- First receipt: ACCEPTED_TERMINAL_RECEIPT
- Duplicate receipt: REJECTED_DUPLICATE_TERMINAL_RECEIPT
- JSON read encoding: utf-8-sig
- Claim count: 1
- Receipt count: 1
- External side effects: 0 in the recorded fixture

### 025

- Result commit: fe9a236ddb335a0831414c85afdaa93b8ca840f5
- Status: PASS_ONEFLOW_LOCAL_COMMAND_RUNNER_VERIFY_READY_FOR_026
- Executed command: allowlisted Python version check only
- shell: false
- exit_code: 0
- stdout captured: PASS
- stderr captured or empty: PASS
- timeout recorded: 15 seconds
- Forbidden-effect counters: all zero in the recorded receipt

### 026 prepared artifacts

- src/pc_agent/local_pc_agent_mvp.py
- tools/source_factory_oneflow_pc_agent_local_mvp_verify_and_push.py
- daily_queue/2026-07-31/026_ONEFLOW_PC_AGENT_LOCAL_MVP_VERIFY_EXECUTION.md

### Supporting modules

- src/queue/local_claim_store.py
- src/queue/terminal_receipt_store.py
- src/queue/local_worker_lifecycle.py
- src/pc_agent/local_command_runner.py

## 4. 026 hold compliance

- 026 was not executed by W001.
- No GPT prompt was sent.
- No browser automation was launched.
- No PC Agent service was started.
- No external API was called.
- No middleware data was transmitted.
- No production deployment was performed.
- No production source file was modified.
- Only this report artifact was added.

Python one-flow review:

- Core verifier is implemented in Python: PASS
- PowerShell is only shown as a thin launcher in the execution guide: PASS
- JSON BOM-compatible read uses utf-8-sig: PASS
- Dynamic import registers modules in sys.modules before exec_module: PASS
- Python verifier can generate reports and commit/push when explicitly authorized: PASS

## 5. Risk list

### BLOCKER-1 — Rejected duplicate claim does not stop command execution

In `run_local_pc_agent_mvp`, the claim is attempted and `command_runner.execute(command_spec)` is called immediately afterward without first requiring `ACCEPTED_FIRST_CLAIM`.

Impact:

- A pre-existing duplicate claim can be rejected while the local command still executes.
- Receipt deduplication occurs only after command execution and therefore cannot enforce exactly-once side effects.
- The current 026 happy-path verifier does not expose this failure because it begins with an empty claim store.

Required fix:

- Return a rejected/no-execution result immediately unless the first claim status is `ACCEPTED_FIRST_CLAIM`.
- Do not build or save a completion receipt for a rejected claim.

### BLOCKER-2 — Command allowlist binds only command_id, not argv

`LocalCommandRunner.execute` checks whether `spec.command_id` is in `allowed_command_ids`, but does not verify that `argv`, executable, cwd, timeout, expected exit code, and effect match a canonical definition for that ID.

Impact:

- A caller can reuse an allowed ID such as `LOCAL_PYTHON_VERSION_CHECK` with different arbitrary argv.
- The intended narrow allowlist is not enforced at the actual executable/argument boundary.

Required fix:

- Replace the ID-only set with an immutable command registry.
- Resolve command specifications from the registry or compare the full canonical specification before execution.
- Reject mismatched executable, argv, cwd, timeout, expected exit code, or effect.

### HIGH-1 — 026 verifier does not test claim-before-command enforcement

The verifier performs one accepted claim, executes the command, and only then tests a second duplicate claim. It does not pre-seed a duplicate claim and prove that command invocation count remains zero.

Required fix:

- Add a pre-existing-claim fixture.
- Use a spy/fake command runner.
- Require `REJECTED_DUPLICATE_CLAIM`, zero command invocations, no new receipt, and unchanged store counts.

### HIGH-2 — Terminal receipt identity fields are not mandatory

`REQUIRED_TERMINAL_FIELDS` does not require `schema_version`, `queue_id`, `assignment_id`, `claim_key`, `project_code`, or `forbidden_effect_counters`, even though deduplication depends on identity fields.

Impact:

- Structurally incomplete receipts can be accepted.
- Empty identity values can produce weak or colliding dedupe keys.

Required fix:

- Require all identity and schema fields.
- Reject blank queue_id, assignment_id, worker_id, and claim_key.
- Require all forbidden counter fields to be present and zero.

### MEDIUM-1 — Local claim store is not concurrency-atomic

The claim store uses read-check-append-write without a file lock or atomic compare-and-create operation.

Impact:

- Two processes can race and both observe no existing claim before writing.

Required fix before multi-process/service activation:

- Add an inter-process lock and atomic replace, or move claim ownership to a transactional store.

### MEDIUM-2 — Mutation and side-effect counters are asserted, not measured

The 026 verifier writes `production_overwrite_count: 0` and `external_side_effect_count: 0` as constants and does not compare repository state before and after execution.

Required fix:

- Capture pre/post git status or file ledger outside the report directory.
- Fail on unexpected file mutation.
- Derive counters from observed evidence instead of constants.

### MEDIUM-3 — Command execution exceptions are incomplete

The command runner catches timeout but not executable-not-found and other `OSError` cases as structured command results.

Required fix:

- Convert `FileNotFoundError` and `OSError` into deterministic failure receipts.

## 6. Recommended next gate decision

Keep 026 on HOLD and issue a small focused hotfix package:

1. Enforce accepted claim before command execution.
2. Bind allowlist IDs to exact canonical command specifications.
3. Add rejected-preclaim/no-command verifier coverage.
4. Strengthen terminal receipt required identity fields.
5. Measure unexpected file mutation.
6. Add structured command-launch exception handling.

Concurrency locking may be completed in the same hotfix or made an explicit mandatory gate before any multi-process/service activation.

025 remains PASS. The identified defects are in the unexecuted 026 orchestration and its activation proof, not in the recorded 025 local Python-version receipt.

## 7. Blockers

- BLOCKER-1: Duplicate/rejected claim can still execute the command.
- BLOCKER-2: Allowed command ID can carry non-canonical arbitrary argv.
- HIGH-1: Current verifier cannot detect BLOCKER-1.
- HIGH-2: Receipt validator permits missing dedupe identity fields.

No Commander ambiguity is required to keep the gate closed; the current HOLD decision remains valid.

## 8. Final decision

KEEP_026_HOLD_PENDING_FIXES
