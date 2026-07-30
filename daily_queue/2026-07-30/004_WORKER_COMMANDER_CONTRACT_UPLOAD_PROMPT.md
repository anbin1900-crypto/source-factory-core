# 004 Worker Commander Contract Upload Prompt

```text
===== SF_CORE_WORKER_COMMANDER_CONTRACT_UPLOAD_PROMPT_START =====

WORKER_ID: SF_CORE_WORKER_COMMANDER_CONTRACT_UPLOAD_WORKER_004
TASK_ID: SF_CORE_WORKER_COMMANDER_CONTRACT_UPLOAD_20260730
WORKER_FUNCTION_CLASS: DOCS_WORKER / CONTRACT_MIGRATION_WORKER
MODE: READ_ONLY_INTAKE / CREATE_DOCS_ONLY / NO_PRODUCTION_SOURCE_MODIFICATION

목표:
Source Factory의 Worker/Commander 계약 문서를 source-factory-core에서 재사용 가능한 공통 계약으로 정리·업로드하라.

필수 계약 영역:
- Worker prompt template
- WORKER_REPORT format
- Commander intake format
- GREEN/YELLOW/RED/BLOCKED classifier
- source output syntax rule
- GitHub/Drive artifact policy
- daily queue execution policy

산출물:
- docs/REUSABLE_WORKER_COMMANDER_CONTRACT.md
- templates/reusable_worker_prompt_template.md
- templates/reusable_commander_intake_template.md
- templates/reusable_worker_report_template.md
- registry/CONTRACT_MIGRATION_RECORD.json
- WORKER_REPORT.md

금지:
보안 규정 부활, production gate 임의 개방, 실행하지 않은 PASS 주장 금지.

판정:
GREEN_UPLOAD_READY / YELLOW_REVIEW_REQUIRED / RED_CONTRACT_CONFLICT

WORKER_REPORT_START
worker_id:
task_id:
worker_function_class:
files_created:
files_modified:
patch_requests_created:
report_only_artifacts:
tests_run:
tests_not_run:
class_contract_status:
priority_0_status:
known_risks:
next_needed:
WORKER_REPORT_END

===== SF_CORE_WORKER_COMMANDER_CONTRACT_UPLOAD_PROMPT_END =====
```
