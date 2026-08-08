# V-1 기존 YOLLA Runtime C 모드 구현·검증계획 V1

```text
PLAN_ID=V1-EXISTING-RUNTIME-C-MODE-IMPLEMENTATION-PLAN-V1-20260805-001
OWNER=V-1
BASE_APP_VERSION=5.10.2.3.7
STATUS=PLAN_PUBLISHED_IMPLEMENTATION_NOT_STARTED
```

## 1. 임무

기존 YOLLA Runtime을 보존하면서 오류율이 낮고 간결하며 범용적인 C 모드와 명령실행 매크로를 완성해 LTS로 종결한다.

```text
C 모드
= GitHub WAVE·보고·공정률을 기준으로 반복하는 단순 Batch Relay

명령실행
= 사용자 입력문을 시간 또는 결과게시 조건에 따라 그대로 반복하는 매크로
```

## 2. 절대 경계

```text
기존 Runtime 소유자=V-1
AUTO TEST 소유자=A-0
V1_AUTO_TEST_WRITE_COUNT=0
```

보존 대상:

```text
APP_VERSION=5.10.2.3.7
STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2
RELEASE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-panel\releases
BROWSER_PROFILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
WORKER_PARTITION=persist:sf4-safe-panel-worker-1
ANALYSIS_PARTITION=persist:yolla-analysis-browser-v1
```

설치·업데이트·Smoke Test는 현재 로그인 Profile을 삭제·초기화·덮어쓰기하지 않는다. `E:\YOLLA_AUTO_TEST`는 수정하지 않는다.

## 3. 구현원칙

```text
CHAT_CONTENT_READING=false
GITHUB_STATUS_AUTHORITY=true
BACKGROUND_RUNTIME=true
CYCLE_BATCH_PARALLEL=true
SEQUENTIAL_COMPLETION_GATED_DISPATCH=false
CONCURRENT_C_GROUPS=1
ACTIVE_COMMAND_PER_WORKER=1
C_RECLICK_CANCELS_ACTIVE_BATCH=false
LOAD_WAIT_SECONDS=30
MAX_ATTEMPTS=5
AFTER_MAX_ATTEMPTS=MANUAL_REQUIRED
```

채팅창은 초기 그룹·커맨더·워커 연결과 Prompt 전달에만 사용한다. 실제 상태판정·WAVE·공정률·미보고·END는 백그라운드에서 GitHub를 기준으로 처리한다.

## 4. 최소 UI

```text
그룹 지정
커맨더 지정
워커 연결
작업시작·일시정지·중지
현재 WAVE
공정률과 증감
정상보고·미보고·장기미완료 수
워커별 누적 수행 작업 수
명령실행 입력문·조건·전송 횟수
```

채팅 원문과 워커별 상세 대화는 기본화면에 표시하지 않는다.

## 5. 구현단계

### Phase 0 — 비파괴 Snapshot

기존 State·Registry·Context URL·Profile 경로·C/A/E 원장·Launcher의 SHA-256·크기·수정시각을 기록한다. Snapshot은 실행을 막는 감사 Gate가 아니다.

### Phase 1 — 계약과 상태원장

다음을 영속 저장한다.

```text
그룹·커맨더·워커 연결
현재 WAVE_POST_ID
대상·보고·미보고 워커
워커별 결과게시물 번호와 누적 작업 수
명시적 미보고 요구 실패 횟수
20분·90분 기준시각
보조·교체 워커
커맨더 공정률 이력
명령실행 문장·조건·마지막 전송시각
```

### Phase 2 — C Batch Relay

새 WAVE를 받으면 모든 대상 워커를 한 Batch에 등록하고 앞 워커의 완료를 기다리지 않고 전달한다. 동일 워커·동일 WAVE의 중복 Dispatch를 금지한다.

### Phase 3 — GitHub 보고 감시

워커·커맨더의 고정 `PANEL` 줄을 파싱하고 GitHub 게시물 번호를 저장한다. START는 결과 수에 포함하지 않는다. 채팅 내용은 판정하지 않는다.

### Phase 4 — 시간·예외 처리

```text
20분 + 미보고 1~2명
→ 해당 워커 제외 후 완료 워커 다음 WAVE

20분 + 미보고 3명 이상
→ 대기

90분 장기 미보고
→ 보조 워커 2명 투입

명시적 미보고 요구 4회 실패
→ 신규 주 워커 교체·인계
```

### Phase 5 — 공정률

커맨더의 매 WAVE 공정률을 표시하고, 완료 작업 수 증가와 공정률 미상승을 `PROGRESS_INTEGRITY_ERROR`로 차단한다.

### Phase 6 — 명령실행

```text
EVERY_X_MINUTES
AFTER_COMPLETION=새 GitHub 결과게시물 확인 후
```

사용자 입력문은 변경하지 않는다. 활성 명령이 있으면 Tick을 건너뛰고 중복 Queue를 만들지 않는다.

### Phase 7 — 재시작·LTS 시험

현재 WAVE·Timer·미보고 횟수·명령실행 설정을 재시작 후 복구한다. 기존 로그인 Profile을 보존한 대상 PC 반복시험을 통과한 뒤에만 LTS Terminal을 게시한다.

## 6. 수용시험

기존 인수계약:

```text
GROUP_COUNT=1
WORKER_COUNT=3
ROUND_COUNT=3
EXPECTED_COMPLETED_ROUNDS=3
DUPLICATE_DISPATCH_COUNT=0
PREVIOUS_COMMAND_CANCEL_COUNT=0
COUNTER_FINAL=3
RESTART_RESUME=PASS
```

추가 필수시험:

```text
START_NOT_COUNTED_AS_RESULT=PASS
BATCH_ALL_WORKERS_ENQUEUED_BEFORE_COMPLETION=PASS
WORKER_REPORT_POST_ID_CAPTURE=PASS
COMMANDER_PROGRESS_PARSE=PASS
TWENTY_MINUTE_PARTIAL_CONTINUE=PASS
TWENTY_MINUTE_THREE_PLUS_WAIT=PASS
NINETY_MINUTE_TWO_RESCUE_WORKERS=PASS
FOUR_EXPLICIT_MISSING_REPORT_REPLACEMENT=PASS
PROGRESS_INTEGRITY_ERROR=PASS
COMMAND_EVERY_X_MINUTES=PASS
COMMAND_AFTER_RESULT_POST=PASS
ACTIVE_COMMAND_PER_WORKER_MAX_ONE=PASS
LOGIN_PROFILE_PRESERVED=PASS
AUTO_TEST_WRITE_COUNT=0
```

## 7. 종결

인수 수락과 구현 완료를 구분한다.

```text
인수 수락 Terminal=V1_EXISTING_YOLLA_RUNTIME_HANDOFF_ACCEPTED
최종 LTS Terminal=V1_EXISTING_YOLLA_RUNTIME_C_RELAY_LTS_PASS
```

최종 LTS Terminal은 대상 PC 실제 반복시험·재시작 복구·중복 0·Profile 보존이 확인된 뒤에만 게시한다. Production·Ready·Merge는 별도 승인 없이는 수행하지 않는다.
