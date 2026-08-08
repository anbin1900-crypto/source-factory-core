# B-5 Lossless Normalization·Dataset·Extraction Receipt Directive V1

```text
DIRECTIVE_ID=B1-TO-B5-NORMALIZATION-DATASET-RECEIPT-V1-20260804-001
PARENT_DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001
EXISTING_DIRECTIVE=A0-TO-B1-GENERIC-COLLECTOR-MATERIALIZATION-SHELL-V1-20260803-001
EXISTING_DIRECTIVE_SUPERSEDED=false
B1_CONTROL_PR=source-factory-core#19
START_HEAD=a99144065c86af0dd70866fcd4c0486372441c2d
MODE=FIXTURE_FIRST_LOSSLESS_NORMALIZATION
```

## Owned Root

`yolla-panel-v1/b1-collector-materialization/workers/b5-normalization-dataset/**`

## Mission

Consume B-4 `SOURCE_RECORD_ENVELOPE_V1` and implement normalization without source-field loss.

Required behavior:

1. Preserve every original field through an explicit source-field map or unmapped-field bag.
2. Normalize types and repeated records deterministically.
3. Deduplicate only with evidence-preserving lineage.
4. Produce a fixture SQLite/DB package compatible with the existing B-1 materialization directive.
5. Generate extraction receipt linking Adapter, run, raw artifacts, source records and normalized records.

Required outputs:

- `NORMALIZED_DATASET_V1`
- `EXTRACTION_RECEIPT_V1`
- `FIELD_PRESERVATION_MAP_V1`
- `NORMALIZATION_DEDUP_RECEIPT_V1`
- `FIXTURE_MATERIALIZED_DATABASE_PACKAGE_V1`

## Boundaries

```text
SOURCE_FIELD_LOSS_COUNT=0_REQUIRED
C_SEMANTIC_TRANSFORMATION=false
D_CANONICAL_SCHEMA_DECISION=false
D_CANONICAL_DB_WRITE=false
UNVERIFIED_ADAPTER_USE=false
ACTUAL_BULK_COLLECTION=false
PANEL_SHELL_EDIT=false
PRODUCTION=false
READY=false
MERGE=false
```

Before work, commit `B5_START_REPORT_V1.json`. On completion, commit `B5_FINAL_REPORT_V1.json` and update `LATEST_B5_REPORT_POINTER.json`.

Terminal: `B5_NORMALIZED_DATASET_EXTRACTION_RECEIPT_READY_OR_EXACT_BLOCKER`.
