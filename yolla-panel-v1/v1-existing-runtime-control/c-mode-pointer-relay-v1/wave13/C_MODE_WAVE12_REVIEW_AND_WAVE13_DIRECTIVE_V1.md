# C Mode Wave 12 Review and Wave 13 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
PREVIOUS_WAVE=V1-C-MODE-6W-WAVE-012
WAVE_ID=V1-C-MODE-6W-WAVE-013
REGISTRY_SEQUENCE=13
OWNER=V-1
MODE=SELF_CONTAINED_RC5_PACKAGE_AND_ACTUAL_RUNTIME_PATH_CLOSURE
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
BASELINE_VERSION=5.10.2.4.0
TARGET_VERSION=5.10.2.4.2-rc5
PRODUCTION=false
READY=false
MERGE=false
```

## 1. Wave 12 review

All six Wave 12 rows produced exact correlated reports.

```text
W1_RESULT_COMMENT=5195797122
W1_RESULT_COMMIT=7492abf88c6f6bb84ec50084948ca9e635069f2e
W1_SCOPE=SOURCE_INVENTORY_LOCK_PASS

W2_RESULT_COMMENT=5195703416
W2_RESULT_COMMIT=35da3fbbabe6d12b5aa18e4e3206459f907366ec
W2_SCOPE=TECHNICAL_ACCEPTANCE_GATE_PASS

W3_RESULT_COMMENT=5195394714
W3_RESULT_COMMIT=40023163e8faf0f918e1fa55d1dae4741a3bb7e7
W3_SCOPE=UI_PAYLOAD_OFFLINE_PASS_TARGET_PC_PENDING

W4_RESULT_COMMENT=5195674360
W4_RESULT_COMMIT=f15c83ecbfb5f737d0283246c88d5ea861632acb
W4_SCOPE=CONNECTOR_BYTE_PREPARATION_PASS_POSITIVE_PACKAGE_PENDING

W5_RESULT_COMMENT=5195686133
W5_RESULT_COMMIT=d21c152985fd98b010b4e2c95b20faad42789a6d
W5_SCOPE=EXECUTABLE_SOURCE_IMPLEMENTED_PACKAGE_ASSEMBLY_INCOMPLETE

W6_RESULT_COMMENT=5195668736
W6_RESULT_COMMIT=8459971d75a7a267afd89cd794d45c855af2ce00
W6_SCOPE=NONBLOCKING_AUDIT_PREPARED_W5_POST_RESULT_REAUDIT_REQUIRED

