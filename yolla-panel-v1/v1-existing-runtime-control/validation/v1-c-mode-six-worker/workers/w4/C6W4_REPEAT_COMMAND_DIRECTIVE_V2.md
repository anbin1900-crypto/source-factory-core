# AUTOMATION-C-W4 Directive V2

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WORKER_ID=AUTOMATION-C-W4
CONTROL_PR=#17
BRANCH=worker/automation-c-w4-repeat-command-v2
OWNED_PATHS=validation/v1-c-mode-six-worker/workers/w4/**,automation-c-v1/repeat_command_runtime.cjs,automation-c-v1/tests/test_repeat_command_runtime.cjs
REQUIRED_TERMINAL=C6W4_REPEAT_COMMAND_RUNTIME_PASS_OR_EXACT_BLOCKER
```

## Mission

명령어 입력모드의 반복 실행 Runtime을 One Owner End-to-End로 검증하고 직접 교정한다.

```text
사용자 입력문 Byte 보존
대상 그룹·슬롯 선택
EVERY_X_MINUTES
AFTER_COMPLETION
ROLE+COMMAND_ID 정확한 완료상관
다른 C 작업 결과 오인 금지
STATUS=END 자동정지
활성 명령 중복 Queue 금지
Pause·Resume·삭제
재시작 후 설정·전송수 복구
작업관제 로그·Receipt
```

실패하면 Runtime Module·Fixture·Test를 직접 수정하고 동일 시험을 재실행한다.

## Required Result

```text
V1_C_MODE_6_WORKER_RESULT_V2
PANEL | ROLE=AUTOMATION-C-W4 | STATUS={REPORTED|END}
```

Production·Ready·Merge·AUTO_TEST 쓰기는 금지한다.
