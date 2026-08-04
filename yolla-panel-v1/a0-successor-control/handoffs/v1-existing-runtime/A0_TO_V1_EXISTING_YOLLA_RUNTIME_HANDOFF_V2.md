# A-0 → V-1 기존 YOLLA Runtime 상세 인수인계서 V2

## 0. 권위 선언과 정정

```text
HANDOFF_ID=A0-TO-V1-EXISTING-YOLLA-RUNTIME-HANDOFF-V2-20260805-001
FROM_ROLE=A-0 AUTOMATION EXECUTION SUCCESSOR COMMANDER
TO_ROLE=V-1 EXISTING YOLLA RUNTIME SUCCESSOR OWNER
AUTHORITY_REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=#17
AUTHORITY_BRANCH=integration/a0-yolla-workspace-automation-successor-v1
OBSERVED_PARENT_HEAD=619e34b4b483f1d49f12849ac3f069fb6ab8f1b0
HANDOFF_STATUS=READY_FOR_V1_READBACK_AND_ACCEPTANCE
PRODUCTION=false
READY=false
MERGE=false
```

본 문서는 인수 범위를 다음과 같이 정정·확정한다.

```text
V-1 인수 범위 = 현재 사용 중인 기존 YOLLA Runtime
A-0 유지 범위 = 완전 분리된 AUTO TEST Runtime의 계속 개발·시험·고도화
```

`V-1이 AUTO TEST Runtime을 인수한다`는 이전 로컬 초안은 폐기한다. GitHub 권위는 본 문서와 최신 Pointer다.

```text
V1_AUTO_TEST_OWNERSHIP=false
A0_AUTO_TEST_OWNERSHIP=true
V1_EXISTING_RUNTIME_OWNERSHIP=true
```

---

## 1. 최종 지휘·개발 구조

### 1.1 V-1

V-1은 현재 사용 중인 기존 Runtime의 단일 End-to-End 소유자다.

```text
기존 Runtime 보존
→ 현재 상태 정확화
→ C 단순 일괄 반복모드 완성
→ 대상 PC 반복시험
→ 안정판/LTS 종결
→ 치명적 결함만 유지보수
```

### 1.2 A-0

A-0는 기존 Runtime의 일상 개발권을 V-1에게 넘기고, 다음 Runtime만 계속 개발한다.

```text
RUNTIME_ID=YOLLA_AUTO_TEST
ROOT=E:\YOLLA_AUTO_TEST
OWNER=A-0
PURPOSE=A/E 및 향후 기능의 독립 개발·시험·장시간 검증
```

AUTO TEST에서 PASS한 기능은 자동으로 기존 Runtime에 들어가지 않는다. 승격은 파일목록·SHA-256·대상 Baseline·Rollback이 고정된 별도 Patch Package로만 수행한다.

### 1.3 최상위 운영원칙

```text
POLICY_ID=YOLLA_EFFICIENCY_RATIONALITY_SPEED_FIRST_OPERATING_POLICY_V1
OWNER_MODEL=ONE_OWNER_END_TO_END
CURRENT_RUNTIME_OWNER=V-1
AUTO_TEST_OWNER=A-0
CYCLE_BATCH_PARALLEL=true
SEQUENTIAL_MANUAL_WORKER_DISPATCH=false
```

---

## 2. V-1이 인수하는 기존 Runtime의 물리적 권위

### 2.1 현재 Runtime 경로

```text
CURRENT_RUNTIME_ID=YOLLA_WORKSPACE_EXISTING_RUNTIME
CURRENT_APP_VERSION=5.10.2.3.7
CURRENT_STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2
CURRENT_RELEASE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-panel\releases
CURRENT_BROWSER_PROFILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
CURRENT_WORKER_PARTITION=persist:sf4-safe-panel-worker-1
CURRENT_ANALYSIS_PARTITION=persist:yolla-analysis-browser-v1
CURRENT_LAUNCHER=E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat
```

### 2.2 V-1이 보존해야 할 운영 자산

