# C Mode Wave 13 Review and Wave 14 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
PREVIOUS_WAVE=V1-C-MODE-6W-WAVE-013
WAVE_ID=V1-C-MODE-6W-WAVE-014
REGISTRY_SEQUENCE=14
OWNER=V-1
MODE=AUTHORITATIVE_ROOT_EXACT_SOURCE_OVERLAY_CANDIDATE
BASELINE_VERSION=5.10.2.4.0
TARGET_VERSION=5.10.2.4.2-rc6
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
PRODUCTION=false
READY=false
MERGE=false
```

## 1. Wave 13 result collection

```text
W1_RESULT_COMMENT=5196402486
W1_RESULT_COMMIT=c40901d086faca60ad16cac3e95cabcdbe2babb5
W1_REPORTED_OUTCOME=PASS
W1_COMMANDER_ACCEPTANCE=REJECTED_AUTHORITY_PATH_AND_VERSION_MISMATCH

W2_RESULT_COMMENT=5196298739
W2_RESULT_COMMIT=549b61ba219be9ad616f23087c7676586f969ddb
W2_SCOPE_ACCEPTANCE=PASS_NEGATIVE_GATE

W3_RESULT_COMMENT=5196320722
W3_RESULT_COMMIT=aac4180efae651930f98d842e73bb047ecd5726e
W3_REPORTED_OUTCOME=BLOCKED_W1_MAP_PENDING
W3_DEPENDENCY_STATE=SUPERSEDED_BY_LATE_W1_RESULT_BUT_W1_RESULT_IS_NOT_AUTHORITY_CORRECT

W4_RESULT_COMMENT=5196270579
W4_RESULT_COMMIT=7c70c49cdde1c7295ce4a4cf9bd6463c99d7591e
W4_REPORTED_OUTCOME=BLOCKED_W5_PACKAGE_PENDING
W4_DEPENDENCY_STATE=SUPERSEDED_BY_LATE_W5_RESULT_REQUIRES_REVALIDATION

W5_RESULT_COMMENT=5196292106
W5_RESULT_COMMIT=e9d690ea71092924aec58ed32eeb47c1fa6f7d1c
W5_REPORTED_OUTCOME=PASS
W5_COMMANDER_ACCEPTANCE=REJECTED_STUB_PAYLOAD_AND_AUTHORITY_BINDING_FAILURE

W6_RESULT_COMMENT=MISSING
W6_RESULT_KEY=519606842800
W6_REPORT_REQUEST_COUNT=1
W6_REPLACEMENT_THRESHOLD=4
```

```text
WAVE13_REPORTED=5
WAVE13_MISSING=1
WAVE13_DUPLICATE_RESULT=0
WAVE13_TECHNICALLY_ACCEPTED_AS_COMPLETE=0
```

## 2. Exact authority

The existing Runtime authority remains:

```text
STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2
RELEASE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-panel\releases
BROWSER_PROFILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
WORKER_PARTITION=persist:sf4-safe-panel-worker-1
ANALYSIS_PARTITION=persist:yolla-analysis-browser-v1
LAUNCHER=E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat
```

Authority source:

```text
yolla-panel-v1/a0-successor-control/handoffs/v1-existing-runtime/A0_TO_V1_EXISTING_YOLLA_RUNTIME_HANDOFF_V2.json
COMMIT=1070b2ee3329ac5ec08020e2c2e2a9377767f888
```

Observed live state locations include:

```text
RUNTIME_LOG=%STATE_ROOT%\runtime.log
C_MODE_STATE=%STATE_ROOT%\automation-c-v1\C_MODE_STATE.json
REPEAT_COMMANDS=%STATE_ROOT%\automation-c-v1\REPEAT_COMMANDS.json
WORK_CONTROL_LOG=%STATE_ROOT%\automation-c-v1\work_control_events.jsonl
```

No worker may replace these with invented `%LOCALAPPDATA%`, `.yolla\state`, `.yolla\profiles`, `.yolla\logs`, or new unapproved partitions.

## 3. Commander findings

### 3.1 W1 Wave 13 authority mismatch

W1 published target `5.10.2.4.2-rc4` under a Wave whose target was rc5 and substituted the following non-authoritative layout:

```text
RELEASE_ROOT=E:\SOURCE FACTORY\.yolla\releases\...
STATE_ROOT=E:\SOURCE FACTORY\.yolla\state
PROFILE_ROOT=E:\SOURCE FACTORY\.yolla\profiles
LAUNCHER_POINTER=E:\SOURCE FACTORY\.yolla\launcher.json
PARTITION_C=persist:yolla-v510241-c
PARTITION_REPEAT=persist:yolla-v510241-repeat
```

This layout is not accepted as existing Runtime authority.

### 3.2 W5 Wave 13 stub payload substitution

The self-contained rc5 installer has valid GitHub bytes but embeds twelve tiny substitute implementations instead of the exact locked Runtime source bytes. Examples:

```text
EMBEDDED c_mode_runtime.cjs=142 bytes
LOCKED c_mode_runtime.cjs=5081 bytes

