# Source Factory Core Asset Annotation Guide

이 문서는 Source Factory 재사용 코어의 핵심 자산을 “무엇에 쓰는 파일인지”, “언제 가져다 써야 하는지”, “어디를 고치면 안 되는지” 기준으로 자세히 주석화한 안내서다.

실행 소스 파일 내부에는 대량 주석을 직접 삽입하지 않는다. 이유는 실행 안정성과 diff 가독성을 지키기 위해서다. 대신 이 문서를 공식 사용 주석으로 사용한다.

## 1. 핵심 자산 분류

Source Factory core는 크게 5개 계층으로 나뉜다.

```text
1. SAFE Panel Runtime Layer
2. Stage4 IPC Controller Layer
3. Stage4 Shared Core Layer
4. Stage4 Store Layer
5. Prompt / Tool / Constitution Layer
```

각 계층의 의미는 다음과 같다.

| 계층 | 목적 | 대표 경로 |
|---|---|---|
| SAFE Panel Runtime | Electron UI 실행 | `safe_panel_v10/` |
| Stage4 IPC Controller | renderer/preload/main 사이의 기능 연결 | `safe_panel_v10/ipc/stage4StationBindingHandlers.js` |
| Stage4 Shared Core | queue, sender, collector, validator, parser | `src/shared/stage4/` |
| Stage4 Store | output, panel record, source unit 저장 | `src/shared/stage4/stores/` |
| Prompt/Tool/Constitution | 운영 계약, prompt, 검증 도구 | `prompts/`, `tools/`, `_CONSTITUTION_V2_COMPACT/` |

## 2. SAFE Panel Runtime Layer

### 2.1 `safe_panel_v10/safe_panel_main.js`

역할:

```text
Electron main process entry.
SAFE Panel BrowserWindow를 만들고,
HTML을 로드하며,
preload와 IPC handler를 연결하는 시작 파일이다.
```

재사용 시점:

```text
- 새 Source Factory UI를 Electron으로 실행할 때
- SAFE Panel을 독립 실행 앱으로 만들 때
- PC Agent와 연결되는 main process runtime을 만들 때
```

사용 방법:

```text
electron safe_panel_v10/safe_panel_main.js
```

주의:

```text
- preload 경로를 바꾸면 renderer API가 깨질 수 있다.
- html 경로를 바꾸면 UI가 열리지 않을 수 있다.
- ipc handler 등록 경로를 바꾸면 Stage4 API가 작동하지 않는다.
- D: 또는 E: 같은 절대경로를 새 프로젝트에 고정하지 말고 상대경로 기준으로 유지한다.
```

### 2.2 `safe_panel_v10/safe_panel_preload.js`

역할:

```text
Renderer와 Main 사이의 안전한 bridge.
window.sfApi를 노출하고,
renderer가 직접 Node/Electron main에 접근하지 않고 IPC를 호출하게 한다.
```

중요 API:

```text
window.sfApi.stage4.*
window.sfApi.stage4.getProjectPanelIdentity
```

재사용 시점:

```text
- renderer UI에서 Stage4 기능을 호출해야 할 때
- Project Panel Identity getter를 renderer에 노출해야 할 때
- Electron contextIsolation 환경에서 bridge가 필요할 때
```

주의:

```text
- preload API 이름을 바꾸면 renderer 전체 binding이 깨진다.
- IPC channel 이름을 바꾸면 stage4StationBindingHandlers.js와 불일치한다.
- 새 API를 추가할 때는 renderer 호출명, preload expose명, IPC channel, main handler를 함께 관리한다.
```

### 2.3 `safe_panel_v10/safe_panel_renderer.js`

역할:

```text
SAFE Panel의 browser-side UI controller.
버튼, 입력창, Project Panel, status panel, selectedPrompt, logPanel, lifecycle event producer를 관리한다.
```

중요 기능:

```text
- Stage4 API 호출
- Project Panel Identity 표시
- runtime_event_registry lifecycle payload 전송
- selectedPrompt/logPanel 보존
- operator-visible warning 표시
```

재사용 시점:

```text
- SAFE Panel UI를 그대로 가져갈 때
- Project Panel Identity 표시 기능을 재사용할 때
- UI에서 Stage4 API 호출 버튼을 붙일 때
```