```text
workspace_state.json
registry.json 및 그룹·워커 표시정보
워커별 context_url
사용자 지정 commander_id
현재 Browser Profile과 로그인 세션
E 작업표·Dispatch Receipt·Exactly-once Ledger
A 그룹 Loop State·GitHub Pointer
Runtime 로그·로그 다운로드 기능
기존 Launcher와 Rollback 가능 Release
```

V-1은 인수 직후 위 자산의 SHA-256·크기·수정시각 Snapshot을 한 번 작성해야 한다. Snapshot 작성은 보존을 위한 것이며 실행을 막는 감사 Gate가 아니다.

---

## 3. 최신 관측 운영상태

최신 제출 로그의 기준 시각은 `2026-08-04T20:22:14.432Z`이며 다음 상태가 관측됐다.

```text
APP_VERSION=5.10.2.3.7
PANEL_OPEN=true
WORKSPACE_OPEN=true
LOG_STATUS_OPEN=true
BROWSER_ATTACHED=true
ACTIVE_COMMAND_CYCLE_COUNT=0
WORKER_TOTAL=20
WORKING=0
WAITING=15
RESTING_OR_COMPLETED=4
ERROR=1
PC_AGENT_LIKELY_CONNECTED=false
```

이는 Runtime 창과 Browser는 살아 있지만 실제 작업 수행자는 0명이며, 다수 Lane이 대기 상태였다는 뜻이다.

---

## 4. 기존 기능별 인수상태

### 4.1 UI·그룹·워커 관리

보존 대상:

```text
세로 그룹 목록
그룹 이름·색상 변경
그룹별 워커 추가
워커 메뉴 팝업
사용자 지정 커맨더
워커 상태표시
상단 집계
로그 다운로드
A/E 버튼 상태표시
```

V-1은 UI를 다시 설계하지 않는다. C 최소기능과 정확한 상태표시만 추가·교정한다.

### 4.2 E 작업표 모드

E의 핵심 흐름은 실제 완료증거가 있다.

```text
Schedule 등록
워커별 Job 선택
ChatGPT 워커 전달
GitHub Result 감지
PASS 후 다음 Job 전달
Exactly-once Ledger
```

실제 완료 이력:

```text
B-5=2/2 COMPLETED
B-6=2/2 COMPLETED
B-3=첫 Job PASS 후 의존대기
```

현재 상태 불일치:

```text
schedule_status=RUNNING
runtime.enabled=false
runtime.running=false
```

현재 Job 상태:

```text
B-2=RESULT_WAITING
B-3=WAIT_DEPENDENCY
B-4=RESULT_WAITING
B-5=COMPLETED
B-6=COMPLETED
```

V-1의 판정:

```text
E_CORE_FLOW=REUSABLE
E_REWRITE_FROM_ZERO=FORBIDDEN
E_NEW_FEATURE_DEVELOPMENT_IN_EXISTING_RUNTIME=NOT_PRIORITY
E_STATUS_PROJECTION_FIX=REQUIRED
```

A-0는 AUTO TEST에서 E를 계속 고도화한다. V-1은 기존 Runtime에서 E가 거짓으로 `RUNNING`을 표시하지 않도록 실제 `enabled && running` 기준만 교정한다.

### 4.3 A 커맨더–워커 순환 모드

관측된 주요 결함:

```text
session.getPartition() 호환 오류 이력
단일 BrowserView의 대화 전환 중 ERR_ABORTED
response_waited_in_chatgpt=false인 과거 Receipt
LEGACY_WEAK Dispatch 고착
NEW_USER_MESSAGE_NOT_OBSERVED 오판정
긴 대화 DOM 가상화로 전송증거 누락
COMMANDER_POINTER_WAITING 장기대기
워커별 커맨더 반복호출로 대화전환 과다
```

V5.10.2.3.7은 Dispatch Token 교정을 포함하지만 전체 A 순환의 운영 PASS는 아직 선언할 수 없다.

V-1은 기존 Runtime에서 A를 계속 복잡하게 확장하지 않는다. A의 본격 고도화는 A-0의 AUTO TEST 범위다.

### 4.4 잔존 상태

