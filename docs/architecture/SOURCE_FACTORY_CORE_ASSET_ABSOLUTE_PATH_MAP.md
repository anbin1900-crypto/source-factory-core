# Source Factory Core Asset Absolute Path Map

이 문서는 Source Factory 핵심 자산을 사용자 PC의 E: 절대경로 기준으로 지도화한다. 목적은 후속 사용자, Worker, Commander, 결합자가 어느 파일을 재사용해야 하는지 빠르게 찾도록 하는 것이다.

## 1. 기준 경로

```text
ACTIVE_CORE_ROOT=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038

REUSABLE_CORE_ROOT=
E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708

GITHUB_RELEASE_PATH=
source-factory-core/releases/SF_REUSABLE_CORE_20260801_175708/
```

`ACTIVE_CORE_ROOT`는 실행 가능한 E: runtime이다. `REUSABLE_CORE_ROOT`는 재사용을 위해 불필요한 backup/log/node_modules/history를 줄여 추출한 코어 복사본이다.

## 2. SAFE Panel Runtime Assets

| 자산 | Active-core 절대경로 | Reusable-core 상대경로 | 역할 |
|---|---|---|---|
| Main entry | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js` | `safe_panel_v10/safe_panel_main.js` | Electron main process entry |
| Preload bridge | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_preload.js` | `safe_panel_v10/safe_panel_preload.js` | `window.sfApi` bridge |
| Renderer controller | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_renderer.js` | `safe_panel_v10/safe_panel_renderer.js` | SAFE Panel UI binding/controller |
| HTML layout | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel.html` | `safe_panel_v10/safe_panel.html` | SAFE Panel DOM |
| CSS | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel.css` | `safe_panel_v10/safe_panel.css` | SAFE Panel style |
| Stage4 IPC controller | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\ipc\stage4StationBindingHandlers.js` | `safe_panel_v10/ipc/stage4StationBindingHandlers.js` | Stage4 API controller |
| Recovery handler | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\ipc\safePanelV0106RecoveryHandlers.js` | `safe_panel_v10/ipc/safePanelV0106RecoveryHandlers.js` | SAFE Panel recovery handler |

## 3. Terminal / Browser Shell Assets

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_terminal.css
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_terminal.html
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_terminal_preload.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_terminal_renderer.js
```

역할:

```text
SAFE Panel 내부 terminal/browser shell 자원이다.
main/preload/renderer/html처럼 한 세트로 취급한다.
```

## 4. Stage4 Shared Core Assets

기준:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4
```

| 파일 | 역할 | 재사용 시점 |
|---|---|---|
| `apiIpcBindingConsistencyChecker.js` | API/IPC binding consistency check | renderer/preload/main 이름 일치 확인 |
| `collectorCommanderGateHandoffAdapter.js` | Worker output → Commander gate handoff | 결과 수집 후 Commander 판정 입력 생성 |
| `downloadResourceExtractor.js` | Download resource extraction | GPT/worker output에서 resource link 추출 |
| `downloadResourceManager.js` | Download resource queue/storage | 태라창 resource 관리 |
| `duplicatePathConflictDetector.js` | Duplicate path conflict detect | SOURCE_FILE 경로 충돌 감지 |
| `efficiencyGateStatus.js` | GREEN/YELLOW/RED gate status helper | 효율성 기준 상태 분류 |
| `executionErrorReporter.js` | Execution error report | 실행 실패 보고 생성 |
| `executionResultCollector.js` | Execution result collector | PC Agent 결과 수집 후보 |
| `fileBatchDispatcher.js` | File batch dispatcher | SOURCE_FILE 묶음 dispatch |
| `greenOutputAssemblyQueue.js` | GREEN output assembly queue | 결합 가능한 산출물 queue |
| `panelCommandParser.js` | Panel command parser | SOURCE_FILE/SF_COMMAND 후보 감지 |
| `panelInputClassifier.js` | Panel input classifier | 입력 유형 분류 |
| `patchRequestConflictSorter.js` | Patch request conflict sorter | patch_request 충돌 정렬 |
| `placeholderOmissionDetector.js` | Placeholder/omission detector | 생략 코드 탐지 |
| `projectPanelIdentityHelper.js` | Project Panel identity helper | panel/project identity 정규화 |
| `promptPackageVersionManager.js` | Prompt package version manager | prompt package version gate |
| `promptQueueManager.js` | Prompt queue manager | Worker/Commander prompt queue |
| `redFixRequestGenerator.js` | RED fix request generator | RED hotfix 요청 생성 |
| `runtimePartialAssemblyClassifier.js` | Runtime vs partial assembly classifier | partial assembly와 runtime 구분 |
| `sequentialPromptSender.js` | Sequential prompt sender | queue에서 다음 prompt 선택/전송 |
| `sourceFileBlockExtractor.js` | SOURCE_FILE block extractor | SOURCE_FILE 블록 추출 |
| `sourceFileFormatValidator.js` | SOURCE_FILE format validator | SOURCE_FILE 형식 검증 |
| `windowsRegexEscapeChecker.js` | Windows regex/path escape checker | Windows 경로·regex escape 점검 |
| `workerFileOwnershipChecker.js` | Worker file ownership checker | worker별 소유 경로 확인 |
| `workerReportErrorExtractor.js` | Worker report error extractor | WORKER_REPORT 오류 추출 |

## 5. Store Assets

기준:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\stores
```

