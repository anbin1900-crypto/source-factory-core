# AUTOMATION-C-W5 Directive V2

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WORKER_ID=AUTOMATION-C-W5
CONTROL_PR=#17
BRANCH=worker/automation-c-w5-background-install-log-v2
OWNED_PATHS=validation/v1-c-mode-six-worker/workers/w5/**,automation-c-v1/background_dispatch_runtime.cjs,install_v51024*.ps1,workspace_main_bridge.cjs
REQUIRED_TERMINAL=C6W5_BACKGROUND_DISPATCH_INSTALL_LOG_PASS_OR_EXACT_BLOCKER
```

## Mission

브라우저 전송·백그라운드 자원·설치·Rollback·작업관제 로그를 One Owner End-to-End로 검증하고 직접 교정한다.

```text
6개 슬롯 Batch 전송
Exactly-once·중복 0
30초 대기·최대 5회·MANUAL_REQUIRED
기존 작업 취소 0
숨김 Browser 필요시 생성·완료 후 해제
로그인 Profile 보존
Runtime Log·work_control_events.jsonl·Receipt 보존
로그 다운로드
정확한 Version 설치·Fail-closed
Smoke Test·Rollback·재시작
AUTO_TEST_WRITE_COUNT=0
```

실패하면 Source·Installer·Fixture·Test를 직접 수정하고 동일 시험을 재실행한다.

## Required Result

```text
V1_C_MODE_6_WORKER_RESULT_V2
PANEL | ROLE=AUTOMATION-C-W5 | STATUS={REPORTED|END}
```

Production·Ready·Merge·AUTO_TEST 쓰기는 금지한다.