```text
B_GROUP=STOPPED이나 과거 COMMANDER_POINTER_WAITING 5건 잔존
완료 워커 B-5/B-6의 반복 Replan 파일 생성 이력
PC Agent bridge root는 있으나 likely_connected=false
그룹별 실제작업 0인데 RUNNING으로 보이는 상태 이력
```

V-1은 비활성 그룹을 삭제하지 않고 `ARCHIVED`로 표시하여 상단 집계에서 제외한다. 완료 워커의 Replan은 워커당 1회 Latch를 두고 반복 생성을 중지한다.

---

## 5. V-1의 최우선 종결 임무: C 단순 일괄 반복모드

C는 새 거대 오케스트레이터가 아니다. 현재 Runtime의 최종 반복작업 기능이다.

```text
A=커맨더가 다음 작업을 결정하는 출처
E=작업표가 다음 작업을 제공하는 출처
C=그룹 전체를 한 차수로 전달하는 단순 실행 방식
```

### 5.1 C 최소 흐름

```text
1. 사용자가 그룹의 커맨더를 지정
2. C 시작
3. 커맨더에게 그룹 전체 워커 결과·미완료 작업 확인 명령 1건 전송
4. 커맨더가 GitHub에 그룹 일괄 지시 게시물 1개 게시
5. Runtime이 게시물 Comment ID를 확인
6. 각 워커에게 같은 게시물에서 자기 WORKER_ID 구역만 수행하라고 순차 전달
7. GitHub Result Terminal 감시
8. 모든 대상 워커가 Terminal에 도달하면 C 완료 카운터 +1
9. 다시 커맨더에게 그룹 전체 검토 1건 전송
10. 반복
```

### 5.2 고정 로딩·시도 계약

사용자 확정값:

```text
LOAD_WAIT_SECONDS=30
MAX_ATTEMPTS=5
```

각 시도의 성공조건:

```text
정확한 Context URL 일치
browser.loading=false
입력창 존재
전송 버튼 사용 가능
정확한 Dispatch Token 확인
```

실패 흐름:

```text
최대 30초 조건 대기
→ 실패 시 재탐색 또는 새로고침
→ 최대 5회
→ 5회 실패 시 MANUAL_REQUIRED
```

5회 실패 이후 자동추론·무한재시도·다른 워커 재배정은 하지 않는다. 사용자가 직접 처리하고 `재개`를 누른다.

### 5.3 최소 상태

```text
IDLE
COMMANDER_SENT
BATCH_COMMENT_WAIT
WORKER_DISPATCH
RESULT_WAIT
ROUND_COMPLETED
MANUAL_REQUIRED
PAUSED
STOPPED
```

### 5.4 동시성·취소 규칙

```text
동시에 실행 가능한 C 그룹=1
동일 워커 ACTIVE_COMMAND 최대=1
현재 명령 처리 전 다음 명령=QUEUE
C 재클릭으로 기존 Batch 취소=금지
일시정지=현재 전송 완료 후 다음 단계 대기
중지=새 Round 생성 중지, 이미 전송된 작업 유지
강제취소=별도 명시적 사용자 확인과 취소원장 필수
```

### 5.5 카운터

상단 표시:

```text
C 완료 N회 | 현재 X/Y
```

증가조건:

```text
현재 Batch 대상 워커 전원이
PASS 또는 BLOCKED_EXTERNAL 또는 NO_PENDING_DIRECTIVE
중 하나에 도달
```

메시지 전송 횟수, 커맨더 호출 횟수, 재시도 횟수는 완료 카운터가 아니다.

### 5.6 C 최초 수용시험

```text
GROUP_COUNT=1
WORKER_COUNT=3
ROUND_COUNT=3
LOAD_WAIT_SECONDS=30
MAX_ATTEMPTS=5
EXPECTED_COMPLETED_ROUNDS=3
DUPLICATE_DISPATCH_COUNT=0
PREVIOUS_COMMAND_CANCEL_COUNT=0
COUNTER_FINAL=3
RESTART_RESUME=PASS
```

---

## 6. 로그인 세션과 Browser Profile 인수계약

