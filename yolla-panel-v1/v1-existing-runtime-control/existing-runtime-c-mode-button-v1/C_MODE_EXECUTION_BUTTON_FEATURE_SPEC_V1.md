# C 모드 실행 버튼 기능 명세 V1

```text
SPEC_ID=C-MODE-EXISTING-RUNTIME-GROUP-BUTTON-V1-20260806-001
MODE=EXISTING_C_MODE_MINIMAL_PATCH
REBUILD_REQUIRED=false
NEW_RUNTIME_CREATION=false
PANEL_REDESIGN_SCOPE=false
TARGET_PC_APPLIED=false
PRODUCTION=false
READY=false
MERGE=false
```

## 1. 목적

기존 C 모드의 게시물 중계 흐름을 유지하면서 각 그룹 메뉴 헤더에서 C 모드를 명시적으로 시작하고 현재 상태를 즉시 확인한다. 버튼은 기존 패널이 보유한 커멘더창·워커창 Adapter를 호출하며 새 BrowserView, 새 전송계층 또는 새 자동화 Runtime을 만들지 않는다.

## 2. 버튼 위치

각 그룹 메뉴 헤더 우측에 버튼을 한 개 배치한다.

```text
그룹 제목                                      [C 모드 실행]
Wave {wave} · 수행된 작업 {executedCount}회 · 상태: {상태문구}
```

DOM 결속 권장 속성:

```text
GROUP_HEADER=[data-c-mode-group-header="true"]
STATUS_LINE=[data-c-mode-group-status="true"]
BUTTON=[data-c-mode-execution-button="true"]
```

## 3. 버튼 상태

버튼 문구는 모든 상태에서 `C 모드 실행`으로 고정한다.

| 상태 | 색상 | 상태문구 | 의미 |
|---|---|---|---|
| `IDLE` | `GRAY` | `대기` | 아직 실행하지 않았거나 정상 종료·수동 정지됨 |
| `RUNNING` | `BLUE` | `실행중` | C 모드가 현재 동작 중 |
| `ERROR` | `RED` | `오류` | 작업 중 오류가 발생하여 중단됨 |

## 4. 클릭 동작

버튼을 한 번 누르면 다음 순서를 지킨다.

```text
1. IDLE 또는 ERROR를 RUNNING으로 즉시 저장
2. 파란색 버튼과 실행중 상태문구를 즉시 Render
3. 그룹별 commandMessage를 정확히 커멘더창에 전송
4. 기본 commandMessage가 없으면 아래 문구 사용
```

기본문구:

```text
모든 워커에게 지시할 작업을 게시하라
```

그룹별 대체 예시:

```text
C 모드 규칙에 따라 모든 워커에게 지시할 작업을 게시하라
```

커멘더창 전송이 실패하면 `RUNNING -> ERROR`로 전환하고 `lastError`를 저장한다.

## 5. 상태 전환

```text
IDLE --버튼 클릭--> RUNNING
ERROR --버튼 클릭--> RUNNING
RUNNING --작업 오류--> ERROR
RUNNING --정상 종료 또는 수동 정지--> IDLE
```

이미 `RUNNING`인 상태에서 버튼을 다시 눌러도 새 시작 명령을 중복 전송하지 않는다.

## 6. Wave와 수행된 작업 수

커멘더가 새로운 전체 워커 게시물 세트를 한 번 완성하면 다음을 동시에 수행한다.

```text
wave += 1
executedCount += 1
```

전체 세트는 다음 조건을 충족해야 한다.

```text
모든 대상 워커 ID 존재
각 워커의 게시물 번호가 양의 정수
워커 ID 중복 0
게시물 번호 중복 0
그룹의 expectedWorkerIds와 정확히 일치
고유 distributionId 존재
```

같은 `distributionId`를 다시 읽으면 Wave와 수행 횟수를 증가시키지 않고 `DUPLICATE_SUPPRESSED`로 처리한다.

## 7. 워커창 직접 전송

커멘더의 전체 게시물 세트가 검증되면 기존 패널의 워커창 Adapter를 사용하여 각 워커창에 다음 문구를 정확히 전송한다.

```text
게시물 #{postNumber}를 읽고 작업을 수행하라
```

예시:

```text
W01 -> 게시물 #123를 읽고 작업을 수행하라
W02 -> 게시물 #124를 읽고 작업을 수행하라
```

오배정 방지를 위해 `workerId`, `postNumber`, `distributionId`, `wave`를 하나의 전송 Receipt에 결속한다. 한 워커창 전송이라도 실패하면 상태를 `ERROR`로 변경하고 다음 형식으로 오류를 저장한다.

```text
WORKER_DISPATCH_FAILED:{workerId}:{exactError}
```

## 8. 최소 데이터 구조

```javascript
group.cMode = {
  state: 'IDLE' | 'RUNNING' | 'ERROR',
  wave: 0,
  executedCount: 0,
  lastError: null,
  commandMessage: '모든 워커에게 지시할 작업을 게시하라',
  completedDistributionIds: [],
  workerDispatchReceipts: []
};
```

## 9. 구현 우선순위

### 1차

- 그룹 헤더 우측 버튼 추가
- 회색·파란색·빨간색 상태
- 클릭 즉시 파란색 전환
- 커멘더창 기본 메시지 전송

### 2차

- `Wave N · 수행된 작업 X회 · 상태: ...` 표시
- 그룹별 commandMessage 지원
- 전체 워커 게시물 세트 검증
- 정확한 워커창 전송

### 3차

- 작업 오류 시 빨간색 전환
- 정상 종료·수동 정지 시 회색 복귀
- distributionId 중복 억제
- 전송 Receipt와 lastError 저장

## 10. 수용 기준

```text
IDLE_GRAY=PASS
CLICK_IMMEDIATE_RUNNING_BLUE=PASS
DEFAULT_COMMANDER_MESSAGE_EXACT=PASS
ERROR_RETRY_RUNNING=PASS
COMMANDER_SEND_FAILURE_RED=PASS
COMPLETE_DISTRIBUTION_WAVE_PLUS_ONE=PASS
COMPLETE_DISTRIBUTION_COUNT_PLUS_ONE=PASS
DUPLICATE_DISTRIBUTION_SUPPRESSED=PASS
EXACT_WORKER_WINDOW_ROUTING=PASS
WORKER_WINDOW_FAILURE_RED=PASS
NORMAL_STOP_GRAY=PASS
TARGET_PC_VISUAL_AND_LIVE=SEPARATE_PENDING
```
