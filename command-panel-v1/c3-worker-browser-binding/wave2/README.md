# C-3 AI욜라 Workspace Service Session Wave 2

기존 `workerBrowserBindingAdapter`와 Source Factory Safe Panel Runtime을 재사용해 세 전문 AI 서비스를 동일 Workspace Runtime에 설정 기반으로 결속한다. Electron Browser Session은 역할별로 재사용하지만 서비스별 논리 Session ID와 Domain Result Receipt를 분리한다.

## 실행

```bash
node --check aiYollaWorkspaceServiceSessionAdapter.js
node tests/testAiYollaWorkspaceServiceSessionAdapter.js
```

## 경계

새 Browser Runtime, Electron App, Session 구현, Prompt Transport를 만들지 않는다. Runtime 요청은 `AI_YOLLA_RUNTIME` 경계 Metadata만 생성하며 실행 권한은 부여하지 않는다.
