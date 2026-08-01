# SLOT_06 — SF_028 MIGRATION GATE AND OLD ROOT DELETE READINESS PROMPT V1

WORKER_ID: SLOT_06_SF028_MIGRATION_GATE_AND_OLD_ROOT_DELETE_READINESS_WORKER
TASK_ID: SF_028_MIGRATION_GATE_AND_OLD_ROOT_DELETE_READINESS
WORKER_FUNCTION_CLASS: INSPECTOR_WORKER / GATE_COMMANDER_ASSISTANT
REPORT_TO: SF_028_ACTIVE_CORE_MIGRATION_COMMANDER
REPO: anbin1900-crypto/source-factory-core

## GOAL

SLOT_01~SLOT_05 결과를 intake하여 새 `source-factory-active-core` 폴더가 기존 4.7GB OLD_ROOT를 대체할 수 있는지 판정한다. 이 worker는 OLD_ROOT를 직접 삭제하지 않는다. DELETE_OLD_ROOT_READY 여부만 보고한다.

## REQUIRED INPUTS

```text
state/SF_028_SIZE_AUDIT.json
state/SF_028_DELETE_CANDIDATE_SIZE_AUDIT.json
state/SF_028_RUNTIME_REACHABILITY_GRAPH.json
state/SF_028_ACTIVE_RUNTIME_CORE_MANIFEST.json
state/SF_028_VERIFY_ONLY_SOURCE_MANIFEST.json
state/SF_028_PENDING_INTEGRATION_SOURCE_LEDGER.json
state/SF_028_ARCHIVE_BACKLOG_POINTER.json
state/SF_028_ACTIVE_CORE_COPY_REPORT.json
state/SF_028_COMPACT_CONSTITUTION_COPY_REPORT.json
reports/sf028_active_core_verify_<timestamp>/VERIFY_ACTIVE_CORE_REPORT.md
reports/sf028_active_core_verify_<timestamp>/VERIFY_ACTIVE_CORE_REPORT.json
```

If any required input is missing, do not claim PASS. Use YELLOW or FAIL depending on severity.

## FORBIDDEN

- OLD_ROOT 삭제 금지
- 파일 이동 금지
- source 수정 금지
- 026 verifier 실행 금지
- PC Agent service 시작 금지
- GPT/browser/external API/middleware/production deploy 금지
- GitHub merge/ready 전환 금지
- SLOT_05 verify 없이 DELETE_OLD_ROOT_READY=true 주장 금지

## GATE CHECKS

1. SLOT_01 size audit present
2. SLOT_02 reachability graph present
3. SLOT_03 copy report present
4. SLOT_04 compact constitution/rules report present
5. SLOT_05 active core verify PASS or acceptable YELLOW
6. NEW_ROOT exists and is smaller than OLD_ROOT
7. Required runtime files present
8. Required compact constitution files present
9. Forbidden dirs copied count = 0
10. JSON parse PASS
11. Python compile PASS
12. JS syntax PASS or YELLOW_NOT_RUN with reason
13. Hash match PASS or YELLOW_PARTIAL with no required file mismatch
14. pending integration explicitly listed
15. 25,000 candidate backlog excluded from active core
16. old_root_deleted=false
17. external_effect_count=0

## DELETE READINESS RULE

`DELETE_OLD_ROOT_READY=true` only if all of the following are true:

```text
SLOT_05 terminal is PASS or YELLOW with only non-blocking issues
NEW_ROOT required files present
JSON parse PASS
Python compile PASS
forbidden dirs copied count = 0
required file hash mismatch count = 0
candidate backlog excluded
old_root_deleted = false
external_effect_count = 0
Commander/user approval still required
```

Even if ready, write:

```text
OLD_ROOT_DELETE_ACTION: NOT_RUN
OLD_ROOT_DELETE_REQUIRES: COMMANDER_AND_USER_CONFIRMATION
```

## OUTPUT FILES

```text
reports/sf028_migration_gate_<timestamp>/DELETE_OLD_ROOT_READY_REPORT.md
reports/sf028_migration_gate_<timestamp>/DELETE_OLD_ROOT_READY_REPORT.json
reports/sf028_migration_gate_<timestamp>/WORKER_REPORT_SLOT_06.md
```

## READY REPORT JSON SCHEMA

```json
{
  "task_id": "SF_028_MIGRATION_GATE_AND_OLD_ROOT_DELETE_READINESS",
  "worker_id": "SLOT_06_SF028_MIGRATION_GATE_AND_OLD_ROOT_DELETE_READINESS_WORKER",
  "old_root": "",
  "new_root": "",
  "old_root_size_bytes": 0,
  "new_root_size_bytes": 0,
  "size_reduction_estimate_bytes": 0,
  "required_inputs_present": true,
  "slot_status": {
    "SLOT_01": "PASS|YELLOW|FAIL|MISSING",
    "SLOT_02": "PASS|YELLOW|FAIL|MISSING",
    "SLOT_03": "PASS|YELLOW|FAIL|MISSING",
    "SLOT_04": "PASS|YELLOW|FAIL|MISSING",
    "SLOT_05": "PASS|YELLOW|FAIL|MISSING"
  },
  "blocking_issues": [],
  "non_blocking_warnings": [],
  "delete_old_root_ready": false,
  "old_root_deleted": false,
  "old_root_delete_requires": "COMMANDER_AND_USER_CONFIRMATION",
  "terminal_status": ""
}
```

## TERMINAL STATUS

Use one:

```text
SF_028_ACTIVE_CORE_MIGRATION_GATE_PASS_DELETE_READY_NOT_EXECUTED
SF_028_ACTIVE_CORE_MIGRATION_GATE_YELLOW_REVIEW_NEEDED
SF_028_ACTIVE_CORE_MIGRATION_GATE_FAIL
```

## REPORT FORMAT

```text
WORKER_REPORT_START
worker_id: SLOT_06_SF028_MIGRATION_GATE_AND_OLD_ROOT_DELETE_READINESS_WORKER
task_id: SF_028_MIGRATION_GATE_AND_OLD_ROOT_DELETE_READINESS
worker_function_class: INSPECTOR_WORKER / GATE_COMMANDER_ASSISTANT
old_root:
new_root:
old_root_size_bytes:
new_root_size_bytes:
size_reduction_estimate:
required_inputs_present:
slot_status:
blocking_issues:
non_blocking_warnings:
delete_old_root_ready:
old_root_deleted: false
files_created:
files_modified:
tests_run:
tests_not_run:
forbidden_operations:
  old_root_delete: NOT_RUN
  file_move: NOT_RUN
  source_modify: NOT_RUN
  026_oneflow_verifier: NOT_RUN
  pc_agent_service: NOT_STARTED
  ready_or_merge: NOT_RUN
  external_effect: 0
class_contract_status:
priority_0_status:
known_risks:
next_needed:
terminal_status: SF_028_ACTIVE_CORE_MIGRATION_GATE_PASS_DELETE_READY_NOT_EXECUTED | SF_028_ACTIVE_CORE_MIGRATION_GATE_YELLOW_REVIEW_NEEDED | SF_028_ACTIVE_CORE_MIGRATION_GATE_FAIL
WORKER_REPORT_END
```

## FINAL CAUTION

DELETE_READY is not DELETE_DONE. This worker must not delete OLD_ROOT. Deletion requires explicit Commander and user confirmation after this report.
