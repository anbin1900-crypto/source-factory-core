# V1 C Mode Six-Worker Wave 6 Additive Directive V7

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WAVE_ID=V1-C-MODE-6W-WAVE-006
COMMANDER=V-1
OBJECTIVE=POINTER_RELAY_RESULT_KEY_RUNTIME
OBJECTIVE_MODE=ADDITIVE_NOT_REPLACEMENT
PREVIOUS_WAVE5_CANCELLED=false
EXISTING_VALIDATION_SYSTEM=RETAINED_AND_EXTENDED
TARGET_CANDIDATE_VERSION=5.10.2.4.2-rc2
DISPATCH_MODE=CYCLE_BATCH_PARALLEL
PRODUCTION=false
READY=false
MERGE=false
AUTO_TEST_WRITE_COUNT=0
```

## 공통 실행규칙

Wave 5의 소유 작업을 폐기하지 않는다. 경로 충돌이 없으면 병렬 수행하고, 충돌이 있으면 자신의 Wave 5 Terminal 직후 별도 승인 없이 즉시 수행한다. 첫 실패는 Terminal이 아니며 직접 교정·재시험한다. 결과 Commit과 정확한 `C_RESULT` Terminal 댓글을 모두 게시해야 보고완료다.

권위 계약:

```text
yolla-panel-v1/v1-existing-runtime-control/c-mode/C_MODE_POINTER_RELAY_RESULT_KEY_CONTRACT_V1.md
```

Wave 6 Result Marker:

```text
C_RESULT|ROLE={ROLE}|RESULT_KEY={RESULT_KEY}|STATUS=END
```

`RESULT_KEY`는 해당 Worker PR의 Wave 6 지시 댓글 ID 뒤에 ASCII `00`을 붙인 값이며, Control PR의 `C_MODE_WAVE_V2` 게시물에서 확정한다.

## W1 — WAVE Pointer Parser·State Machine

```text
WORKER_PR=#59
COMMAND_ID=C6W-W6-W1-WAVE-POINTER-PARSER-STATE
```

`C_MODE_WAVE_V2` Parser와 상태머신을 구현한다. `Wn|ROLE|PR|COMMENT|RESULT_KEY` 행, `STATUS=READY`, `WORKER_COUNT`, `END_WAVE`, ASCII 숫자, `COMMENT + "00"` 일치, Role·PR·Comment·Result Key 중복을 Fail-closed한다. 모든 댓글을 사전 Fetch·검증하기 전에는 한 슬롯도 전송하지 않는다. Dispatch Key는 `WAVE_ID:ROLE:COMMENT`로 고정하고 재시작 후 Exactly-once를 보장한다. 기존 20분·90분·4회·공정률·END 상태머신 시험을 유지하면서 Pointer Relay 시험을 추가한다.

## W2 — Result Key Watcher·Commander Result List

```text
WORKER_PR=#60
COMMAND_ID=C6W-W6-W2-RESULT-KEY-WATCHER-COLLECTOR
```

지정 PR에서 지시 댓글 이후의 새 댓글만 검색해 `C_RESULT|ROLE=...|RESULT_KEY=...|STATUS=END`를 판정한다. 0건=MISSING, 1건=REPORTED, 2건 이상=DUPLICATE_REPORT로 처리하고 실제 GitHub Result Comment ID를 저장한다. 지시 댓글 본문의 예시 키는 결과로 오인하지 않는다. 결과가 모이면 커맨더에게 `COMMENT·RESULT_KEY·RESULT_COMMENT` 목록과 `작업완료. ... 다음 WAVE를 게시하라.` 문구를 생성한다. 자연어 성공·실패 판단은 하지 않는다. Pagination·일시오류 5회·Restart·연속 미보고 Reset을 검증한다.

## W3 — Pointer Relay UI Truth

```text
WORKER_PR=#61
COMMAND_ID=C6W-W6-W3-POINTER-RELAY-UI-TRUTH
```

실제 C UI 후보에 WAVE Manifest Comment, Directive Comment, Result Key, 실제 Result Comment, MISSING, DUPLICATE_REPORT를 표시한다. 지시 전송 전 검증중, Batch 전송완료, 결과대기, 부분수집, 전체수집을 구분한다. C·명령 실행모드는 계속 분리하며 둘 다 비활성이면 작업 중 0이다. 과거 A/E 상태를 제외하고 대상 PC Collector와 Render Harness에 신규 필드를 추가한다.

## W4 — Repeat Command Namespace Isolation

```text
WORKER_PR=#62
COMMAND_ID=C6W-W6-W4-REPEAT-NAMESPACE-ISOLATION
```

C 모드 `RESULT_KEY`와 반복명령 `ROLE+COMMAND_ID+DISPATCH_ID`를 별도 Namespace로 유지한다. C 결과가 반복명령 완료를 유발하거나 반복명령 결과가 C 결과로 인식되지 않아야 한다. Pointer Relay Batch와 6슬롯 반복명령을 동시에 300회 이상 Soak하고 중복·상호취소·END 재전송·Receipt 유실·대기 Queue 증가를 모두 0으로 검증한다. 실제 팝업·Bridge·상태저장 Adapter를 갱신한다.

## W5 — Runtime Integration·Installer·Artifact

```text
WORKER_PR=#63
COMMAND_ID=C6W-W6-W5-POINTER-RELAY-INTEGRATION-INSTALLER
INTEGRATION_OWNER=true
TARGET_VERSION=5.10.2.4.2-rc2
```

W1 Parser·State, W2 Watcher, W3 UI, W4 Namespace Adapter를 정확한 Head로 결속해 기존 `5.10.2.4.2-rc1` Candidate에 추가한다. 대상 PC 설치 기준선 `5.10.2.4.0`에서 직접 승격하거나 Installer 내부 Staging으로 승격하며 사용자의 수동 `5.10.2.4.1` 선행설치를 요구하지 않는다. 설치 BAT, Source ZIP, Payload Manifest, Rollback, One-click Target-PC Acceptance Runner를 생성하고 Drive에 업로드하여 File ID·크기·SHA-256·Readback을 게시한다. 기존 로그인 Profile, Runtime Log, Work-Control JSONL을 보존하고 A/E 실행경로를 되살리지 않는다.

## W6 — Additive Independent Validation·Failure Injection

```text
WORKER_PR=#64
COMMAND_ID=C6W-W6-W6-POINTER-RELAY-INDEPENDENT-ACCEPTANCE
IMPLEMENTATION_DIRECT_EDIT=false
```

기존 독립수용 Gate를 유지하면서 Pointer Relay·Result Key를 추가 감사한다. malformed WAVE, END_WAVE 누락, Wrong PR·Role, 중복 Comment·Result Key, 전각 숫자, 결과가 지시보다 먼저 존재, 지시문 안 예시 키 오인, 결과댓글 중복, READY 후 지시댓글 수정, Stale WAVE, 일부 Fetch 실패, 부분 Dispatch 시도를 Fail-closed한다. W1~W5 산출물·Installer·Source Artifact·로그·Profile 보존·A/E 제거를 독립 감사한다. 대상 PC 6워커×3 WAVE·재시작·Log Loss Zero Gate는 계속 유지한다.

## Wave 6 수용조건

```text
VALID_CORRELATED_REPORTS=6_OF_6
WAVE_V2_PARSER=PASS
ALL_ROWS_VALID_BEFORE_DISPATCH=PASS
PARTIAL_DISPATCH_COUNT=0
RESULT_KEY_DERIVATION=ASCII_COMMENT_SUFFIX_00_PASS
RESULT_FALSE_POSITIVE_COUNT=0
RESULT_COMMENT_CAPTURE=PASS
COMMANDER_RESULT_LIST=PASS
C_REPEAT_CROSS_CORRELATION_COUNT=0
DUPLICATE_DISPATCH_COUNT=0
PREVIOUS_COMMAND_CANCEL_COUNT=0
LOST_WORK_CONTROL_EVENT_COUNT=0
EXISTING_VALIDATION_ABANDONED=false
TARGET_PC_6_WORKERS_X_3_WAVES=PENDING_UNTIL_LIVE_RECEIPTS
AUTO_TEST_WRITE_COUNT=0
```
