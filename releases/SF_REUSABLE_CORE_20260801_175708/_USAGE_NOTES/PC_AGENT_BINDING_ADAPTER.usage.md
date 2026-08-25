# PC Agent Binding Adapter Usage Note

이 문서는 `SF_REUSABLE_CORE_20260801_175708`의 PC Agent 결속 지점을 설명한다.

## 1. 현재 상태

이 snapshot은 Source Factory SAFE Panel과 Stage4 core를 포함하지만, PC Agent adapter는 아직 삽입되어 있지 않다.

현재 dispatch 흐름:

```text
renderer / preload / IPC
→ stage4StationBindingHandlers.js
→ handleStage4DispatchNextPrompt
→ promptPackageVersionManager
→ sequentialPromptSender
```

현재 execution check 흐름:

```text
renderer / preload / IPC
→ stage4StationBindingHandlers.js
→ handleStage4RunCheck
→ executionResultCollector
```

현재 storage 흐름:

```text
handleStage4AppendStationRecords
→ taeoRawOutputStore
→ panelRecordExecutionStore
→ workerOutputBatchStore
```

## 2. 목표 흐름

PC Agent를 붙일 때 권장 흐름은 다음이다.

```text
handleStage4DispatchNextPrompt
→ promptPackageVersionManager
→ sequentialPromptSender 유지
→ PC_AGENT_DISPATCH_ADAPTER
→ PC Agent
→ PC_AGENT_RESULT_ADAPTER
→ handleStage4RunCheck
→ executionResultCollector
→ appendStationRecords / stores
```

핵심은 기존 경로를 삭제하지 않고 adapter를 추가하는 것이다.

## 3. Adapter target

```text
ADAPTER_TARGET_FILE=
safe_panel_v10/ipc/stage4StationBindingHandlers.js

DISPATCH_TARGET_FUNCTION=
handleStage4DispatchNextPrompt

RESULT_TARGET_FUNCTION=
handleStage4RunCheck

STORAGE_TARGET_FUNCTION=
handleStage4AppendStationRecords
```

## 4. PC_AGENT_DISPATCH_ADAPTER 역할

Dispatch adapter는 `handleStage4DispatchNextPrompt` 안에서 prompt 또는 execution intent를 PC Agent가 이해할 수 있는 작업 요청으로 변환한다.

권장 입력:

```json
{
  "task_id": "string",
  "prompt_package_id": "string",
  "prompt_package_version": "string",
  "target_worker": "string|null",
  "command": "string|null",
  "args": [],
  "cwd": "string|null",
  "execution_kind": "node_check|powershell|python|cmd|manual|unknown",
  "source": "dispatchNextPrompt"
}
```

권장 출력:

```json
{
  "pc_agent_dispatched": true,
  "pc_agent_task_id": "string",
  "dispatch_status": "queued|sent|skipped|blocked",
  "reason": "string|null"
}
```

## 5. PC_AGENT_RESULT_ADAPTER 역할

Result adapter는 PC Agent가 돌려준 결과를 `handleStage4RunCheck`와 `executionResultCollector`가 처리할 수 있는 형태로 바꾼다.

권장 입력:

```json
{
  "pc_agent_task_id": "string",
  "task_id": "string",
  "exit_code": 0,
  "stdout": "string",
  "stderr": "string",
  "started_at": "ISO timestamp",
  "finished_at": "ISO timestamp",
  "artifacts": [],
  "status": "success|failed|timeout|cancelled"
}
```

권장 출력:

```json
{
  "executed": true,
  "status": "success|failed",
  "exit_code": 0,
  "stdout": "string",
  "stderr": "string",
  "collector_status": "COLLECTED",
  "pc_agent_task_id": "string"
}
```

## 6. 최소 구현 원칙

```text
1. 새 IPC channel을 먼저 만들지 않는다.
2. 기존 dispatchNextPrompt / runExecutionCheck path를 활용한다.
3. sequentialPromptSender를 삭제하지 않는다.
4. executionResultCollector를 삭제하지 않는다.
5. fallback response를 보존한다.
6. 실패해도 기존 UI가 깨지지 않게 한다.
7. 결과 저장은 appendStationRecords 또는 store 계열로 연결한다.
```

## 7. 금지 사항

```text
- package.json 즉시 수정 금지
- preload API rename 금지
- IPC channel rename 금지
- Project Panel Identity registry 삭제 금지
- source:not_found fallback 삭제 금지
- SF_COMMAND 자동 실행 금지
- 라오창 입력 인식 기능 수정 금지
- Worker/Commander count를 6/7로 고정 금지
```

## 8. 권장 patch 순서

```text
1. PATCH_REQUEST_ONLY로 adapter 설계
2. stage4StationBindingHandlers.js 안의 정확 anchor 확인
3. PC_AGENT_DISPATCH_ADAPTER helper 함수 추가
4. PC_AGENT_RESULT_ADAPTER helper 함수 추가
5. 기존 handler 안에 guarded branch 삽입
6. node --check
7. UI runtime fixture
8. 실패 시 fallback 유지 확인
```

## 9. runtime 판정 기준

```text
PASS:
- dispatchNextPrompt 호출 시 PC Agent task id가 생성된다.
- PC Agent 결과가 runExecutionCheck 경로로 돌아온다.
- 결과가 executionResultCollector 또는 storage 계열에 남는다.
- 기존 sequentialPromptSender fallback이 살아 있다.

PARTIAL:
- PC Agent task id는 생성되지만 결과 callback이 없다.
- 결과는 오지만 storage에 남지 않는다.

FAIL:
- 기존 dispatchNextPrompt가 깨진다.
- 기존 runExecutionCheck가 깨진다.
- preload/API/IPC rename으로 UI 호출이 실패한다.
```
