# C MODE COMPLETION SUCCESSOR HANDOFF AND 7-CYCLE PLAN V1

```text
DOCUMENT_ID=C-MODE-COMPLETION-SUCCESSOR-HANDOFF-AND-7-CYCLE-PLAN-V1-20260806-001
USER_DIRECTIVE_TIME=2026-08-06T23:11:00+09:00
REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=17
AUTHORITY_BRANCH=integration/a0-yolla-workspace-automation-successor-v1
BASELINE_HEAD_BEFORE_PUBLICATION=37a35fe8b0d8b0d4cb3ada3ae4f1dce8d19a846e
PRIMARY_OWNER=A-0_AUTOMATION_EXECUTION_SUCCESSOR_COMMANDER
PRIMARY_GOAL=C_MODE_COMPLETION
STATUS=HANDOFF_PUBLISHED_EXECUTION_NOT_CLAIMED
```

## 1. 사용자 권위와 단일 목표

이 문서는 장기 대화 컨텍스트 소모 또는 후임 교체 이후에도 임무가 변형되지 않도록 하는 권위 인수인계서다.

사용자의 최신 명시적 지시에 따라 현재 A-0 후임의 단일 최우선 목표는 다음과 같다.

```text
PRIMARY_GOAL=
기존 YOLLA Workspace Runtime을 보존하면서
C 모드와 명령실행 기능을 실제 대상 PC에서 완성하고
반복 실행·중복 억제·실패 복구·재시작 복구를 검증한 뒤
C 모드 LTS Terminal을 확정하는 것
```

다음은 현재 최우선 목표가 아니다.

```text
SITE_ANALYZER_EXTENSION=DEFERRED_UNTIL_C_MODE_LTS_OR_NEW_USER_DIRECTIVE
A_B_C_D_DATA_PIPELINE_EXPANSION=NOT_CURRENT_GOAL
D_GROUP_NEW_ASSIGNMENT=NOT_AUTHORIZED_BY_THIS_HANDOFF
LOCAL_SERVER_OPERATION=NOT_AUTHORIZED_BY_THIS_HANDOFF
PRODUCTION_READY_MERGE=NOT_AUTHORIZED
```

후임은 사용자 명시 지시 없이 목표를 확대하거나 새로운 그룹 임무를 자동 발행하지 않는다.

## 2. C 모드의 정확한 정의

기존 권위계획 `V1_C_MODE_IMPLEMENTATION_PLAN_V1.md`의 정의를 유지한다.

```text
C_MODE=
GitHub WAVE·결과게시물·공정률을 권위로 사용하여
커맨더 지시를 대상 워커 전체에 Batch로 전달하고
보고·미보고·시간예외·다음 WAVE를 반복 관리하는 모드

COMMAND_EXECUTION=
사용자가 입력한 문장을 변경하지 않고
시간조건 또는 새로운 GitHub 결과게시물 조건에 따라 반복 전송하는 매크로
```

채팅 원문은 상태판정 권위가 아니다. GitHub 게시물·결과키·WAVE·공정률이 권위다.

## 3. 현재 확인된 권위상태

### 3.1 실가동·후보 Runtime

```text
LAST_VERIFIED_ACTIVE_RUNTIME=5.10.2.3.7
C_TARGET_CHAIN=5.10.2.4.0-c-mode-repeat-command -> 5.10.2.4.1-c-command-ui-hotfix
TARGET_PC_INSTALL=PENDING
LIVE_PROCESS_READBACK=PENDING_INSTALLER_RECEIPT
FINAL_LTS_TERMINAL_CLAIMED=false
```

권위 Pointer:

```text
yolla-panel-v1/v1-existing-runtime-control/LATEST_C_MODE_ACTIVE_RUNTIME_SOURCE_AUTHORITY_POINTER.json
yolla-panel-v1/v1-existing-runtime-control/LATEST_V1_V510241_C_COMMAND_UI_POINTER.json
```

