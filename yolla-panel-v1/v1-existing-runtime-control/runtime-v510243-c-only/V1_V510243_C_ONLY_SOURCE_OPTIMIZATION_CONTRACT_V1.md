# V1 V5.10.2.4.3 C-ONLY SOURCE OPTIMIZATION CONTRACT V1

```text
VERSION=5.10.2.4.3
BASELINE=5.10.2.3.7
SOURCE_CHAIN=5.10.2.4.0 -> 5.10.2.4.1 -> 5.10.2.4.3
MODE=C_ONLY_SOURCE_OPTIMIZATION
TARGET_PC_INSTALL=PENDING
PRODUCTION=false
READY=false
MERGE=false
```

## 목적

폐기된 E/A 기능을 화면에서 숨기는 방식이 아니라 새 버전 Release의 실제 Source에서 제거한다. 기존 실행 중 Release는 수정하지 않는다.

## 삭제 범위

```text
workspace.js:
  data-epic-group / epic-button 생성과 클릭 처리
  data-auto-group / automation-button 생성과 클릭 처리
  E/A 전용 상태 조회·Event 처리

workspace_preload.js:
  v5:schedule:* 실행 API
  v5:group-loop:* 실행 API
  E/A Event 구독

main.js:
  E/A Runtime require와 초기화
  E/A Queue·Timer·Restore·Dispatch 함수
  E/A Action IPC
  E/A 상태 Event 전송

release source:
  automation-v1
  automation-v2

log status:
  A/E 상태 Projection·필터·Event만 제거
```

## 제한적 호환

다음 두 조회 IPC만 기존 호출자의 Fail-closed 호환을 위해 유지한다.

```text
v5:schedule:get-state -> status=REMOVED
v5:group-loop:get-state -> status=REMOVED
```

실행·변경 Action IPC는 존재하면 실패다.

## 보존 범위

```text
C 모드 Runtime과 반복명령
커멘더·워커 Browser Dispatch
그룹 편집과 워커 추가
프로젝트·대화주소 Binding
workspace_state.json
Browser Profile과 Worker Partition
runtime.log
log_status Window와 다운로드 IPC
Receipt와 Rollback
```

## C 모드 그룹 버튼

```text
IDLE=GRAY
RUNNING=BLUE
ERROR=RED
LABEL=C 모드 실행
STATUS_LINE=Wave {N} · 수행된 작업 {X}회 · 상태: {대기|실행중|오류}
DEFAULT_COMMANDER_MESSAGE=모든 워커에게 지시할 작업을 게시하라
```

버튼은 IDLE 또는 ERROR에서 클릭하면 즉시 RUNNING을 표시하고 C 시작 요청을 보낸다. 전송 실패 시 ERROR로 전환한다. 실행 중 클릭은 상태·중지 Dialog를 연다.

## 설치 안전성

1. `5.10.2.3.7`의 5개 권위 Source SHA-256을 모두 확인한다.
2. 실행 프로세스·ExecutablePath·CommandLine을 설치 전 Readback한다.
3. A/E 상태폴더를 Timestamp Backup하되 즉시 삭제하지 않는다.
4. 새 `v5.10.2.4.3-c-only-source-optimized` Release를 별도로 조립한다.
5. Base와 Hotfix 적용 후 기능삭제 Optimizer를 실행한다.
6. 잔존 참조·문법·Runtime 시험이 PASS한 뒤에만 기존 Runtime을 종료한다.
7. 새 Process CommandLine이 새 Release를 가리키는지 Readback한다.
8. 실패하면 새 Release를 제거하고 기존 `5.10.2.3.7`을 재시작한다.

## 수용 경계

오프라인 시험 PASS는 Target PC Live PASS가 아니다. 설치 Receipt, 실제 버튼 화면, A/E 부재, 로그창 보존, C 시작·오류·정상종료가 확인된 뒤 다음 Cycle로 진행한다.
