# V-1 C 모드 3-워커 실험·검증·보완 통제 V1

```text
CONTROL_ID=V1-C-MODE-VALIDATION-CYCLE-001
COMMANDER=V-1
RUNTIME_BASELINE=5.10.2.4.1
REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=#17
MODE=PARALLEL_EXPERIMENT_VERIFY_FIX_RETEST
PRODUCTION=false
READY=false
MERGE=false
```

## 목적

C 모드와 명령 실행 모드를 실제로 시험하고, 오류를 발견한 담당 워커가 자신의 범위에서 직접 수정·재시험한 뒤, V-1이 세 결과를 통합한다.

현재 기준선은 `C_MODE_ENABLED=false`, `REPEAT_COMMAND_COUNT=0`, `WORKING=0`이다. 과거 A/E 상태는 현재 작업수 판정에서 제외한다.

## 3개 워커

### V1-CV-1 — Runtime Logic·Deterministic Simulation

- C 상태머신, START, WAVE 일괄전송, WAVE/ROLE 결과 상관관계
- 20분 부분진행, 90분 보조 워커 2명, 명시적 미보고 4회 교체
- 공정률 단조성, END·재활성화, 재시작 상태복구
- 반복명령 시간모드와 `ROLE+COMMAND_ID` 완료모드
- 발견한 Runtime 결함은 직접 수정하고 재시험

Terminal:

```text
CV1_C_MODE_RUNTIME_LOGIC_PASS_OR_EXACT_BLOCKER
```

### V1-CV-2 — Target PC·UI·Install·Live Flow

- 대상 PC 설치와 Idle 0명 표시
- 각 그룹 `C` 버튼과 상단 `명령 실행` 팝업
- 3개 워커 × 3개 WAVE 실제 전송
- 시간 반복과 결과 완료 반복, END 자동정지
- 로그인 Profile·관제로그·Rollback 보존
- UI·설치 결함은 직접 수정하고 재시험

Terminal:

```text
CV2_TARGET_PC_C_COMMAND_UI_PASS_OR_EXACT_BLOCKER
```

### V1-CV-3 — Failure Injection·Recovery·Independent Acceptance

- 브라우저 ERR_ABORTED, GitHub 일시 오류, 잘못된 PANEL, 과거 상태, 순서 뒤바뀐 결과, 중복 결과
- 재시작 중 WAVE, Rescue 경합, Exactly-once, 관제로그 누락 검사
- 구현 Source 직접 수정 금지; Findings·재현 Fixture·수용판정만 소유

Terminal:

```text
CV3_C_MODE_FAILURE_RECOVERY_ACCEPTANCE_PASS_OR_EXACT_BLOCKER
```

## 실행순서

```text
세 워커 START 동시 게시
→ 각 워커 독립 실행·직접 교정·재시험
→ Terminal 3/3 게시
→ V-1 결과·Commit·로그 Readback
→ 충돌 없는 수정만 통합
→ Offline 전 시험 재실행
→ 대상 PC 3워커 3WAVE·재시작 복구
→ 최종 LTS 판정
```

중간 실패는 Terminal이 아니다. 동일 오류가 두 번 반복되면 Source·명령·순서·도구 중 하나 이상을 변경하고 재시험한다.

## Gate

```text
G0=기준선·권위·Hash
G1=Idle 상태 정확성
G2=C Batch·보고 상관관계
G3=20분·90분·4회 미보고
G4=반복명령
G5=대상 PC UI·설치
G6=3워커×3WAVE
G7=재시작·오류복구·독립수용
```

Offline G0~G4는 제공 Harness에서 자동 실행한다. G5~G7은 대상 PC 실제 증거가 없으면 PASS로 선언하지 않는다.

## 공통 보고

모든 워커는 성공·실패·차단 여부와 무관하게 JSON Terminal과 PR 댓글 Pointer를 게시한다.

```text
PANEL | ROLE={WORKER} | CYCLE=V1-C-MODE-VALIDATION-CYCLE-001 | STATUS={PASS|BLOCKED_EXTERNAL} | RESULT_POST={POST_ID}
```

## 최종 수용조건

```text
WORKER_TERMINALS=3_OF_3
OFFLINE_GATES=PASS_G0_TO_G4
TARGET_PC_GATES=PASS_G5_TO_G7
FALSE_WORKING_WHEN_IDLE=0
DUPLICATE_DISPATCH_COUNT=0
PREVIOUS_COMMAND_CANCEL_COUNT=0
LOST_WORK_CONTROL_EVENT_COUNT=0
RESTART_RESUME=PASS
AUTO_TEST_WRITE_COUNT=0
```
