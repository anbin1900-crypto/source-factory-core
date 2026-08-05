# C Mode Directive Comment · Result Key Relay Contract V1

```text
CONTRACT_ID=C-MODE-DIRECTIVE-RESULT-KEY-RELAY-V1
OWNER=V-1
STATUS=ACTIVE_IMPLEMENTATION_AUTHORITY
NORMAL_PATH=CONTROL_WAVE_REGISTRY_TO_EXACT_COMMENT_RELAY_TO_RESULT_KEY_WATCH
LEGACY_SEMANTIC_DISCOVERY=READ_ONLY_FALLBACK_NOT_NORMAL_PATH
PRODUCTION=false
READY=false
MERGE=false
```

## 1. 목적

C 모드에서 패널의 판단을 최소화한다.

```text
커맨더=작업 판단·구체적 지시 댓글 작성
GitHub=지시·결과 원장
패널=정확한 댓글 Relay·RESULT_KEY 존재 확인·실제 결과댓글번호 수집
워커=작업 수행·결과 또는 미수행 사유 게시
```

패널은 작업내용을 요약·재작성·추론하지 않는다.

## 2. WAVE Registry

커맨더는 Worker PR에 완성된 지시 댓글을 게시한 뒤 Control PR에 다음 형식으로 WAVE Registry를 게시한다.

```text
C_MODE_WAVE_V1
CONTROL_ID={CONTROL_ID}
WAVE_ID={WAVE_ID}
STATUS=READY
WORKER_COUNT={N}

W1|ROLE={ROLE}|PR={PR}|COMMENT={DIRECTIVE_COMMENT}|RESULT_KEY={RESULT_KEY}
...
WN|ROLE={ROLE}|PR={PR}|COMMENT={DIRECTIVE_COMMENT}|RESULT_KEY={RESULT_KEY}

END_WAVE
```

## 3. RESULT_KEY 생성규칙

```text
RESULT_KEY = ASCII_DECIMAL_STRING(DIRECTIVE_COMMENT) + "00"
```

예:

```text
DIRECTIVE_COMMENT=5192189857
RESULT_KEY=519218985700
```

`+100` 산술연산이 아니며, 전각 `００`은 금지한다. `00`은 ASCII 숫자 두 자리다.

RESULT_KEY는 GitHub 실제 댓글 ID가 아니다. GitHub 실제 결과댓글 ID는 결과가 게시된 후 패널이 별도로 수집한다.

## 4. Batch Relay

패널은 WAVE Registry의 모든 행을 사전검증한다.

```text
STATUS=READY
END_WAVE 존재
WORKER_COUNT=행 수
PR·COMMENT 존재
댓글이 지정 PR에 속함
ROLE 일치
RESULT_KEY=COMMENT+"00"
COMMENT 중복 0
RESULT_KEY 중복 0
댓글 본문 비어있지 않음
```

하나라도 실패하면 부분전송하지 않고 `WAVE_INVALID`로 기록한다. 전부 PASS한 경우 같은 Batch로 모든 대상 슬롯에 전달한다.

전송 Payload:

```text
SOURCE_WAVE={WAVE_ID}
SOURCE_PR={PR}
SOURCE_COMMENT={DIRECTIVE_COMMENT}
RESULT_KEY={RESULT_KEY}

{GitHub 지시댓글 원문 전체}
```

패널의 댓글 요약·축약·문장추가·작업순서 추론은 금지한다. 단, RESULT_KEY가 지시댓글에 이미 기재되지 않은 Legacy Fixture에 한해 전송 Header의 RESULT_KEY를 권위로 사용한다.

## 5. 워커 결과형식

워커는 지정 PR에 결과 또는 미수행 사유를 게시하고 마지막 줄에 다음 Marker를 기록한다.

```text
C_RESULT|RESULT_KEY={RESULT_KEY}|ROLE={ROLE}|OUTCOME={PASS|FAIL|BLOCKED|NO_WORK}|STATUS=END|RESULT_COMMIT={40_HEX_OR_NONE}
```

