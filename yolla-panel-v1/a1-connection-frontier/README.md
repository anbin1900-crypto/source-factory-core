# A-1 YOLLA Panel Connection Frontier V1

## 목표

기능을 완성하는 단계가 아니다. 기존 Source Factory SAFE Panel에 다음 연결지점을 먼저 연다.

- 역할 Registry와 왼쪽 역할 메뉴
- 역할 선택 이벤트
- 기존 Electron Worker BrowserWindow 재사용·생성
- `role_id → window_id → browser_session_id` Binding
- Directive·Result·PC State·Command Payload Provider Slot
- 기존 `sfApi.stage4.dispatchNextPrompt` 전송 연결점
- Apply·Rollback·재실행 도구

## 설치 및 실행

`RUN_YOLLA_PANEL_CONNECTION_FRONTIER.cmd`를 관리자 권한으로 실행한다.

설치기는 `E:\SOURCE FACTORY\source-factory-active-core` 아래의 최신 `safe_panel_v10`을 자동 탐색하고, 원본 4개 파일을 백업한 뒤 패널 연결부를 설치하고 기존 Launcher로 실행한다.

## Rollback

`ROLLBACK_YOLLA_PANEL_CONNECTION_FRONTIER.cmd`를 실행한다.

## 다른 그룹의 연결 방법

```javascript
window.YollaPanel.registerProvider("directive", async ({ role, runtime }) => {
  return { directive_id: "...", cycle_id: "...", assignment_id: "..." };
});

window.YollaPanel.registerProvider("result", async ({ role, runtime }) => {
  return { decision: "PASS", terminal: "..." };
});

window.YollaPanel.registerProvider("commandPayload", async ({ role, directive, runtime }) => {
  return { exact_package: directive, role_id: role.role_id };
});
```

Custom Events:

```text
yolla:panel-ready
yolla:role-selected
yolla:worker-window-bound
yolla:runtime-refreshed
yolla:provider-registered
yolla:command-requested
yolla:command-dispatched
yolla:action-failed
```

## 현재 경계

```text
ROLE_COUNT=39
GROUP_COUNT=6
NEW_ELECTRON_RUNTIME=0
NEW_BROWSER_RUNTIME=0
NEW_PROMPT_TRANSPORT=0
DIRECTIVE_FETCHER=NOT_IMPLEMENTED
RESULT_FETCHER=NOT_IMPLEMENTED
WORKER_BUSINESS_FEATURES=NOT_IMPLEMENTED
PRODUCTION=false
READY=false
MERGE=false
```
