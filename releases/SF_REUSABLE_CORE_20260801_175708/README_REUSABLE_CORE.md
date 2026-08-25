# Source Factory Reusable Core

이 폴더는 소스팩토리의 재사용 가능한 핵심 소스만 추출한 복사본이다.

## 원본 기준

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038
```

## 재사용 코어 위치

```text
E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708
```

## 먼저 읽을 문서

처음 사용하는 사람은 아래 순서대로 읽는다.

```text
1. USER_START_HERE.md
2. SOURCE_USAGE_INDEX.md
3. CORE_ASSET_ANNOTATION_GUIDE.md
4. _USAGE_NOTES/stage4StationBindingHandlers.usage.md
5. _USAGE_NOTES/PC_AGENT_BINDING_ADAPTER.usage.md
6. _USAGE_NOTES/PROJECT_PANEL_IDENTITY.usage.md
7. ANNOTATION_CHANGELOG.md
8. REUSABLE_CORE_MANIFEST.json
```

문서별 역할:

| 파일 | 목적 |
|---|---|
| `USER_START_HERE.md` | 처음 사용자용 읽기 순서와 빠른 사용법 |
| `SOURCE_USAGE_INDEX.md` | 핵심 파일별 역할 요약표와 상세 주석 링크 |
| `CORE_ASSET_ANNOTATION_GUIDE.md` | 핵심 자산별 상세 주석/재사용법/주의사항 |
| `_USAGE_NOTES/PC_AGENT_BINDING_ADAPTER.usage.md` | PC Agent 결속 지점과 adapter 설계 주석 |
| `_USAGE_NOTES/PROJECT_PANEL_IDENTITY.usage.md` | Project Panel Identity 모델 주석 |
| `ANNOTATION_CHANGELOG.md` | 상세 주석 추가 이력 |

## 포함된 핵심 그룹

1. `safe_panel_v10`
   - Electron SAFE Panel 실행 UI
   - main / preload / renderer / html / ipc handler 포함

2. `src/shared/stage4`
   - Prompt Queue
   - Sequential Sender
   - Worker Output Collector
   - Execution Result Collector
   - SOURCE_FILE extractor / validator
   - Project Panel Identity helper
   - stores 계열

3. `_CONSTITUTION_V2_COMPACT`
   - 소스공장 compact 운영 헌법
   - Worker / Commander 계약

4. `prompts` / `tools`
   - Stage4 운영 보조 prompt와 도구

## 중요한 점

- 이 폴더는 원본 실행본이 아니다.
- 파일 내부는 수정하지 않았다.
- 사용법 설명은 `SOURCE_USAGE_INDEX.md`, `CORE_ASSET_ANNOTATION_GUIDE.md`, `_USAGE_NOTES/*.usage.md`에 따로 기록한다.
- 원본 E active-core는 수정하지 않았다.
- 새 프로젝트에 적용할 때는 필요한 계층만 가져가고, API/IPC/preload 이름은 함께 보존한다.

## PC Agent 결속 핵심 지점

- dispatch side:
  `safe_panel_v10\ipc\stage4StationBindingHandlers.js`
  `handleStage4DispatchNextPrompt`

- result side:
  `safe_panel_v10\ipc\stage4StationBindingHandlers.js`
  `handleStage4RunCheck`

- storage side:
  `safe_panel_v10\ipc\stage4StationBindingHandlers.js`
  `handleStage4AppendStationRecords`

## 재사용 원칙

```text
1. 실행 소스와 재사용 소스를 구분한다.
2. 기존 fallback 경로를 삭제하지 않는다.
3. preload API 이름을 임의로 바꾸지 않는다.
4. IPC channel 이름을 임의로 바꾸지 않는다.
5. Project Panel Identity에는 fake/default 값을 넣지 않는다.
6. SF_COMMAND 후보는 detect/queue 대상으로만 취급하고 자동 실행하지 않는다.
7. PC Agent는 기존 dispatch/run check 흐름에 adapter로 붙인다.
8. Worker/Commander count를 6/7로 고정하지 않는다.
```
