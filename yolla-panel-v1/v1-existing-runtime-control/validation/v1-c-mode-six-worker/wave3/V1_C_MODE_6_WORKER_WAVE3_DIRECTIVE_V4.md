# V1 C Mode Six-Worker Wave 3 Directive V4

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WAVE_ID=V1-C-MODE-6W-WAVE-003
COMMANDER=V-1
DISPATCH_MODE=PARALLEL_WITH_ONE_CARRYOVER
CURRENT_PROGRESS=72%
PRODUCTION=false
READY=false
MERGE=false
AUTO_TEST_WRITE_COUNT=0
```

## Common execution rule

Each worker shall read its latest PR comment, perform the assigned scope End-to-End, correct reproducible defects within owned paths, rerun the same tests, Commit a machine-readable result, and post a correlated Terminal comment. A failure or external blocker must also be reported. Target-PC PASS and LTS PASS are prohibited without live receipts.

## AUTOMATION-C-W1 — Unified Candidate and Full Runtime Parity

```text
WORKER_PR=#59
COMMAND_ID=C6W-W3-W1-UNIFIED-CANDIDATE
INPUT_W2_HEAD=028faddc8c314361f6703c9cbbb27865ed009edd
INPUT_W4_HEAD=42e5ff1857754aeb366849448f671f5144694d7d
INPUT_W3_HEAD=9f0d97291ab47592bd9e0136d8ca44723971f90e
INPUT_W5_HEAD=25c2cd59e096718cc2ee9bd6e3b3591682b01acd
```

The prior blocker is resolved. Resume parity work using the exact W2 and W4 Wave-2 heads. Keep the deterministic state-machine model as an Oracle. Assemble a non-merged unified candidate under the W1 validation/candidate path and bind W2 report parsing, W4 per-target repeat runtime, W3 UI evidence harness, and W5 background/install tests through a manifest. Run START, six-worker batch, 20/90-minute branches, four-report-demand replacement, monotonic progress, pause/resume, END/reactivation, restart restore, dual report schema, per-target repeat state, and background/log regression. Do not merge worker PRs or overwrite the release source.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W1 | WAVE=V1-C-MODE-6W-WAVE-003 | COMMAND_ID=C6W-W3-W1-UNIFIED-CANDIDATE | STATUS=END
```

## AUTOMATION-C-W2 — Live Acceptance Ledger and Directive Discovery

```text
WORKER_PR=#60
COMMAND_ID=C6W-W3-W2-LIVE-LEDGER-DIRECTIVE-DISCOVERY
```

Use the actual Wave-2 comments from PR #59 through #64. Produce an acceptance ledger that records accepted, blocked, rejected, stale, duplicate, and missing reports with post IDs. Add a fail-closed directive-discovery contract and tests proving that a newer directive comment cannot be hidden by an older Terminal or by `NO_PENDING_DIRECTIVE`. Reproduce the W6 miss where directive `5189701057` existed before comment `5189877834`, and make the expected verdict `NEWER_DIRECTIVE_MISSED`. Keep C_RESULT and REPEAT_RESULT schemas separate and publish exact worker/commander templates for Wave 3.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W2 | WAVE=V1-C-MODE-6W-WAVE-003 | COMMAND_ID=C6W-W3-W2-LIVE-LEDGER-DIRECTIVE-DISCOVERY | STATUS=END
```

## AUTOMATION-C-W3 — UI Projection Integration

```text
WORKER_PR=#61
COMMAND_ID=C6W-W3-W3-UI-PROJECTION-INTEGRATION
```

Bind the UI truth model to W2 dual report states and W4 per-target repeat states through deterministic fixtures. Verify all-idle projection when C and command execution are disabled, and a mixed six-slot fixture containing C-active, command-active, awaiting-completion, error, END, and idle states. Counters must be derived only from current C/repeat/error state, never from legacy A/E profile status. Extend the target-PC evidence collector to validate the mixed fixture, screenshot hashes, counters, labels, and restart readback. Do not claim live PASS before target-PC execution.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W3 | WAVE=V1-C-MODE-6W-WAVE-003 | COMMAND_ID=C6W-W3-W3-UI-PROJECTION-INTEGRATION | STATUS=END
```

