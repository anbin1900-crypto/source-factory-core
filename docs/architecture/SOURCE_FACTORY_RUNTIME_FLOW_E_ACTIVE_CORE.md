# Source Factory E: Active-Core Runtime Flow

이 문서는 E:로 이전 완료된 Source Factory active-core가 실제로 어떻게 실행되는지 설명한다. 기준은 사용자 PC에서 확인된 E: 단독 실행 상태다.

## 1. 현재 실행 상태

```text
SOURCE_FACTORY_E_MIGRATION_STATUS=PASS_E_ONLY_RUNTIME
EXECUTION_MODE=E source + E Electron dependency
```

현재 실행은 D: 의존을 제거한 E: 단독 실행 상태다.

```text
RUNTIME_ROOT=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038

ELECTRON_BINARY=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\node_modules\electron\dist\electron.exe

MAIN_ENTRY=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js

RENDERER_APP_PATH=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10
```

## 2. 실행 명령 흐름

공식 E-only launcher:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\RUN_E_SF4_SAFE_PANEL_E_ONLY.bat
```

개념상 실행 명령:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\node_modules\.bin\electron.cmd \
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js
```

Process CommandLine에서 확인되는 실제 구조:

```text
"E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\node_modules\electron\dist\electron.exe" "E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js"
```

Renderer process app-path:

```text
--app-path="E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10"
```

이 두 값이 E:로 보이면 E: source + E: Electron dependency 실행이 확정된다.

## 3. Runtime Layer 흐름

```text
RUN_E_SF4_SAFE_PANEL_E_ONLY.bat
→ node_modules\.bin\electron.cmd
→ node_modules\electron\dist\electron.exe
→ safe_panel_v10\safe_panel_main.js
→ safe_panel_v10\safe_panel.html
→ safe_panel_v10\safe_panel_preload.js
→ safe_panel_v10\safe_panel_renderer.js
→ safe_panel_v10\ipc\stage4StationBindingHandlers.js
→ src\shared\stage4\...
```

## 4. Main process 역할

파일:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js
```

역할:

```text
1. Electron app lifecycle 관리
2. SAFE Panel BrowserWindow 생성
3. safe_panel.html 로드
4. safe_panel_preload.js 연결
5. Stage4 IPC handler 등록
6. terminal/browser shell 관련 구조 연결
```

재사용 주의:

```text
- safe_panel_main.js를 실행 entry로 사용한다.
- package.json의 main 필드보다 실제 launcher command를 우선한다.
- preload/html/ipc 상대경로가 유지되어야 한다.
```

## 5. Preload bridge 역할

파일:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_preload.js
```

역할:

```text
1. renderer에서 직접 Node/Electron 내부 API를 만지지 않게 한다.
2. window.sfApi를 노출한다.
3. renderer 호출을 ipcRenderer.invoke(...)로 main process에 전달한다.
4. Project Panel Identity getter도 이 경로를 사용한다.
```

중요 API:

```text
window.sfApi.stage4.getProjectPanelIdentity(payload)
→ ipcRenderer.invoke('sf:stage4-get-project-panel-identity', payload || {})
```

보존 원칙:

```text
- preload API 이름 변경 금지
- IPC channel 이름 변경 금지
- 기존 getProjectPanelIdentity payload forwarding 보존
```

## 6. Renderer 역할

파일:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_renderer.js
```

역할:

```text
1. SAFE Panel UI 버튼과 상태 표시를 바인딩한다.
2. selectedPrompt, logPanel, W49/W50 UI marker를 유지한다.
3. Project Panel Identity 값을 표시한다.
4. W60_R13F lifecycle event producer를 포함한다.
5. click/focus/custom lifecycle event를 기존 getter path로 main process에 보낸다.
```

중요한 Project Panel 흐름:

```text
Project Panel UI event
→ safe_panel_renderer.js
→ window.sfApi.stage4.getProjectPanelIdentity(payload)
→ safe_panel_preload.js
→ sf:stage4-get-project-panel-identity
→ stage4StationBindingHandlers.js
→ runtime_event_registry
```

## 7. Stage4 IPC Controller 역할

파일:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\ipc\stage4StationBindingHandlers.js
```

이 파일은 Source Factory Stage4의 가장 중요한 controller다.

주요 handler:

```text
handleStage4AppendStationRecords
handleStage4GenerateNextInstruction
handleStage4DispatchNextPrompt
handleStage4RunCheck
handleStage4ManageResource
handleStage4BuildPlan
handleStage4GenerateDoneLight
handleStage4RefreshState
w58GetProjectPanelIdentityHandlerV5812
```

## 8. Stage4 Shared Core 연결

Stage4 IPC controller는 다음 shared core 모듈을 서비스처럼 사용한다.

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\promptQueueManager.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\sequentialPromptSender.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\promptPackageVersionManager.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\executionResultCollector.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\downloadResourceManager.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\greenOutputAssemblyQueue.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\redFixRequestGenerator.js
```

## 9. Project Panel Identity runtime flow

```text
safe_panel_renderer.js
→ getProjectPanelIdentity(payload)
→ safe_panel_preload.js
→ 'sf:stage4-get-project-panel-identity'
→ stage4StationBindingHandlers.js
→ runtime_event_registry
→ panel_instance_id / source_partial / source_found response
→ safe_panel_renderer.js 표시 갱신
```

현재 구조의 핵심 원칙:

```text
panel_instance_id는 main process runtime context에서 생성한다.
project_id/project_name은 실제 선택값이 없으면 null이다.
source_partial은 정상 상태일 수 있다.
source:not_found fallback은 계속 보존한다.
```

## 10. PC Agent 결속 전 현재 흐름

현재 dispatch 실행 흐름:

```text
handleStage4DispatchNextPrompt
→ promptPackageVersionManager
→ sequentialPromptSender
```

현재 execution check 흐름:

```text
handleStage4RunCheck
→ executionResultCollector
```

아직 없는 것:

```text
PC_AGENT_DISPATCH_ADAPTER
PC_AGENT_RESULT_ADAPTER
```

다음 목표:

```text
handleStage4DispatchNextPrompt
→ PC_AGENT_DISPATCH_ADAPTER
→ PC Agent
→ PC_AGENT_RESULT_ADAPTER
→ handleStage4RunCheck
→ executionResultCollector
```

## 11. Runtime 확인 명령

Windows PowerShell에서 E: 실행 여부를 확인하는 명령:

```powershell
Get-CimInstance Win32_Process -Filter "name='electron.exe'" |
  Select-Object ProcessId, CommandLine |
  Format-List
```

PASS 기준:

```text
CommandLine에 다음 두 경로가 모두 E:로 표시된다.

E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\node_modules\electron\dist\electron.exe
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js
```
