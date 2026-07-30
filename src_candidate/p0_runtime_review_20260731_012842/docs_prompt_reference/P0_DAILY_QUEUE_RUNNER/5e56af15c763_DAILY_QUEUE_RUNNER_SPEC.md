# Daily Queue Runner Spec V1

## 1. 목표

하루 작업 할당량을 GitHub에 등록하고, Source Factory Local Runner가 순서대로 읽어 실행하도록 한다.

```text
001 읽기
→ 실행
→ output 저장
→ GitHub commit
→ 002 읽기
→ 실행
→ output 저장
→ GitHub commit
```

## 2. Daily Plan 위치

```text
daily_queue/YYYY-MM-DD/000_DAILY_PLAN.json
```

## 3. Prompt 위치

```text
daily_queue/YYYY-MM-DD/001_TASK_NAME.md
daily_queue/YYYY-MM-DD/002_TASK_NAME.md
```

## 4. Run Output 위치

```text
runs/YYYY-MM-DD/001_TASK_NAME/output.txt
runs/YYYY-MM-DD/001_TASK_NAME/WORKER_REPORT.md
runs/YYYY-MM-DD/001_TASK_NAME/RESULT.json
```

## 5. 중단 정책

```text
GREEN_READY: continue
YELLOW_INPUT_PENDING: continue unless dependency-critical
YELLOW_RUNTIME_PENDING: continue next independent task
RED_FIX_REQUIRED: increment red_count
BLOCKED_BY_MISSING_INPUT: continue next independent task
BLOCKED_BY_RUNTIME: stop runtime branch only
BLACK_FORBIDDEN: stop all
```

## 6. 속도 정책

```text
concurrency: 1
cooldown_after_task_seconds: 120
cooldown_after_error_seconds: 600
max_tasks_per_run: configured by daily plan
max_red_failures: configured by daily plan
```
