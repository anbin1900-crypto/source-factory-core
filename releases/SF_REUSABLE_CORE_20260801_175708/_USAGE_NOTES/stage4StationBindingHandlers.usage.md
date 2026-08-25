# stage4StationBindingHandlers.js usage

역할:
- Stage4 IPC controller
- dispatchNextPrompt, runExecutionCheck, appendStationRecords, refreshControlState 등 핵심 API를 연결한다.

PC Agent 결속 지점:
- handleStage4DispatchNextPrompt
- handleStage4RunCheck

주의:
- 기존 sequentialPromptSender 삭제 금지
- 기존 executionResultCollector 삭제 금지
- IPC channel rename 금지
- preload API rename 금지
- Project Panel Identity registry 삭제 금지