`STATUS=END`는 보고가 종료됐다는 뜻이다. 성공 여부는 `OUTCOME`으로 구분한다.

## 6. 패널 결과판정

패널은 지정 PR의 `DIRECTIVE_COMMENT` 이후 생성된 댓글에서 다음을 확인한다.

```text
줄 시작=C_RESULT|
RESULT_KEY 정확 일치
ROLE 정확 일치
STATUS=END
```

판정:

```text
정확히 1개=REPORTED
0개=MISSING
2개 이상=DUPLICATE_RESULT
```

지시댓글 본문에 기재된 RESULT_KEY는 결과로 인정하지 않는다. 패널은 발견한 실제 GitHub 결과댓글 ID를 `RESULT_COMMENT`로 저장한다.

## 7. 커맨더 결과수집 Prompt

전체 또는 부분 Gate가 충족되면 패널은 커맨더에게 다음 형식으로 전송한다.

```text
C_MODE_WAVE_RESULT_V1
WAVE_ID={WAVE_ID}
STATUS={RESULTS_COLLECTED|PARTIAL}
REPORTED={N}
MISSING={N}

W1|ROLE={ROLE}|PR={PR}|DIRECTIVE_COMMENT={COMMENT}|RESULT_KEY={RESULT_KEY}|RESULT_COMMENT={ACTUAL_ID_OR_MISSING}
...

작업완료 보고 수집 완료. 위 RESULT_COMMENT 게시물을 검토하고 다음 WAVE의 워커별 지시를 게시하라.
```

패널은 결과의 기술적 성공·실패를 판정하지 않는다. 커맨더가 RESULT_COMMENT를 읽고 다음 작업을 결정한다.

## 8. 중복·수정·재시도

```text
DISPATCH_KEY={WAVE_ID}:{ROLE}:{DIRECTIVE_COMMENT}
```

성공 전송된 동일 DISPATCH_KEY는 재전송하지 않는다. 지시 변경은 기존 댓글 수정이 아니라 새 댓글 게시와 새 WAVE Registry 행으로 수행한다.

미보고 재요구도 새 Directive Comment와 새 RESULT_KEY를 사용한다. 4회 교체규칙은 명시적 재요구 WAVE에 결과가 없을 때만 증가한다.

## 9. 상태·로그 보존

기존 상태와 로그를 보존하고 다음 필드를 추가한다.

```text
current_wave_registry_comment_id
entries_by_role
  directive_pr
  directive_comment
  result_key
  actual_result_comment
  report_state
  dispatched_at
  reported_at
last_seen_comment_id_by_pr
duplicate_result_keys
```

보존 대상:

```text
runtime.log
automation-c-v1/work_control_events.jsonl
browser-dispatch-receipts
C_MODE_STATE.json
REPEAT_COMMANDS.json
기존 로그인 Browser Profile
```

## 10. 모드 경계

```text
C_MODE=GitHub WAVE Pointer Relay
COMMAND_INPUT_MODE=사용자 입력문 반복실행
```

두 모드는 Queue·상관키·완료조건을 공유하지 않는다. C_RESULT의 RESULT_KEY가 반복명령 완료를 발생시키지 않는다. 반복명령은 ROLE+COMMAND_ID+DISPATCH_ID 계약을 유지한다.

## 11. 승계

이 계약은 C 모드 정상경로의 `최신 지시 자연어 탐색`, `과거 Terminal 비교`, `작업중 추정`, `자유문장 결과판독`을 대체한다. 기존 Parser·Directive Discovery는 과거 기록 Readback과 Migration Fixture에만 사용한다.

```text
IMPLEMENTATION_REQUIRED=true
RUNTIME_MODIFIED_BY_THIS_DOCUMENT=false
TARGET_PC_PASS=PENDING
LTS_TERMINAL_CLAIMED=false
AUTO_TEST_WRITE_COUNT=0
```
