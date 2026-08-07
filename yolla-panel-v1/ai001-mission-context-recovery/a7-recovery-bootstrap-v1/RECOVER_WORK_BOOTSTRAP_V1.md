# RECOVER_WORK_BOOTSTRAP_V1

## 목적
AI-001 새 Context, 후계자 실행기, PC Agent 또는 PC 명령실행기가 중간에 끊겨도 전체 대화 이력을 다시 읽지 않고 `LATEST_MISSION_POINTER.json`이 가리키는 최소 4개 입력만으로 마지막 업무상태를 복원한다.

## 최소 읽기 순서
1. `LATEST_MISSION_POINTER.json`
2. Pointer의 `MISSION_POINTER`
3. `CURRENT_COMMAND`
4. `LATEST_RESULT`
5. `CHECKPOINT`
6. 필요할 때만 `COMMAND_CHECKPOINT_RESUME_V1.json`

## 단일 복구 명령
```bash
node recover-work.cjs --pointer ./LATEST_MISSION_POINTER.json
```
부분산출물을 격리하고 복구계획까지 적용해야 할 때만:
```bash
node recover-work.cjs --pointer ./LATEST_MISSION_POINTER.json --repair --json
```

## 출력
`resume_candidate.decision`은 `SKIP_DUPLICATE`, `RESUME`, `REPAIR_THEN_RESUME`, `SAFE_RERUN`, `BLOCKED`, `ADVANCE` 중 하나다.

## Fail-closed 규칙
- 같은 idempotency key에 PASS Receipt가 있으면 절대 재실행하지 않는다.
- heartbeat가 살아있는 RUNNING command를 복구 프로세스가 탈취하지 않는다.
- durable checkpoint 없는 stale command는 `safe_rerun=true`이고 비멱등 side effect가 commit되지 않았을 때만 재실행한다.
- 손상된 partial artifact는 원본 위치에서 덮어쓰지 않고 quarantine 후 재생성 대상으로 표시한다.
- Production, Target PC, Tunnel, Successor direct call은 이 Bootstrap이 실행하지 않는다.

## 새 Context Bootstrap
새 Context는 과거 대화 전체 대신 Latest Pointer와 위 최소 입력을 읽고 `recover-work.cjs` 출력의 `MISSION`, `CURRENT_COMMAND`, `LATEST_RESULT`, `CHECKPOINT`, `NEXT_ACTION`만 현재 작업메모리에 적재한다. 상세 과거 로그는 모순 또는 provenance 검증이 필요한 경우에만 추가 조회한다.