### 6.1 기존 Runtime — V-1 소유

```text
PROFILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
OWNER=V-1
PRESERVE_ACROSS_RESTART=true
PRESERVE_ACROSS_REINSTALL=true
PRESERVE_ACROSS_UPGRADE=true
DELETE_ON_INSTALL=false
OVERWRITE_ON_INSTALL=false
SMOKE_TEST_USES_LIVE_PROFILE=false
```

V-1 설치기와 Patch는 기존 Browser Profile을 삭제·초기화·덮어쓰기하지 않는다. Smoke Test는 임시 Profile을 사용한다.

### 6.2 AUTO TEST — A-0 소유

```text
PROFILE=E:\YOLLA_AUTO_TEST\browser-profile
OWNER=A-0
PRESERVE_ACROSS_RESTART=true
PRESERVE_ACROSS_REINSTALL=true
PRESERVE_ACROSS_UPGRADE=true
LIVE_PROFILE_SHARING_WITH_EXISTING_RUNTIME=false
```

두 Runtime은 로그인 상태를 실시간 동기화하지 않는다. 같은 Profile 경로나 같은 userData Root를 사용하지 않는다. AUTO TEST 최초 로그인이 필요하면 사용자 1회 로그인을 허용하고 이후 자체 Profile을 보존한다.

---

## 7. 절대 분리 경계

### 7.1 A-0 AUTO TEST 전용 경로

```text
AUTO_TEST_ROOT=E:\YOLLA_AUTO_TEST
AUTO_TEST_SOURCE_ROOT=E:\YOLLA_AUTO_TEST\source
AUTO_TEST_RELEASE_ROOT=E:\YOLLA_AUTO_TEST\runtime\releases
AUTO_TEST_STATE_ROOT=E:\YOLLA_AUTO_TEST\state
AUTO_TEST_BROWSER_PROFILE=E:\YOLLA_AUTO_TEST\browser-profile
AUTO_TEST_LOG_ROOT=E:\YOLLA_AUTO_TEST\logs
AUTO_TEST_CONFIG_ROOT=E:\YOLLA_AUTO_TEST\config
AUTO_TEST_BRIDGE_ROOT=E:\YOLLA_AUTO_TEST\bridge
AUTO_TEST_HOST_ROOT=E:\YOLLA_AUTO_TEST\host
AUTO_TEST_LAUNCHER_ROOT=E:\YOLLA_AUTO_TEST\launcher
AUTO_TEST_TEMP_ROOT=E:\YOLLA_AUTO_TEST\temp
AUTO_TEST_BACKUP_ROOT=E:\YOLLA_AUTO_TEST\backups
AUTO_TEST_WORKER_PARTITION=persist:yolla-auto-test-worker-v1
AUTO_TEST_ANALYSIS_PARTITION=persist:yolla-auto-test-analysis-v1
AUTO_TEST_APP_ID=com.yolla.autotest.runtime.v1
```

### 7.2 금지 교차행위

```text
V-1이 E:\YOLLA_AUTO_TEST 아래 Source·State·Profile 수정=금지
A-0가 기존 Runtime State에 AUTO TEST 실험결과 쓰기=금지
두 Runtime이 동일 Browser Profile 사용=금지
두 Runtime이 동일 State Root 사용=금지
기존 Schedule·Ledger·Receipt의 AUTO TEST 자동복사=금지
AUTO TEST State의 기존 Runtime 자동병합=금지
한 Runtime 설치기가 다른 Runtime 프로세스 종료=금지
검증 전 AUTO TEST 전체 Source를 기존 Runtime에 덮어쓰기=금지
```

기능 승격은 버전이 지정된 단방향 Patch Package만 허용한다.

---

## 8. A-0가 유지하는 AUTO TEST 기준선