### 3.2 6워커 검증체계

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
OFFLINE_VALIDATION=PASS
OFFLINE_FAILURE_COUNT=0
TARGET_PC_LIVE_TEST=PENDING
SIX_WORKER_THREE_ROUND=PENDING
RESTART_RESUME=PENDING
LTS_TERMINAL_CLAIMED=false
```

권위 Pointer:

```text
yolla-panel-v1/v1-existing-runtime-control/LATEST_V1_C_MODE_6_WORKER_VALIDATION_POINTER.json
```

### 3.3 기존 Runtime 버튼 후보

PR #73의 후보는 다음 기능을 보유한다.

```text
CANDIDATE_BRANCH=agent/c-mode-existing-runtime-button-v1
OBSERVED_HEAD=e1d0353c3f993793787cb228efc3abef69957ad4
CANDIDATE_REFERENCE=5.10.2.4.2-rc8
STATIC_ASSERTIONS=PASS_33
TARGET_PC_APPLIED=false
TARGET_PC_LIVE_PASS_CLAIMED=false
```

이 후보는 PR #17 권위와 대상 PC 실행증거에 결속되기 전까지 최종 Runtime 권위가 아니다.

## 4. 실패 우선 진단

현재 C 모드가 종결되지 않은 직접 이유는 다음과 같다.

```text
1. 대상 PC 설치·실행 Readback 미완료
2. 실제 그룹 헤더 C 모드 버튼 결속 미확인
3. 실제 커맨더→전체 워커 Batch 전달 미확인
4. GitHub 결과게시물 상관관계 Live 확인 미완료
5. 6워커 3라운드 실제 실행 미완료
6. 실패주입·부분미보고·교체·구조 복구 Live 확인 미완료
7. 재시작 후 WAVE·Timer·명령실행 복구 미완료
8. 브라우저를 열기만 해도 무겁다는 사용자 관측에 대한 자원계측·경량화 미완료
```

정적 테스트나 Fixture PASS만으로 대상 PC PASS 또는 LTS PASS를 주장하지 않는다.

## 5. 7-Cycle 종결 구조

각 Cycle은 문서작성 단위가 아니다.

```text
ONE_CYCLE=
구현 또는 교정
-> 대상 Runtime 적용
-> 실제 실행
-> 실패 분석
-> 재교정·재실행
-> GitHub 결과·증거 게시
```

### Cycle 1 — 권위·Runtime·성능 기준선 고정

목표:

```text
ACTIVE_RUNTIME_SOURCE=EXACT_READBACK
TARGET_INSTALLER=EXACT_SHA256_AND_PATH
CURRENT_PROCESS_VERSION=OBSERVED
BASE_IDLE_CPU_MEMORY_PROCESS_COUNT=MEASURED
BROWSERWINDOW_WEBCONTENTS_COUNT=MEASURED
```

작업:

- 실가동 `5.10.2.3.7`과 후보 `5.10.2.4.0/4.1`, PR #73 후보를 구분한다.
- 대상 PC에서 실제 실행파일·Launcher·Process·Browser Profile을 Readback한다.
- 패널만 실행, 브라우저 1개 실행, 비활성 좌석 상태의 CPU·RAM·Renderer·WebContents 수를 계측한다.
- 성능수치 없이 경량화 PASS를 주장하지 않는다.

PASS:

```text
SOURCE_AUTHORITY_READBACK=PASS
TARGET_PC_BASELINE_RECEIPT=PASS
IDLE_RESOURCE_BASELINE=PASS
FALSE_ACTIVE_RUNTIME_CLAIM_COUNT=0
```

### Cycle 2 — Browser Lifecycle 경량화

목표:

```text
SEAT_COUNT != LIVE_BROWSER_COUNT
LAZY_BROWSER_CREATION=true
INACTIVE_BROWSER_LIFECYCLE=HOT_WARM_COLD
ANALYZER_BROWSER_DEFAULT_CREATED=false
```

작업:

- 좌석 상태객체와 실제 WebContents를 분리한다.
- 선택한 좌석 또는 실행 중 좌석만 Browser를 생성한다.
- 비활성 View는 Background Throttling, Suspend 또는 Destroy한다.
- 탭 닫기·그룹 전환·재시작 후 Renderer·WebContents 누수를 검사한다.
- 전체 좌석 재Render와 과도한 Polling을 변경기반 갱신으로 줄인다.

초기 목표값:

```text
MAX_ACTIVE_CHATGPT_WEBCONTENTS=2
MAX_ACTIVE_ANALYZER_WEBCONTENTS=1
MAX_ACTIVE_TOTAL_WEBCONTENTS=3
IDLE_CPU_TARGET=<5_PERCENT
UNBOUNDED_MEMORY_GROWTH=false
```

목표값은 대상 PC 계측결과에 따라 조정할 수 있으나 측정 없이 삭제하지 않는다.

### Cycle 3 — C 모드 버튼·상태머신·UI 진실성

목표:

```text
GROUP_HEADER_C_MODE_BUTTON=LIVE_BOUND
IDLE=GRAY
RUNNING=BLUE
ERROR=RED
MODE_SEPARATION=C_MODE_VS_COMMAND_EXECUTION
```

작업:

- 기존 Runtime의 `readGroup/writeGroup/renderGroup/sendToCommander/sendToWorker` Adapter에 최소 Patch를 결속한다.
- 클릭 즉시 상태를 저장하고 Render한다.
- 사용자 중지, 정상종료, 오류, 재실행을 정확히 구분한다.
- A/E 또는 Legacy 상태가 C 모드 UI에 투영되지 않게 한다.

PASS:

```text
TARGET_PC_C_BUTTON_VISIBLE=PASS
CLICK_TO_RUNNING=PASS
ERROR_TO_RESTART=PASS
FALSE_RUNNING_COUNT=0
MODE_STATE_LEAK_COUNT=0
```

### Cycle 4 — GitHub Batch Relay·상관관계·WAVE·공정률

목표:

```text
COMMANDER_POST_SET_VALIDATION=PASS
ALL_TARGET_WORKERS_BATCH_DISPATCH=PASS
DUPLICATE_DISTRIBUTION_ID_COUNT=0
GITHUB_RESULT_POST_CORRELATION=PASS
```

작업:

- 커맨더에게 기본 또는 설정된 `commandMessage`를 전송한다.
- 커맨더의 전체 워커 게시물 세트를 검증한다.
- 앞 워커 완료를 기다리지 않고 대상 워커 전체에 같은 Batch를 전달한다.
- `distributionId`, worker, WAVE, directive, result post ID를 결속한다.
- START 게시물은 결과 수에 포함하지 않는다.
- 커맨더 공정률과 완료작업 수를 비교하고 역행·정체 오류를 표시한다.
- 20분·90분·명시적 미보고 교체규칙을 실제 시간주입 시험으로 검증한다.

PASS:

```text
BATCH_ALL_WORKERS_ENQUEUED_BEFORE_COMPLETION=PASS
START_NOT_COUNTED_AS_RESULT=PASS
WORKER_REPORT_POST_ID_CAPTURE=PASS
COMMANDER_PROGRESS_PARSE=PASS
TWENTY_MINUTE_PARTIAL_CONTINUE=PASS
TWENTY_MINUTE_THREE_PLUS_WAIT=PASS
NINETY_MINUTE_RESCUE=PASS
FOUR_FAILURE_REPLACEMENT=PASS
```

### Cycle 5 — 명령실행·백그라운드·설치·로그

목표:

```text
COMMAND_EVERY_X_MINUTES=LIVE
COMMAND_AFTER_RESULT_POST=LIVE
BACKGROUND_RUNTIME=PASS
INSTALL_ROLLBACK_LOG=PASS
```

작업:

- 사용자의 입력문을 변경하지 않고 반복한다.
- 활성 명령이 있으면 중복 Queue를 만들지 않는다.
- 창이 비활성화돼도 Runtime이 동작하되 유휴자원을 과도하게 사용하지 않게 한다.
- 설치·업데이트·Rollback 후 C 상태·로그·Browser Profile을 보존한다.
- 로그창은 보존하되 무제한 DOM·파일 증가를 방지한다.

PASS:

```text
ACTIVE_COMMAND_PER_WORKER_MAX_ONE=PASS
COMMAND_EVERY_X_MINUTES=PASS
COMMAND_AFTER_RESULT_POST=PASS
BACKGROUND_DISPATCH=PASS
INSTALL_ROLLBACK=PASS
LOG_ROTATION_OR_BOUNDING=PASS
BROWSER_PROFILE_PRESERVED=PASS
```

### Cycle 6 — 6워커 실제 실행·실패주입·재시작 복구

목표:

```text
WORKER_COUNT=6
ROUND_COUNT=3
DUPLICATE_DISPATCH_COUNT=0
RESTART_RESUME=PASS
```

담당범위:

```text
AUTOMATION-C-W1=Runtime 상태머신·WAVE 시간규칙
AUTOMATION-C-W2=GitHub 보고·상관관계·미보고
AUTOMATION-C-W3=UI 상태 진실성·두 모드 분리·자원상태 표시
AUTOMATION-C-W4=반복 명령 Runtime
AUTOMATION-C-W5=백그라운드 전송·설치·Rollback·로그
AUTOMATION-C-W6=실패주입·대상 PC·독립수용
```

시험:

- 커맨더 전송 실패
- 워커 전송 실패
- GitHub 결과 누락
- 부분미보고
- 중복 클릭·중복 게시물
- Runtime 강제종료
- 패널 재시작
- Browser View 생성·해제 반복

PASS:

```text
SIX_WORKER_THREE_ROUND=PASS
DUPLICATE_DISPATCH_COUNT=0
STATE_RECOVERY=PASS
TIMER_RECOVERY=PASS
COMMAND_RECOVERY=PASS
WEBCONTENTS_LEAK_TEST=PASS
FAILURE_INJECTION_MATRIX=PASS
```

### Cycle 7 — 대상 PC LTS 수용·종결

목표:

```text
TARGET_PC_REAL_USAGE=PASS
C_MODE_LTS_TERMINAL=PASS
```

최종 수용조건:

```text
GROUP_HEADER_C_BUTTON=PASS
COMMANDER_TO_ALL_WORKERS=PASS
GITHUB_RESULT_CORRELATION=PASS
WAVE_REPEAT=PASS
PROGRESS_DISPLAY=PASS
PARTIAL_MISSING_REPORT_RULES=PASS
REPEAT_COMMAND=PASS
RESTART_RESUME=PASS
LOGIN_PROFILE_PRESERVED=PASS
IDLE_RESOURCE_TARGET=PASS_OR_EXACT_MEASURED_EXCEPTION
DUPLICATE_DISPATCH_COUNT=0
UNBOUNDED_MEMORY_GROWTH=false
```

최종 Terminal:

```text
V1_EXISTING_YOLLA_RUNTIME_C_RELAY_LTS_PASS
```

이 Terminal은 대상 PC 실제 반복시험과 증거가 없으면 게시하지 않는다.

## 6. Cycle Gate 원칙

```text
CYCLE_N_PLUS_1_START=
CYCLE_N_TERMINAL_PASS
OR
CYCLE_N_EXACT_BLOCKER_WITH_PARALLEL_SAFE_SUBTASK
```

- 동일 경로 동시수정 금지.
- 성능 최적화는 기능삭제로 처리하지 않는다.
- 정적 PASS를 Live PASS로 승격하지 않는다.
- 사용자 관측과 상충하는 UI 상태를 PASS로 표시하지 않는다.
- 결과보고는 Commit·Blob·대상 PC Receipt를 포함한다.

## 7. 후임 즉시 실행순서

```text
1. PR #17 최신 Remote HEAD 재조회
2. 본 인수서와 3개 핵심 Pointer Readback
3. PR #73과 PR #59~#64 최신 HEAD·Terminal 재조회
4. 대상 PC 현재 설치본·Process·WebContents 기준선 수집
5. Cycle 1 실행
6. Cycle별 Terminal 이후 다음 Cycle 게시
7. Cycle 7 PASS 후에만 LTS Terminal 게시
```

필수 선행 Readback:

```text
yolla-panel-v1/v1-existing-runtime-control/c-mode/V1_C_MODE_IMPLEMENTATION_PLAN_V1.md
yolla-panel-v1/v1-existing-runtime-control/LATEST_C_MODE_ACTIVE_RUNTIME_SOURCE_AUTHORITY_POINTER.json
yolla-panel-v1/v1-existing-runtime-control/LATEST_V1_V510241_C_COMMAND_UI_POINTER.json
yolla-panel-v1/v1-existing-runtime-control/LATEST_V1_C_MODE_6_WORKER_VALIDATION_POINTER.json
```

## 8. 보고형식

각 Cycle 종결보고는 최소 다음을 포함한다.

```text
CYCLE_ID
BASELINE_HEAD
FINAL_REMOTE_HEAD
IMPLEMENTED_PATHS
TARGET_PC_APPLIED
TARGET_PC_RECEIPT
TEST_COMMANDS
PASS_FAIL_COUNTS
CPU_MEMORY_WEBCONTENTS_BEFORE_AFTER
FIRST_FAILURE
CORRECTION
TERMINAL
NEXT_GATE
PRODUCTION=false
READY=false
MERGE=false
```

## 9. 최종 경계

```text
USER_IS_FINAL_AUTHORITY=true
CHAT_IS_NOT_AUTHORITY=true
GITHUB_COMMITTED_DOCUMENT_IS_AUTHORITY=true
TARGET_PC_EVIDENCE_REQUIRED=true
PRODUCTION=false
READY=false
MERGE=false
SELF_MERGE=false
```

이 인수서는 C 모드 완성 임무를 후임에게 연속 인계하기 위한 문서이며, 별도 사용자 지시 없이 다른 목표로 전환하는 권한을 부여하지 않는다.
