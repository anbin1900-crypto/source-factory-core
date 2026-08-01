# SLOT 06 — SF_028 Wave 01 DIRECT_REUSE V2 Fixture and Canonical Plan Report

GENERATED_AT_KST: 2026-08-01T21:00:00+09:00
WORKER_ID: SLOT_06_SF028_WAVE01_DIRECT_REUSE_V2_FIXTURE_PLAN_WORKER
TASK_ID: SF_028_P0_WAVE_01_DIRECT_REUSE_V2_FIXTURE_AND_CANONICAL_PLAN
WORKER_FUNCTION_CLASS: TEST_FIXTURE_PLANNER / CANONICAL_LINEAGE_INSPECTOR
MODE: REPORT_ONLY / STATIC_PLAN_ONLY / NO_SOURCE_EXECUTION / NO_PROMOTION

## Terminal

`SF_028_WAVE01_DIRECT_REUSE_V2_FIXTURE_PLAN_PASS`

The Wave 1 queue contains exactly 19 unique DIRECT_REUSE candidates. Every candidate remains `V1_STATIC_ACCEPTED`, requires `V2_FIXTURE_REQUIRED`, and remains `NOT_PROMOTED`.

## Intake

- task prompt: `ed07471ebc99d9e1e0332018648902aea4a8ccce`
- Wave 1 closure: `7381089ec627267f9155bc7e5c39784734651097`
- integrated ledger: `e0631114f5d34c21a9b3f3b9d5bae4d3e4f69322`
- DIRECT_REUSE queue: `d0844d9a5e917fadeb77ab1dcf82bc50d2981bd4`
- maximum parallel policy: `8b90fb4f9ded9a9f03875b6d01f05c37c15b250d`
- queue candidates: 19
- resolved immutable source records: 19
- missing queue items: 0
- duplicate Source IDs: 0

## Fixture-domain grouping

- COMPLETION_OR_STABILITY_DETECTOR: 3
- DELIVERY_OR_DISPATCH_MODEL: 2
- LOG_OR_AUTOSAVE_MODEL: 5
- OUTPUT_CAPTURE_OR_COLLECTION_ADAPTER: 2
- PURE_MODEL_TRANSITION: 1
- PURE_PARSER: 3
- REPLAY_OR_IDEMPOTENCY_MODEL: 1
- RETRY_OR_PAUSE_CONTROL: 2

Each candidate specification contains its original SHA-256, immutable result pointer, dependency and risk record, original next action, at least three positive cases, negative and boundary cases, deterministic clock/ID needs, required mocks, forbidden effects, expected invariants, V2 pass/fail criteria and recommended owner class.

## Canonical-lineage review

Seven overlap groups were identified. All decisions remain `PROPOSED_ONLY`.

Mandatory Taera pair:

- `PCAGENT-AUTO-SRC-000881`: `4bdb1f56629b7d17b7eabfba4916528c2a97cab3e3451d0b686478a8f718efb3`
- `PCAGENT-AUTO-SRC-004212`: `12ca99f0230821cdf0fa8b030df933730e1b755a6cd7537f32219cc62fe9ed85`
- exact duplicate: false
- semantic overlap estimate: 0.93
- relation: parallel or derived lineage not proven
- preferred differential-fixture target: `004212` (`PROPOSED_ONLY`)
- alternate: `000881` retained as differential reference
- current repository exact-name search: no exact path found; this is not proof that no historical or unindexed copy exists

No official canonical winner or reusable-source promotion was claimed.

## V2 execution-wave design

Five balanced work packages cover all 19 candidates:

1. parsers and parser lineage — 3 candidates
2. completion/stability detectors and control policies — 5 candidates
3. log/autosave models — 5 candidates
4. delivery/replay models — 4 candidates
5. output capture/collection adapters — 2 candidates, strict mock-only boundary

Pure models and mock-adapter boundaries are separated. No package permits live browser, network, process, filesystem, middleware or production effects.

## Artifacts

- `state/SF_028_P0_WAVE_01_DIRECT_REUSE_V2_FIXTURE_PLAN.json`
- `state/SF_028_P0_WAVE_01_CANONICAL_LINEAGE_REVIEW.json`
- `state/SF_028_P0_WAVE_01_V2_FIXTURE_WORK_PACKAGE_MAP.json`
- `reports/sf028_p0_wave01_v2_fixture_plan_20260801_2100KST/WORKER_REPORT_SLOT_06.md`

## Parallel boundary

SLOT 01~05 Wave 2 classification assignments were not modified. This report is an append-only checkpoint/terminal for the planning task. If all five Wave 2 results are published, Wave 2 integration becomes the next SLOT 06 priority.

WORKER_REPORT_START
worker_id: SLOT_06_SF028_WAVE01_DIRECT_REUSE_V2_FIXTURE_PLAN_WORKER
task_id: SF_028_P0_WAVE_01_DIRECT_REUSE_V2_FIXTURE_AND_CANONICAL_PLAN
queue_candidate_count: 19
resolved_record_count: 19
unique_source_id_count: 19
fixture_domain_counts: {"COMPLETION_OR_STABILITY_DETECTOR": 3, "DELIVERY_OR_DISPATCH_MODEL": 2, "LOG_OR_AUTOSAVE_MODEL": 5, "OUTPUT_CAPTURE_OR_COLLECTION_ADAPTER": 2, "PURE_MODEL_TRANSITION": 1, "PURE_PARSER": 3, "REPLAY_OR_IDEMPOTENCY_MODEL": 1, "RETRY_OR_PAUSE_CONTROL": 2}
canonical_overlap_group_count: 7
mandatory_taera_pair_review_status: PASS_EXACT_FALSE_HIGH_SEMANTIC_OVERLAP_PROPOSED_ONLY
work_package_count: 5
files_created:
  - state/SF_028_P0_WAVE_01_DIRECT_REUSE_V2_FIXTURE_PLAN.json
  - state/SF_028_P0_WAVE_01_CANONICAL_LINEAGE_REVIEW.json
  - state/SF_028_P0_WAVE_01_V2_FIXTURE_WORK_PACKAGE_MAP.json
  - reports/sf028_p0_wave01_v2_fixture_plan_20260801_2100KST/WORKER_REPORT_SLOT_06.md
source_execution_count: 0
source_modification_count: 0
fixture_execution_count: 0
promotion_count: 0
external_effect_count: 0
wave_02_assignments_modified: false
terminal_status: SF_028_WAVE01_DIRECT_REUSE_V2_FIXTURE_PLAN_PASS
WORKER_REPORT_END