```text
AUTO_TEST_VERSION=1.0.1
INSTALLER=INSTALL_AI_YOLLA_AUTO_TEST_RUNTIME_V1_0_1_EMPTY_SCHEDULE_FIX.bat
INSTALLER_SIZE=343095
INSTALLER_SHA256=97bd254c5fcde10f1cf2353fdf4f7c99241cce1b03cb081942f2d8dab3f6caaa
SOURCE=AI_YOLLA_AUTO_TEST_RUNTIME_V1_0_1_SOURCE.zip
SOURCE_SIZE=125661
SOURCE_SHA256=8ae5be956d1aa4f873f643ed9ed2ade5e4880211250c3ca5076505801e63608b
RUNTIME_PACKAGE_SHA256=ac3e1230f6abdc8b5e5a9115d54a68694a22e7eba01b83a508527d46abbd94da
EXTERNAL_DISPATCH_ENABLED_DEFAULT=false
LOAD_WAIT_SECONDS=30
MAX_ATTEMPTS=5
SMOKE_TIMEOUT_SECONDS=90
```

V1 설치에서 발생했던 `TypeError: schedule must be an object`는 AUTO TEST Fresh State에 Schedule이 없는데 Schedule Runtime이 null을 검증한 것이 원인이었다. V1.0.1은 `AUTO_TEST_EMPTY_SCHEDULE_V1`, 90초 Smoke Timeout, Unhandled Promise 종료처리를 포함한다.

현재 판정:

```text
BUILD_VALIDATION=PASS
TARGET_PC_V1_0_1_INSTALL_ACCEPTANCE=PENDING
AUTO_TEST_OWNER=A-0
V1_ACTION_ON_AUTO_TEST=NONE_EXCEPT_READ_ONLY_REFERENCE
```

---

## 9. V-1의 작업 우선순위

### P0-1 인수 Snapshot

기존 Runtime의 State·Release·Launcher·Profile 핵심 파일 Hash·수정시각을 기록하고 로그인 상태를 보존한다.

### P0-2 상태표시 정확화

```text
E RUNNING 표시=runtime.enabled && runtime.running일 때만
실제작업 집계=실제 Active Command가 있을 때만
비활성 B_GROUP=ARCHIVED 처리 후 집계 제외
완료 워커 Replan=1회 Latch
```

### P0-3 C V1 구현

본 문서 5장의 최소 상태·30초·5회·수동처리 계약만 구현한다.

### P0-4 대상 PC 최소시험

1개 그룹, 3개 워커, 3개 Round로 카운터·중복 0·취소 0·재시작 복구를 검증한다.

### P0-5 기존 Runtime LTS 종결

```text
TERMINAL=V1_EXISTING_YOLLA_RUNTIME_C_RELAY_LTS_PASS
```

이 Terminal 이후에는 치명적 결함 외 기능추가를 중지하고 A/E의 추가 개발은 A-0 AUTO TEST 결과를 명시적으로 승격할 때만 반영한다.

---

## 10. A-0의 후속 AUTO TEST 임무

```text
AUTO TEST V1.0.1 대상 PC 설치·Smoke 수용
AUTO TEST 로그인 Profile 지속보존
A 모드 Batch 구조 고도화
E Schedule 상태·Watcher·Exactly-once 고도화
장시간·재시작·네트워크 지연 시험
향후 독립 Browser 또는 Background Runtime 연구
기능별 승격 Package 제작
```

A-0는 V-1의 기존 Runtime Branch나 State에 직접 작업하지 않는다.

---

## 11. GitHub 분기·보고 계약

본 인수인계는 PR #17에 게시한다. 이후 Source 수정은 분리한다.

```text
V1_TARGET_BRANCH=successor/v1-existing-yolla-runtime-v1
A0_AUTO_TEST_TARGET_BRANCH=auto-test/a0-runtime-development-v1
```

위 Branch가 아직 없다면 각 담당자가 첫 Source 변경 전에 현재 권위 Head에서 생성한다. 서로의 Branch에 직접 Commit하지 않는다.

V-1 주요 보고 필드:

```text
ROLE=V-1
RUNTIME_ID=YOLLA_WORKSPACE_EXISTING_RUNTIME
VERSION
SOURCE_HEAD
TARGET_PC_STATUS
LOGIN_SESSION_STATUS
C_ROUND_COMPLETED_COUNT
CURRENT_BATCH_PROGRESS
DUPLICATE_DISPATCH_COUNT
PREVIOUS_COMMAND_CANCEL_COUNT
CURRENT_RUNTIME_WRITE_SCOPE
AUTO_TEST_WRITE_COUNT=0
LATEST_LOG_POINTER
NEXT_GATE
```