EMBEDDED c_mode_wave_pointer.cjs=170 bytes
LOCKED c_mode_wave_pointer.cjs=3518 bytes

EMBEDDED runtime_result_adapter.cjs=206 bytes
LOCKED runtime_result_adapter.cjs=2605 bytes

EMBEDDED repeat_command_runtime.cjs=203 bytes
LOCKED repeat_command_runtime.cjs=9094 bytes
```

Required exact executable members are 17; the installer reports only 12 embedded members. It omits at least the registry authority Runtime, repeat release adapter, C/repeat namespace adapter, and actual candidate bridge binding. The installer itself does not cure missing embedded source members.

The installer also checks preservation names under `ExistingStateRoot` that do not match the actual Runtime layout and treats the fixed browser profile as if it were under State Root. It does not clone or bind the complete baseline Electron release, does not prove an actual runtime load hook, and overwrites the launcher with a one-line environment variable wrapper.

Therefore:

```text
BYTE_EXISTS=true
SELF_CONTAINED_FILE_EXISTS=true
EXACT_SOURCE_BYTES=false
REQUIRED_MEMBER_COUNT_PASS=false
AUTHORITATIVE_ROOT_BINDING=false
BASE_RELEASE_OVERLAY_PROVEN=false
RUNTIME_LOAD_HOOK_PROVEN=false
INSTALLABLE_RUNTIME=false
TARGET_PC_ACCEPTED=false
```

The rc5 installer is retained as a negative fixture.

## 4. Wave 14 assignments

Five new Wave 14 rows are assigned. W6 remains the active Wave 13 carryover and must not receive a second active command.

### W1 — Authority-correct overlay map V2

Rebuild the deployment map from the exact handoff and observed Runtime state. Remove all invented roots and partitions. The candidate must be an overlay on a complete baseline release, not a sparse standalone release.

Required output:

```text
BASE_RELEASE_PATH_RESOLUTION=FROM_EXISTING_LAUNCHER_OR_EXPLICIT_VALIDATED_PARAMETER
CANDIDATE_RELEASE_ROOT=%RELEASE_ROOT%\5.10.2.4.2-rc6
STATE_ROOT=exact authority
BROWSER_PROFILE=exact authority
WORKER_PARTITION=exact authority
ANALYSIS_PARTITION=exact authority
LAUNCHER=exact authority
OVERLAY_MEMBER_COUNT=17
EXACT_SOURCE_COMMIT_PATH_BLOB_SHA256_SIZE=17/17
BASE_RELEASE_CLONE_BEFORE_OVERLAY=true
LOAD_HOOK_MAP_REQUIRED=true
```

Do not mark PASS if the launcher content or base release path remains guessed.

### W2 — rc5 false-positive gate and rc6 acceptance gate

Apply the existing technical gate to the actual W5 rc5 installer and add these rejection reasons:

```text
STUB_PAYLOAD_SUBSTITUTION
EXACT_SOURCE_HASH_MISMATCH
REQUIRED_MEMBER_COUNT_MISMATCH
BASE_RELEASE_NOT_PRESENT_OR_CLONED
RUNTIME_LOAD_HOOK_MISSING
AUTHORITATIVE_PATH_MISMATCH
PRESERVATION_PATH_MISMATCH
LAUNCHER_TARGET_NOT_EXECUTABLE
TARGET_VERSION_MISMATCH
```

The rc5 package must fail. Prepare a positive gate for rc6 and keep reporting separate from technical acceptance.

### W3 — Authority-correct UI load-hook overlay

Use the handoff authority directly; do not wait for another inferred W1 path. Re-export exact Wave 12 UI bytes and implement a deterministic load-hook patch against the actual baseline renderer files. The patch must be idempotent and rollback must remove only the overlay hook and overlay files.

Required proof:

```text
EXACT_UI_SOURCE_BYTES=true
BASE_UI_PRESERVED=true
CSS_LOAD_AFTER_BASE_CSS=true
JS_LOAD_AFTER_BASE_JS=true
BRIDGE_LOAD_BEFORE_UI_OVERLAY=true
FIXED_BROWSER_PROFILE_UNCHANGED=true
DISABLED_WORKING_COUNT=0
A_E_CURRENT_COUNT=0
```

### W4 — Actual rc5 rejection and rc6 offline acceptance runner

Run the prepared validator against the actual rc5 installer bytes and prove rejection for stub source, member-count, root, profile, base-release, load-hook, smoke, and rollback defects. Then prepare the same runner to consume rc6.

Required rc6 offline suite:

```text
EXACT_MEMBER_HASHES=17/17
BASE_RELEASE_CLONE=PASS
OVERLAY_INSTALL=PASS
ALL_COMPONENT_IMPORTS=PASS
UI_LOAD_HOOK=PASS
C_AND_REPEAT_NAMESPACE_NONINTERFERENCE=PASS
SIX_WORKERS_X_THREE_ROUNDS=PASS
RESTART_RESUME=PASS
EXACTLY_ONCE_RECEIPTS=PASS
ROLLBACK_PRE_POST_READBACK=PASS
```

All error counters must remain zero.

### W5 — Exact-source baseline-overlay rc6 installer

W5 remains the single integration owner. Build rc6 from the exact source bytes locked by authoritative commits. Handwritten substitute modules are forbidden.

Required design:

```text
COPY_OR_CLONE_COMPLETE_BASELINE_RELEASE_FIRST=true
APPLY_EXACT_17_MEMBER_OVERLAY=true
EXACT_MEMBER_SOURCE_HASH_MATCH=17/17
INSTALL_TIME_NETWORK_DEPENDENCY=false
AUTHORITATIVE_RELEASE_ROOT=true
AUTHORITATIVE_STATE_ROOT=true
AUTHORITATIVE_BROWSER_PROFILE_SEPARATE=true
AUTHORITATIVE_LAUNCHER=true
ACTUAL_RENDERER_LOAD_HOOK=true
FULL_COMPONENT_SMOKE=true
LAUNCHER_SWITCH_ONLY_AFTER_PASS=true
ROLLBACK_EXACT_LAUNCHER_BYTES=true
ROLLBACK_REMOVE_CANDIDATE_RELEASE=true
PRESERVATION_READBACK_USES_ACTUAL_PATHS=true
A_E_REINTRODUCTION_COUNT=0
```

The installer may accept explicit paths, but each must equal or be validated under the authority above. It must not replace the launcher with a non-launching one-line environment assignment. Commit actual installer bytes, exact member manifest, hashes, static positive/negative transcript, and one-click Target-PC runner. Only Windows live execution may remain externally pending.

### W6 — Wave 13 carryover

Continue the existing Wave 13 independent audit using the now-published rc5 package. Publish result or exact blocker with the original `RESULT_KEY=519606842800`. This is report request 1 of 4. Independently verify that rc5 fails for stub payload, member mismatch, authority mismatch, missing base release overlay, missing load hook, shallow smoke, and preservation-path mismatch. Do not wait for Wave 14 to report the Wave 13 result.

## 5. Registry policy

```text
WAVE14_NEW_ROW_COUNT=5
WAVE13_CARRYOVER_COUNT=1
ALL_NEW_ROWS_VALID_BEFORE_ANY_NEW_DISPATCH=true
PARTIAL_NEW_WAVE_DISPATCH=false
ACTIVE_COMMAND_PER_WORKER=1
W6_NEW_WAVE14_COMMAND=false
SAME_SEQUENCE_DUPLICATE=FAIL_CLOSED
```

```text
CURRENT_PROGRESS=96
PROGRESS_INCREASE_WITHHELD_REASON=RC5_FALSE_POSITIVE_AND_AUTHORITY_MISMATCH
TARGET_PC_PASS=PENDING
LTS_TERMINAL_CLAIMED=false
```
