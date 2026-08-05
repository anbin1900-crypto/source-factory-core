# V1-CV-1 Runtime Logic·Deterministic Simulation Directive V1

```text
CYCLE_ID=V1-C-MODE-VALIDATION-CYCLE-001
WORKER=V1-CV-1
CONTROL_PR=#17
BASE_HEAD=cc4f5cbd6248fea5890f7fcad8245fe8a58fb221
BRANCH=worker/v1-cv1-runtime-simulation-v1
OWNED_PATHS=validation/v1-c-mode/workers/cv1/**,automation-c-v1/**
```

PR #17의 최신 C 모드 검증 Pointer와 Test Matrix를 읽고 다음을 End-to-End로 수행하라.

```text
Runtime Unit·Virtual-time Simulation
START·WAVE Batch
잘못된 WAVE·중복 결과
20분 1~2명 부분진행·3명 이상 대기
90분 Rescue 2명
명시적 미보고 4회 교체
공정률 무결성
END·재활성화
시간 반복·ROLE+COMMAND_ID 완료 반복
재시작 상태복구
```

실패하면 직접 Source를 수정하고 재시험한다. 동일 오류 두 번 후에는 방법을 변경한다. 결과를 다음 경로에 Commit한다.

```text
validation/v1-c-mode/workers/cv1/CV1_RUNTIME_SIMULATION_TERMINAL.json
validation/v1-c-mode/workers/cv1/LATEST_CV1_POINTER.json
```

Terminal:

```text
CV1_C_MODE_RUNTIME_LOGIC_PASS_OR_EXACT_BLOCKER
```

Production·Ready·Merge·AUTO TEST 수정은 금지한다.
