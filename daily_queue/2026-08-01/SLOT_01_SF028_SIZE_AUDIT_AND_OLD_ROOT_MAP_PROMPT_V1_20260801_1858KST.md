# SLOT_01 — SF_028 SIZE AUDIT AND OLD ROOT MAP PROMPT V1

WORKER_ID: SLOT_01_SF028_SIZE_AUDIT_AND_OLD_ROOT_MAP_WORKER
TASK_ID: SF_028_SIZE_AUDIT_AND_OLD_ROOT_MAP
WORKER_FUNCTION_CLASS: INSPECTOR_WORKER
REPORT_TO: SF_028_ACTIVE_CORE_MIGRATION_COMMANDER
REPO: anbin1900-crypto/source-factory-core

## GOAL

기존 소스팩토리 폴더가 약 4.7GB까지 커진 원인을 상위 폴더·확장자·대형 파일·archive/cache 후보 기준으로 감사한다. 삭제하지 않는다. 이동하지 않는다. 복사하지 않는다. 오직 원장화한다.

## OLD_ROOT CANDIDATES

```text
E:\YOLLA\source-factory-core
D:\SOURCE FACTORY\source-factory-core
```

둘 중 실제 존재하는 경로를 OLD_ROOT로 선택한다. 둘 다 존재하면 더 최근 Git HEAD 또는 사용자가 현재 쓰는 경로를 우선하고, 나머지는 secondary_old_root로 기록한다.

## FORBIDDEN

- OLD_ROOT 삭제 금지
- 파일 이동 금지
- production source 수정 금지
- 026 one-flow verifier 실행 금지
- PC Agent service 시작 금지
- GPT/browser/external API/middleware/production deploy 금지
- 25,000개 후보군 전체 내용 분석 금지
- node_modules, .git, reports 전체를 active core로 판정 금지

## ALLOWED

- read-only directory size audit
- file count audit
- large file listing
- extension summary
- suspected archive/cache/backlog/delete-candidate classification
- state/*.json 보고서 생성
- reports/*/WORKER_REPORT 작성

## REQUIRED ANALYSIS

1. OLD_ROOT 존재 확인
2. current branch / HEAD / dirty 상태 확인
3. OLD_ROOT total size bytes 산정
4. top-level directory size 산정
5. extension별 file count / size 산정
6. 50MB 이상 대형 파일 목록 작성
7. 다음 항목의 존재와 크기 기록

```text
.git/
node_modules/
reports/
daily_queue/
staging/
extracted/
candidate/
backlog/
dist/
build/
cache/
temp/
*.zip
*.7z
*.tar
*.gz
```

## OUTPUT FILES

Create only these report artifacts:

```text
state/SF_028_SIZE_AUDIT.json
state/SF_028_DELETE_CANDIDATE_SIZE_AUDIT.json
reports/sf028_slot01_size_audit_<timestamp>/WORKER_REPORT_SLOT_01.md
```

## SF_028_SIZE_AUDIT.json SCHEMA

```json
{
  "task_id": "SF_028_SIZE_AUDIT_AND_OLD_ROOT_MAP",
  "worker_id": "SLOT_01_SF028_SIZE_AUDIT_AND_OLD_ROOT_MAP_WORKER",
  "old_root": "",
  "secondary_old_root": "",
  "current_head": "",
  "current_branch": "",
  "worktree_dirty": false,
  "total_size_bytes": 0,
  "top_level_dirs": [],
  "extension_summary": [],
  "large_files_50mb_plus": [],
  "suspected_size_drivers": [],
  "notes": []
}
```

## DELETE CANDIDATE AUDIT SCHEMA

```json
{
  "task_id": "SF_028_SIZE_AUDIT_AND_OLD_ROOT_MAP",
  "hard_delete_allowed": false,
  "delete_candidate_dirs": [],
  "delete_candidate_files": [],
  "archive_first_required": true,
  "commander_approval_required": true,
  "old_root_deleted": false
}
```

## PASS CRITERIA

- total size 산정 완료
- top-level size drivers 확인 완료
- large files 목록 생성
- delete candidate는 원장화만 하고 삭제하지 않음
- external effect 없음

## REPORT FORMAT

```text
WORKER_REPORT_START
worker_id: SLOT_01_SF028_SIZE_AUDIT_AND_OLD_ROOT_MAP_WORKER
task_id: SF_028_SIZE_AUDIT_AND_OLD_ROOT_MAP
worker_function_class: INSPECTOR_WORKER
old_root:
current_head:
current_branch:
total_size_bytes:
files_created:
files_modified:
large_file_count:
top_size_drivers:
tests_run:
tests_not_run:
forbidden_operations:
  old_root_delete: NOT_RUN
  file_move: NOT_RUN
  production_source_modify: NOT_RUN
  026_oneflow_verifier: NOT_RUN
  pc_agent_service: NOT_STARTED
  external_effect: 0
class_contract_status:
priority_0_status:
known_risks:
next_needed:
terminal_status: SF_028_SLOT_01_SIZE_AUDIT_PASS | SF_028_SLOT_01_SIZE_AUDIT_YELLOW | SF_028_SLOT_01_SIZE_AUDIT_FAIL
WORKER_REPORT_END
```
