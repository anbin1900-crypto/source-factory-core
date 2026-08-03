# B-6 Extraction Acceptance·C-1 Handoff Audit Directive V1

```text
DIRECTIVE_ID=B1-TO-B6-EXTRACTION-ACCEPTANCE-C1-HANDOFF-V1-20260804-001
PARENT_DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001
EXISTING_DIRECTIVE=A0-TO-B1-GENERIC-COLLECTOR-MATERIALIZATION-SHELL-V1-20260803-001
EXISTING_DIRECTIVE_SUPERSEDED=false
B1_CONTROL_PR=source-factory-core#19
START_HEAD=a99144065c86af0dd70866fcd4c0486372441c2d
MODE=EVENT_WAIT_B2_TO_B5_THEN_INDEPENDENT_ACCEPTANCE
```

## Owned Root

`yolla-panel-v1/b1-collector-materialization/workers/b6-extraction-acceptance/**`

## Entry Condition

B-2, B-3, B-4 and B-5 terminals and Latest Pointers must be published 4/4.

## Mission

Independently verify the complete fixture-first extraction pipeline:

`VERIFIED_OR_FIXTURE_ADAPTER → Adapter Loader → Scope/Quota/Schedule → Pagination → Retry/Resume → Incremental Extraction → Immutable Raw Artifact → Source Record Envelope → Lossless Normalization → Extraction Receipt`.

Required checks:

- Exact Remote Head and Blob readback.
- No overlapping Owned Root.
- No unverified Adapter use.
- No actual site extraction before A-2 verified package.
- Raw Artifact SHA-256 and metadata parity.
- Source field loss count zero.
- Resume and duplicate suppression deterministic.
- C-1 handoff contains source evidence only and no B-owned semantic transformation.
- Production, Ready and Merge remain false.

Required outputs:

- `B6_EXTRACTION_ACCEPTANCE_REPORT_V1`
- `B6_C1_HANDOFF_AUDIT_RECEIPT_V1`
- `B1_TO_C1_HANDOFF_CANDIDATE_V1`

Before work, commit `B6_START_REPORT_V1.json`. On completion, commit `B6_FINAL_REPORT_V1.json` and update `LATEST_B6_REPORT_POINTER.json`.

Terminal: `B6_EXTRACTION_ACCEPTANCE_C1_HANDOFF_READY_OR_EXACT_BLOCKER`.
