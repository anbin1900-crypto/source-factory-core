# C Mode Wave 16 Review and Wave 17 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
PREVIOUS_WAVE=V1-C-MODE-6W-WAVE-016
WAVE_ID=V1-C-MODE-6W-WAVE-017
REGISTRY_SEQUENCE=17
OWNER=V-1
MODE=RC8_EXACT_SOURCE_CORRECTION_AND_ACCEPTANCE_PREPARATION
BASELINE_VERSION=5.10.2.4.0
TARGET_VERSION=5.10.2.4.2-rc8
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
TARGET_PC_INSTALL_AUTHORIZED=false
PRODUCTION=false
READY=false
MERGE=false
```

## 1. Wave 16 review

Wave 16 produced five authoritative worker results. W6 did not receive an authoritative bound directive and therefore has no Wave 16 Terminal Result.

```text
W1_RESULT_KEY=519827909700
W1_RESULT_COMMIT=9f68450072e4ba426e7d0cced3c100260641a7c4
W1_OUTCOME=BLOCKED_W5_RC7_PENDING_AT_RESULT_TIME

W2_RESULT_KEY=519827953700
W2_RESULT_COMMIT=132b60e1137fbfd22ee4f565720b77176a58f71d
W2_OUTCOME=PASS_GATE_IMPLEMENTATION

W3_RESULT_KEY=519828395400
W3_RESULT_COMMIT=6431abc8d99f6daa255a0f65f22988ea4ae867fc
W3_OUTCOME=BLOCKED_W5_RC7_PENDING_AT_RESULT_TIME

W4_RESULT_KEY=519828502000
W4_RESULT_COMMIT=fa83a517355bfb28d93437980a6e0c4e0e4e344f
W4_OUTCOME=BLOCKED_W5_RC7_PENDING_AT_RESULT_TIME

W5_RESULT_KEY=519828566800
W5_RESULT_COMMIT=6862d0fbbd82d17f708330aa1f71cd49565ecad4
W5_OUTCOME=PASS_OFFLINE_STATIC_AND_BYTE_ASSEMBLY
W5_ARTIFACT_HEAD=854c3d928e17a30a124b2aab294ff5a9d781a252

W6_DIRECTIVE_BOUND=false
W6_RESULT_KEY=NONE
W6_RESULT_COMMIT=NONE