A-0 AUTO TEST 보고 필드:

```text
ROLE=A-0
RUNTIME_ID=YOLLA_AUTO_TEST
VERSION
SOURCE_HEAD
TARGET_PC_STATUS
LOGIN_SESSION_STATUS
CURRENT_RUNTIME_WRITE_COUNT=0
CURRENT_RUNTIME_PROCESS_STOP_ATTEMPT_COUNT=0
TEST_STATUS
PROMOTION_PACKAGE_POINTER
NEXT_GATE
```

---

## 12. V-1 첫 실행명령

```text
REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=#17
ROLE=V-1 EXISTING YOLLA RUNTIME SUCCESSOR OWNER

PR #17의 A0_TO_V1_EXISTING_YOLLA_RUNTIME_HANDOFF_V2를 읽고 기존 Runtime을 인수하라.
AUTO TEST는 A-0 소유이므로 E:\YOLLA_AUTO_TEST 아래 파일·상태·프로필을 수정하지 마라.
먼저 기존 Runtime의 State·Release·Launcher·Browser Profile Snapshot을 작성하고 로그인 세션을 보존하라.
그 다음 실제 Runtime 상태표시를 교정하고, C 단순 일괄 반복모드를 30초 로딩 대기·최대 5회 시도·5회 실패 MANUAL_REQUIRED 계약으로 구현하라.
1개 그룹·3개 워커·3개 Round에서 중복실행 0, 이전 명령 취소 0, 완료카운터 3, 재시작 복구 PASS를 검증하라.
완료 후 같은 PR에 Result Pointer와 Terminal을 게시하라.
```

---

## 13. 인수 Readback 및 Terminal

V-1은 인수 후 다음을 같은 PR에 게시한다.

```text
YOLLA_V1_EXISTING_RUNTIME_HANDOFF_READBACK_V1
HANDOFF_ID=A0-TO-V1-EXISTING-YOLLA-RUNTIME-HANDOFF-V2-20260805-001
ROLE=V-1
EXISTING_RUNTIME_ACCEPTED=true
AUTO_TEST_OWNERSHIP_ACCEPTED=false
AUTO_TEST_WRITE_COUNT=0
CURRENT_PROFILE_PRESERVATION_ACCEPTED=true
LOAD_WAIT_SECONDS=30
MAX_ATTEMPTS=5
NEXT_TASK=EXISTING_RUNTIME_SNAPSHOT_AND_C_V1
```

인수 수락 Terminal:

```text
V1_EXISTING_YOLLA_RUNTIME_HANDOFF_ACCEPTED
```

최종 LTS Terminal:

```text
V1_EXISTING_YOLLA_RUNTIME_C_RELAY_LTS_PASS
```

---

## 14. 읽기 순서

```text
1. LATEST_A0_TO_V1_EXISTING_RUNTIME_HANDOFF_POINTER.json
2. A0_TO_V1_EXISTING_YOLLA_RUNTIME_HANDOFF_V2.md
3. A0_TO_V1_EXISTING_YOLLA_RUNTIME_HANDOFF_V2.json
4. 최신 운영 로그 AI_YOLLA_LOG_EXPORT_20260804_202214.json
5. YOLLA_EFFICIENCY_RATIONALITY_SPEED_FIRST_OPERATING_POLICY_V1
6. 기존 A/E Runtime Pointer와 Schedule 계약
```

---

## 15. 최종 경계 요약

```text
V-1:
기존 Runtime 인수
→ C 단순 반복모드 완성
→ 상태표시 정확화
→ 로그인 세션 보존
→ LTS 종결

A-0:
AUTO TEST 계속 개발
→ A/E 고도화
→ 장시간 시험
→ 기능별 승격 Package 제작

공통:
Source·State·Profile·Launcher·Process 완전 분리
자동 병합 없음
검증 전 승격 없음
```
