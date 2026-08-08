# C모드 규칙 V1

```text
RULE_NAME=C_MODE_RULES
RULE_NAME_KO=C모드 규칙
RULE_ID=YOLLA_C_MODE_RULES_V1
STATUS=ACTIVE_FROM_NEXT_CYCLE
EFFECTIVE_SCOPE=AUTOMATION_GROUP
INITIAL_WORKERS=AUTOMATION-C-W2,AUTOMATION-C-W3,AUTOMATION-C-W4,AUTOMATION-C-W5,AUTOMATION-C-W6
CONTROL_REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=17
SUPERIOR_POLICY=YOLLA_EFFICIENCY_RATIONALITY_SPEED_FIRST_OPERATING_POLICY_V1
RETROACTIVE_CHANGE=false
```

## 1. 목적

C모드 규칙은 자동화 그룹의 명령 작성, 전달상태 표시, 워커 답장, Commander 확인을 하나의 간단하고 검증 가능한 형식으로 통일한다.

```text
현재 단계=명령과 답장을 동일 규격으로 작성하고 GitHub에서 추적한다.
GOAL_0_5=기능 완성 과정에서 Commander 지시가 사용자 중계 없이 워커에게 직접 전달되고 작업큐에 자동 등록되는 상태에 자연스럽게 도달한다.
GOAL_0_5_IMMEDIATE_QUEUE_CREATION=false
USER_RELAY_TARGET=0
```

## 2. 상위 운영원칙

- 명확한 작업은 `ONE_OWNER_END_TO_END`로 배정한다.
- 배정에는 배정 범위 안의 실행·수정·시험·교정·재시도 권한이 포함된다.
- 동일 실패 서명이 2회 반복되면 Source, 명령, 순서, 경로, Runtime, 도구 또는 구현방법 중 하나 이상을 바꾼다.
- 중간 실패는 Attempt Log이며 Terminal이 아니다.
- Terminal은 `PASS` 또는 `BLOCKED_EXTERNAL`만 허용한다.
- 워커 간 독립 작업은 한 Cycle에 병렬 배포한다.
- 보고는 실행을 지연시키지 않는 최소 증거 중심으로 작성한다.
- Mock·문서·계획만으로 Live 완료를 주장하지 않는다.

## 3. Cycle 명령 작성 규칙

다음 Cycle부터 모든 자동화 그룹 Worker 지시는 아래 순서와 필드를 사용한다. 해당되지 않는 선택 필드는 생략할 수 있으나 필수 필드는 생략하지 않는다.

### 3.1 필수 Header

```text
RULE_ID=YOLLA_C_MODE_RULES_V1
CYCLE_ID=<cycle-id>
DIRECTIVE_ID=<unique-directive-id>
WORKER_ID=<automation-worker-id>
ROLE=<single-owner-role>
REPOSITORY=<owner/repository>
CONTROL_PR=<number>
WORKER_PR=<number>
PRIORITY=<P0|P1|P2>
MODE=CYCLE_BATCH_PARALLEL
POLICY=YOLLA_EFFICIENCY_RATIONALITY_SPEED_FIRST_OPERATING_POLICY_V1
ASSIGNMENT_INCLUDES_EXECUTION_AUTHORITY=true
ONE_OWNER_END_TO_END=true
```

### 3.2 작업 본문

```text
GOAL=<이번 Cycle에서 실제로 완성할 한 문장 목표>
SCOPE=<담당 Source·기능·경계>
REUSE_FIRST=<우선 재사용할 기존 자산·PR·파일>
REQUIRED_ACTIONS=
1. <분석>
2. <수정 또는 결속>
3. <실행·검증>
4. <실패 교정·재시도>
5. <Remote 반영과 결과 게시>

ACCEPTANCE=
- <실제 동작 또는 검증 기준>
- <필수 증거>
- <금지 위반 0>

FORBIDDEN=
- <신규 중복 Runtime·Transport 등 금지사항>
- <Mock만으로 Live PASS 선언>
- <첫 실패 후 BLOCKED 종결>

EXPECTED_TERMINAL=PASS_OR_BLOCKED_EXTERNAL
```

### 3.3 전달상태 명시

명령 댓글 게시와 작업큐 등록을 같은 것으로 표현하지 않는다.

```text
DELIVERY_STATE=<GITHUB_DIRECTIVE_POSTED|QUEUE_REGISTERED|CLAIMED|STARTED>
DIRECTIVE_COMMENT_ID=<github-comment-id-or-NONE>
QUEUE_ITEM_ID=<queue-id-or-NONE>
CLAIM_RECEIPT_ID=<receipt-id-or-NONE>
```

- `GITHUB_DIRECTIVE_POSTED`: GitHub에 지시만 게시됨.
- `QUEUE_REGISTERED`: 실제 Worker Wake/Execution Queue에 등록되고 Readback됨.
- `CLAIMED`: 대상 Worker/Executor가 해당 항목을 선점함.
- `STARTED`: Worker의 실행 시작 증거가 확인됨.
- 증거가 없는 상위 상태를 추정해 쓰지 않는다.

