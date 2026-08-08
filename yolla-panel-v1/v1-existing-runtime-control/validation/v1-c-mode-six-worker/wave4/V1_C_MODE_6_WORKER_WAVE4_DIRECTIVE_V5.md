# V1 C Mode Six-Worker Wave 4 Directive V5

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WAVE_ID=V1-C-MODE-6W-WAVE-004
COMMANDER=V-1
DISPATCH_MODE=SIX_WORKER_PARALLEL
CURRENT_PROGRESS=82%
PRODUCTION=false
READY=false
MERGE=false
AUTO_TEST_WRITE_COUNT=0
```

## Common report rule

A task is not complete until both a committed result and a correlated GitHub Terminal comment exist. A Commit without a Terminal comment is `REPORT_MISSING`. Each worker shall inspect every comment newer than its previous Terminal before claiming `NO_PENDING_DIRECTIVE`.

```text
C_RESULT=PANEL | ROLE={ROLE} | WAVE=V1-C-MODE-6W-WAVE-004 | COMMAND_ID={COMMAND_ID} | STATUS=END
```

A failure, blocker, partial result, or non-execution reason must also be committed and posted. Target-PC PASS and LTS PASS remain prohibited without live receipts.

## AUTOMATION-C-W1 — Connector-byte unified offline candidate

```text
WORKER_PR=#59
COMMAND_ID=C6W-W4-W1-CONNECTOR-BYTE-UNIFIED-OFFLINE
INPUT_W2_HEAD=e7fa30621f6d99d28f9c63e25833da6fc1e12619
INPUT_W3_HEAD=e08dbab7b050f8fb350c0f435f40807fa7fb3af3
INPUT_W4_HEAD=0a6d7fa97166f4991edda3b3c62cd33b1e8642d6
INPUT_W5_HEAD=2000195cb9a73628a6f27261b481f760e05d42a4
```

Do not use `git clone`, `git fetch`, or DNS-dependent repository checkout. Reconstruct a temporary workspace from exact GitHub connector file bytes and the existing immutable source supplement. Bind the exact heads above, retain the state-machine model as Oracle, and run all available Node regressions for state machine, GitHub correlation, dual schema, directive discovery, UI projection, per-target repeat, bridge arbitration, background/log, and target-PC bundle. Commit the reconstructed byte manifest, every executed command, exit code, assertion count, and a unified offline candidate result. Do not modify release source or merge worker PRs.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W1 | WAVE=V1-C-MODE-6W-WAVE-004 | COMMAND_ID=C6W-W4-W1-CONNECTOR-BYTE-UNIFIED-OFFLINE | STATUS=END
```

## AUTOMATION-C-W2 — Missing Terminal repair and report-completeness gate

```text
WORKER_PR=#60
COMMAND_ID=C6W-W4-W2-REPORT-COMPLETENESS-GATE
MISSING_WAVE3_RESULT_COMMIT=e7fa30621f6d99d28f9c63e25833da6fc1e12619
MISSING_WAVE3_COMMAND=C6W-W3-W2-LIVE-LEDGER-DIRECTIVE-DISCOVERY
```

First publish the missing Wave-3 correlated Terminal for the exact result Commit above. Then implement and test a fail-closed completeness gate:

```text
RESULT_COMMIT_PRESENT + TERMINAL_COMMENT_ABSENT = REPORT_MISSING
TERMINAL_COMMENT_PRESENT + RESULT_COMMIT_ABSENT = REPORT_INCOMPLETE
EXACT_RESULT_COMMIT + EXACT_CORRELATED_TERMINAL = REPORTED
```

Use the actual W2 and W6 Wave-3 cases as fixtures. Track result post ID, result Commit, directive post ID, Terminal post ID, latest comment order, and consecutive missing-report count. Prove an older Terminal or `NO_PENDING_DIRECTIVE` cannot hide a newer directive. Publish the canonical worker and commander output templates consumed by the panel.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W2 | WAVE=V1-C-MODE-6W-WAVE-004 | COMMAND_ID=C6W-W4-W2-REPORT-COMPLETENESS-GATE | STATUS=END
```

## AUTOMATION-C-W3 — Report-truth UI projection

```text
WORKER_PR=#61
COMMAND_ID=C6W-W4-W3-REPORT-TRUTH-UI-PROJECTION
```

Bind the UI projection to W2 report-completeness states. A worker with a result Commit but no correlated Terminal must display `보고 누락`, not `완료`, `작업 중`, or `오류`. Build deterministic fixtures for:

```text
REPORTED_PASS
REPORTED_BLOCKED
RESULT_COMMITTED_REPORT_MISSING
DIRECTIVE_PENDING
C_ACTIVE
REPEAT_ACTIVE
AWAITING_COMPLETION
END
IDLE
```

Verify all counters are derived only from current C/repeat/report state and never from legacy A/E status. Extend the target-PC collector to capture report-completeness counters, labels, post IDs, Commit IDs, screenshot hashes, and restart readback. Do not claim live PASS before target-PC execution.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W3 | WAVE=V1-C-MODE-6W-WAVE-004 | COMMAND_ID=C6W-W4-W3-REPORT-TRUTH-UI-PROJECTION | STATUS=END
```

