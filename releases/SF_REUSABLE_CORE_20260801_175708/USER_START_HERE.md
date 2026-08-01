# Source Factory Reusable Core — 처음 사용자 안내

이 문서는 `SF_REUSABLE_CORE_20260801_175708`을 처음 보는 사용자가 어떤 파일을 먼저 봐야 하고, 어떤 순서로 사용해야 하는지 설명한다.

## 1. 이 폴더의 정체

이 폴더는 Source Factory 전체 4.7GB 작업폴더를 그대로 옮긴 것이 아니라, 앞으로 재사용 가능한 핵심 자산만 추출한 스냅샷이다.

```text
목적: 여러 프로젝트에서 재사용 가능한 Source Factory core 보존
기준: E: active-core 실행 성공본
형태: 실행 소스 + Stage4 core + 사용 설명 + manifest
대상: 사람 사용자, Commander, Worker, 후속 PC Agent 결합자
```

## 2. 제일 먼저 읽을 파일

읽는 순서는 다음이 좋다.

```text
1. README_REUSABLE_CORE.md
2. USER_START_HERE.md
3. SOURCE_USAGE_INDEX.md
4. CORE_ASSET_ANNOTATION_GUIDE.md
5. _USAGE_NOTES/stage4StationBindingHandlers.usage.md
6. _USAGE_NOTES/PC_AGENT_BINDING_ADAPTER.usage.md
7. REUSABLE_CORE_MANIFEST.json
```

각 파일의 역할은 다음과 같다.

| 파일 | 역할 |
|---|---|
| `README_REUSABLE_CORE.md` | 이 스냅샷이 무엇인지 설명하는 최상위 안내 |
| `SOURCE_USAGE_INDEX.md` | 핵심 파일별 역할 표 |
| `CORE_ASSET_ANNOTATION_GUIDE.md` | 핵심 자산별 상세 주석과 재사용 방법 |
| `_USAGE_NOTES/*.usage.md` | 특정 모듈군별 세부 사용 주석 |
| `REUSABLE_CORE_MANIFEST.json` | 파일 목록, 크기, SHA-256 기록 |

## 3. 폴더 구조 한눈에 보기

```text
SF_REUSABLE_CORE_20260801_175708/
  safe_panel_v10/
    safe_panel_main.js
    safe_panel_preload.js
    safe_panel_renderer.js
    safe_panel.html
    ipc/
      stage4StationBindingHandlers.js
      safePanelV0106RecoveryHandlers.js

  src/shared/stage4/
    promptQueueManager.js
    sequentialPromptSender.js
    executionResultCollector.js
    sourceFileBlockExtractor.js
    sourceFileFormatValidator.js
    stores/
      taeoRawOutputStore.js
      workerOutputBatchStore.js
      panelRecordExecutionStore.js
      laoSourceUnitStore.js
      taeraDownloadResourceStore.js

  prompts/
  tools/
  _USAGE_NOTES/
```

## 4. 실행 계층과 재사용 계층을 구분할 것

이 스냅샷에는 실행 가능한 SAFE Panel 소스가 포함되어 있지만, 이 폴더 자체의 1차 목적은 “재사용 가능한 핵심 자산 보존”이다.

```text
실행 계층:
- safe_panel_v10/safe_panel_main.js
- safe_panel_v10/safe_panel_preload.js
- safe_panel_v10/safe_panel_renderer.js
- safe_panel_v10/safe_panel.html
- safe_panel_v10/ipc/stage4StationBindingHandlers.js

재사용 계층:
- src/shared/stage4/*.js
- src/shared/stage4/stores/*.js
- prompts/stage4/*.txt
- tools/stage4/*
```

새 프로젝트에 적용할 때는 전체를 무조건 복사하지 말고, 아래 순서로 필요한 계층만 가져간다.

