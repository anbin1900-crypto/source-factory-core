# C Mode Wave 7 Review and Wave 8 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
PREVIOUS_WAVE=V1-C-MODE-6W-WAVE-007
NEXT_WAVE=V1-C-MODE-6W-WAVE-008
REGISTRY_SEQUENCE=8
OWNER=V-1
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
TARGET_VERSION=5.10.2.4.2-rc3
PRODUCTION=false
READY=false
MERGE=false
```

## Wave 7 review

All six workers posted one valid result correlated to Registry comment `5193659817`.

```text
W1|RESULT_COMMENT=5193766643|HEAD=91872336931c3e5686bd973766737089d1860218|OUTCOME=PASS|TEST=15/15
W2|RESULT_COMMENT=5193762256|HEAD=0fdcbae0416cabd827e322bf70179bced1b4fe40|OUTCOME=PASS|TEST=10/10
W3|RESULT_COMMENT=5193762357|HEAD=1a3e6fbc08cb2613e70a16915367ac03a5aa38d8|OUTCOME=PASS_OFFLINE_TARGET_PC_PENDING|TEST=10/10
W4|RESULT_COMMENT=5193766350|HEAD=61fc6a20b2245c691ab3812d07ea321aa2944ea0|OUTCOME=PASS|SOAK_CYCLES=360
W5|RESULT_COMMENT=5193744236|HEAD=46791b277705467dabf0e6edc43575e980e3aee5|OUTCOME=BLOCKED_INPUTS_PENDING|NONDEPENDENT_PACKAGE=COMPLETE
W6|RESULT_COMMENT=5193735003|HEAD=4b2eb6550770f646ab2611cc7c9154ff9f6c5f70|OUTCOME=BLOCKED_FINAL_INPUTS_PENDING|FAILURE_INJECTION=PASS
```

```text
VALID_CORRELATED_REPORTS=6/6
MISSING_REPORTS=0
DUPLICATE_RESULTS=0
REPLACEMENT_REQUIRED=0
CURRENT_PROGRESS_PERCENT=93
```

W5 and W6 blockers were time-order dependencies, not external terminal blockers. W1-W4 inputs now exist, so the blockers are released for Wave 8.

## Wave 8 objective

Converge the tested components into the actual Runtime candidate without discarding the existing validation system.

```text
NORMAL_PATH=REGISTRY_TO_EXACT_COMMENT_RELAY_TO_RESULT_KEY_TO_RESULT_COMMENT
COMMAND_INPUT_MODE=SEPARATE_NAMESPACE
INTEGRATION_OWNER=AUTOMATION-C-W5
FINAL_INDEPENDENT_ACCEPTANCE_OWNER=AUTOMATION-C-W6
TARGET_PC_PASS=PENDING
LTS_TERMINAL_CLAIMED=false
```

### W1 — exact input lock and compatibility map

Lock W1-W4 Wave 7 heads, result comments, owned paths, blob IDs and SHA-256 in one candidate input manifest. Run cross-head conflict and contract-compatibility checks for W5. Do not duplicate prior parser implementation.

### W2 — actual Wave 7 result collection and Runtime adapter

Build an actual `C_MODE_WAVE_RESULT_V1` from the six Wave 7 result comments. It must report `REPORTED=6`, `MISSING=0` while preserving PASS/BLOCKED outcomes as report content. Connect Registry Authority and Result Watcher through one Runtime adapter/export for W5.

### W3 — actual UI candidate patch

Apply the verified authority-truth model to the real candidate UI/bridge path. Show current, historical, missing, duplicate, error, END and idle separately; prefer actual RESULT_COMMENT. Preserve `C inactive + command inactive = working 0` and exclude A/E history.

### W4 — actual bridge adapter and extended non-interference soak

Bind the C/Repeat namespace adapter to the actual candidate bridge/state path and run at least 1,000 mixed cycles across six slots. Duplicate, cross-cancel, END redispatch, receipt loss and queue growth must all remain zero.

### W5 — rc3 integration and distributable package

Use the exact W1-W4 Wave 7 heads above immediately. Consume any Wave 8 export that becomes available, but do not wait idly. Assemble `5.10.2.4.2-rc3`, run full offline regression, create installer BAT, Source ZIP, payload manifest, rollback and one-click Target-PC acceptance runner. Preserve login profile, Runtime log, Work-Control JSONL, dispatch receipts and C/Repeat state. A/E reintroduction count must be zero. Upload artifacts and publish size/SHA-256/readback when connector access permits. Do not claim Target-PC PASS without Windows receipts.

### W6 — independent convergence audit

Independently verify the six Wave 7 result correlations and W1-W4 exact heads now available. Prepare the final acceptance matrix and audit W5's rc3 result when posted. Implementation direct edit remains forbidden. Target-PC, 6 workers x 3 waves, restart and log-loss-zero remain pending until actual receipts exist.

## Reporting contract

Each worker posts exactly one final result comment for Wave 8:

```text
C_RESULT|RESULT_KEY={DIRECTIVE_COMMENT}00|ROLE={ROLE}|OUTCOME={PASS|FAIL|BLOCKED|NO_WORK}|STATUS=END|RESULT_COMMIT={40_HEX_OR_NONE}
```

Intermediate failures are attempt logs. Each owner retries until PASS or a proven external blocker. All six directives are dispatched as one Cycle Batch.
