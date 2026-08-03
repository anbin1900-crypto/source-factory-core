# B-4 Raw Artifact·Source Record Envelope Directive V1

```text
DIRECTIVE_ID=B1-TO-B4-RAW-ARTIFACT-SOURCE-ENVELOPE-V1-20260804-001
PARENT_DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001
EXISTING_DIRECTIVE=A0-TO-B1-GENERIC-COLLECTOR-MATERIALIZATION-SHELL-V1-20260803-001
EXISTING_DIRECTIVE_SUPERSEDED=false
B1_CONTROL_PR=source-factory-core#19
START_HEAD=a99144065c86af0dd70866fcd4c0486372441c2d
MODE=FIXTURE_FIRST_IMMUTABLE_ARTIFACT_PIPELINE
```

## Owned Root

`yolla-panel-v1/b1-collector-materialization/workers/b4-raw-artifact-intake/**`

## Mission

Implement immutable preservation of every fixture or verified-Adapter response and build the C-consumable source envelope.

Required preserved facts:

- Raw response bytes or canonical fixture bytes.
- Source URL.
- Collection timestamp.
- Parameter/request summary without secret values.
- SHA-256.
- Record count.
- Response format and metadata.
- Artifact readback identity.

Required outputs:

- `RAW_ARTIFACT_MANIFEST_V1`
- `SOURCE_RECORD_ENVELOPE_V1`
- `RAW_ARTIFACT_READBACK_RECEIPT_V1`
- `SOURCE_METADATA_PRESERVATION_RECEIPT_V1`

`SOURCE_RECORD_ENVELOPE_V1` must preserve source fields and evidence links but must not perform C-owned semantic transformation.

## Boundaries

```text
RAW_ARTIFACT_OVERWRITE=false
SECRET_VALUE_STORAGE=false
C_SEMANTIC_TRANSFORMATION=false
D_CANONICAL_SCHEMA_DECISION=false
D_CANONICAL_DB_WRITE=false
ACTUAL_SITE_EXTRACTION=false_UNTIL_A2_VERIFIED_PACKAGE
PANEL_SHELL_EDIT=false
PRODUCTION=false
READY=false
MERGE=false
```

Before work, commit `B4_START_REPORT_V1.json`. On completion, commit `B4_FINAL_REPORT_V1.json` and update `LATEST_B4_REPORT_POINTER.json`.

Terminal: `B4_RAW_ARTIFACT_SOURCE_ENVELOPE_READY_OR_EXACT_BLOCKER`.
