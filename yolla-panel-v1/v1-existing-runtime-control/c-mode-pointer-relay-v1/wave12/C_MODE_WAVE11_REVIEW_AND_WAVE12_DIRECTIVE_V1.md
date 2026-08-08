# C Mode Wave 11 Review and Wave 12 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
PREVIOUS_WAVE=V1-C-MODE-6W-WAVE-011
WAVE_ID=V1-C-MODE-6W-WAVE-012
REGISTRY_SEQUENCE=12
OWNER=V-1
MODE=EXECUTABLE_SOURCE_GAP_CLOSURE_AND_REAL_RC4_BUILD
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
TARGET_VERSION=5.10.2.4.2-rc4
PRODUCTION=false
READY=false
MERGE=false
```

## 1. Wave 11 review

All five Wave 11 registry rows and the W3 Wave 9 carryover produced valid correlated reports.

```text
W1_RESULT_COMMENT=5194951700
W1_OUTCOME=BLOCKED_EXECUTABLE_SOURCE_CLASSES_MISSING
W2_RESULT_COMMENT=5194934304
W2_OUTCOME=PASS_ARTIFACT_CONTENT_GATE
W3_RESULT_COMMENT=5194984232
W3_OUTCOME=PASS_OFFLINE_TARGET_PC_PENDING
W4_RESULT_COMMENT=5194957912
W4_OUTCOME=BLOCKED_WAITING_CORRECTED_RC4_PACKAGE
W5_RESULT_COMMENT=5194936814
W5_OUTCOME=BLOCKED_EXECUTABLE_SOURCE_CLASSES_MISSING
W6_RESULT_COMMENT=5194921717
W6_OUTCOME=BLOCKED_WAITING_CORRECTED_RC4_PACKAGE
VALID_CORRELATED_REPORTS=6
MISSING_REPORTS=0
DUPLICATE_RESULTS=0
REPLACEMENT_REQUIRED=0
```

W3 carryover is closed and its consecutive missing-report counter is reset to zero.

## 2. Exact remaining implementation gap

Wave 11 correctly rejected the metadata-only Wave 10 artifact. The remaining source gap is now exact:

```text
MISSING_CLASS_1=BACKGROUND_BROWSER_DISPATCH_AND_WORK_CONTROL_LOG
MISSING_CLASS_2=INSTALLER_LAUNCHER_SMOKE_ROLLBACK
MISSING_EXECUTABLE_1=BACKGROUND_DISPATCH_OR_EQUIVALENT_RUNTIME_SOURCE
MISSING_EXECUTABLE_2=WORK_CONTROL_LOG_RUNTIME_SOURCE
MISSING_EXECUTABLE_3=ROLLBACK_RUNTIME_SOURCE
```

The next cycle must close these implementation gaps and build a real installable Runtime. It must not stop merely because a canonical source file is absent. Assignment includes execution authority; W5 is the single implementation and integration owner and must create or adapt the missing implementation, test it, fix failures, retry, and package the result. W1, W2, W3, W4, and W6 are parallel support and validation owners and do not block W5 execution.

## 3. Wave 12 worker assignments

### W1 — Executable source inventory and lock V5

Read all current worker heads and the existing Runtime baseline. Produce one exact source inventory and lock for every required component class. Distinguish executable files from reports, receipts, schemas, fixtures, and pointers. For the three missing executable classes, identify the closest reusable implementation or publish an exact gap contract for W5. Do not edit W5 integration files. The lock must contain exact commit, path, blob SHA-1, SHA-256, size, component class, install destination, load order, and whether the file is executable, validator-only, or evidence-only.

PASS requires every component class to have at least one executable payload member or an explicit `IMPLEMENT_BY_W5` gap record with required interface and tests.

### W2 — Runtime technical acceptance gate

Promote the Wave 11 artifact-content validator into the actual Result Watcher and Commander Builder path. Worker-reported `OUTCOME=PASS` must remain a report state, while technical acceptance is calculated independently.

Required output states:

```text
REPORTED
TECHNICALLY_ACCEPTED
METADATA_ONLY_REJECTED
EXECUTABLE_SOURCE_MISSING
INSTALL_ACTION_MISSING
SMOKE_OR_ROLLBACK_MISSING
INSTALLABLE_RUNTIME
TARGET_PC_PENDING
TARGET_PC_ACCEPTED
```

Use Wave 10 as the negative fixture and the Wave 12 W5 artifact as the positive candidate. Preserve RESULT_KEY, carryover, pagination, retry, restart, duplicate fail-closed, and commander result-comment output.

### W3 — UI executable payload and evidence integration

Reuse the completed Wave 9 UI Acceptance Pack. Lock the exact UI/bridge/CSS executable members that must be included in the rc4 release, provide installation destinations and smoke assertions, and produce a package-membership validator. The validator must prove:

```text
C_AND_REPEAT_DISABLED_WORKING_COUNT=0
LEGACY_A_E_EXCLUDED=true
RESULT_COMMENT_PRIORITY=true
CURRENT_AND_HISTORICAL_REGISTRY_SEPARATED=true
MISSING_DUPLICATE_ERROR_END_RESTING_SEPARATED=true
```

Prepare the target-PC evidence collector and schema for inclusion in W5's package. Offline PASS is allowed; live UI PASS remains pending until actual target-PC execution.

### W4 — Connector-byte preflight and deterministic acceptance rerun

Use GitHub Connector/API byte readback or committed immutable bytes; do not depend on `raw.githubusercontent.com` DNS. Keep the Wave 10 metadata-only package as a required negative fixture. When the W5 Wave 12 rc4 artifact is posted, read back its exact bytes and run:

```text
ARTIFACT_CONTENT_GATE
PORTABLE_PREFLIGHT
6_WORKERS_X_3_ROUNDS
RESTART_RESUME_FIXTURE
C_REPEAT_NAMESPACE_NONINTERFERENCE
EXACTLY_ONCE_RECEIPT
```

Required counters remain zero:

```text
DUPLICATE
C_REPEAT_CROSS_CANCEL
END_REDISPATCH
RECEIPT_LOSS
QUEUE_GROWTH
```

Do not end early solely because the W5 result is not yet available. Complete all independent preparation, then re-read the W5 result and execute the dependent checks in the same assignment.

### W5 — One-owner executable gap closure and real rc4 build

W5 remains the single End-to-End implementation and integration owner. Do not wait for W1 to finish. Inspect the current Runtime and worker source, then directly implement or adapt the missing executable components:

```text
BACKGROUND_BROWSER_DISPATCH
WORK_CONTROL_EVENT_LOGGING
ROLLBACK_RUNTIME
LAUNCHER_SWITCH_AFTER_SMOKE
```

The rc4 package must contain the actual executable C-mode Runtime, Pointer Relay parser, Result Watcher, UI bridge/CSS, Repeat-command Runtime, background dispatch, work-control logging, installer, isolated smoke runner, launcher switch, and rollback implementation. Reports, results, pointers, manifests, schemas, and fixtures may be included as evidence but cannot substitute for executable payload.

Required behavior:

```text
BASELINE=5.10.2.4.0
TARGET=5.10.2.4.2-rc4
CREATE_RELEASE_DIRECTORY=true
INSTALL_EXECUTABLE_RUNTIME=true
RUN_ISOLATED_SMOKE=true
SWITCH_LAUNCHER_ONLY_AFTER_SMOKE_PASS=true
ROLLBACK_ON_FAILURE=true
PRESERVE_LOGIN_PROFILE=true
PRESERVE_RUNTIME_LOG=true
PRESERVE_WORK_CONTROL_JSONL=true
PRESERVE_DISPATCH_RECEIPTS=true
PRESERVE_C_AND_REPEAT_STATE=true
LEGACY_A_E_REINTRODUCTION_COUNT=0
```

Commit actual artifact bytes, full file manifest, installer, smoke runner, launcher update, rollback, negative and positive tests, file size, SHA-256, blob SHA-1, and GitHub byte readback. Retry until PASS or a proven external blocker. Missing preexisting source is not an external blocker.

### W6 — Non-blocking independent substantive audit

Do not modify implementation source and do not block W5. Preserve the Wave 10 metadata-only package as a negative fixture. Prepare all failure fixtures immediately. After the W5 Wave 12 result appears, re-read it and audit the exact bytes, executable membership, hashes, install effects, smoke, launcher switch, rollback, state/log/profile preservation, and A/E reintroduction zero.

Required negative fixtures:

```text
WRONG_HASH
METADATA_ONLY_PAYLOAD
TRUNCATED_PAYLOAD
STALE_HEAD
MISSING_BACKGROUND_DISPATCH
MISSING_WORK_CONTROL_LOG
MISSING_ROLLBACK
DUPLICATE_REGISTRY
PARTIAL_DISPATCH
```

Offline artifact acceptance and target-PC live acceptance remain separate. Target-PC PASS requires actual external receipts.

## 4. Registry and acceptance

All six Wave 12 directives are independent and are published in one Cycle Batch. All six rows must validate before dispatch. Each `RESULT_KEY` is the directive-comment decimal string plus ASCII `00`.

```text
CURRENT_PROGRESS=96
PROGRESS_INCREASE_WITHHELD_REASON=REAL_INSTALLABLE_RUNTIME_NOT_YET_BUILT
TARGET_PC_PASS=PENDING
LTS_TERMINAL_CLAIMED=false
```
