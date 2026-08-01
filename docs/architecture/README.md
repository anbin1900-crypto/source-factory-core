# Source Factory Architecture Documentation

이 폴더는 Source Factory의 구조를 설명하는 공식 아키텍처 문서 위치다.

## 문서 목적

`releases/SF_REUSABLE_CORE_20260801_175708/`는 특정 시점의 재사용 코어 스냅샷이다. 반면 이 `docs/architecture/` 폴더는 Source Factory 전체 구조, 사용자 PC의 실제 E: 실행 경로, Stage 4 호출 흐름, 핵심 자산 지도, PC Agent 결속 모델을 장기적으로 설명하는 문서 위치다.

## 먼저 읽을 문서

| 순서 | 문서 | 목적 |
|---:|---|---|
| 1 | `SOURCE_FACTORY_PC_E_DRIVE_STRUCTURE.md` | 사용자 PC의 E: 절대경로 기준 실행 구조 |
| 2 | `SOURCE_FACTORY_RUNTIME_FLOW_E_ACTIVE_CORE.md` | E: active-core가 Electron에서 실행되는 흐름 |
| 3 | `SOURCE_FACTORY_CORE_ASSET_ABSOLUTE_PATH_MAP.md` | 핵심 소스 파일과 재사용 자산의 절대경로 지도 |
| 4 | `SOURCE_FACTORY_PC_AGENT_BINDING_PATHS.md` | PC Agent adapter 결속 지점과 Stage 4 handler 구조 |

## 현재 기준 실행 상태

```text
SOURCE_FACTORY_E_MIGRATION_STATUS=PASS_E_ONLY_RUNTIME
ACTIVE_CORE=E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038
REUSABLE_CORE=E:\SOURCE FACTORY\source-factory-reusable-core\SF_REUSABLE_CORE_20260801_175708
EXECUTION_MODE=E source + E Electron dependency
```

## 절대경로 표기 원칙

이 문서들은 사용자 PC에서 실제 확인된 E: 절대경로를 그대로 기록한다. 다른 사용자가 재사용할 때는 다음 원칙을 따른다.

```text
E:\SOURCE FACTORY\... = 사용자 PC의 실제 기준 경로
다른 PC에서는 자신의 드라이브/폴더로 치환한다
경로를 치환할 때는 safe_panel_v10, src/shared/stage4, node_modules 상대구조를 유지한다
```

## 핵심 결론

현재 Source Factory는 E: active-core 기준으로 단독 실행이 확인되었다. 남은 다음 결속 과제는 PC Agent adapter를 `handleStage4DispatchNextPrompt`와 `handleStage4RunCheck` 사이에 삽입하는 것이다.
