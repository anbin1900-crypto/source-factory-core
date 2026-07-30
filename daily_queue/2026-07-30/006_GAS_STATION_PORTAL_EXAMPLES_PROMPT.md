# 006 Gas Station Portal Examples Prompt

```text
===== SF_CORE_GAS_STATION_PORTAL_EXAMPLES_PROMPT_START =====

WORKER_ID: SF_CORE_GAS_STATION_PORTAL_EXAMPLES_WORKER_006
TASK_ID: SF_CORE_GAS_STATION_PORTAL_EXAMPLES_20260730
WORKER_FUNCTION_CLASS: DOCS_WORKER / EXAMPLE_PACKAGE_WORKER / PORTAL_SUPPORT_WORKER
MODE: CREATE_EXAMPLES_ONLY / NO_PRODUCT_PRODUCTION_CODE / NO_EXTERNAL_RUNTIME

목표:
주유소 전문 포털 개발에 source-factory-core를 재사용하는 예제 구조를 만든다.

포털 초기 범위:
- 오피넷 데이터 수집
- 정규화
- 가격 변동 분석
- 주유소 상세페이지
- 지도/표/다운로드
- 자연어 데이터 질의

산출물:
- examples/gas_station_portal/README.md
- examples/gas_station_portal/000_DAILY_PLAN.json
- examples/gas_station_portal/001_OPINET_INGEST_PROMPT.md
- examples/gas_station_portal/002_PRICE_CHANGE_ANALYSIS_PROMPT.md
- examples/gas_station_portal/003_PORTAL_PAGE_GENERATION_PROMPT.md
- examples/gas_station_portal/ARTIFACT_POINTER_EXAMPLE.json
- WORKER_REPORT.md

금지:
실제 Opinet 호출, 외부 수집 실행, production DB 연결, 개인정보 포함 금지.

판정:
GREEN_EXAMPLES_READY / YELLOW_REQUIRE_PORTAL_REPO / RED_EXAMPLE_CONFLICT

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

===== SF_CORE_GAS_STATION_PORTAL_EXAMPLES_PROMPT_END =====
```
