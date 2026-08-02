# A-1 YOLLA Panel Command Cycle V2

## 현재 목표

모든 기능을 구현하지 않는다. 다음 최소 수직 흐름을 먼저 실제로 연다.

```text
패널 실행
→ 커맨더·워커 그룹이 들어 있는 단일 워크스페이스 실행
→ A-1 커맨더가 A-3 워커에게 명령 전송
→ 기존 Stage4 전송소가 명령 수락
→ 워커 수신
→ Canary 결과 반환
→ A-1 커맨더 결과 수신
```

## 워커창 구조

```text
단일 Electron Worker Workspace
├─ 왼쪽: 최고 커맨더·A/B/C/D/API 그룹과 39개 역할
├─ 오른쪽: 기존 ChatGPT BrowserView
└─ 상단·왼쪽 하단: 현재 역할과 최근 명령 순환 상태
```

역할별 별도 BrowserWindow를 패널에서 배정하지 않는다. 하나의 워크스페이스 창 안에서 역할을 선택하고 기존 ChatGPT 세션을 사용한다.

## 사용자 PC 적용

V1 연결지점이 이미 설치된 PC에서는 다음을 실행한다.

```text
RUN_YOLLA_COMMAND_CYCLE_V2.cmd
```

V1이 없는 새 Runtime은 먼저 다음을 실행한 뒤 V2를 실행한다.

```text
RUN_YOLLA_PANEL_CONNECTION_FRONTIER.cmd
RUN_YOLLA_COMMAND_CYCLE_V2.cmd
```

정확한 현재 Runtime:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10
```

## 자동 1회 Canary

V2 패널은 최초 실행 때 다음 순환을 한 번 자동 실행한다.

```text
A-1 → A-3 → A-1
```

단계:

```text
COMMAND_CREATED
EXISTING_STAGE4_DISPATCH_ACCEPTED
WORKER_RECEIVED
WORKER_ACKNOWLEDGED
COMMANDER_RESULT_RECEIVED
```

성공 후 로컬 완료 마커를 남겨 재시작 시 자동 순환을 반복하지 않는다. 패널의 `1회 명령 순환 실행` 버튼으로 수동 재시험할 수 있다.

## 경계

```text
CANARY_ONLY=true
BUSINESS_EXECUTION_PERFORMED=false
WORKER_AI_EXECUTION_PERFORMED=false
EXISTING_SAFE_PANEL_RUNTIME_REUSED=true
EXISTING_BROWSER_WINDOW_FACTORY_REUSED=true
EXISTING_STAGE4_TRANSPORT_REUSED=true
NEW_ELECTRON_RUNTIME_COUNT=0
NEW_BROWSER_RUNTIME_COUNT=0
NEW_PROMPT_TRANSPORT_COUNT=0
PRODUCTION=false
READY=false
MERGE=false
```

실제 업무 기능, GPT 자동입력, 결과 해석, 다중 워커 병렬화는 다른 그룹이 이후 연결한다.

## 복구

```text
ROLLBACK_YOLLA_COMMAND_CYCLE_V2.cmd
```

V2 적용 직전 상태로 복구한다. V1까지 제거하려면 이후 `ROLLBACK_YOLLA_PANEL_CONNECTION_FRONTIER.cmd`를 실행한다.
