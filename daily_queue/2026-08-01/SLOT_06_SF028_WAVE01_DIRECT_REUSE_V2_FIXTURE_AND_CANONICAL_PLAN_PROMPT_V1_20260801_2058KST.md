# SLOT 06 — SF_028 WAVE 01 DIRECT REUSE V2 FIXTURE AND CANONICAL PLAN

WORKER_ID: `SLOT_06_SF028_WAVE01_DIRECT_REUSE_V2_FIXTURE_PLAN_WORKER`
TASK_ID: `SF_028_P0_WAVE_01_DIRECT_REUSE_V2_FIXTURE_AND_CANONICAL_PLAN`
WORKER_FUNCTION_CLASS: `TEST_FIXTURE_PLANNER / CANONICAL_LINEAGE_INSPECTOR`
REPORT_TO: `SF_028_P0_COMMANDER`
MODE: `REPORT_ONLY / STATIC_PLAN_ONLY / NO_SOURCE_EXECUTION / NO_PROMOTION`

## Authority

- Wave 1 closure commit: `7381089ec627267f9155bc7e5c39784734651097`
- Integrated ledger commit: `e0631114f5d34c21a9b3f3b9d5bae4d3e4f69322`
- Direct reuse queue commit: `d0844d9a5e917fadeb77ab1dcf82bc50d2981bd4`
- Adapter backlog commit: `a1ffb6cf1c2b85f1d52094b4358af50d3e770411`
- Nonpromotion ledger commit: `215e5439e490f42ce672cefb2ad6b723906aac1e`
- Maximum parallel policy commit: `8b90fb4f9ded9a9f03875b6d01f05c37c15b250d`

## Current parallel context

- SLOT 01~05 are classifying Wave 2.
- This SLOT 06 task must not block, modify, or duplicate their work.
- When all five Wave 2 result commits exist, Wave 2 integration becomes SLOT 06 priority after this task reaches an append-only checkpoint or terminal report.

## Goal

Convert the 19 Wave 1 `DIRECT_REUSE` candidates from a flat V1 static queue into a precise V2 fixture plan and canonical-lineage review package. This task designs verification; it does not execute source code or promote any candidate.

## Required intake checks

1. Read `state/SF_028_P0_WAVE_01_DIRECT_REUSE_V2_FIXTURE_QUEUE.json`.
2. Confirm candidate count = 19.
3. Confirm every item has:
   - `current_state=V1_STATIC_ACCEPTED`
   - `next_state=V2_FIXTURE_REQUIRED`
   - `promotion_status=NOT_PROMOTED`
4. Resolve each item back to the immutable Wave 1 source result record.
5. Preserve all original SHA-256, risks, dependencies and next-action evidence.

## Required analysis

### A. Fixture-domain grouping

Group each candidate into one primary V2 domain:

```text
PURE_MODEL_TRANSITION
PURE_PARSER
COMPLETION_OR_STABILITY_DETECTOR
RETRY_OR_PAUSE_CONTROL
LOG_OR_AUTOSAVE_MODEL
OUTPUT_CAPTURE_OR_COLLECTION_ADAPTER
DELIVERY_OR_DISPATCH_MODEL
REPLAY_OR_IDEMPOTENCY_MODEL
```

### B. Per-candidate fixture specification

For each of the 19 candidates define:

- source_id
- file_name
- SHA-256
- fixture_domain
- minimum positive cases
- negative cases
- boundary cases
- deterministic clock/id injection needs
- required mocks or stubs
- forbidden effects to assert
- expected invariants
- V2 pass criteria
- V2 fail criteria
- recommended fixture owner class
- promotion_status=`NOT_PROMOTED`

At least three concrete fixture cases per candidate are required unless the candidate has a justified smaller exhaustive state space.

### C. Canonical-lineage review

Inspect exact or semantic overlap among the 19 candidates and current repository canonical sources.

Mandatory review pair:

```text
PCAGENT-AUTO-SRC-000881 stage4TaeraLinkExtractor.js
PCAGENT-AUTO-SRC-004212 stage4TaeraLinkExtractor.js
```

For each overlap group record:

- exact duplicate: true/false
- semantic overlap estimate and evidence
- older/newer/parallel lineage relation
- preferred fixture target
- alternate retained as reference or rejected
- canonical decision state: `PROPOSED_ONLY`

Do not claim a canonical winner without exact evidence. A proposed winner is not promotion.

### D. V2 execution-wave design

Prepare a later V2 worker batch design that can use SLOT 01~05 in parallel while SLOT 06 integrates results.

Constraints:

- no more than 5 fixture work packages per wave
- balance packages by expected effort, not only item count
- pure models and effectful adapters must not share the same fixture boundary unless explicitly justified
- browser/profile candidates require mock-only fixtures in V2
- no live browser, network, process execution, middleware or production environment

## Required outputs

Create append-only:

```text
state/SF_028_P0_WAVE_01_DIRECT_REUSE_V2_FIXTURE_PLAN.json
state/SF_028_P0_WAVE_01_CANONICAL_LINEAGE_REVIEW.json
state/SF_028_P0_WAVE_01_V2_FIXTURE_WORK_PACKAGE_MAP.json
reports/sf028_p0_wave01_v2_fixture_plan_<timestamp>/WORKER_REPORT_SLOT_06.md
```

## Required output counts

- fixture plan candidates: exactly 19
- candidate Source IDs unique: exactly 19
- missing queue item count: 0
- duplicate Source ID count: 0
- work package count: 1 to 5
- officially promoted count: 0

## Forbidden

- source execution
- source modification
- dependency installation
- actual fixture execution
- runtime/service/browser/network start
- official canonical promotion
- Ready or Merge
- OLD_ROOT deletion
- changing Wave 2 worker assignments

## Terminal status

Use one:

```text
SF_028_WAVE01_DIRECT_REUSE_V2_FIXTURE_PLAN_PASS
SF_028_WAVE01_DIRECT_REUSE_V2_FIXTURE_PLAN_YELLOW_REVIEW_NEEDED
SF_028_WAVE01_DIRECT_REUSE_V2_FIXTURE_PLAN_FAIL
```

PASS means the V2 plan and proposed canonical-lineage map are complete. It does not mean V2 tests passed or sources were promoted.

## Report minimum

```text
WORKER_REPORT_START
worker_id: SLOT_06_SF028_WAVE01_DIRECT_REUSE_V2_FIXTURE_PLAN_WORKER
task_id: SF_028_P0_WAVE_01_DIRECT_REUSE_V2_FIXTURE_AND_CANONICAL_PLAN
queue_candidate_count:
resolved_record_count:
unique_source_id_count:
fixture_domain_counts:
canonical_overlap_group_count:
mandatory_taera_pair_review_status:
work_package_count:
files_created:
source_execution_count: 0
source_modification_count: 0
fixture_execution_count: 0
promotion_count: 0
external_effect_count: 0
wave_02_assignments_modified: false
terminal_status:
WORKER_REPORT_END
```
