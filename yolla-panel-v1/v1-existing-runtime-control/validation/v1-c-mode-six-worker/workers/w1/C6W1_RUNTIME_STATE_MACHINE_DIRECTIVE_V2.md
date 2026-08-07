# AUTOMATION-C-W1 Directive V2

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WORKER_ID=AUTOMATION-C-W1
CONTROL_PR=#17
BRANCH=worker/automation-c-w1-runtime-state-v2
OWNED_PATHS=validation/v1-c-mode-six-worker/workers/w1/**,automation-c-v1/c_mode_runtime.cjs,automation-c-v1/tests/test_c_mode_runtime.cjs
REQUIRED_TERMINAL=C6W1_RUNTIME_STATE_MACHINE_PASS_OR_EXACT_BLOCKER
```

## Mission

C Runtime State Machine과 Wave 시간규칙을 One Owner End-to-End로 검증하고 직접 교정한다.

```text
IDLE→START
START 7개 Receipt
6개 워커 동일 WAVE 일괄등록
20분: 미보고 0 / 1~2 / 3 이상 분기
90분: 보조 워커 정확히 2명
명시적 게시요구 4회: 신규 워커 교체
공정률 단조성
END·재활성화
Pause·Resume
재시작 상태복구
```

실패하면 Source·Fixture·Test를 직접 수정하고 동일 시험을 재실행한다. 같은 오류가 두 번 반복되면 방법을 변경한다.

## Required Result

```text
V1_C_MODE_6_WORKER_RESULT_V2
PANEL | ROLE=AUTOMATION-C-W1 | STATUS={REPORTED|END}
```

Production·Ready·Merge·AUTO_TEST 쓰기는 금지한다.