| 파일 | 역할 | 주의 |
|---|---|---|
| `taeoRawOutputStore.js` | GPT/Worker raw output 저장 | append-only 선호 |
| `workerOutputBatchStore.js` | worker batch output 저장 | worker_id / prompt_id / output_id 유지 |
| `panelRecordExecutionStore.js` | panel execution/event record 저장 | Project Panel singleton 오염 금지 |
| `laoSourceUnitStore.js` | 라오창 source unit 저장 | detect/queue와 execution 분리 |
| `taeraDownloadResourceStore.js` | 태라창 download resource 저장 | resource metadata와 실행 결과 분리 |

## 6. Prompt Assets

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\prompts\stage4\DONE_LIGHT_REPORT_GENERATOR_PROMPT.txt
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\prompts\stage4\NEXT_COMMANDER_HANDOFF_GENERATOR_PROMPT.txt
```

역할:

```text
DONE_LIGHT 보고서 생성 및 다음 Commander handoff 생성을 위한 prompt template이다.
```

## 7. Tool Assets

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\tools\stage4\ST4_W47_BASELINE_FREEZE_LOCAL_VERIFY.ps1
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\tools\stage4\checkStage4Syntax.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\tools\stage4\runCmdWrapper.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\tools\stage4\runNodeCheckWrapper.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\tools\stage4\runPythonWrapper.js
```

역할:

```text
Stage4 local verification, syntax check, command wrapper, node check wrapper, python wrapper.
PC Agent adapter 설계 시 실행 도구 후보로 참고할 수 있다.
```

## 8. Compact Constitution Assets

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\_CONSTITUTION_V2_COMPACT
```

역할:

```text
Worker / Commander 계약, Stage4 자동화 우선순위, SOURCE_FILE 형식, 라오창 detect/queue-only 원칙, six-slot prompt batch 원칙을 보관한다.
```

## 9. GitHub 게시 위치

현재 GitHub PR #2에 게시된 재사용 코어 위치:

```text
repository: anbin1900-crypto/source-factory-core
branch: publish/reusable-core-20260801
path: releases/SF_REUSABLE_CORE_20260801_175708/
```

구조:

```text
releases/SF_REUSABLE_CORE_20260801_175708/
├─ safe_panel_v10/
├─ src/shared/stage4/
├─ prompts/
├─ tools/
├─ README_REUSABLE_CORE.md
├─ USER_START_HERE.md
├─ SOURCE_USAGE_INDEX.md
├─ CORE_ASSET_ANNOTATION_GUIDE.md
├─ REUSABLE_CORE_MANIFEST.json
└─ _USAGE_NOTES/
```

## 10. 재사용 시 권장 순서

```text
1. safe_panel_v10 전체를 복사한다.
2. src/shared/stage4 전체를 복사한다.
3. package.json / package-lock.json / node_modules 또는 npm install을 준비한다.
4. Electron launcher에서 safe_panel_v10/safe_panel_main.js를 main entry로 실행한다.
5. node --check로 JS 파일을 검증한다.
6. getProjectPanelIdentity / runtime_event_registry가 검색되는지 확인한다.
7. dispatchNextPrompt / runExecutionCheck handler를 확인한다.
8. PC Agent adapter는 patch_request로 삽입한다.
```
