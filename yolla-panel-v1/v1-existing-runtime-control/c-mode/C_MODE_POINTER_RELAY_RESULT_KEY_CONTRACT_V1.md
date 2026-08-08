# C Mode Pointer Relay + Result Key Contract V1

```text
CONTRACT_ID=C_MODE_POINTER_RELAY_RESULT_KEY_CONTRACT_V1
OWNER=V-1
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
STATUS=ADDITIVE_ACTIVE
EXISTING_VALIDATION_SYSTEM=RETAINED_AND_EXTENDED
TARGET_CANDIDATE_VERSION=5.10.2.4.2-rc2
PRODUCTION=false
READY=false
MERGE=false
```

## 1. 목적

C 모드의 정상 실행경로를 `커맨더가 완성된 작업지시 댓글을 작성하고, Control PR의 WAVE 게시물이 댓글 위치를 등록하며, 패널은 원문 전달과 결과 존재 확인만 수행하는 구조`로 단순화한다.

이 계약은 기존 상태머신·보고상관·UI·반복명령·백그라운드·설치·로그·실패주입·대상 PC 검증체계를 폐기하지 않는다. 기존 검증체계에 새로운 Pointer Relay·Result Key 목표를 추가한다.

## 2. 역할 분리

```text
COMMANDER=
작업 판단
→ Worker PR에 완성된 지시 댓글 게시
→ Control PR에 WAVE 배포목록 게시
→ 결과 댓글 검토
→ 다음 WAVE 게시

PANEL=
WAVE 고정형식 파싱
→ 모든 지시 댓글 사전검증
→ 전체 Batch 전달
→ RESULT_KEY 결과댓글 존재 확인
→ 실제 RESULT_COMMENT 번호 수집
→ 커맨더에게 결과목록 전달

WORKER=
지시 원문 수행
→ 성공·실패·차단·미수행과 무관하게 결과 게시
→ 정확한 C_RESULT Marker 게시
```

패널은 작업내용을 해석하거나 재작성하지 않는다.

## 3. WAVE 게시 형식

```text
C_MODE_WAVE_V2
WAVE_ID={WAVE_ID}
STATUS=READY
WORKER_COUNT={N}

W1|ROLE={ROLE}|PR={PR}|COMMENT={DIRECTIVE_COMMENT}|RESULT_KEY={RESULT_KEY}
W2|ROLE={ROLE}|PR={PR}|COMMENT={DIRECTIVE_COMMENT}|RESULT_KEY={RESULT_KEY}
...

END_WAVE
```

필수 규칙:

```text
RESULT_KEY = ASCII decimal COMMENT 문자열 뒤에 ASCII "00"을 붙인 값
ARITHMETIC_PLUS_100=false
FULL_WIDTH_DIGITS_ALLOWED=false
COMMENT_EDIT_AFTER_READY=false
ALL_ROWS_VALID_BEFORE_ANY_DISPATCH=true
PARTIAL_DISPATCH=false
DUPLICATE_ROLE=false
DUPLICATE_COMMENT=false
DUPLICATE_RESULT_KEY=false
```

예:

```text
COMMENT=5192189857
RESULT_KEY=519218985700
```

`519218985700`은 GitHub 실제 댓글 ID가 아니라 예정 결과 식별키다.

## 4. 지시 전달

패널은 모든 행을 검증한 뒤 각 `PR + COMMENT`의 댓글 원문을 가져와 대응 슬롯에 전달한다.

```text
SOURCE_WAVE={WAVE_ID}
SOURCE_PR={PR}
SOURCE_COMMENT={COMMENT}
RESULT_KEY={RESULT_KEY}

{DIRECTIVE_COMMENT_BODY_EXACT_BYTES}
```

금지:

```text
PROMPT_SUMMARY=false
PROMPT_REWRITE=false
PROMPT_INFERENCE=false
SEQUENTIAL_WAIT_FOR_PREVIOUS_WORKER=false
```

중복방지키:

```text
DISPATCH_KEY={WAVE_ID}:{ROLE}:{COMMENT}
```

## 5. 워커 결과 형식

결과 댓글 마지막 줄:

```text
C_RESULT|ROLE={ROLE}|RESULT_KEY={RESULT_KEY}|STATUS=END
```

