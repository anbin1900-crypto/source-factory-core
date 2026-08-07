# AUTOMATION-C-W6 Directive V2

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WORKER_ID=AUTOMATION-C-W6
CONTROL_PR=#17
BRANCH=worker/automation-c-w6-failure-acceptance-v2
OWNED_PATHS=validation/v1-c-mode-six-worker/workers/w6/**
IMPLEMENTATION_DIRECT_EDIT=false
REQUIRED_TERMINAL=C6W6_FAILURE_RECOVERY_INDEPENDENT_ACCEPTANCE_PASS_OR_EXACT_BLOCKER
```

## Mission

C 모드와 명령 실행모드의 실패 주입·복구·대상 PC 통합 수용을 독립 수행한다.

```text
ERR_ABORTED·ERR_FAILED
GPT 응답 없음
GitHub 지연·일시 오류·Pagination
잘못된 PANEL·ROLE·WAVE·COMMAND_ID
과거 A/E 상태 오염
중복·순서역전·보조워커 결과 경합
WAVE 도중 재시작
작업관제 로그 누락
6개 워커 × 3 WAVE
로그인 Profile·Rollback·AUTO_TEST_WRITE_COUNT=0
```

구현 Source를 직접 수정하지 않는다. 재현 가능한 Fixture·Finding·정확한 수정요구를 게시하되 W1~W5의 교정을 막지 않는다. 최종 수용은 실제 증거로만 판정한다.

## Required Result

```text
V1_C_MODE_6_WORKER_RESULT_V2
PANEL | ROLE=AUTOMATION-C-W6 | STATUS={REPORTED|END}
```

대상 PC 증거가 없으면 PASS를 주장하지 않는다. Production·Ready·Merge·AUTO_TEST 쓰기는 금지한다.
