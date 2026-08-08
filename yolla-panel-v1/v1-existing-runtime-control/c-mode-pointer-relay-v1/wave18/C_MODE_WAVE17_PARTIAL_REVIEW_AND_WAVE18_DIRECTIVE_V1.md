# C Mode Wave 17 Partial Review and Wave 18 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
PREVIOUS_WAVE=V1-C-MODE-6W-WAVE-017
WAVE_ID=V1-C-MODE-6W-WAVE-018
REGISTRY_SEQUENCE=18
MODE=RC8_PREINTEGRATION_AND_TARGET_PC_ACCEPTANCE_PREPARATION
TARGET_VERSION=5.10.2.4.2-rc8
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
PRODUCTION=false
READY=false
MERGE=false
TARGET_PC_INSTALL_AUTHORIZED=false
```

## 1. Wave 17 review

```text
ASSIGNED=6
REPORTED=5
MISSING=1
DUPLICATE_RESULT=0
COMPLETE=false
```

```text
W1_RESULT_COMMENT=5198777211
W1_RESULT_COMMIT=f55870053245177430c20a3f9ba0029f955df8f0
W1_OUTCOME=PASS_EXACT_RESOLVER_BUNDLE

W2_RESULT_COMMENT=5198641540
W2_RESULT_COMMIT=d4adf24b4a5bb5381a2aec70531b56bc2f9f4a68
W2_OUTCOME=PASS_ARTIFACT_GATE_V2

W3_RESULT_COMMENT=5198723961
W3_RESULT_COMMIT=7af7a51ee18e6b5ae6f64942cf02392f596e4678
W3_OUTCOME=PASS_EXACT_UI_HOOK_ROLLBACK_BUNDLE

W4_RESULT_COMMENT=5198603151
W4_RESULT_COMMIT=c068f213af2cf7cf0636ad23219cc64c157c247f
W4_OUTCOME=PASS_OFFLINE_ACCEPTANCE_RUNNER_V2

W5_DIRECTIVE_COMMENT=5198514990
W5_RESULT_KEY=519851499000
W5_RESULT_COMMENT=MISSING
W5_HEAD=6862d0fbbd82d17f708330aa1f71cd49565ecad4
W5_CARRYOVER=true
W5_REPORT_REQUEST_COUNT=1

W6_RESULT_COMMENT=5198605692
W6_RESULT_COMMIT=e461d6be7bca1de7682649a2c25657c976120745
W6_OUTCOME=PASS_INDEPENDENT_AUDIT_PREPARATION
```

The 20-minute gate has passed with one worker incomplete. The 90-minute rescue-worker gate has not yet been reached. W5 remains the one-owner integration carryover; its active command is not cancelled or duplicated.

## 2. Wave 18 assignments

### W1 — Expected component manifest authority

Create a machine-readable immutable expected manifest for rc8. Combine the exact resolver bundle, exact UI hook/rollback bundle, authoritative runtime members, installer, verifier, smoke, rollback, and target-PC runner classes. Each row must include owner, source commit, path, blob SHA-1, SHA-256, size, package path, install destination, load order, and executable/evidence classification. Evidence/report/pointer files must not count as runtime members. Publish a W5/W2/W4/W6-consumable assembly lock and fail closed on missing or duplicate component classes.

### W2 — Pre-install authorization aggregator

Create the commander-side pre-install authorization gate that consumes exact W1, W3, W4, W6 outputs and later the W5 carryover result. Separate `REPORTED`, `SCOPED_ACCEPTED`, `OFFLINE_ARTIFACT_ACCEPTED`, `INSTALLABLE_RUNTIME`, `TARGET_PC_AUTHORIZED`, and `TARGET_PC_ACCEPTED`. Test missing W5, worker PASS overriding technical failure, wrong manifest, stale head, and duplicate result. No target-PC authorization may be emitted before all required offline gates pass.

### W3 — Target-PC UI evidence pack V2

Create a one-click target-PC UI evidence collector and schema using the exact Wave 17 UI bundle. Collect app version, runtime status, screenshot hashes, login/profile preservation, idle working count zero, RESULT_COMMENT priority, current/historical registry separation, C/repeat mode separation, A/E absence, restart before/after, and rollback visual state. Offline fixture and schema validation must pass; no live PASS claim.

### W4 — Target-PC deterministic acceptance pack V2

Create a one-click target-PC acceptance runner package for `6 workers × 3 rounds`, restart/resume, exactly-once receipts, C/repeat isolation, zero queue growth, state/log/profile preservation, and rollback readback. The runner must fail closed when any receipt or pre/post evidence is absent and must not print PASS from synthetic or shallow receipts.

### W5 — Wave 17 carryover

No new Wave 18 directive. Continue `C6W-W17-W5-ACTUAL-INSTALLABLE-RC8` under `RESULT_KEY=519851499000`. Publish the actual rc8 immutable artifact result or an exact external blocker. This is report request 1 of 4. At 90 minutes without a result, two rescue workers may be assigned to the same task without cancelling W5.

### W6 — Independent pre-install acceptance V2

Do not modify implementation source. Independently review the Wave 17 W1/W2/W3/W4 outputs, prepare the final rc8 pre-install audit runner, and verify that missing W5 remains `NOT_EVALUATED`, not PASS. Add failure fixtures for stale W5 head, manifest mismatch, missing live receipt, synthetic screenshot, missing restart evidence, and rollback readback loss. Actual W5 rc8 artifact audit remains an event-triggered next step.

## 3. Registry and progress

Five new Wave 18 rows will be published for W1, W2, W3, W4, and W6. W5 remains a Wave 17 carryover. All five new rows must validate before any dispatch.

```text
CURRENT_PROGRESS=97
PROGRESS_BASIS=FIVE_WAVE17_SCOPED_OUTPUTS_REMOTE_VERIFIED
TARGET_PC_PASS=PENDING
LTS_TERMINAL_CLAIMED=false
```
