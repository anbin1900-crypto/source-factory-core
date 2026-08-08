# V1 C Mode Six-Worker Wave 2 Directive V3

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WAVE_ID=V1-C-MODE-6W-WAVE-002
COMMANDER=V-1
CURRENT_PROGRESS_PERCENT=60
DISPATCH_MODE=SIX_WORKER_PARALLEL
PRODUCTION=false
READY=false
MERGE=false
```

## Common rule

Read the Wave 1 result, the accepted worker heads, and the Wave 2 source supplement. Execute, correct, rerun, and commit a result JSON. Every terminal comment must end with the exact correlated PANEL line assigned below. Do not claim Target-PC PASS without actual evidence.

## AUTOMATION-C-W1 — Full-runtime parity and integration candidate

Treat PR #59's state machine as a deterministic oracle, not as a direct replacement for the full 5.10.2.4.1 runtime. Compare it with the supplied 54 KB runtime and create model-versus-release parity tests for START, six-worker batch, 20/90-minute branches, four report demands, progress, pause/resume, END and restart. Import W2 and W4 accepted modules only into an integration candidate/test branch, record semantic divergences, and publish an integration-ready manifest.

```text
PANEL | ROLE=AUTOMATION-C-W1 | WAVE=V1-C-MODE-6W-WAVE-002 | COMMAND_ID=C6W-W2-W1-PARITY-INTEGRATION | STATUS={REPORTED|END}
```

## AUTOMATION-C-W2 — Dual report schema and real-comment compliance

Define and implement two explicit schemas: C result = ROLE+WAVE+COMMAND_ID+STATUS; repeat result = ROLE+COMMAND_ID+DISPATCH_ID+STATUS. Validate the actual Wave 1 comments from PRs #59-#64, publish a compliance matrix, reject malformed/stale/duplicate results, and provide exact worker/commander output templates. Legacy compatibility may be read-only and cycle-scoped; new Wave 2 reports must be strict.

```text
PANEL | ROLE=AUTOMATION-C-W2 | WAVE=V1-C-MODE-6W-WAVE-002 | COMMAND_ID=C6W-W2-W2-DUAL-REPORT-SCHEMA | STATUS={REPORTED|END}
```

## AUTOMATION-C-W3 — Deterministic UI harness and Target-PC evidence collector

Keep the current offline UI PASS. Add a deterministic DOM/render harness proving idle=0, group C button, top command popup, separate C/command/error counters and labels. Build a Target-PC evidence collector and evidence schema that captures version, screenshot, runtime status, C state, repeat state and restart before/after. Do not claim live visual PASS until the collector is actually run.

```text
PANEL | ROLE=AUTOMATION-C-W3 | WAVE=V1-C-MODE-6W-WAVE-002 | COMMAND_ID=C6W-W2-W3-UI-EVIDENCE-HARNESS | STATUS={REPORTED|END}
```

## AUTOMATION-C-W4 — Per-target repeat-command independence

Refactor the repeat runtime from command-global awaiting state to independent per-target slot state. One slow or END slot must not stop or complete another slot. Implement automatic AFTER_COMPLETION redispatch per accepted target result, X-minute skip without queue growth, per-target counters, per-target END, persistence and restart recovery. Consume W2's repeat-result schema and test at least three targets with mixed completion timing.

```text
PANEL | ROLE=AUTOMATION-C-W4 | WAVE=V1-C-MODE-6W-WAVE-002 | COMMAND_ID=C6W-W2-W4-PER-TARGET-REPEAT | STATUS={REPORTED|END}
```

## AUTOMATION-C-W5 — Unblocked background/install/log executable validation

The prior missing-source blocker is resolved by the Wave 2 supplement. The background browser and dispatch implementation is embedded in `baseline-v510241/src/apply_c_mode_patch.cjs`; do not require a nonexistent standalone file. Validate exactly-once, 30-second/5-attempt fail-closed behavior, hidden-browser creation/release, profile preservation, runtime/work-control log preservation, installer smoke, rollback and restart. Build executable G6 tests and a Target-PC execution script. Keep live PASS blocked until target execution.

```text
PANEL | ROLE=AUTOMATION-C-W5 | WAVE=V1-C-MODE-6W-WAVE-002 | COMMAND_ID=C6W-W2-W5-BACKGROUND-INSTALL-LOG | STATUS={REPORTED|END}
```

## AUTOMATION-C-W6 — Commit evidence, offline failure injection, independent Wave 2 audit

First commit the Wave 1 blocker report JSON that was only posted as a comment. Then execute all failure injections possible offline against the accepted W1/W2/W4 candidates: malformed PANEL, role/wave/command/dispatch mismatch, stale, duplicate, out-of-order, retry exhaustion and restart snapshot. After W1-W5 Wave 2 heads are available, audit them independently and publish provisional acceptance. Target-PC and six-worker-three-round remain blocked until actual receipts exist. Do not modify implementation source.

```text
PANEL | ROLE=AUTOMATION-C-W6 | WAVE=V1-C-MODE-6W-WAVE-002 | COMMAND_ID=C6W-W2-W6-INDEPENDENT-AUDIT | STATUS={REPORTED|END}
```

## Wave 2 exit gate

```text
W1_TO_W5_COMMITTED_RESULTS=5_OF_5
W6_COMMITTED_INDEPENDENT_RESULT=1_OF_1
REPORT_SCHEMA_COMPLIANCE=6_OF_6
OFFLINE_INTEGRATION=PASS
TARGET_PC_PASS=NOT_REQUIRED_FOR_WAVE2_EXIT_BUT_MUST_REMAIN_EXPLICITLY_PENDING
AUTO_TEST_WRITE_COUNT=0
```