WAVE16_ASSIGNED=6
WAVE16_AUTHORITATIVE_RESULTS=5
WAVE16_MISSING=1
WAVE16_COMPLETE=false
```

## 2. Commander technical findings on rc7

The rc7 tree is real and contains a one-click wrapper, installer, payload, runtime, tools and tests. It is not accepted as an installable Runtime yet because source-level review found the following gaps.

```text
FINDING_01=W1_EXACT_RESOLVER_SUBSTITUTED_BY_SIMPLIFIED_IMPLEMENTATION
FINDING_02=W3_EXACT_MAIN_AND_HTML_HOOK_SUBSTITUTED_BY_SIMPLIFIED_IMPLEMENTATION
FINDING_03=W3_ROLLBACK_DOES_NOT_FAIL_CLOSED_ON_MISSING_BACKUP
FINDING_04=FULL_COMPONENT_SMOKE_DOES_NOT_EXECUTE_ALL_REQUIRED_COMPONENT_BEHAVIORS
FINDING_05=PRESERVATION_PATHS_FOR_C_MODE_STATE_REPEAT_STATE_AND_WORK_CONTROL_LOG_ARE_WRONG
FINDING_06=BUNDLE_VERIFIER_GENERATES_A_MANIFEST_BUT_DOES_NOT_COMPARE_TO_AN_IMMUTABLE_EXPECTED_MANIFEST
FINDING_07=TARGET_PC_RUNNER_CAN_PRINT_PASS_WITHOUT_APP_LAUNCH_RESTART_6W_3_ROUNDS_LOG_LOSS_ZERO_OR_UI_ACCEPTANCE
FINDING_08=GITHUB_BRANCH_ARCHIVE_IS_NOT_AN_IMMUTABLE_COMMIT_PINNED_USER_ARTIFACT
```

The corrected background dispatcher is reusable: it uses the fixed Browser Profile, fixed worker/analysis partitions and `temporaryProfile=false`.

## 3. Wave 17 operating model

Wave 17 removes the repeated pattern where validators terminate early only because W5 has not posted yet. Every worker has an independently completable scope. W5 remains the single integration owner and does not wait for advisory workers.

```text
DISPATCH_MODE=CYCLE_BATCH_PARALLEL
ALL_ROWS_VALID_BEFORE_ANY_DISPATCH=true
PARTIAL_DISPATCH=false
ONE_OWNER_END_TO_END=true
MID_PROCESS_AUDIT=NON_BLOCKING
TARGET_PC_LIVE_TEST=NOT_AUTHORIZED
```

Wave 17 Terminal scope is implementation and deterministic offline preparation. Actual rc8 cross-worker technical acceptance will be a separate next event after all Wave 17 results are collected.

## 4. Worker assignments

### W1 — Exact resolver package and integration verifier

```text
COMMAND_ID=C6W-W17-W1-RC8-EXACT-RESOLVER-INTEGRATION
ROLE=AUTOMATION-C-W1
PR=59
```

Reuse the exact Wave 15 resolver and handoff rather than rewriting them:

```text
EXACT_RESOLVER_COMMIT=ed8bde5eb66f0d65de64ad1dfae4fde038e6012c
EXACT_RESOLVER_BLOB=92e3e7f027f716fb49373bc66e9d62aff61b73ae
EXACT_RESOLVER_SHA256=a6eaeef66a2dfc59b646fb63ab62d6bff12361b79f13d97bb4022eaa01255ea6
EXACT_RESOLVER_SIZE=10563
HANDOFF_COMMIT=001f2b23f743b204565f91bd058094330fbaa11a
```

Produce an rc8 exact-source resolver bundle and verifier that rejects the simplified rc7 resolver. Required behavior:

- Explicit BaseReleasePath must be an absolute strict child of the authoritative Release Root.
- Validate `package.json`, version `5.10.2.4.0`, `package.main`, `main.js`, `workspace.html`, and the executable entry.
- Without explicit input, accept exactly one fully valid baseline; reject zero or multiple candidates.
- Read and immutably back up the launcher bytes at target time.
- Clone the baseline recursively and compare complete before/after tree SHA-256.
- Guessed path count must remain zero.

Terminal PASS is based on this bundle, verifier and positive/negative fixtures. Do not wait for W5 and do not claim the rc8 candidate itself is accepted.

### W2 — Actual artifact gate V2

```text
COMMAND_ID=C6W-W17-W2-RC8-ACTUAL-ARTIFACT-GATE-V2
ROLE=AUTOMATION-C-W2
PR=60
```

Extend the existing gate and use rc7 as a required negative fixture. It must reject:

- simplified resolver substitution;
- simplified UI hook or rollback substitution;
- manifest generation without comparison to a committed expected manifest;
- shallow component smoke;
- incorrect preservation paths;
- premature Target-PC PASS;
- mutable branch-only archive authority.

Define separate states for `REPORTED`, `OFFLINE_ARTIFACT_ACCEPTED`, `INSTALLABLE_RUNTIME`, `TARGET_PC_PENDING`, and `TARGET_PC_ACCEPTED`. A worker-reported PASS must never override a failed technical gate. Terminal PASS is based on the gate implementation, rc7 negative result and regression tests; do not wait for W5.

### W3 — Exact UI hook and rollback bundle V2

```text
COMMAND_ID=C6W-W17-W3-RC8-EXACT-UI-HOOK-BUNDLE-V2
ROLE=AUTOMATION-C-W3
PR=61
```

Reuse exact source bytes:

```text
EXACT_LOAD_HOOK_COMMIT=ca9343722856c333ae1d7d9208642d21480130a2
EXACT_LOAD_HOOK_BLOB=1e6e54914737b1878a3f3ba1e88adbba57eab190
EXACT_LOAD_HOOK_SHA256=188dcc15f0f88ac41e5179272ccc0ee11b9ee48001ee986d1732f6414d88f462
EXACT_LOAD_HOOK_SIZE=6304
EXACT_ROLLBACK_COMMIT=1076f509e85463546cbf6dc6107715c401a9b17e
EXACT_ROLLBACK_BLOB=1b3df39a0ffa6c80ffa0b99e44422d6a26110f11
EXACT_ROLLBACK_SHA256=7a86437b703b50a6b7bbe575802bdf6d82a228919d5dc48bd8169046baf9253b
EXACT_ROLLBACK_SIZE=2873
```

Publish an rc8-consumable exact bundle and verifier. It must enforce:

- Truth Bridge binding immediately after the single `"use strict";` anchor and before renderer creation;
- `globalThis.__YOLLA_W3_UI_TRUTH_BRIDGE__` binding;
- overlay CSS after base CSS and overlay JS after base JS;
- exactly-one hook cardinality;
- patch and rollback idempotence;
- exact pre-overlay byte restoration;
- base UI and fixed Browser Profile preservation.

Terminal PASS is based on the exact bundle and deterministic fixtures; do not wait for W5.

### W4 — Full offline acceptance runner V2

```text
COMMAND_ID=C6W-W17-W4-RC8-FULL-OFFLINE-ACCEPTANCE-RUNNER-V2
ROLE=AUTOMATION-C-W4
PR=62
```

Use rc7 as the required negative fixture and build an rc8-ready positive runner. It must check:

- immutable expected manifest comparison, not self-generated acceptance;
- exact W1 and W3 source identity;
- all Runtime modules instantiated and exercised;
- C mode and repeat-command namespace isolation;
- deterministic `6 workers × 3 rounds`;
- restart resume;
- exactly-once receipts;
- rollback and preservation readback.

Required zero counters:

```text
DUPLICATE=0
C_REPEAT_CROSS_CANCEL=0
END_REDISPATCH=0
RECEIPT_LOSS=0
QUEUE_GROWTH=0
```

Terminal PASS is based on the runner and rc7 negative fixture. Actual rc8 positive evaluation is the next event and must not block this assignment.

### W5 — Actual installable rc8 integration

```text
COMMAND_ID=C6W-W17-W5-ACTUAL-INSTALLABLE-RC8
ROLE=AUTOMATION-C-W5
PR=63
INTEGRATION_OWNER=true
```

Build `5.10.2.4.2-rc8` from rc7 while preserving rc7 as a negative fixture. W5 must directly correct and retest all findings.

Mandatory requirements:

- Use the exact W1 resolver blob, not a simplified rewrite.
- Use the exact W3 hook and exact W3 rollback blobs, not simplified rewrites.
- Include `EXPECTED_MEMBER_MANIFEST.json` with exact path, size and SHA-256 for every required member.
- `VERIFY_BUNDLE.ps1` must compare actual bytes to that committed expected manifest and fail on missing, extra, altered or truncated members.
- Correct preservation paths:
  - `%STATE_ROOT%\runtime.log`
  - `%STATE_ROOT%\automation-c-v1\C_MODE_STATE.json`
  - `%STATE_ROOT%\automation-c-v1\REPEAT_COMMANDS.json`
  - `%STATE_ROOT%\automation-c-v1\work_control_events.jsonl`
  - dispatch receipts
  - fixed Browser Profile
  - original launcher bytes.
- Full smoke must instantiate and exercise C State Machine, Pointer Relay, Registry Authority, Result Watcher, Repeat Runtime, Repeat Release Adapter, C/Repeat Namespace Adapter, Candidate Bridge, Background Dispatch, Work-Control Log, UI Truth Bridge, renderer hooks, restart restore, exactly-once, launcher switch and rollback.
- Target-PC runner must not print PASS unless app launch, restart, C/repeat tests, `6 workers × 3 rounds`, duplicate zero, log-loss zero and required UI/login evidence are present.
- Publish one immutable commit-pinned archive or deterministic ZIP with exact size and SHA-256. A mutable branch archive is not sufficient authority.
- Install-time network dependency remains zero.
- Target-PC execution remains unauthorized and pending.

### W6 — Independent rc8 audit preparation

```text
COMMAND_ID=C6W-W17-W6-INDEPENDENT-RC8-AUDIT-PREPARATION
ROLE=AUTOMATION-C-W6
PR=64
IMPLEMENTATION_DIRECT_EDIT=false
```

This is the first authoritative bound assignment after the Wave 16 publication defect. Do not modify implementation Source.

Use rc7 as a required negative fixture and prepare an rc8 independent audit matrix. Required failure fixtures:

- wrong or truncated member;
- self-generated manifest accepted as authority;
- simplified resolver substitution;
- simplified hook or rollback substitution;
- shallow smoke;
- wrong preservation paths;
- premature Target-PC PASS;
- mutable branch archive.

Terminal PASS is based on the matrix, negative fixtures and reusable audit runner. Actual rc8 positive audit is the next event after W5 publishes its immutable rc8 artifact.

## 5. Reporting contract

Every worker must publish one result regardless of PASS, FAIL, BLOCKED or NO_WORK.

```text
C_RESULT|RESULT_KEY={BOUND_RESULT_KEY}|ROLE={ROLE}|OUTCOME={PASS|FAIL|BLOCKED|NO_WORK}|STATUS=END|RESULT_COMMIT={40_HEX_OR_NONE}
```

No Target-PC, Production, Ready, Merge or LTS PASS may be claimed in Wave 17.

```text
CURRENT_PROGRESS=96
PROGRESS_INCREASE_WITHHELD_REASON=RC7_NOT_TECHNICALLY_ACCEPTED_AND_WAVE16_W6_UNBOUND
```
