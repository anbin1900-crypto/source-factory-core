# Source Factory Structure

이 문서는 Source Factory 전체 구조를 설명하는 공식 구조 문서다. 사용자 PC의 실제 E: active-core 실행 구조와 GitHub에 게시된 reusable core snapshot을 함께 기준으로 삼는다.

## 1. Source Factory의 목적

Source Factory는 GPT/Worker/Commander가 생산한 SOURCE_FILE, prompt package, worker output, report, runtime result를 수집·검증·결합·보존하는 로컬 AI 개발 자동화 코어다.

핵심 목표:

```text
1. 반복 복사/붙여넣기 감소
2. Worker/Commander 병렬 운영 지원
3. SOURCE_FILE block 추출과 검증
4. Prompt Queue / Sequential Sender 운영
5. Worker output 수집
6. Commander gate 판단 입력 생성
7. Project Panel 단위 identity 관리
8. PC Agent 결속을 통한 실제 로컬 실행 연결
```

## 2. 현재 기준 경로

현재 실행 기준은 E: active-core다.

```text
ACTIVE_CORE=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038
```

재사용 코어 스냅샷:

```text
REUSABLE_CORE=
E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708
```

GitHub 게시 위치:

```text
REPOSITORY=anbin1900-crypto/source-factory-core
BRANCH=publish/reusable-core-20260801
PATH=releases/SF_REUSABLE_CORE_20260801_175708/
```

## 3. 전체 레이어 구조

```text
Source Factory
├─ Runtime Shell Layer
│  └─ Electron + SAFE Panel
├─ Renderer UI Layer
│  └─ safe_panel_renderer.js / safe_panel.html / safe_panel.css
├─ Preload Bridge Layer
│  └─ safe_panel_preload.js / window.sfApi
├─ Main IPC Controller Layer
│  └─ stage4StationBindingHandlers.js
├─ Stage4 Shared Core Layer
│  └─ src/shared/stage4/*.js
├─ Store Layer
│  └─ src/shared/stage4/stores/*.js
├─ Project Panel Identity Layer
│  └─ runtime_event_registry / panel_instance_id / source_partial
├─ Prompt / Worker / Commander Layer
│  └─ prompt queue, sequential sender, report extractor, commander handoff
└─ PC Agent Binding Layer
   └─ planned dispatch/result adapter
```

## 4. Runtime Shell Layer

기준 파일:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js
```

역할:

```text
1. Electron app 시작
2. BrowserWindow 생성
3. safe_panel.html 로드
4. safe_panel_preload.js 연결
5. Stage4 IPC handler 등록
```

현재 실행 방식:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\node_modules\electron\dist\electron.exe
→ E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js
```

## 5. Renderer UI Layer

기준 파일:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_renderer.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel.html
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel.css
```

역할:

```text
1. UI 버튼 바인딩
2. selectedPrompt 표시와 유지
3. logPanel 표시와 유지
4. Stage4 API 호출
5. Project Panel Identity 표시
6. W60_R13F lifecycle event producer
```

주의:

```text
selectedPrompt, logPanel, W49/W50 marker는 보존 대상이다.
라오창 입력 인식 기능은 Project Panel 내부 기능이 아니다.
```

## 6. Preload Bridge Layer

기준 파일:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_preload.js
```

역할:

```text
Renderer UI에서 window.sfApi를 통해 main IPC를 호출하게 한다.
```

중요 원칙:

```text
1. preload API rename 금지
2. IPC channel rename 금지
3. Project Panel Identity payload forwarding 유지
```

Project Panel Identity bridge:

```text
window.sfApi.stage4.getProjectPanelIdentity(payload)
→ ipcRenderer.invoke('sf:stage4-get-project-panel-identity', payload || {})
```

## 7. Stage4 IPC Controller Layer

기준 파일:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\ipc\stage4StationBindingHandlers.js
```

가장 중요한 controller다.

핵심 handler:

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

Stage4 주요 API:

```text
appendStationRecords
generateNextInstruction
dispatchNextPrompt
runExecutionCheck
manageDownloadResource
buildAssemblyPlan
generateDoneLightReport
refreshControlState
getProjectPanelIdentity
```

## 8. Stage4 Shared Core Layer

기준 경로:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4
```

