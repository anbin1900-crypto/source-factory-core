# Source Factory Core Operating Model

## 1. 목적

Source Factory Core는 AI 개발 작업을 GitHub 원장 기반으로 배치, 실행, 수집, 검증, 보고, 재개하기 위한 재사용 코어입니다.

## 2. 역할 분리

```text
GitHub
- daily_queue
- prompt
- worker report
- commander decision
- artifact pointer
- current state

Google Drive
- large ZIP
- DB dump
- real-site evidence bundle
- collector output archive
- large CSV / JSONL / GZIP

Local Runner
- 실제 브라우저 실행
- DB runtime
- queue 순차 실행
- output autosave
- commit/push trigger

GPT Commander
- 작업 지시 생성
- 결과 intake
- gate decision
- next action generation

Worker
- 단위 작업 수행
- WORKER_REPORT 제출
- 산출물 생성
```

## 3. 기본 실행 흐름

```text
1. daily_queue/YYYY-MM-DD/000_DAILY_PLAN.json 읽기
2. order 순서대로 prompt_path 읽기
3. Worker에게 prompt 전달
4. output 저장
5. WORKER_REPORT 추출
6. status 분류
7. runs/YYYY-MM-DD/{order}_{task_id}/에 결과 저장
8. GitHub commit/push
9. stop policy에 따라 계속/중단 결정
10. DAILY_SUMMARY 생성
```

## 4. 속도 정책

```text
DEFAULT_CONCURRENCY: 1
RECOMMENDED_DELAY_BETWEEN_TASKS_MINUTES: 2
MAX_RED_FAILURES_DEFAULT: 2
STOP_ON_BLACK: true
STOP_ON_PRODUCTION_PROMOTION_REQUEST: true
```

## 5. 최종 판정 권위

Worker의 status는 자기 보고입니다.
Commander만 최종 gate decision을 내릴 수 있습니다.

```text
Worker Report != Final Commander Decision
Fixture PASS != Real Runtime PASS
Candidate != Promoted
Drive Pointer != Byte Verification
```
