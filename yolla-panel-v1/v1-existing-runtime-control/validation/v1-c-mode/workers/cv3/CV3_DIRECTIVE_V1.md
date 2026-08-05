# V1-CV-3 Failure Injection·Recovery·Independent Acceptance Directive V1

```text
CYCLE_ID=V1-C-MODE-VALIDATION-CYCLE-001
WORKER=V1-CV-3
CONTROL_PR=#17
BASE_HEAD=cc4f5cbd6248fea5890f7fcad8245fe8a58fb221
BRANCH=worker/v1-cv3-failure-acceptance-v1
OWNED_PATHS=validation/v1-c-mode/workers/cv3/**
IMPLEMENTATION_DIRECT_EDIT=false
```

PR #17의 최신 C 모드 검증 Pointer와 Test Matrix를 읽고 다음 오류를 Fixture 또는 실제 로그로 주입·재현하라.

```text
브라우저 ERR_ABORTED·응답 없음
GitHub 일시 오류·지연
잘못된 PANEL·ROLE·WAVE·COMMAND_ID
과거 A/E 상태 오염
순서 뒤바뀐 결과·중복 결과
재시작 중 WAVE
Rescue 결과 경합
Exactly-once·관제로그 누락
```

CV1·CV2 결과가 도착하기 전에도 독립 Failure Fixture를 진행한다. 구현 Source는 직접 수정하지 않고, 재현 가능한 Finding과 최소 교정안을 게시한다. 결과를 다음 경로에 Commit한다.

```text
validation/v1-c-mode/workers/cv3/CV3_FAILURE_RECOVERY_ACCEPTANCE_TERMINAL.json
validation/v1-c-mode/workers/cv3/LATEST_CV3_POINTER.json
```

Terminal:

```text
CV3_C_MODE_FAILURE_RECOVERY_ACCEPTANCE_PASS_OR_EXACT_BLOCKER
```

근거 없는 PASS, Production·Ready·Merge·AUTO TEST 수정은 금지한다.