```text
1. SAFE Panel UI가 필요하면 safe_panel_v10 전체를 가져간다.
2. Worker/Commander 자동화 코어만 필요하면 src/shared/stage4만 가져간다.
3. SOURCE_FILE 추출만 필요하면 sourceFileBlockExtractor + sourceFileFormatValidator부터 가져간다.
4. PC Agent 결합이 필요하면 stage4StationBindingHandlers.js의 dispatch/run check 지점을 본다.
```

## 5. 현재 가장 중요한 결속 지점

PC Agent를 붙일 때 가장 중요한 파일은 다음이다.

```text
safe_panel_v10/ipc/stage4StationBindingHandlers.js
```

핵심 함수는 다음이다.

```text
handleStage4DispatchNextPrompt
handleStage4RunCheck
handleStage4AppendStationRecords
```

역할은 다음과 같다.

| 함수 | 현재 역할 | 다음 결합 방향 |
|---|---|---|
| `handleStage4DispatchNextPrompt` | prompt version 확인 후 sequentialPromptSender 호출 | PC_AGENT_DISPATCH_ADAPTER 삽입 후보 |
| `handleStage4RunCheck` | executionResultCollector 호출 | PC_AGENT_RESULT_ADAPTER callback 후보 |
| `handleStage4AppendStationRecords` | raw output / panel record / worker batch 저장 | PC Agent 결과 저장 연결 후보 |

## 6. 절대 지켜야 할 것

```text
- package.json을 성급히 바꾸지 않는다.
- preload API 이름을 바꾸지 않는다.
- IPC channel 이름을 바꾸지 않는다.
- 기존 fallback 경로를 삭제하지 않는다.
- Project Panel Identity의 source:not_found fallback을 삭제하지 않는다.
- fake/default/hardcoded project_id/project_name을 넣지 않는다.
- 라오창 입력 인식 기능을 Project Panel 내부 기능으로 취급하지 않는다.
- SF_COMMAND 후보를 자동 실행하지 않는다.
```

## 7. 빠른 재사용 시나리오

### A. 새 Electron SAFE Panel 만들기

가져갈 파일:

```text
safe_panel_v10/safe_panel_main.js
safe_panel_v10/safe_panel_preload.js
safe_panel_v10/safe_panel_renderer.js
safe_panel_v10/safe_panel.html
safe_panel_v10/safe_panel.css
safe_panel_v10/ipc/*.js
```

점검:

```text
node --check safe_panel_v10/safe_panel_main.js
node --check safe_panel_v10/safe_panel_preload.js
node --check safe_panel_v10/safe_panel_renderer.js
node --check safe_panel_v10/ipc/stage4StationBindingHandlers.js
```

### B. Worker output collector만 재사용하기

가져갈 파일:

```text
src/shared/stage4/sourceFileBlockExtractor.js
src/shared/stage4/sourceFileFormatValidator.js
src/shared/stage4/workerReportErrorExtractor.js
src/shared/stage4/stores/workerOutputBatchStore.js
```

### C. Prompt Queue / Sequential Sender만 재사용하기

가져갈 파일:

```text
src/shared/stage4/promptQueueManager.js
src/shared/stage4/promptPackageVersionManager.js
src/shared/stage4/sequentialPromptSender.js
```

### D. PC Agent 결합 준비

먼저 읽을 파일:

```text
_USUAGE_NOTES/PC_AGENT_BINDING_ADAPTER.usage.md
_USUAGE_NOTES/stage4StationBindingHandlers.usage.md
```

실제 경로는 `_USAGE_NOTES/`이다. 위 오타 경로를 쓰지 말고 `_USAGE_NOTES/`를 사용한다.

## 8. 현재 이 스냅샷의 상태

```text
STATUS: REUSABLE_CORE_SNAPSHOT_PUBLISHED
SOURCE: E active-core runtime
SCOPE: reusable core only
NOT INCLUDED: old full assembled history, old backup folders, logs, node_modules unless separately staged
NEXT WORK: PC Agent adapter binding
```
