# C Mode Wave 14 Review and Wave 15 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
PREVIOUS_WAVE=V1-C-MODE-6W-WAVE-014
WAVE_ID=V1-C-MODE-6W-WAVE-015
REGISTRY_SEQUENCE=15
OWNER=V-1
MODE=EXACT_BLOB_PACKAGE_AND_TARGET_TIME_BASELINE_RESOLUTION
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
BASELINE_VERSION=5.10.2.4.0
TARGET_VERSION=5.10.2.4.2-rc6
PRODUCTION=false
READY=false
MERGE=false
```

## 1. Wave 14 review

```text
W1_RESULT_COMMENT=5196728251
W1_OUTCOME=BLOCKED_MAP_PASS_DEPLOYMENT_PENDING
W2_RESULT_COMMENT=5196647746
W2_OUTCOME=PASS_GATE
W3_RESULT_COMMENT=5196694708
W3_OUTCOME=PASS_OFFLINE_TARGET_PC_PENDING
W4_RESULT_COMMENT=5196612369
W4_OUTCOME=BLOCKED_RC6_POSITIVE_INPUT_PENDING
W5_RESULT_COMMENT=5196617821
W5_OUTCOME=BLOCKED_RAW_DNS_AND_LOCAL_PACKER_INPUT
W6_CARRYOVER_RESULT_COMMENT=5196614410
W6_OUTCOME=FAIL_RC5_INDEPENDENT_AUDIT
REPORTED=6
MISSING=0
DUPLICATE_RESULT=0
```

## 2. Commander decision

W1 and W5 blockers are not accepted as final external blockers.

```text
GITHUB_BLOB_API_AVAILABLE=true
VERIFIED_EXAMPLE_BLOB=2db157e02008f64ef8fba22f58047b80953ab26d
VERIFIED_EXAMPLE_COMPONENT=C_RUNTIME_STATE_MACHINE
RAW_GITHUB_DNS_REQUIRED=false
MOUNTED_CHECKOUT_REQUIRED=false
```

Each exact Source member can be read with GitHub blob API by immutable blob SHA, verified against locked SHA-256 and size, then embedded into the package. The installer also does not need off-target launcher bytes or a guessed baseline path. It must read and back up launcher bytes on the Target PC and resolve the baseline by either an explicit validated `BaseReleasePath` parameter or deterministic exactly-one discovery under the authority Release Root.

```text
LAUNCHER_BYTE_READBACK_AT_INSTALL_TIME=true
BASE_RELEASE_EXPLICIT_PARAMETER_ALLOWED=true
BASE_RELEASE_EXACTLY_ONE_DISCOVERY_ALLOWED=true
BASE_RELEASE_GUESSING=false
BLOCKER_REPEAT_WITHOUT_ALTERNATIVE_METHOD_FORBIDDEN=true
```

## 3. Wave 15 assignments

### W1 — Target-PC Runtime Locator and Baseline Resolver

Convert the Wave 14 map into an executable resolver contract. It must accept an explicit `BaseReleasePath` or discover exactly one baseline under `E:\SOURCE FACTORY\.yolla\yolla-panel\releases`, validate version `5.10.2.4.0`, required renderer files, and executable entry points, and fail closed on zero or multiple matches. Launcher bytes are read and hashed at install time from `E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat`; no off-target byte is required. Publish resolver Source, tests, and W5 handoff.

### W2 — Exact Blob Package Positive Acceptance Gate

Extend the gate to validate immutable blob SHA, exact Source SHA-256, exact size, member count 17, baseline resolver semantics, target-time launcher backup, complete load hooks, full smoke, rollback, and preservation readback. Keep rc5 as a required negative fixture. Consume W5 rc6 when posted in the same assignment and publish technical acceptance separately from Target-PC acceptance.

### W3 — Exact UI Overlay Bundle and Hook Receipt

Preserve the Wave 14 PASS. Publish an exact three-member UI bundle plus patch and rollback Source as immutable blob-SHA-addressed inputs for W5. Verify authority Release Root, fixed browser profile, base CSS/JS anchors, idempotent patch, exact rollback, and working-count zero when C and Repeat are disabled. Target-PC live evidence remains separate.

### W4 — Blob-fed rc6 Offline Acceptance

Replace any raw URL dependency with GitHub blob API inputs. Validate W5 rc6 when posted. Required coverage: 17/17 hashes, baseline resolution, recursive baseline clone, overlay installation, full imports, UI hook, C/Repeat noninterference, six workers × three rounds, restart resume, exactly-once receipts, and rollback pre/post readback. All five error counters must be zero.

### W5 — Exact 17-Blob Self-contained rc6 Build

W5 remains the single integration owner. Use the exact 17 blob SHAs from W1's locked map and fetch each byte through GitHub blob API; do not use raw.githubusercontent.com and do not create handwritten substitutes. Verify each member SHA-256 and size before embedding.

The installer must:

```text
ACCEPT_OR_DISCOVER_VALIDATED_BASE_RELEASE=true
CLONE_COMPLETE_BASELINE_RECURSIVELY=true
OVERLAY_EXACT_17_SOURCE_MEMBERS=true
APPLY_W3_RENDERER_HOOKS=true
PRESERVE_STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2
PRESERVE_BROWSER_PROFILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
READ_AND_BACKUP_LAUNCHER_AT_INSTALL_TIME=true
RUN_FULL_COMPONENT_SMOKE=true
SWITCH_LAUNCHER_ONLY_AFTER_PASS=true
ROLLBACK_EXACT_LAUNCHER_AND_BASELINE=true
INSTALL_TIME_NETWORK_DEPENDENCY=false
LEGACY_A_E_REINTRODUCTION_COUNT=0
```

Commit actual package bytes, complete member manifest, blob/SHA/size receipt, resolver, installer, smoke, rollback, static transcript, negative fixtures, and one-click Target-PC runner. Only actual Windows execution may remain externally pending.

### W6 — Independent rc6 Audit

Use rc5 as a negative fixture and prepare the rc6 matrix immediately. When W5 rc6 is posted, read it in the same assignment and independently verify exact 17 blob membership, authority paths, baseline resolver, recursive clone, renderer hooks, full smoke, launcher backup/switch, rollback, profile/state/log/receipt preservation, and A/E reintroduction zero. Keep Target-PC live acceptance separate.

## 4. Reporting

All workers must publish one correlated result:

```text
C_RESULT|RESULT_KEY={BOUND_RESULT_KEY}|ROLE={ROLE}|OUTCOME={PASS|FAIL|BLOCKED|NO_WORK}|STATUS=END|RESULT_COMMIT={40_HEX_OR_NONE}
```

```text
CURRENT_PROGRESS=96
PROGRESS_INCREASE_WITHHELD_REASON=EXACT_RC6_PACKAGE_NOT_YET_BUILT
LTS_TERMINAL_CLAIMED=false
```