## 4. 워커 답장 규칙

워커는 실행 중 장문의 중간보고를 반복하지 않는다. 최종 답장은 아래 형식의 단일 결과 블록을 사용한다.

```text
REPORT=C_MODE_WORKER_REPLY
RULE_ID=YOLLA_C_MODE_RULES_V1
CYCLE_ID=<cycle-id>
DIRECTIVE_ID=<directive-id>
WORKER_ID=<worker-id>
RESULT=<PASS|BLOCKED_EXTERNAL>
SUMMARY=<완성된 실제 결과 또는 정확한 외부 차단 한 문장>
ATTEMPT_COUNT=<integer>
FAILURE_SIGNATURES=<NONE|comma-separated-codes>
CORRECTIONS=<NONE|핵심 교정 요약>
VERIFICATION=<실행한 검증과 결과>
FINAL_REMOTE_HEAD=<40-char-sha|NONE>
RESULT_COMMENT_ID=<github-comment-id|NONE>
ARTIFACT_POINTER=<path-or-url|NONE>
TERMINAL=<expected-terminal-value>
USER_MANUAL_ACTION_COUNT=<integer>
NEXT_ACTION=<NONE|외부에서 필요한 정확한 한 가지 조치>
```

### 4.1 PASS 요건

- `ACCEPTANCE`의 실제 기능 기준 충족
- 관련 검증 실행 및 결과 제시
- 요구된 Source/결과가 Remote에 반영된 경우 정확한 Head 제시
- Terminal 값이 명령의 `EXPECTED_TERMINAL`과 호환
- 금지사항 위반 없음

### 4.2 BLOCKED_EXTERNAL 요건

- 담당 범위의 교정·재시도 수행
- 동일 오류 2회 후 다른 방법 적용 또는 적용 불가 이유 특정
- 남은 원인이 계정·권한·물리장치·외부 서비스 등 담당 범위 밖임
- 정확한 실패 증거와 외부에서 필요한 단일 조치 제시

첫 실패, 계획 미완성, 다른 워커 대기만으로 `BLOCKED_EXTERNAL`을 선언할 수 없다.

### 4.3 대화 답장 최소화

GitHub 권위 결과를 게시한 뒤 대화 답장은 아래 다섯 줄 이내로 제한한다.

```text
작업완료
RESULT=<PASS|BLOCKED_EXTERNAL>
RESULT_COMMENT_ID=<id|NONE>
FINAL_REMOTE_HEAD=<sha|NONE>
TERMINAL=<value>
```

## 5. Commander 답장 확인 규칙

Commander는 Worker 답장을 수신하거나 다음 Cycle을 작성하기 전에 각 답장을 확인한다.

```text
CHECK_1=RULE_ID_AND_IDENTITY_MATCH
CHECK_2=DIRECTIVE_ACCEPTANCE_COVERAGE
CHECK_3=VERIFICATION_EVIDENCE_PRESENT
CHECK_4=REMOTE_HEAD_AND_POINTER_READBACK
CHECK_5=TERMINAL_VALIDITY
CHECK_6=DELIVERY_STATE_NOT_OVERCLAIMED
```

판정은 다음 세 가지다.

```text
ACCEPTED=형식과 실제 완료 증거가 모두 충족됨.
CORRECTION_REQUIRED=누락·불일치·검증 부족을 같은 Worker에게 즉시 반환함.
BLOCKED_EXTERNAL_CONFIRMED=외부 차단 요건과 증거가 모두 확인됨.
```

Commander 확인은 중간 실행을 막는 승인 Gate가 아니다. Worker 실행은 계속되며, 확인 결과는 다음 Cycle의 입력과 작업 재배정에 사용한다.

## 6. 다음 Cycle 적용

```text
CURRENT_CYCLE_RETROACTIVE_REWRITE=false
NEXT_CYCLE_COMMANDS_MUST_REFERENCE_RULE_ID=true
NEXT_CYCLE_WORKER_REPLIES_MUST_USE_REPLY_FORMAT=true
NEXT_CYCLE_TARGET_WORKERS=AUTOMATION-C-W2..AUTOMATION-C-W6
COMMANDER_MUST_VERIFY_REPLIES=true
COMMANDER_MUST_NOT_EQUATE_COMMENT_WITH_QUEUE=true
```

규칙 미준수 답장은 자동으로 실패로 종결하지 않는다. 실제 작업 증거가 있으면 `CORRECTION_REQUIRED`로 보정 형식만 요구하고, 기능 실패가 있으면 같은 Worker가 직접 교정·재시도한다.

## 7. 공식 상태

```text
RULE_STATUS=ACTIVE_FROM_NEXT_CYCLE
AUTHORITATIVE_FORM=GITHUB_COMMITTED_FILE
PR_COMMENTS=POINTER_ONLY
PRODUCTION=false
READY=false
MERGE=false
```