선택 필드:

```text
OUTCOME=PASS|FAIL|BLOCKED|NO_WORK
```

패널은 OUTCOME의 의미를 판정하지 않는다. `STATUS=END`는 결과게시 절차가 끝났다는 뜻이다.

## 6. 결과 판정

패널은 지정 PR에서 다음 조건을 모두 충족하는 댓글만 결과로 인정한다.

```text
COMMENT_ID != DIRECTIVE_COMMENT
CREATED_AT > DIRECTIVE_CREATED_AT
LINE_PREFIX=C_RESULT|
ROLE exact match
RESULT_KEY exact match
STATUS=END
```

판정:

```text
0 valid comments = MISSING
1 valid comment = REPORTED
2+ valid comments = DUPLICATE_REPORT
```

지시 댓글 안에 예시 RESULT_KEY가 있어도 지시 댓글 자체는 결과로 인정하지 않는다.

패널은 발견 후 실제 GitHub 댓글 ID를 저장한다.

```text
DIRECTIVE_COMMENT={COMMENT}
RESULT_KEY={RESULT_KEY}
RESULT_COMMENT={ACTUAL_GITHUB_COMMENT_ID}
```

## 7. 커맨더 전달문

전체 수집:

```text
C_MODE_WAVE_RESULT_V1
WAVE_ID={WAVE_ID}
STATUS=RESULTS_COLLECTED
REPORTED={N}
MISSING=0

W1|ROLE={ROLE}|PR={PR}|COMMENT={DIRECTIVE_COMMENT}|RESULT_KEY={RESULT_KEY}|RESULT_COMMENT={ACTUAL_RESULT_COMMENT}
...

작업완료. 위 RESULT_COMMENT 게시물을 모두 검토하고 다음 WAVE의 워커별 작업을 게시하라.
```

부분 수집:

```text
STATUS=PARTIAL
RESULT_COMMENT=MISSING
```

패널은 미보고 후속지시 문장을 작성하지 않는다. 커맨더가 다음 지시 댓글에 직접 포함한다.

## 8. 상태·로그

기존 상태원장을 확장한다.

```text
current_wave_manifest_comment_id
wave_rows_by_role
result_key_by_role
actual_result_comment_by_role
dispatch_key_by_role
result_status_by_role
comment_body_sha256_by_role
```

기존 `runtime.log`, `work_control_events.jsonl`, Dispatch Receipt, 로그인 Profile, 반복명령 상태는 유지한다.

## 9. 기존 검증체계 유지

다음 Gate는 계속 유지하고 Pointer Relay·Result Key 시나리오를 추가한다.

```text
STATE_MACHINE
REPORT_CORRELATION
UI_TRUTH
REPEAT_COMMAND
BACKGROUND_DISPATCH
INSTALL_ROLLBACK
WORK_CONTROL_LOG
FAILURE_INJECTION
TARGET_PC_6_WORKERS_X_3_WAVES
RESTART_RESUME
LOGIN_PROFILE_PRESERVATION
```

추가 실패주입:

```text
MALFORMED_WAVE
MISSING_END_WAVE
WRONG_PR
WRONG_ROLE
DUPLICATE_COMMENT
DUPLICATE_RESULT_KEY
FULL_WIDTH_DIGITS
RESULT_BEFORE_DIRECTIVE
DIRECTIVE_BODY_CONTAINS_RESULT_KEY
DUPLICATE_RESULT_COMMENTS
EDITED_DIRECTIVE_AFTER_READY
STALE_WAVE
PARTIAL_FETCH_FAILURE
PARTIAL_DISPATCH_ATTEMPT
```

## 10. 최종 원칙

```text
COMMANDER_WRITES_EXACT_DIRECTIVE=true
CONTROL_PR_WAVE_IS_DISPATCH_INDEX=true
WORKER_PR_COMMENT_IS_COMMAND_PAYLOAD=true
PANEL_ONLY_RELAYS_AND_CHECKS_EXISTENCE=true
NATURAL_LANGUAGE_RESULT_INTERPRETATION=false
EXISTING_VALIDATION_ABANDONED=false
EXISTING_VALIDATION_EXTENDED=true
```
