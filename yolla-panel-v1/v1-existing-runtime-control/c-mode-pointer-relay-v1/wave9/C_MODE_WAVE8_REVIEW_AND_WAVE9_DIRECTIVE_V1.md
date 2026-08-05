# V-1 C Mode Wave 8 Review and Wave 9 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
PREVIOUS_WAVE=V1-C-MODE-6W-WAVE-008
CURRENT_WAVE=V1-C-MODE-6W-WAVE-009
REGISTRY_SEQUENCE=9
OWNER=V-1
REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=17
TARGET_VERSION=5.10.2.4.2-rc3
CURRENT_PROGRESS=95
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
PRODUCTION=false
READY=false
MERGE=false
```

## 1. Wave 8 Review

Wave 8 has six valid correlated result comments and no missing or duplicate result.

```text
W1|PR=59|DIRECTIVE=5193852309|RESULT_KEY=519385230900|RESULT_COMMENT=5194273797|HEAD=ac15ba87733445d0006953c060e73e488ab49913|OUTCOME=PASS
W2|PR=60|DIRECTIVE=5193857083|RESULT_KEY=519385708300|RESULT_COMMENT=5193959441|HEAD=d1e12289eb25282601894946f902238306c7b677|OUTCOME=PASS
W3|PR=61|DIRECTIVE=5193862391|RESULT_KEY=519386239100|RESULT_COMMENT=5194248288|HEAD=3b3f8c792e9eaba9aa495e3e229d3c6019b149db|OUTCOME=PASS_OFFLINE_TARGET_PC_PENDING
W4|PR=62|DIRECTIVE=5193866450|RESULT_KEY=519386645000|RESULT_COMMENT=5194272466|HEAD=c104760dc53e8ba07c509b8ef5a472f38bd1d9b3|OUTCOME=PASS
W5|PR=63|DIRECTIVE=5193871227|RESULT_KEY=519387122700|RESULT_COMMENT=5193944215|HEAD=d3881f439bb393498c69b53d4c5558d4e9869420|OUTCOME=BLOCKED_SOURCE_ZIP_DRIVE_TARGET_PC_PENDING
W6|PR=64|DIRECTIVE=5193876277|RESULT_KEY=519387627700|RESULT_COMMENT=5193935894|HEAD=3b384eca85f1f2bed6b9fd039ab8d3c76cc1f165|OUTCOME=BLOCKED_W5_RESULT_NOT_AVAILABLE_AT_AUDIT_TIME_TARGET_PC_PENDING

REPORTED=6
MISSING=0
DUPLICATE_RESULT=0
REPLACEMENT_REQUIRED=0
```

W5 and W6 BLOCKED outcomes are valid reports, not missing reports. W5 completed the payload lock, installer, rollback and acceptance script skeletons but did not produce immutable package bytes, Drive readback or Windows receipts. W6 completed the independent matrix before the W5 result was available; that timing blocker is now released, while target-PC gates remain pending.

## 2. Wave 9 Objective

```text
OBJECTIVE=RC3_IMMUTABLE_BYTE_ARTIFACT_AND_TARGET_PC_ACCEPTANCE_PREPARATION
DISPATCH_MODE=CYCLE_BATCH_PARALLEL
ALL_ROWS_VALID_BEFORE_ANY_DISPATCH=true
PARTIAL_DISPATCH=false
SAME_WAVE_MULTIPLE_READY=FAIL_CLOSED
HIGHEST_VALID_REGISTRY_SEQUENCE_WINS=true
```

Wave 9 does not replace the six-worker validation system. It advances the same system from offline implementation convergence to immutable package construction and target-PC acceptance preparation.

## 3. Worker Assignments

### W1 — RC3 Exact Release Input Lock V2

Lock the current Wave 8 W1-W4 heads, result comments, file paths, blobs and SHA-256 values. Verify cross-head path collisions and contract compatibility. Publish one W5-consumable immutable release-input manifest. Reuse existing parsers; do not rewrite completed logic.

### W2 — Wave 8 Result Collection and Commander Next-Wave Trigger

Collect the six actual Wave 8 results and generate `C_MODE_WAVE_RESULT_V1` with `REPORTED=6`, `MISSING=0`, `DUPLICATE=0`. Bind the exact commander output that lists each `RESULT_COMMENT` and ends with the instruction to review results and publish the next wave. Verify that PASS, BLOCKED, FAIL and NO_WORK are all reported outcomes while only absence is MISSING.

### W3 — Target-PC UI Acceptance Pack

Freeze the actual Candidate UI bridge and build a target-PC evidence pack covering idle truth, C execution, command execution, current/historical registry results, pending, missing, duplicate, error, END and idle. Include screenshot hashes, restart readback and expected counters. Export exact files for W5.

### W4 — Target-PC C/Repeat Soak and Restart Pack

Convert the verified actual bridge soak into a one-click target-PC runner. Preserve namespace separation, exactly-once receipts, restart recovery and zero counters for duplicate, cross-cancel, END redispatch, receipt loss and queue growth. Export exact files for W5; do not repeat already-passed source implementation work.

### W5 — RC3 Immutable Byte Artifact and Installer

W5 remains the single integration owner. Consume the exact Wave 8 heads and Wave 9 W1-W4 exports. Produce the actual rc3 runtime candidate, installable single-entry package, source ZIP, payload manifest, rollback and one-click target-PC acceptance runner. Preserve login profile, runtime log, work-control JSONL, dispatch receipts and C/repeat state; A/E reintroduction count must remain zero.

Use alternative package methods rather than repeating the same blocker: repository archive assembly, deterministic local packer, or a self-extracting verified payload. Publish file names, sizes, SHA-256 and byte readback. Upload to Drive when available. Windows target-PC PASS is forbidden until real receipts exist.

### W6 — Independent Artifact Audit and Target-PC Gate

Do not modify implementation source. Recheck the six Wave 8 correlations, consume the W5 Wave 9 artifact result when posted, independently verify package hashes, manifests, installer/rollback contracts, log/profile preservation and A/E reintroduction zero. Prepare the exact target-PC acceptance matrix. Keep target-PC, 6 workers x 3 waves, restart resume and log-loss-zero pending until real receipts exist.

## 4. Result Contract

Each worker must post exactly one result under the assigned Result Key.

```text
C_RESULT|RESULT_KEY={RESULT_KEY}|ROLE={ROLE}|OUTCOME={PASS|FAIL|BLOCKED|NO_WORK}|STATUS=END|RESULT_COMMIT={40_HEX_OR_NONE}
```

The panel treats exactly one matching comment as REPORTED, zero as MISSING and two or more as DUPLICATE_RESULT. Result content is reviewed by the commander; the panel only correlates and collects.

## 5. Remaining Final Gates

```text
RC3_IMMUTABLE_PACKAGE=REQUIRED
PACKAGE_SHA256_READBACK=REQUIRED
TARGET_PC_INSTALL=REQUIRED
TARGET_PC_UI_TRUTH=REQUIRED
TARGET_PC_6_WORKERS_3_WAVES=REQUIRED
RESTART_RESUME=REQUIRED
LOG_LOSS_ZERO=REQUIRED
LOGIN_PROFILE_PRESERVED=REQUIRED
A_E_REINTRODUCTION_COUNT=0
LTS_TERMINAL=NOT_YET_ALLOWED
```