주의:

```text
- selectedPrompt와 logPanel은 기존 작업 흐름의 핵심 UI marker다.
- Project Panel은 독립 프로젝트 단위 패널이다.
- 라오창은 Project Panel 내부 요소가 아니다.
- renderer는 panel_instance_id 최종 생성자가 아니다. panel_instance_id는 main process runtime context에서 생성한다.
```

### 2.4 `safe_panel_v10/safe_panel.html`

역할:

```text
SAFE Panel의 DOM 구조.
Project Panel Identity 표시 영역, 버튼, 로그 패널, 입력 영역의 selector 기준점이다.
```

재사용 시점:

```text
- SAFE Panel UI를 복제할 때
- renderer binding을 유지하면서 layout만 조정할 때
```

주의:

```text
- id, data-* selector를 함부로 바꾸지 않는다.
- Project Panel Identity 관련 data-project-panel-field 값을 유지한다.
- renderer.js가 기대하는 selector가 사라지면 UI binding이 깨진다.
```

## 3. Stage4 IPC Controller Layer

### 3.1 `safe_panel_v10/ipc/stage4StationBindingHandlers.js`

역할:

```text
Stage4의 중앙 controller.
renderer/preload에서 들어온 IPC 요청을 실제 core service로 라우팅한다.
```

핵심 handler:

```text
handleStage4DispatchNextPrompt
handleStage4RunCheck
handleStage4AppendStationRecords
handleStage4GenerateNextInstruction
handleStage4ManageResource
handleStage4BuildPlan
handleStage4GenerateDoneLight
handleStage4RefreshState
```

가장 중요한 PC Agent 결속 지점:

```text
Dispatch side:
handleStage4DispatchNextPrompt

Result side:
handleStage4RunCheck

Storage side:
handleStage4AppendStationRecords
```

현재 구조:

```text
handleStage4DispatchNextPrompt
→ promptPackageVersionManager
→ sequentialPromptSender

handleStage4RunCheck
→ executionResultCollector

handleStage4AppendStationRecords
→ taeoRawOutputStore
→ panelRecordExecutionStore
→ workerOutputBatchStore
```

PC Agent 결합 방향:

```text
handleStage4DispatchNextPrompt
→ PC_AGENT_DISPATCH_ADAPTER
→ PC Agent
→ PC_AGENT_RESULT_ADAPTER
→ handleStage4RunCheck
→ executionResultCollector
```

주의:

```text
- 기존 sequentialPromptSender 호출을 삭제하지 않는다.
- 기존 executionResultCollector 호출을 삭제하지 않는다.
- fallback response를 삭제하지 않는다.
- source:not_found branch를 삭제하지 않는다.
- Project Panel Identity registry를 삭제하지 않는다.
- 새 IPC channel을 만들기 전에 기존 channel로 가능한지 먼저 확인한다.
```

## 4. Stage4 Shared Core Layer

### 4.1 `promptQueueManager.js`

역할:

```text
Worker/Commander prompt package를 queue에 넣고 관리하는 모듈.
```

재사용 시점:

```text
- 여러 Worker prompt를 순차 전송해야 할 때
- prompt package id/version을 보존해야 할 때
- Batch-first prompt authoring 후 queue에 등록할 때
```

주의:

```text
- prompt_package_id와 prompt_package_version은 추적 기준이다.
- queue와 sender는 분리해서 생각한다.
```

### 4.2 `sequentialPromptSender.js`

역할:

```text
Queue에서 다음 prompt를 선택하고 전송 대상으로 넘기는 sender 계층.
```

재사용 시점:

```text
- Prompt Queue를 실제 Worker/Commander 창으로 보내야 할 때
- 한 번에 여러 prompt를 만들고 순서대로 전송해야 할 때
```

주의:

```text
- Sequential Sender는 전송 도구다.
- Prompt 작성 자체를 순차 대기시키는 근거가 아니다.
- PC Agent 실행과 동일한 개념이 아니다.
```

### 4.3 `promptPackageVersionManager.js`

역할:

```text
prompt package version을 검사하고 정규화한다.
```

재사용 시점:

```text
- 구버전 prompt나 섞인 version prompt를 방지할 때
- dispatch 전에 prompt package contract를 확인할 때
```

