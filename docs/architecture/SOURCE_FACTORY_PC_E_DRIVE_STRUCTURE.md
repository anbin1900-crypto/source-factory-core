# Source Factory 사용자 PC E: 절대경로 구조

이 문서는 사용자의 PC에서 실제 확인된 Source Factory E: 실행 구조를 기록한다. 목적은 이후 사용자, Worker, Commander, 결합자가 같은 기준 경로를 보고 혼동 없이 실행·검증·이전·백업·재사용 작업을 이어받게 하는 것이다.

## 1. 현재 최종 실행 기준

```text
SOURCE_FACTORY_E_MIGRATION_STATUS=PASS_E_ONLY_RUNTIME
EXECUTION_MODE=E source + E Electron dependency
```

현재 Source Factory는 E: 안의 active-core에서 단독 실행된다.

```text
E_ACTIVE_CORE=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038
```

이 폴더가 현재 실행 기준이다. D:의 과거 assembled runtime candidate는 더 이상 현재 실행 의존성이 아니다.

## 2. E: 최상위 Source Factory 구조

```text
E:\SOURCE FACTORY\
├─ source-factory-active-core\
│  └─ SF_ACTIVE_CORE_20260801_172038\
├─ source-factory-reusable-core\
│  └─ SF_REUSABLE_CORE_20260801_175708\
├─ _BACKUPS\
└─ github-upload\
   └─ source-factory-core\
```

각 폴더의 의미는 다음과 같다.

| 절대경로 | 역할 | 상태 |
|---|---|---|
| `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038` | 현재 실행 가능한 E: active-core | PASS_E_ONLY_RUNTIME |
| `E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708` | 재사용 가능한 핵심 소스 추출본 | GitHub PR #2에 게시됨 |
| `E:\SOURCE FACTORY\_BACKUPS` | E: active-core zip/manifest 백업 위치 | 백업용 |
| `E:\SOURCE FACTORY\github-upload\source-factory-core` | GitHub 업로드 작업 clone 위치 | 로컬 Git 작업용 |

## 3. 현재 active-core 내부 구조

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\
├─ safe_panel_v10\
├─ src\shared\stage4\
├─ node_modules\
├─ prompts\
├─ tools\
├─ _CONSTITUTION_V2_COMPACT\
├─ _electron_reference\
├─ package.json
├─ package-lock.json
├─ RUN_E_SF4_SAFE_PANEL_E_ONLY.bat
├─ RUN_E_SF4_SAFE_PANEL_ACTIVE_CORE_WITH_D_ELECTRON.bat
├─ SOURCE_FACTORY_E_ACTIVE_CORE_MANIFEST.json
└─ SOURCE_FACTORY_E_ACTIVE_CORE_NODE_CHECK.txt
```

## 4. E: 단독 실행 파일

공식 실행 런처는 다음이다.

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\RUN_E_SF4_SAFE_PANEL_E_ONLY.bat
```

이 런처의 목적은 E: 안의 Electron과 E: 안의 SAFE Panel main entry를 함께 실행하는 것이다.

```text
ELECTRON_BINARY=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\node_modules\electron\dist\electron.exe

MAIN_ENTRY=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js
```

Windows Process CommandLine 기준으로 다음 형태가 확인되면 E: 단독 실행이다.

```text
"E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\node_modules\electron\dist\electron.exe" "E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js"
```

Renderer process에서는 다음 app-path가 보여야 한다.

```text
--app-path="E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10"
```

## 5. SAFE Panel 핵심 절대경로

```text
SAFE_PANEL_ROOT=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10
```

핵심 파일은 다음이다.

| 파일 | 절대경로 | 역할 |
|---|---|---|
| Main entry | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_main.js` | Electron main process entry |
| Preload bridge | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_preload.js` | `window.sfApi` bridge |
| Renderer controller | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel_renderer.js` | UI binding/controller |
| HTML layout | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel.html` | SAFE Panel DOM |
| Style | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\safe_panel.css` | SAFE Panel UI style |
| Stage4 IPC controller | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\ipc\stage4StationBindingHandlers.js` | Stage4 API handler |
| Recovery handler | `E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\ipc\safePanelV0106RecoveryHandlers.js` | SAFE Panel recovery helper |

## 6. Stage4 shared core 절대경로

```text
STAGE4_SHARED_ROOT=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4
```

주요 모듈:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\promptQueueManager.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\sequentialPromptSender.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\promptPackageVersionManager.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\executionResultCollector.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\executionErrorReporter.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\fileBatchDispatcher.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\sourceFileBlockExtractor.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\sourceFileFormatValidator.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\projectPanelIdentityHelper.js
```

Store 계열:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\stores\taeoRawOutputStore.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\stores\workerOutputBatchStore.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\stores\panelRecordExecutionStore.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\stores\laoSourceUnitStore.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\stores\taeraDownloadResourceStore.js
```

## 7. 재사용 코어 절대경로

```text
REUSABLE_CORE=
E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708
```

이 폴더는 active-core 원본을 직접 수정하지 않고 복사·정리한 재사용 코어다. GitHub에는 다음 경로로 게시되었다.

```text
anbin1900-crypto/source-factory-core
releases/SF_REUSABLE_CORE_20260801_175708/
```

재사용 코어의 주요 문서:

```text
E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708\README_REUSABLE_CORE.md
E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708\USER_START_HERE.md
E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708\SOURCE_USAGE_INDEX.md
E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708\CORE_ASSET_ANNOTATION_GUIDE.md
E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708\REUSABLE_CORE_MANIFEST.json
```

## 8. 경로 치환 규칙

다른 사용자가 이 구조를 재사용할 때는 E: 절대경로를 그대로 복사하지 말고 자신의 PC 기준 경로로 치환해야 한다.

예:

```text
사용자 PC 기준:
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038

다른 PC 예시:
D:\MY_SOURCE_FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038
```

단, 내부 상대구조는 반드시 유지한다.

```text
safe_panel_v10\safe_panel_main.js
safe_panel_v10\safe_panel_preload.js
safe_panel_v10\safe_panel_renderer.js
safe_panel_v10\ipc\stage4StationBindingHandlers.js
src\shared\stage4\...
node_modules\electron\dist\electron.exe
```
