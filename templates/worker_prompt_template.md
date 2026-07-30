# Worker Prompt Template

```text
===== SOURCE_FACTORY_WORKER_PROMPT_START =====

WORKER_ID: {{WORKER_ID}}
TASK_ID: {{TASK_ID}}
WORKER_FUNCTION_CLASS_PRIMARY: {{WORKER_FUNCTION_CLASS}}
TARGET_STAGE: {{TARGET_STAGE}}
MODE: {{MODE}}

기준 상태 파일:
- {{CURRENT_STATE_PATH}}
- {{INPUT_LEDGER_PATH}}

입력:
{{INPUTS}}

목표:
{{GOALS}}

금지:
{{FORBIDDEN}}

필수 산출물:
{{REQUIRED_OUTPUTS}}

판정 기준:
{{DECISION_RULES}}

보고 형식:
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

===== SOURCE_FACTORY_WORKER_PROMPT_END =====
```
