# C Mode Pointer Relay Additive Wave 6 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WAVE_ID=V1-C-MODE-6W-WAVE-006
SUBGOAL=POINTER_RELAY_RESULT_KEY_ADDITIVE_IMPLEMENTATION
COMMANDER=V-1
DISPATCH_MODE=CYCLE_BATCH_PARALLEL
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
WAVE1_TO_WAVE5_RESULTS=PRESERVED_AS_INPUT
SUPERSEDES_PREVIOUS_VALIDATION=false
TARGET_RUNTIME=5.10.2.4.2-rc2
TARGET_PC_INSTALLED_BASELINE=5.10.2.4.0
SOURCE_STAGING_BASELINE=5.10.2.4.1
PRODUCTION=false
READY=false
MERGE=false
AUTO_TEST_WRITE_COUNT=0
```

## 공통 실행규칙

이 Wave는 기존 6-워커 실험·검증·보완체계를 유지하면서 다음 정상경로를 추가한다.

```text
커맨더 Worker PR 지시댓글 게시
→ Control PR WAVE Registry 게시
→ 패널이 지정 댓글 원문을 전체 Batch Relay
→ 워커가 지정 RESULT_KEY로 결과 게시
→ 패널이 실제 RESULT_COMMENT ID 수집
→ 커맨더에게 결과번호 목록과 다음 WAVE 요청 전달
```

기존 Wave 5 지시가 미완료인 워커는 먼저 Wave 5 Result Commit·Terminal을 게시한 뒤 같은 실행에서 Wave 6를 수행한다. Wave 6는 Wave 5를 폐기하지 않는다.

각 워커 댓글은 게시 후 다음 값으로 확정된다.

```text
DIRECTIVE_COMMENT={GITHUB_COMMENT_ID}
RESULT_KEY={DIRECTIVE_COMMENT}00
```

결과 댓글 마지막 줄:

```text
C_RESULT|RESULT_KEY={RESULT_KEY}|ROLE={ROLE}|OUTCOME={PASS|FAIL|BLOCKED|NO_WORK}|STATUS=END|RESULT_COMMIT={40_HEX_OR_NONE}
```

## W1 — WAVE Registry Parser·Batch State Machine

```text
ROLE=AUTOMATION-C-W1
WORKER_PR=#59
COMMAND_ID=C-RELAY-W6-W1-REGISTRY-BATCH-STATE
```

1. `C_MODE_WAVE_V1 ... END_WAVE` Parser·Validator를 구현한다.
2. `RESULT_KEY=COMMENT+ASCII_00`을 검증하고 산술 `+100`, 전각 숫자, 중복 COMMENT·RESULT_KEY를 거부한다.
3. 모든 행 사전검증 전 부분전송을 금지하고 전부 PASS한 경우만 Batch를 생성한다.
4. `DISPATCH_KEY={WAVE_ID}:{ROLE}:{COMMENT}` exactly-once와 Restart 복구를 구현한다.
5. 20분·90분·명시적 미보고 4회 정책을 RESULT_KEY 상태에 결속한다.
6. 기존 상태머신·시간규칙 Harness를 유지하고 새 경로 회귀를 추가한다.

## W2 — RESULT_KEY Watcher·RESULT_COMMENT Collector

```text
ROLE=AUTOMATION-C-W2
WORKER_PR=#60
COMMAND_ID=C-RELAY-W6-W2-RESULT-WATCH-COLLECT
```

1. 지정 PR에서 Directive Comment 이후 새 댓글만 증분 조회한다.
2. `C_RESULT|RESULT_KEY|ROLE|STATUS=END` 정확 일치만 수용한다.
3. 0개=MISSING, 1개=REPORTED, 2개 이상=DUPLICATE_RESULT로 Fail-closed한다.
4. 실제 GitHub 결과댓글 ID를 `RESULT_COMMENT`로 저장한다.
5. 커맨더에게 6개 RESULT_COMMENT와 MISSING 목록을 전달하는 `C_MODE_WAVE_RESULT_V1` Builder를 구현한다.
6. 기존 상관관계·Pagination·Retry·Stale·Order Reversal 검증을 유지하고 RESULT_KEY Fixture를 추가한다.

## W3 — UI Truth·Pointer Relay 상태표시

```text
ROLE=AUTOMATION-C-W3
WORKER_PR=#61
COMMAND_ID=C-RELAY-W6-W3-UI-TRUTH-PROJECTION
```

1. 실제 UI 후보경로에 `Registry 준비·Batch 검증·전송·결과대기·보고완료·미보고·중복결과·오류·END`를 표시한다.
2. C 모드와 명령 실행모드를 계속 분리한다.
3. C·명령 모두 비활성이면 작업 중 0을 보장한다.
4. 과거 A/E 상태를 현재 작업 수에 포함하지 않는다.
5. RESULT_KEY는 내부 식별값으로만 표시하고 커맨더 화면에는 실제 RESULT_COMMENT를 우선 표시한다.
6. 기존 DOM/Render Harness와 Target-PC Collector를 유지·확장한다.

## W4 — 명령 실행모드 비간섭·회귀 Soak

```text
ROLE=AUTOMATION-C-W4
WORKER_PR=#62
COMMAND_ID=C-RELAY-W6-W4-REPEAT-NONINTERFERENCE
```

1. C RESULT_KEY가 반복명령 완료를 발생시키지 않도록 Queue·Watcher를 분리한다.
2. 반복명령의 ROLE+COMMAND_ID+DISPATCH_ID 계약을 유지한다.
3. C Pointer Relay Batch와 반복명령 6슬롯을 혼합해 300회 이상 Virtual Soak한다.
4. 중복·상호취소·END 재전송·Receipt 유실·대기 Queue 증가가 모두 0이어야 한다.
5. Restart 후 C Registry와 Repeat Queue가 독립 복구되는지 검증한다.
6. 기존 반복작업 검증·보완체계를 유지한다.

## W5 — Runtime Integration·Installer·Work-Control Log

```text
ROLE=AUTOMATION-C-W5
WORKER_PR=#63
COMMAND_ID=C-RELAY-W6-W5-INTEGRATION-INSTALLER
INTEGRATION_OWNER=true
```

1. W1 Registry, W2 Watcher, W3 UI, W4 비간섭 Adapter를 정확한 Head로 통합한다.
2. 대상 PC `5.10.2.4.0`에서 직접 설치 또는 내부 Staging을 거쳐 `5.10.2.4.2-rc2`로 승격하는 Installer를 만든다.
3. Directive 원문 Relay, Batch 사전검증, RESULT_KEY Watch, RESULT_COMMENT 수집, 커맨더 Prompt를 실제 Runtime Bridge에 연결한다.
4. Runtime Log, Work-Control JSONL, Dispatch Receipt, C State, Repeat State, 로그인 Profile을 보존한다.
5. 설치·Smoke·Rollback·Restart·6 workers × 3 rounds One-click Acceptance Package를 유지·확장한다.
6. A/E 실행경로를 재도입하지 않는다. Target-PC Receipt 전 Live PASS를 금지한다.

## W6 — 독립 실패주입·수용

```text
ROLE=AUTOMATION-C-W6
WORKER_PR=#64
COMMAND_ID=C-RELAY-W6-W6-INDEPENDENT-ACCEPTANCE
IMPLEMENTATION_SOURCE_MODIFIED=false
```

1. 기존 6-워커 검증체계가 삭제·축소되지 않았는지 감사한다.
2. Registry 누락·부분행·잘못된 PR·없는 COMMENT·ROLE 불일치·RESULT_KEY 오류·중복·전각 숫자·산술 +100을 실패주입한다.
3. Result 0/1/2+, 지시보다 오래된 결과, 다른 PR·ROLE, Stale·Order Reversal·Pagination·Retry 소진을 검증한다.
4. C와 반복명령 상호비간섭, Restart, Log Loss Zero, Profile 보존, A/E 재도입 0을 감사한다.
5. 대상 PC에서 6 workers × 3 rounds와 실제 RESULT_COMMENT 수집을 독립 확인한다.
6. 구현 Source를 직접 수정하지 않고 Finding·재현증거·Terminal을 게시한다.

## Wave 6 수용조건

```text
VALID_CORRELATED_REPORTS=6_OF_6
EXISTING_VALIDATION_GATES_PRESERVED=PASS
REGISTRY_PARSER=PASS
ALL_OR_NOTHING_BATCH=PASS
RESULT_KEY_RULE=PASS
ACTUAL_RESULT_COMMENT_CAPTURE=PASS
COMMANDER_RESULT_LIST=PASS
C_REPEAT_NONINTERFERENCE=PASS
UI_TRUTH=PASS_OFFLINE_AND_TARGET_PC
DUPLICATE_DISPATCH_COUNT=0
DUPLICATE_RESULT_ACCEPTED_COUNT=0
PREVIOUS_COMMAND_CANCEL_COUNT=0
LOST_WORK_CONTROL_EVENT_COUNT=0
A_E_EXECUTION_REINTRODUCTION_COUNT=0
RESTART_RESUME=PASS
LOGIN_PROFILE_PRESERVED=PASS
AUTO_TEST_WRITE_COUNT=0
TARGET_PC_PASS=PENDING_UNTIL_RECEIPT
```
