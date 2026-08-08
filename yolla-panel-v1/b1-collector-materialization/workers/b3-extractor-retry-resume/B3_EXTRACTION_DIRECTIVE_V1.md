# B-3 Pagination·Retry·Resume·Incremental Extractor Directive V1

```text
DIRECTIVE_ID=B1-TO-B3-EXTRACTOR-RETRY-RESUME-INCREMENTAL-V1-20260804-001
PARENT_DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001
EXISTING_DIRECTIVE=A0-TO-B1-GENERIC-COLLECTOR-MATERIALIZATION-SHELL-V1-20260803-001
EXISTING_DIRECTIVE_SUPERSEDED=false
B1_CONTROL_PR=source-factory-core#19
START_HEAD=a99144065c86af0dd70866fcd4c0486372441c2d
MODE=FIXTURE_FIRST_DETERMINISTIC_EXTRACTION_LOOP
```

## Owned Root

`yolla-panel-v1/b1-collector-materialization/workers/b3-extractor-retry-resume/**`

## Mission

Using only the B-2 consumer contract and a verified or fixture Adapter, implement:

1. Pagination Loop.
2. Retry policy and retryable/non-retryable classification.
3. Resume Ledger and interrupted-run continuation.
4. Incremental extraction cursor and monotonic progress.
5. Exactly-once page/result acceptance and duplicate suppression.

Required outputs:

- `PAGINATION_EXECUTION_PLAN_V1`
- `RESUME_LEDGER_V1`
- `INCREMENTAL_EXTRACTION_STATE_V1`
- `COLLECTION_PROGRESS_EVENT_V1`
- `EXTRACTION_RUN_RECEIPT_V1`

## Boundaries

```text
SITE_STRUCTURE_REANALYSIS=false
ADAPTER_GENERATION=false
UNVERIFIED_ADAPTER_USE=false
ACTUAL_SITE_EXTRACTION=false_UNTIL_A2_VERIFIED_PACKAGE
ACTUAL_BULK_COLLECTION=false
RAW_ARTIFACT_MUTATION=false
PANEL_SHELL_EDIT=false
PRODUCTION=false
READY=false
MERGE=false
```

Before work, commit `B3_START_REPORT_V1.json`. On completion, commit `B3_FINAL_REPORT_V1.json` and update `LATEST_B3_REPORT_POINTER.json`.

Terminal: `B3_EXTRACTOR_RETRY_RESUME_READY_OR_EXACT_BLOCKER`.
