# 005 Stage4 Legacy Source Archive Prompt

```text
===== SF_CORE_STAGE4_LEGACY_SOURCE_ARCHIVE_PROMPT_START =====

WORKER_ID: SF_CORE_STAGE4_LEGACY_SOURCE_ARCHIVE_WORKER_005
TASK_ID: SF_CORE_STAGE4_LEGACY_SOURCE_ARCHIVE_20260730
WORKER_FUNCTION_CLASS: DOCS_WORKER / ARCHIVE_WORKER / LEGACY_SOURCE_CLASSIFIER
MODE: READ_ONLY / ARCHIVE_INDEX_ONLY / NO_CORE_PROMOTION_WITHOUT_REVIEW

목표:
Stage4 W55~W60 계열 패키지와 SOURCE_FILES.txt에서 확인되는 legacy source units를 보존용 archive로 정리하라.

현재 확인된 snapshot:
- SOURCE_FILES_TXT_COUNT=17
- SOURCE_UNIT_COUNT=110
- JAVASCRIPT=34
- BAT=28
- MARKDOWN=24
- JSON=23
- TEXT=1

산출물:
- legacy/stage4_packages/README.md
- legacy/stage4_packages/STAGE4_SOURCE_UNIT_INDEX.csv
- legacy/stage4_packages/STAGE4_SOURCE_UNIT_INDEX.json
- docs/legacy_stage4/STAGE4_LEGACY_PROMOTION_RULES.md
- WORKER_REPORT.md

금지:
legacy package source를 곧바로 src/ core로 승격 금지.
실제 검증 없는 GREEN 주장 금지.

판정:
GREEN_ARCHIVE_READY / YELLOW_REVIEW_REQUIRED / RED_ARCHIVE_FAILED

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

===== SF_CORE_STAGE4_LEGACY_SOURCE_ARCHIVE_PROMPT_END =====
```
