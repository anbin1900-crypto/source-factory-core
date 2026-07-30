# 003 GPT Browser Bridge Source Classify Prompt

```text
===== SF_CORE_GPT_BROWSER_BRIDGE_SOURCE_CLASSIFY_PROMPT_START =====

WORKER_ID: SF_CORE_GPT_BROWSER_BRIDGE_SOURCE_CLASSIFY_WORKER_003
TASK_ID: SF_CORE_GPT_BROWSER_BRIDGE_SOURCE_CLASSIFY_20260730
WORKER_FUNCTION_CLASS: INSPECTOR_WORKER / BROWSER_BRIDGE_SOURCE_CLASSIFICATION_WORKER
MODE: READ_ONLY / REPORT_ONLY / NO_RUNTIME_PATCH / NO_SOURCE_MODIFICATION

목표:
기존 Source Factory Browser의 GPT 입력·답변 수집 소스를 찾아 source-factory-core의 reusable Browser Bridge 모듈로 분류하라.

특히 확인할 소스명:
- gptWindowController.js
- gptOutputCollector.js
- gptInjectionPlan.md
- gptPreload.js
- windowManager.js
- promptBuilder.js
- taskInstructionManager.js
- rawOutputStore.js
- stateStore.js
- windowRegistry.js

분류:
A. direct reusable
B. reusable after path parameterization
C. Electron/session dependent
D. ChatGPT selector dependent
E. project-specific only

산출물:
- reports/SF_CORE_GPT_BROWSER_BRIDGE_SOURCE_CLASSIFICATION.md
- reports/SF_CORE_GPT_BROWSER_BRIDGE_SOURCE_CLASSIFICATION.json
- reports/SF_CORE_GPT_BROWSER_BRIDGE_MIGRATION_MAP.csv
- WORKER_REPORT.md

금지:
실제 ChatGPT 자동전송 실행 금지. 브라우저 runtime patch 금지. source 수정 금지.

판정:
GREEN_CLASSIFICATION_READY / YELLOW_LOCAL_SOURCE_REQUIRED / RED_CLASSIFICATION_FAILED

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

===== SF_CORE_GPT_BROWSER_BRIDGE_SOURCE_CLASSIFY_PROMPT_END =====
```