주의:

```text
- dispatchNextPrompt 전에 우회하지 않는 것이 좋다.
- batch 안에서 version이 섞이면 YELLOW 판정 대상이다.
```

### 4.4 `executionResultCollector.js`

역할:

```text
실행 결과나 실행 체크 결과를 수집한다.
```

재사용 시점:

```text
- PC Agent가 수행한 명령 결과를 수집할 때
- runExecutionCheck 결과를 기록할 때
- syntax check 또는 command result를 표준화할 때
```

주의:

```text
- 실제 process spawn executor와 collector를 혼동하지 않는다.
- collector는 결과 수집 계층이고, executor는 외부 실행 계층이다.
```

### 4.5 `sourceFileBlockExtractor.js`

역할:

```text
GPT/Worker 출력에서 SOURCE_FILE block을 추출한다.
```

재사용 시점:

```text
- Worker output에서 파일 산출물을 분리할 때
- SOURCE_FILE_START/END 구조를 추출할 때
```

주의:

```text
- 추출은 실행이 아니다.
- 추출된 파일을 실제로 쓰는 것은 별도 materialize 단계에서 한다.
```

### 4.6 `sourceFileFormatValidator.js`

역할:

```text
SOURCE_FILE block 형식과 필수 필드를 검증한다.
```

재사용 시점:

```text
- SOURCE_FILE을 파일로 쓰기 전에
- operation, path, language, owner_worker, content를 확인할 때
```

주의:

```text
- “나머지는 동일” 같은 생략 코드를 통과시키지 않는다.
- TODO-only 파일을 완성 소스로 판단하지 않는다.
```

### 4.7 `panelCommandParser.js` / `panelInputClassifier.js`

역할:

```text
라오창 또는 panel input에서 SOURCE_FILE 후보, SF_COMMAND 후보, 일반 prompt를 구분한다.
```

재사용 시점:

```text
- 입력창에서 사용자가 붙여넣은 내용을 자동 분류할 때
- SOURCE_FILE block과 SF_COMMAND block을 감지할 때
```

주의:

```text
- SF_COMMAND는 detect/queue 후보일 뿐 자동 실행 대상이 아니다.
- 라오창은 Worker/Commander 창 부속 입력 인식 기능이다.
- Project Panel Identity source로 사용하지 않는다.
```

## 5. Stage4 Store Layer

### 5.1 `taeoRawOutputStore.js`

역할:

```text
GPT/Worker raw output을 저장한다.
```

재사용 시점:

```text
- Autosave된 raw output을 보존할 때
- 이후 Collector가 다시 읽을 수 있게 할 때
```

주의:

```text
- 가능하면 append-only로 유지한다.
- output_id, prompt_id, worker_id를 보존한다.
```

### 5.2 `workerOutputBatchStore.js`

역할:

```text
여러 Worker output을 batch 단위로 묶어 저장한다.
```

재사용 시점:

```text
- 6-slot 병렬 prompt batch 결과를 모을 때
- Commander gate가 여러 Worker 산출물을 한 번에 intake할 때
```

주의:

```text
- worker_slot과 worker_function_class를 혼동하지 않는다.
- Worker 번호는 고정 직업이 아니라 실행 slot이다.
```

### 5.3 `panelRecordExecutionStore.js`

역할:

```text
Panel에서 발생한 execution/event record를 저장한다.
```

재사용 시점:

```text
- Panel UI 이벤트 기록
- execution lifecycle 기록
- PC Agent 결과가 panel event로 들어올 때
```

주의:

```text
- singleton current_project를 만들지 않는다.
- Project Panel이 여러 개 열릴 수 있음을 전제로 한다.
```

### 5.4 `laoSourceUnitStore.js`

역할:

```text
라오창 또는 source interface에서 감지한 source unit을 저장한다.
```

재사용 시점:

```text
- SOURCE_FILE block 후보 저장
- SF_COMMAND block 후보 저장
- Queue 후보 관리
```

주의:

```text
- 감지와 실행을 분리한다.
- 자동 실행하지 않는다.
```

### 5.5 `taeraDownloadResourceStore.js`

역할:

```text
다운로드 자원, 생성 파일, report path 같은 resource metadata를 저장한다.
```