## AUTOMATION-C-W4 — Six-slot repeat-command soak and contention

```text
WORKER_PR=#62
COMMAND_ID=C6W-W4-W4-SIX-SLOT-REPEAT-SOAK
```

Run a deterministic virtual-time soak with six slots and at least 100 trigger cycles combining `EVERY_X_MINUTES`, `AFTER_COMPLETION`, pause/resume, partial END, out-of-order results, restart restore, and simultaneous C-mode work. Verify:

```text
DUPLICATE_REPEAT_DISPATCH_COUNT=0
PREVIOUS_C_COMMAND_CANCEL_COUNT=0
C_QUEUE_CANCELLED_BY_REPEAT=0
REPEAT_QUEUE_CANCELLED_BY_C=0
ENDED_TARGET_REDISPATCH_COUNT=0
LOST_REPEAT_RECEIPT_COUNT=0
QUEUE_GROWTH_WHILE_AWAITING=0
```

Consume W2 `REPEAT_RESULT` correlation and produce a machine-readable soak ledger, restart snapshots, and final counters.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W4 | WAVE=V1-C-MODE-6W-WAVE-004 | COMMAND_ID=C6W-W4-W4-SIX-SLOT-REPEAT-SOAK | STATUS=END
```

## AUTOMATION-C-W5 — One-click target-PC acceptance package

```text
WORKER_PR=#63
COMMAND_ID=C6W-W4-W5-ONE-CLICK-TARGET-PC-PACKAGE
```

Build one fail-closed Windows target-PC package that accepts the W1 unified candidate manifest and invokes the W2 report gate, W3 UI collector, W4 soak validator, install/smoke/rollback/restart checks, and six-worker three-round evidence collection. It must preserve the live login profile and work-control log, use a temporary smoke profile, validate exact version and SHA-256, and emit one immutable evidence directory plus a final JSON receipt. Historical Runtime log entries are error fixtures only and must not count as current C work. Run package-level offline tests; live PASS requires actual Windows receipts.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W5 | WAVE=V1-C-MODE-6W-WAVE-004 | COMMAND_ID=C6W-W4-W5-ONE-CLICK-TARGET-PC-PACKAGE | STATUS=END
```

## AUTOMATION-C-W6 — Missing Terminal repair and independent Wave-4 audit

```text
WORKER_PR=#64
COMMAND_ID=C6W-W4-W6-INDEPENDENT-CLOSURE-AUDIT
MISSING_WAVE3_RESULT_COMMIT=4860202c2bde55d425cf7d48452d3cb473a602c5
MISSING_WAVE3_COMMAND=C6W-W3-W6-CARRYOVER-INDEPENDENT-AUDIT
CONSECUTIVE_MISSING_REPORT_COUNT=2
```

First publish the missing Wave-3 correlated Terminal for the exact result Commit above and acknowledge the two consecutive report-publication failures. Then independently audit the Wave-4 report-completeness gate and all available W1-W5 outputs. Verify that Commit-only results remain `REPORT_MISSING`, directive ordering is monotonic, no-pending claims are fail-closed, and all Terminal comments bind exact result Commits. Re-run independent malformed/stale/duplicate/order-reversal/retry-exhaustion/restart fixtures without modifying implementation source. Target-PC and six-worker-three-round acceptance remain exact blockers until live receipts exist.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W6 | WAVE=V1-C-MODE-6W-WAVE-004 | COMMAND_ID=C6W-W4-W6-INDEPENDENT-CLOSURE-AUDIT | STATUS=END
```

## Wave 4 acceptance

```text
VALID_CORRELATED_REPORTS=6_OF_6
W2_W6_MISSING_WAVE3_TERMINALS_REPAIRED=true
REPORT_COMPLETENESS_GATE=PASS
UNIFIED_OFFLINE_CANDIDATE=PASS_OR_EXACT_BLOCKER
REPORT_TRUTH_UI_PROJECTION=PASS
SIX_SLOT_REPEAT_SOAK=PASS
TARGET_PC_ONE_CLICK_PACKAGE=PASS_OFFLINE
INDEPENDENT_AUDIT=PASS_OR_EXACT_TARGET_PC_BLOCKER
DUPLICATE_DISPATCH_COUNT=0
PREVIOUS_COMMAND_CANCEL_COUNT=0
LOST_WORK_CONTROL_EVENT_COUNT=0
TARGET_PC_PASS=PENDING
```
