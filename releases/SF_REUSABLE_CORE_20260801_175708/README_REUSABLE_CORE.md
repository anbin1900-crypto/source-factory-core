# Source Factory Reusable Core

이 폴더는 소스팩토리의 재사용 가능한 핵심 소스만 추출한 복사본이다.

## 원본 기준

E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038

## 재사용 코어 위치

E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708

## 포함된 핵심 그룹

1. safe_panel_v10
   - Electron SAFE Panel 실행 UI
   - main / preload / renderer / html / ipc handler 포함

2. src/shared/stage4
   - Prompt Queue
   - Sequential Sender
   - Worker Output Collector
   - Execution Result Collector
   - SOURCE_FILE extractor / validator
   - Project Panel Identity helper
   - stores 계열

3. _CONSTITUTION_V2_COMPACT
   - 소스공장 compact 운영 헌법
   - Worker / Commander 계약

4. prompts / tools
   - Stage4 운영 보조 prompt와 도구

## 중요한 점

- 이 폴더는 원본 실행본이 아니다.
- 파일 내부는 수정하지 않았다.
- 사용법 설명은 SOURCE_USAGE_INDEX.md와 *.usage.md 파일에 따로 기록한다.
- 원본 E active-core는 수정하지 않았다.

## PC Agent 결속 핵심 지점

- dispatch side:
  safe_panel_v10\ipc\stage4StationBindingHandlers.js
  handleStage4DispatchNextPrompt

- result side:
  safe_panel_v10\ipc\stage4StationBindingHandlers.js
  handleStage4RunCheck

- storage side:
  safe_panel_v10\ipc\stage4StationBindingHandlers.js
  handleStage4AppendStationRecords
