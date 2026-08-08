# B-2 Adapter Runtime·Scope Planner Directive V1

```text
DIRECTIVE_ID=B1-TO-B2-ADAPTER-RUNTIME-SCOPE-PLANNER-V1-20260804-001
PARENT_DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001
EXISTING_DIRECTIVE=A0-TO-B1-GENERIC-COLLECTOR-MATERIALIZATION-SHELL-V1-20260803-001
EXISTING_DIRECTIVE_SUPERSEDED=false
B1_CONTROL_PR=source-factory-core#19
START_HEAD=a99144065c86af0dd70866fcd4c0486372441c2d
MODE=FIXTURE_FIRST_READ_ONLY_INPUT_CONTRACT
```

## Owned Root

`yolla-panel-v1/b1-collector-materialization/workers/b2-adapter-runtime-scope/**`

## Mission

Implement the B-owned consumer side for `VERIFIED_ADAPTER_PACKAGE_V1` without analyzing a site or generating an Adapter.

Required work:

1. Adapter Loader and strict package validation.
2. Collection scope calculation.
3. Quota, rate and schedule calculation.
4. Fail-closed handling for missing, unverified or incompatible Adapter packages.
5. Fixture Adapter mode until A-2 publishes a verified package.

Required outputs:

- `VERIFIED_ADAPTER_PACKAGE_CONSUMER_CONTRACT_V1`
- `COLLECTION_SCOPE_PLAN_V1`
- `QUOTA_SCHEDULE_PLAN_V1`
- `ADAPTER_LOAD_RECEIPT_V1`

## Boundaries

```text
SITE_STRUCTURE_REANALYSIS=false
ADAPTER_GENERATION=false
UNVERIFIED_ADAPTER_USE=false
ACTUAL_SITE_EXTRACTION=false
ACTUAL_BULK_COLLECTION=false
PANEL_SHELL_EDIT=false
D_CANONICAL_DB_WRITE=false
PRODUCTION=false
READY=false
MERGE=false
```

Before work, commit `B2_START_REPORT_V1.json`. On completion, commit `B2_FINAL_REPORT_V1.json` and update `LATEST_B2_REPORT_POINTER.json`.

Terminal: `B2_ADAPTER_RUNTIME_SCOPE_READY_OR_EXACT_BLOCKER`.
