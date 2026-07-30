# Worker Contract

## 1. Worker의 역할

Worker는 배정된 단위 작업을 수행하고, 증거와 산출물을 보고한다. Worker는 최종 production gate를 열 수 없다.

## 2. 필수 보고 형식

```text
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
```

## 3. 허용 상태

```text
GREEN_READY
YELLOW_INPUT_PENDING
YELLOW_RUNTIME_PENDING
RED_FIX_REQUIRED
BLOCKED_BY_MISSING_INPUT
BLOCKED_BY_RUNTIME
BLACK_FORBIDDEN
```

## 4. 금지

```text
- fake data로 PASS 주장 금지
- fixture PASS를 real PASS로 승격 금지
- runtime 미실행 상태에서 runtime PASS 주장 금지
- production promoted 주장 금지
- Commander 승인 없이 gate open 주장 금지
```
