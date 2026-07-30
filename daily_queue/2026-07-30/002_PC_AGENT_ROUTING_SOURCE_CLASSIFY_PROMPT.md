# 002 PC Agent Routing Source Classify Prompt

```text
===== SF_CORE_PC_AGENT_ROUTING_SOURCE_CLASSIFY_PROMPT_START =====

WORKER_ID: SF_CORE_PC_AGENT_ROUTING_SOURCE_CLASSIFY_WORKER_002
TASK_ID: SF_CORE_PC_AGENT_ROUTING_SOURCE_CLASSIFY_20260730
WORKER_FUNCTION_CLASS: ARCHITECTURE_WORKER / SOURCE_CLASSIFICATION_WORKER
MODE: READ_ONLY / REPORT_ONLY / NO_SOURCE_MODIFICATION

목표:
PC Agent가 4명 Commander의 요청을 각 6명 Worker에게 전달하고, Worker 결과를 Commander에게 회수·GitHub 보고하는 데 필요한 재사용 소스를 분류하라.

입력:
- registry/REUSABLE_SOURCE_CLASSIFICATION_20260730.json
- reports/SF_CORE_SOURCE_INVENTORY_SCAN.json if available

분류 대상:
- GitHub directive reader
- exactly-once claim/executor
- commander-router
- worker-slot registry
- prompt delivery
- output collector
- receipt publisher
- WAL/lineage
- GitHub report commit/push adapter

산출물:
- reports/SF_CORE_PC_AGENT_ROUTING_SOURCE_CLASSIFICATION.md
- reports/SF_CORE_PC_AGENT_ROUTING_SOURCE_CLASSIFICATION.json
- WORKER_REPORT.md

판정:
GREEN_CLASSIFICATION_READY / YELLOW_INPUT_PENDING / RED_FIX_REQUIRED

금지:
실제 source 수정, production promotion, 실행하지 않은 PASS 주장 금지.

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

===== SF_CORE_PC_AGENT_ROUTING_SOURCE_CLASSIFY_PROMPT_END =====
```