REPORTED=6
MISSING=0
DUPLICATE_RESULT=0
```

## 2. Commander findings requiring Wave 13

The Wave 12 work materially advanced the executable Source, but the published W5 installer is not yet a complete installable package.

```text
FINDING_01=INSTALLER_EXPECTS_ADJACENT_RC4_PACKAGE_DIRECTORY_BUT_DIRECTORY_BYTES_ARE_NOT_COMMITTED
FINDING_02=UI_PACKAGE_PATHS_IN_W1_LOCK_DO_NOT_MATCH_W5_INSTALLER_REQUIRED_PATH
FINDING_03=INSTALLER_USES_LOCALAPPDATA_PATHS_INSTEAD_OF_EXISTING_RUNTIME_ROOTS
FINDING_04=BACKGROUND_DISPATCH_OPENS_TEMPORARY_PROFILE_WITHOUT_FIXED_LOGIN_PROFILE_BINDING_PROOF
FINDING_05=SMOKE_DOES_NOT_LOAD_ALL_REQUIRED_RUNTIME_COMPONENTS
FINDING_06=ROLLBACK_RETURNS_PRESERVED_LABELS_WITHOUT_PRE_POST_HASH_OR_EXISTENCE_VERIFICATION
FINDING_07=W2_GATE_AND_W6_AUDIT_PRECEDED_THE_FINAL_W5_WAVE12_RESULT
```

Observed existing-runtime roots remain:

```text
STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2
RELEASE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-panel\releases
BROWSER_PROFILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
WORKER_PARTITION=persist:sf4-safe-panel-worker-1
ANALYSIS_PARTITION=persist:yolla-analysis-browser-v1
```

Wave 13 must correct the package and path contract without discarding the existing validation system, tests, fixtures, result watchers, UI evidence, repeat-command soak, failure-injection matrix, or work-control logs.

## 3. Wave 13 assignments

### W1 — Actual runtime-root and self-contained assembly map

Read the existing-runtime handoff, the observed runtime state, the Wave 12 executable lock, and the actual launcher/release Source. Produce one exact rc5 assembly map that resolves:

```text
EXACT_EXISTING_RELEASE_ROOT
EXACT_STATE_ROOT
EXACT_FIXED_LOGIN_PROFILE
EXACT_WORKER_PARTITION
EXACT_LAUNCHER_ENTRYPOINT_OR_POINTER
EXACT_STARTUP_COMMAND
EXACT_INSTALL_DESTINATION_FOR_ALL_REQUIRED_FILES
EXACT_UI_CSS_JS_LOAD_ORDER
EXACT_ROLLBACK_TARGET
```

Reconcile the W3 UI package paths with the installer. Remove `%LOCALAPPDATA%\Yolla` as an accepted existing-runtime destination unless direct repository evidence proves it is the active launcher root. Publish exact Commit, Source Path, Blob SHA-1, SHA-256, Size, Package Path, Install Destination, Load Order, and Owner for every executable member. Fail closed on missing or duplicate destinations.

### W2 — rc5 package technical-acceptance gate

Extend the existing acceptance gate to reject all of the following as separate machine-readable reasons:

```text
PACKAGE_DIRECTORY_MISSING
SELF_CONTAINED_PAYLOAD_MISSING
NETWORK_DEPENDENT_INSTALLER
ACTIVE_RUNTIME_ROOT_MISMATCH
FIXED_PROFILE_BINDING_MISSING
UI_PATH_OR_LOAD_ORDER_MISMATCH
REQUIRED_COMPONENT_NOT_LOADED_BY_SMOKE
ROLLBACK_PRESERVATION_NOT_VERIFIED
```

The Wave 12 W5 installer is the required negative fixture. Preserve RESULT_KEY, pagination, five retries, restart, duplicate fail-closed, carryover, and commander output behavior. Add a concrete package acceptance schema that distinguishes `REPORTED`, `TECHNICALLY_ACCEPTED`, `INSTALLABLE_RUNTIME`, and `TARGET_PC_ACCEPTED`.

### W3 — Installer-ready UI and profile-binding export

Preserve the accepted Wave 12 UI behavior. Produce an rc5 installer-ready export whose package paths and install destinations exactly match W1's rc5 assembly map. Include the exact CSS and JS load hooks and a removal-only rollback sequence for the overlay. Prove:

```text
C_AND_REPEAT_DISABLED_WORKING_COUNT=0
LEGACY_A_E_EXCLUDED=true
RESULT_COMMENT_PRIORITY=true
CURRENT_AND_HISTORICAL_REGISTRY_SEPARATED=true
MISSING_DUPLICATE_ERROR_END_RESTING_SEPARATED=true
FIXED_LOGIN_PROFILE_CONTRACT_PRESERVED=true
```

No new target-PC PASS may be claimed without live receipts.

### W4 — Self-contained package offline acceptance

Use GitHub Connector/API immutable bytes and never depend on `raw.githubusercontent.com` DNS. Turn the Wave 12 W5 package into a required negative fixture and prove the exact failure reasons. Prepare a deterministic validator and runner for the corrected rc5 package covering:

```text
PACKAGE_MEMBERSHIP_AND_HASH
ACTUAL_RUNTIME_ROOTS
FIXED_PROFILE_AND_PARTITION
ALL_REQUIRED_COMPONENT_IMPORTS
UI_LOAD_ORDER
REPEAT_AND_C_NAMESPACE_NONINTERFERENCE
SIX_WORKERS_X_THREE_ROUNDS
RESTART_RESUME
EXACTLY_ONCE_RECEIPTS
ROLLBACK_PRE_POST_READBACK
```

Required counters remain zero: duplicate, cross-cancel, END redispatch, receipt loss, and queue growth.

### W5 — Self-contained rc5 package, single integration owner

W5 remains the One Owner End-to-End integration owner. Build one actual downloadable and installable rc5 package. It must not require a missing adjacent directory or live network download at installation time.

Preferred form:

```text
ONE_SELF_CONTAINED_POWERSHELL_INSTALLER_WITH_EMBEDDED_BASE64_PAYLOAD
PLUS_OPTIONAL_BAT_WRAPPER
```

An adjacent committed payload directory is acceptable only if every required byte is present under the same downloadable package root and hash-locked.

The package must include all required Runtime, UI, repeat, background, log, smoke, launcher, and rollback bytes. It must use the actual existing-runtime roots, preserve the current login profile and state roots, and bind background dispatch to the fixed login profile/partition contract rather than an unproven temporary profile.

Mandatory behavior:

```text
CREATE_VERSIONED_RELEASE_UNDER_EXISTING_RELEASE_ROOT=true
PRESERVE_EXISTING_STATE_ROOT=true
PRESERVE_FIXED_LOGIN_PROFILE=true
PRESERVE_RUNTIME_LOG=true
PRESERVE_WORK_CONTROL_JSONL=true
PRESERVE_DISPATCH_RECEIPTS=true
PRESERVE_C_AND_REPEAT_STATE=true
RUN_FULL_COMPONENT_SMOKE=true
SWITCH_EXISTING_LAUNCHER_ONLY_AFTER_PASS=true
ROLLBACK_TO_EXACT_PREINSTALL_LAUNCHER_AND_RELEASE=true
VERIFY_PRE_POST_PRESERVATION_HASH_OR_EXISTENCE=true
LEGACY_A_E_REINTRODUCTION_COUNT=0
INSTALL_TIME_NETWORK_DEPENDENCY=false
```

Commit actual package bytes, complete file manifest, embedded-member hashes, package size, package SHA-256, GitHub byte readback, static install transcript fixture, positive and negative tests, and a one-click target-PC acceptance runner. Node/Windows live execution remains a separate external gate, but package assembly and static correctness are not external blockers.

### W6 — Independent rc4 negative audit and rc5 acceptance matrix

Do not modify implementation Source. Independently confirm the Wave 12 package defects and produce the exact rc5 acceptance matrix and failure fixtures. Read back W1, W2, W3, W4, and W5 Wave 13 results when available in the same assignment; if the corrected package is not yet published, complete all nondependent audit work and report the exact remaining external dependency without blocking W5.

Required independent checks:

```text
SELF_CONTAINED_PAYLOAD
EXACT_MEMBER_HASHES
ACTIVE_RUNTIME_ROOT_MATCH
FIXED_PROFILE_BINDING
FULL_COMPONENT_SMOKE_COVERAGE
LAUNCHER_SWITCH_AFTER_PASS
ROLLBACK_PRE_POST_READBACK
STATE_LOG_PROFILE_RECEIPT_PRESERVATION
A_E_REINTRODUCTION_ZERO
TARGET_PC_LIVE_GATE_SEPARATE
```

## 4. Reporting contract

Each worker must publish exactly one result row for the new Wave 13 `RESULT_KEY`. PASS, FAIL, BLOCKED, or NO_WORK are all valid reports; only the technical acceptance gate determines installable-runtime status.

```text
C_RESULT|RESULT_KEY={BOUND_RESULT_KEY}|ROLE={ROLE}|OUTCOME={PASS|FAIL|BLOCKED|NO_WORK}|STATUS=END|RESULT_COMMIT={40_HEX_OR_NONE}
```

```text
CURRENT_PROGRESS=96
PROGRESS_INCREASE_WITHHELD_REASON=INSTALLABLE_SELF_CONTAINED_PACKAGE_AND_TARGET_PC_RECEIPTS_NOT_YET_PROVEN
LTS_TERMINAL_CLAIMED=false
```
