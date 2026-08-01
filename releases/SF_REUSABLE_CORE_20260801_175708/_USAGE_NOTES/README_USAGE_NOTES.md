# _USAGE_NOTES Overview

이 폴더는 Source Factory 재사용 코어의 세부 주석 모음이다.

## 문서 목록

| 문서 | 설명 |
|---|---|
| `stage4StationBindingHandlers.usage.md` | Stage4 IPC controller의 핵심 handler 설명 |
| `safe_panel_renderer.usage.md` | Renderer UI controller와 Project Panel 표시 경계 설명 |
| `stage4_stores.usage.md` | Store 계열 파일 사용법과 주의사항 |
| `PC_AGENT_BINDING_ADAPTER.usage.md` | PC Agent 결속 adapter 설계 주석 |
| `PROJECT_PANEL_IDENTITY.usage.md` | Project Panel Identity 모델과 source_partial/fallback 설명 |

## 사용 원칙

```text
1. 먼저 README_REUSABLE_CORE.md를 읽는다.
2. 전체 구조는 SOURCE_USAGE_INDEX.md로 확인한다.
3. 세부 구현 전에는 해당 usage note를 읽는다.
4. 실행 소스 자체를 바로 수정하지 말고 patch_request로 시작한다.
```

## 가장 중요한 후속 작업

```text
PC Agent binding:
handleStage4DispatchNextPrompt
→ PC_AGENT_DISPATCH_ADAPTER
→ PC Agent
→ PC_AGENT_RESULT_ADAPTER
→ handleStage4RunCheck
```