재사용 시점:

```text
- 생성된 artifact 링크 표시
- 다운로드 가능한 파일 목록 표시
```

주의:

```text
- 파일 자원 표시와 실행 결과 수집을 혼동하지 않는다.
```

## 6. Project Panel Identity 주석

현재 snapshot에는 Project Panel Identity 관련 코드가 포함되어 있다.

핵심 개념:

```text
panel_instance_id = Project Panel runtime instance
project_id        = 선택된 실제 프로젝트 ID
project_name      = 선택된 실제 프로젝트 이름
```

중요 원칙:

```text
- panel_instance_id와 project_id는 다르다.
- project_id가 null이어도 panel_instance_id는 유효할 수 있다.
- source_partial은 정상 상태일 수 있다.
- fake/default project value를 넣지 않는다.
- source:not_found fallback을 유지한다.
```

관련 파일:

```text
safe_panel_v10/safe_panel_renderer.js
safe_panel_v10/ipc/stage4StationBindingHandlers.js
src/shared/stage4/projectPanelIdentityHelper.js
```

## 7. PC Agent 결합 주석

현재 이 snapshot의 첫 번째 후속 과제는 PC Agent adapter 삽입이다.

권장 설계:

```text
handleStage4DispatchNextPrompt
→ 기존 promptPackageVersionManager 확인
→ 기존 sequentialPromptSender 유지
→ PC_AGENT_DISPATCH_ADAPTER 추가
→ PC Agent 실행
→ PC_AGENT_RESULT_ADAPTER
→ handleStage4RunCheck
→ executionResultCollector
```

최소 변경 원칙:

```text
- stage4StationBindingHandlers.js에 patch_request 우선
- preload API rename 금지
- IPC channel rename 금지
- 기존 dispatch/run check fallback 보존
- 결과 저장은 appendStationRecords 계열과 연결
```

## 8. 새 프로젝트에 가져가는 최소 조합

### 8.1 UI 포함 전체 조합

```text
safe_panel_v10/
src/shared/stage4/
prompts/stage4/
tools/stage4/
```

### 8.2 Worker output 처리만 필요한 조합

```text
sourceFileBlockExtractor.js
sourceFileFormatValidator.js
workerReportErrorExtractor.js
taeroRawOutputStore.js 또는 taeoRawOutputStore.js
workerOutputBatchStore.js
collectorCommanderGateHandoffAdapter.js
```

주의: 실제 파일명은 `taeoRawOutputStore.js`다.

### 8.3 PC Agent만 붙일 조합

```text
safe_panel_v10/ipc/stage4StationBindingHandlers.js
src/shared/stage4/executionResultCollector.js
src/shared/stage4/executionErrorReporter.js
src/shared/stage4/stores/panelRecordExecutionStore.js
src/shared/stage4/stores/workerOutputBatchStore.js
```

### 8.4 SOURCE_FILE 추출만 필요한 조합

```text
sourceFileBlockExtractor.js
sourceFileFormatValidator.js
placeholderOmissionDetector.js
windowsRegexEscapeChecker.js
```

## 9. 사용 전 검증 명령

JavaScript 문법 확인:

```powershell
node --check safe_panel_v10\safe_panel_main.js
node --check safe_panel_v10\safe_panel_preload.js
node --check safe_panel_v10\safe_panel_renderer.js
node --check safe_panel_v10\ipc\stage4StationBindingHandlers.js
```

핵심 marker 검색:

```powershell
Select-String -Path safe_panel_v10\**\*.js -Pattern "getProjectPanelIdentity"
Select-String -Path safe_panel_v10\**\*.js -Pattern "runtime_event_registry"
Select-String -Path src\shared\stage4\**\*.js -Pattern "SOURCE_FILE"
```

## 10. 최종 사용 원칙

```text
1. 실행 소스와 재사용 소스를 구분한다.
2. 새 프로젝트에는 필요한 계층만 가져간다.
3. API/IPC/preload 이름은 함께 움직인다.
4. 기존 fallback은 삭제하지 않는다.
5. fake value로 화면을 채우지 않는다.
6. detect/queue와 execute를 분리한다.
7. PC Agent는 adapter로 붙인다.
8. Worker/Commander count를 6/7로 고정하지 않는다.
```