## AUTOMATION-C-W4 — Repeat Runtime Bridge and Arbitration

```text
WORKER_PR=#62
COMMAND_ID=C6W-W3-W4-REPEAT-BRIDGE-ARBITRATION
```

Connect the per-target repeat runtime to the actual command popup/bridge contract in a validation adapter. Prove target-specific dispatch IDs map to exactly one slot, C mode and repeat-command dispatch cannot cancel each other, only one active command exists per worker, paused or awaiting targets do not accumulate queue entries, END stops only the ended target, and restart restores counters/due times without duplicate dispatch. Consume the W2 REPEAT_RESULT parser contract and test mixed three-target completion order plus C/repeat contention.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W4 | WAVE=V1-C-MODE-6W-WAVE-003 | COMMAND_ID=C6W-W3-W4-REPEAT-BRIDGE-ARBITRATION | STATUS=END
```

## AUTOMATION-C-W5 — Target-PC Acceptance Bundle

```text
WORKER_PR=#63
COMMAND_ID=C6W-W3-W5-TARGET-PC-ACCEPTANCE-BUNDLE
```

Create one fail-closed target-PC acceptance bundle that accepts a candidate manifest and invokes the W3 UI evidence collector plus W5 install/background/rollback validation. Validate package SHA-256, exact version, temporary smoke profile, live profile preservation, work-control log preservation, hidden-browser release, 30-second/five-attempt behavior, rollback, restart, and exported evidence schema. Use the uploaded historical runtime log only as an error fixture for ERR_ABORTED/ERR_FAILED classification; do not treat old A/E dispatches as current C work. Current environment may produce package and offline tests only; live PASS requires Windows target-PC receipts.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W5 | WAVE=V1-C-MODE-6W-WAVE-003 | COMMAND_ID=C6W-W3-W5-TARGET-PC-ACCEPTANCE-BUNDLE | STATUS=END
```

## AUTOMATION-C-W6 — Mandatory Carryover Correction and Independent Audit

```text
WORKER_PR=#64
COMMAND_ID=C6W-W3-W6-CARRYOVER-INDEPENDENT-AUDIT
CARRYOVER_FROM_WAVE=V1-C-MODE-6W-WAVE-002
MISSED_DIRECTIVE_COMMENT=5189701057
INCORRECT_NO_PENDING_COMMENT=5189877834
```

First acknowledge that the Wave-2 directive was newer than the previous Terminal and was missed. Commit the Wave-1 exact-blocker report as JSON. Then perform the pending Wave-2 independent audit against exact heads W1=`ea26b91c273f4da208420b5901f067d70dbb0c87`, W2=`028faddc8c314361f6703c9cbbb27865ed009edd`, W3=`9f0d97291ab47592bd9e0136d8ca44723971f90e`, W4=`42e5ff1857754aeb366849448f671f5144694d7d`, and W5=`25c2cd59e096718cc2ee9bd6e3b3591682b01acd`. Independently inject malformed PANEL, role/wave/command/dispatch mismatches, stale, duplicate, order reversal, retry exhaustion, and restart-snapshot fixtures. Publish a provisional acceptance matrix and the directive-discovery miss as a blocking process finding. Implementation source modification remains prohibited. Target-PC and six-worker-three-round acceptance remain blocked until live receipts exist.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W6 | WAVE=V1-C-MODE-6W-WAVE-003 | COMMAND_ID=C6W-W3-W6-CARRYOVER-INDEPENDENT-AUDIT | STATUS=END
```

## Wave 3 acceptance

```text
VALID_CORRELATED_REPORTS=6_OF_6
UNIFIED_OFFLINE_CANDIDATE=PASS
DIRECTIVE_DISCOVERY_NEWER_COMMENT_TEST=PASS
UI_MIXED_STATE_PROJECTION=PASS
PER_TARGET_REPEAT_BRIDGE=PASS
TARGET_PC_BUNDLE_OFFLINE=PASS
INDEPENDENT_AUDIT=PASS_OR_EXACT_TARGET_PC_BLOCKER
DUPLICATE_DISPATCH_COUNT=0
PREVIOUS_COMMAND_CANCEL_COUNT=0
LOST_WORK_CONTROL_EVENT_COUNT=0
TARGET_PC_PASS=PENDING
```
