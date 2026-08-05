# C Mode Wave 10 Review and Wave 11 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
PREVIOUS_WAVE=V1-C-MODE-6W-WAVE-010
WAVE_ID=V1-C-MODE-6W-WAVE-011
REGISTRY_SEQUENCE=11
OWNER=V-1
MODE=SUBSTANTIVE_RUNTIME_PAYLOAD_CLOSURE
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
TARGET_VERSION=5.10.2.4.2-rc4
PRODUCTION=false
READY=false
MERGE=false
```

## 1. Wave 10 review

Valid correlated reports were received for all five Wave 10 registry rows. W3 remains a Wave 9 carryover and is not counted as a Wave 10 missing row.

```text
W1_RESULT_COMMENT=5194741515
W1_OUTCOME=PASS_METADATA_LOCK
W2_RESULT_COMMENT=5194721209
W2_OUTCOME=PASS
W4_RESULT_COMMENT=5194722039
W4_OUTCOME=BLOCKED_LOCAL_RAW_GITHUB_DNS
W5_RESULT_COMMENT=5194725335
W5_REPORTED_OUTCOME=PASS
W5_COMMANDER_ACCEPTANCE=REJECTED_SUBSTANTIVE_RUNTIME_PAYLOAD_NOT_PRESENT
W6_RESULT_COMMENT=5194713046
W6_OUTCOME=BLOCKED_AUDIT_PRECEDED_W5_RESULT
W3_CARRYOVER_RESULT_KEY=519440526200
W3_RESULT_COMMENT=MISSING
W3_REPORT_REQUEST_COUNT=2
```

## 2. Critical commander finding

The committed W5 Wave 10 byte exists and its byte hash readback is valid, but it is not an installable C-mode Runtime package.

```text
ARTIFACT_PATH=yolla-panel-v1/v1-existing-runtime-control/validation/v1-c-mode-six-worker/workers/w5/wave10/YOLLA_C_MODE_5.10.2.4.2-rc3_INSTALL_AND_BUILD.bat
ARTIFACT_COMMIT=5b44c83a78e2a653cf1b721d546d3f5b7b53b61d
ARTIFACT_SIZE=2652
ARTIFACT_SHA256=21587622092a36b16c054569ee97463cfc9458b945a26018c486f0f83f5c6447
BYTE_EXISTS=true
INSTALLABLE_RUNTIME_PROVEN=false
```

The BAT downloads four prior result JSON files and compresses those JSON files. It does not package or install the executable C state machine, Pointer Relay Registry parser, Result Watcher, UI bridge, Repeat-command Runtime, background dispatch, launcher, release directory, smoke test, or rollback implementation. Therefore:

```text
BYTE_EXISTS_IS_NOT_INSTALLABLE_RUNTIME=true
METADATA_ONLY_PAYLOAD_MUST_FAIL=true
W5_WAVE10_TECHNICAL_PASS_ACCEPTED=false
W1_WAVE10_LOCK_SUFFICIENT_FOR_RUNTIME_ASSEMBLY=false
```

This finding reopens the substantive Runtime payload gate without discarding prior tests, models, adapters, fixtures, or evidence.

## 3. Wave 11 worker assignments

### W1 — Substantive executable payload lock V4

Create one exact Source Lock containing executable Runtime bytes rather than result JSONs. Enumerate exact commit, path, blob SHA-1, SHA-256, size, component, install destination, and load order for at least these component classes:

```text
C_STATE_MACHINE
POINTER_RELAY_REGISTRY_PARSER
RESULT_KEY_WATCHER_AND_CARRYOVER
UI_TRUTH_AND_COMMANDER_RESULT_VIEW
REPEAT_COMMAND_RUNTIME_AND_C_REPEAT_BRIDGE
BACKGROUND_BROWSER_DISPATCH_AND_WORK_CONTROL_LOG
INSTALLER_LAUNCHER_SMOKE_ROLLBACK
```

Evidence/result/pointer JSON files may remain in the audit manifest but must not be counted as executable payload. Publish a W5-consumable fetch/assembly map. Fail closed if any component class has zero executable files.

### W2 — Artifact content gate and completion semantics

Implement a deterministic validator that distinguishes:

```text
BYTE_EXISTS
METADATA_ONLY_ARCHIVE
EXECUTABLE_SOURCE_PRESENT
INSTALL_ACTION_PRESENT
SMOKE_AND_ROLLBACK_PRESENT
INSTALLABLE_RUNTIME
TARGET_PC_ACCEPTED
```

The current W5 Wave 10 BAT must be a negative fixture and must fail `INSTALLABLE_RUNTIME`. Preserve the existing RESULT_KEY, partial-wave, carryover, pagination, retry, restart, and commander-output behavior. `OUTCOME=PASS` in a worker report must not override a failing artifact-content gate.

### W3 — Wave 9 carryover

No new Wave 11 command is assigned. Continue the existing Wave 9 Target-PC UI Acceptance Pack and publish a result or exact nonperformance/blocker reason with `RESULT_KEY=519440526200`. This is report request 2 of 4.

### W4 — Connector-byte preflight and three-round rerun

Remove dependency on `raw.githubusercontent.com` DNS. Use GitHub Connector/API byte readback or already committed immutable bytes. First prove that the W5 Wave 10 BAT fails because it packages only result JSONs. Then consume the corrected W5 Wave 11 package when published and run Portable Preflight plus the deterministic `6 workers × 3 rounds` fixture. Required counters remain zero:

```text
DUPLICATE
C_REPEAT_CROSS_CANCEL
END_REDISPATCH
RECEIPT_LOSS
QUEUE_GROWTH
```

### W5 — Actual installable Runtime payload rc4

W5 remains the single integration owner. Replace the metadata-only rc3 package with a real rc4 package that contains or embeds the exact executable Runtime payload from W1, not only report JSONs.

The package must:

```text
BASELINE=5.10.2.4.0
TARGET=5.10.2.4.2-rc4
CREATE_RELEASE_DIRECTORY=true
INSTALL_C_RUNTIME=true
INSTALL_POINTER_RELAY=true
INSTALL_RESULT_WATCHER=true
INSTALL_UI_TRUTH=true
INSTALL_REPEAT_RUNTIME=true
INSTALL_BACKGROUND_DISPATCH=true
INSTALL_WORK_CONTROL_LOG=true
RUN_ISOLATED_SMOKE_TEST=true
SWITCH_LAUNCHER_ONLY_AFTER_PASS=true
ROLLBACK_TO_BASELINE=true
PRESERVE_LOGIN_PROFILE=true
PRESERVE_RUNTIME_LOG=true
PRESERVE_WORK_CONTROL_JSONL=true
PRESERVE_DISPATCH_RECEIPTS=true
PRESERVE_C_AND_REPEAT_STATE=true
LEGACY_A_E_REINTRODUCTION_COUNT=0
```

Commit actual artifact bytes, manifest, installer, rollback, smoke runner, file list, size, SHA-256, and GitHub byte readback. Drive upload is desirable but not a substitute for GitHub byte closure. Target-PC execution remains a separate external gate.

### W6 — Independent substantive artifact audit

Do not modify implementation Source. Use the current W5 Wave 10 BAT as a required negative fixture and confirm that metadata-only payloads fail. Prepare and execute an independent audit against the W5 Wave 11 rc4 result when available, covering executable payload membership, exact hashes, installation effects, launcher switch, isolated smoke, rollback, state/log/profile preservation, A/E reintroduction zero, and failure fixtures. Keep Target-PC live acceptance separate and pending until actual receipts exist.

## 4. Registry and reporting

Five new Wave 11 rows will be registered for W1, W2, W4, W5, and W6. W3 remains the Wave 9 carryover. All five new rows must validate before any dispatch. The commander will derive each `RESULT_KEY` by appending ASCII `00` to the actual directive comment ID.

```text
CURRENT_PROGRESS=96
PROGRESS_INCREASE_WITHHELD_REASON=SUBSTANTIVE_RUNTIME_PAYLOAD_FALSE_POSITIVE_FOUND
LTS_TERMINAL_CLAIMED=false
```