이 레이어는 기능별 재사용 모듈을 담는다.

대표 역할:

```text
promptQueueManager.js              = prompt queue 관리
sequentialPromptSender.js          = next prompt 선택/전송
promptPackageVersionManager.js     = prompt package version gate
executionResultCollector.js        = execution/result 수집
executionErrorReporter.js          = execution error report
sourceFileBlockExtractor.js        = SOURCE_FILE block 추출
sourceFileFormatValidator.js       = SOURCE_FILE 형식 검증
collectorCommanderGateHandoffAdapter.js = commander gate handoff 생성
projectPanelIdentityHelper.js      = Project Panel Identity helper
```

## 9. Store Layer

기준 경로:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\stores
```

Store 역할:

```text
taeoRawOutputStore.js          = raw GPT/Worker output 저장
workerOutputBatchStore.js      = batch별 worker output 저장
panelRecordExecutionStore.js   = panel record / execution event 저장
laoSourceUnitStore.js          = 라오창 source unit 저장
taeraDownloadResourceStore.js  = 태라창 download resource 저장
```

## 10. Project Panel Identity Layer

현재 Project Panel Identity는 W60_R13F 이후 다음 구조를 가진다.

```text
safe_panel_renderer.js
→ getProjectPanelIdentity(payload)
→ safe_panel_preload.js
→ sf:stage4-get-project-panel-identity
→ stage4StationBindingHandlers.js
→ runtime_event_registry
```

핵심 개념:

```text
panel_instance_id = 열린 Project Panel runtime instance
project_id        = 그 패널에서 선택된 실제 프로젝트 ID
project_name      = 그 프로젝트 이름
```

원칙:

```text
panel_instance_id와 project_id는 다르다.
project_id/project_name은 실제 선택값이 없으면 null이다.
source_partial은 정상 상태일 수 있다.
source:not_found fallback은 계속 보존한다.
fake/default/template project value는 금지한다.
```

## 11. 라오창 / 태오창 / 태라창 역할 구분

```text
태오창 = GPT 화면/생산 창
라오창 = SOURCE_FILE 및 SF_COMMAND block 감지·분류·Queue 후보 등록 인터페이스
태라창 = 다운로드 링크, output_dir, report_path, generated resource 표시 인터페이스
```

중요:

```text
라오창은 Project Panel 내부 요소가 아니다.
라오창 입력 인식 기능을 Project Panel Identity source로 사용하지 않는다.
SF_COMMAND는 detect/queue-only이며 자동 실행하지 않는다.
```

## 12. PC Agent Binding Layer

현재 상태:

```text
PC_AGENT_ADAPTER=NOT_INSERTED
```

정확한 결속 지점:

```text
ADAPTER_TARGET_FILE=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\ipc\stage4StationBindingHandlers.js

DISPATCH_TARGET_FUNCTION=
handleStage4DispatchNextPrompt

RESULT_TARGET_FUNCTION=
handleStage4RunCheck
```

목표 흐름:

```text
handleStage4DispatchNextPrompt
→ PC_AGENT_DISPATCH_ADAPTER
→ PC Agent
→ PC_AGENT_RESULT_ADAPTER
→ handleStage4RunCheck
→ executionResultCollector
```

## 13. GitHub / Local PC 역할 분리

```text
GitHub = 원장, 프롬프트, 보고서, 상태, 작은 소스, reusable snapshot
Local PC = Electron runtime, PC Agent, browser/window automation, node_modules, actual execution
Google Drive = 대용량 archive, DB dump, binary artifact pointer
```

## 14. 현재 첫 결함

```text
CURRENT_FIRST_DEFECT=
PC Agent adapter is not yet inserted.
```

그 이전의 런처 불일치 문제와 D: 의존 Electron 문제는 E: active-core 이전 및 E: 단독 실행으로 해결되었다.

## 15. 다음 정확한 작업

```text
1. PC_AGENT_DISPATCH_ADAPTER patch_request 작성
2. PC_AGENT_RESULT_ADAPTER patch_request 작성
3. stage4StationBindingHandlers.js에 guarded adapter branch 설계
4. 기존 sequentialPromptSender / executionResultCollector fallback 유지
5. node --check 검증
6. E: active-core runtime에서 dispatch→agent→result 회귀 테스트
```
