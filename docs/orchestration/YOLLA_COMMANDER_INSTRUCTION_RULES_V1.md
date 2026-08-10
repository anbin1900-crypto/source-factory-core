# YOLLA 커맨더 지시 규칙 V1

```text
DOCUMENT_ID=YOLLA-COMMANDER-INSTRUCTION-RULES-V1
VERSION=1.0.0
STATUS=CANONICAL
EFFECTIVE_DATE=2026-08-10
SCOPE=NEW001/YOLLA 장기 다중 ChatGPT 워커 지휘
RECOMMENDED_PROJECT_PATH=docs/orchestration/YOLLA_COMMANDER_INSTRUCTION_RULES_V1.md
```

## I. 목적

이 문서는 YOLLA 커맨더가 등록된 ChatGPT 워커에게 작업을 배정하고, 상태를 기계적으로 판정하며, 결과를 검증·회수하고, 다음 작업을 연속 배정하는 표준 규칙을 정의한다.

핵심 목표는 커맨더가 워커의 ChatGPT 화면을 직접 조작하는 것이 아니다.

> 각 ChatGPT 대화 컨텍스트를 고유 주소·상태·작업 이력을 가진 장기 작업 노드로 사용한다.

## II. 권위 구조

각 구성요소의 책임은 다음과 같이 분리한다.

1. `Direct MCP + Commander Control API`
   - 워커 등록, 명령 전달, 상태 조회, 결과 회수, 취소 및 이벤트 전달을 담당한다.
2. `YOLLA Dispatcher`
   - Worker Registry, Command Routing, State Machine, Heartbeat, Lease, Event Inbox 및 내부 명령 원장을 담당한다.
3. `GitHub 게시물`
   - 상세 작업지시서, 첨부자료, 작업 결과, Commit·PR·검증 근거의 권위 원장이다.
4. `관제 패널`
   - 사용자가 상태·작업번호·진행률·오류 로그를 확인하는 UI다. 권위 통신 경로가 아니다.

GitHub를 과거의 Queue/Polling/Claim/Receipt 운반망으로 사용하지 않는다. GitHub는 작업지시와 결과의 저장·검증에만 사용한다.

## III. 워커 구성 원칙

1. ChatGPT 전체 대화 URL 1개를 워커 1명으로 등록한다.
2. `worker_id + conversation_id`를 함께 사용해 대상을 확정한다.
3. 같은 대화 URL 또는 같은 `conversation_id`의 중복 등록을 차단한다.
4. Worker 1은 `SUCCESSOR` 전용으로 두고 일반 실행 작업 풀에서 제외한다.
5. Worker 2~7은 기본 실행 풀이다. 추가 워커도 같은 계약으로 확장할 수 있다.
6. 이름이나 화면 순서만으로 대상을 선택하지 않는다.
7. 작업 중인 워커의 URL 변경·삭제·다른 대화로의 전환을 금지한다.

## IV. 작업 및 명령 식별자

다음 식별자는 서로 다른 의미를 가진다.

- `job_id`: 논리적으로 동일한 작업을 나타내며 재시도해도 유지한다.
- `command_id`: 특정 워커에게 발행한 명령 1건을 나타낸다.
- `attempt_id`: 같은 작업 또는 명령의 재시도 회차를 나타낸다.
- `request_id`: API 중복 호출을 차단하는 멱등성 키다.
- `event_id`: 상태 변경 이벤트 1건을 식별한다.
- `global_work_no`: YOLLA 전체 누적 작업번호다.
- `worker_work_no`: 해당 워커의 누적 작업번호다.
- `wave_id`: 계획·보고·통계를 위한 작업 묶음 번호다.

같은 `request_id`와 같은 요청 본문이 다시 들어오면 기존 `command_id`를 반환하고 중복 전송하지 않는다. 같은 `request_id`에 다른 작업·워커·본문이 들어오면 `REQUEST_ID_CONFLICT`로 차단한다.

## V. 표준 명령 계약

커맨더가 Dispatcher에 전달하는 최소 명령은 다음 구조를 따른다.

```json
{
  "job_id": "JOB-000041",
  "command_id": "CMD-000128",
  "attempt_id": "ATT-001",
  "request_id": "WAVE-01-W04-JOB-000041",
  "global_work_no": 128,
  "worker_work_no": 19,
  "wave_id": "WAVE-01",
  "worker_id": "WORKER-04",
  "instruction_ref": {
    "provider": "github",
    "repository": "anbin1900-crypto/source-factory-core",
    "type": "issue",
    "number": 123
  },
  "result_policy": {
    "destination": "SAME_ISSUE_COMMENT",
    "require_result_url": true,
    "require_artifact_refs": true,
    "require_validation": true
  },
  "priority": "NORMAL",
  "dependencies": [],
  "lease_seconds": 60,
  "idempotency_key": "JOB-000041-W04"
}
```

`repository + type + number`를 반드시 함께 적는다. `#123`처럼 게시물 번호만 전달하지 않는다.

## VI. 워커에게 보내는 표준 지시문

워커 대화에는 긴 작업 내용을 복사하지 않고 다음 형식을 보낸다.

```text
[YOLLA WORK ORDER V1]
JOB_ID=JOB-000041
COMMAND_ID=CMD-000128
ATTEMPT_ID=ATT-001
WORKER_ID=WORKER-04
WAVE_ID=WAVE-01
GLOBAL_WORK_NO=128
WORKER_WORK_NO=19

GitHub anbin1900-crypto/source-factory-core의 Issue #123 본문과 첨부자료를 읽고,
그 게시물에 명시된 미수행 작업을 수행하십시오.

완료 후 결과를 같은 Issue #123에 댓글로 게시하십시오.
이 대화에는 COMMAND_ID와 결과 게시물 URL, 상태, 검증 결과만 표준 JSON으로 보고하십시오.

이미 같은 JOB_ID의 결과가 게시되어 있다면 작업을 반복하지 말고 기존 결과 URL을 보고하십시오.
```

상세 목표·범위·금지사항·입력자료·산출물·완료 기준은 GitHub 게시물에 기록한다. 워커에게 보내는 지시는 게시물 위치와 실행·보고 규칙만 포함한다.

## VII. 명령 발행 전 검사

커맨더는 명령을 보내기 전에 다음을 순서대로 검사한다.

1. Direct Executor가 `READY`인지 확인한다.
2. Commander Control API가 `READY`인지 확인한다.
3. `LIST_WORKERS`로 대상 워커의 등록 여부를 확인한다.
4. `PROBE_WORKER`로 등록 `conversation_id`와 실제 열린 대화를 대조한다.
5. Worker Adapter heartbeat가 유효하고 Lease가 만료되지 않았는지 확인한다.
6. 워커 상태가 `IDLE`인지 확인한다.
7. 작업 의존성이 모두 충족됐는지 확인한다.
8. GitHub 지시 게시물의 저장소·종류·번호가 유효한지 확인한다.
9. 동일 `job_id`의 검증 완료 결과가 이미 존재하는지 확인한다.
10. 고유한 `request_id`를 만든 뒤 명령을 원장에 `QUEUED`로 먼저 기록한다.

검사에 실패하면 명령을 전송하지 않고 원인 코드와 함께 기록한다.

## VIII. 상태 모델

### 1. 워커 상태

- `IDLE`: 정상이며 새 명령을 받을 수 있다.
- `RECEIVED`: 새 명령 수신이 확인됐다.
- `WORKING`: 답변 생성·도구 실행·작업 활동이 진행 중이다.
- `WAITING`: 명령 전달 후 응답이나 GitHub 결과를 기다린다.
- `BLOCKED`: 입력, 권한, 로그인, 자료 또는 사용자 판단이 필요하다.
- `DONE`: 결과가 도착했으나 커맨더가 아직 회수·승인하지 않았다.
- `FAILED`: 명령 수행이 실패했다.
- `OFFLINE`: 프로세스, 대화 또는 통신 상태를 확인할 수 없다.

### 2. 명령 상태

```text
QUEUED
→ DISPATCHING
→ RECEIVED
→ WORKING
→ RESULT_POSTED
→ COMPLETED_VERIFIED
→ ACKNOWLEDGED
```

오류 분기는 다음과 같다.

```text
QUEUED | DISPATCHING | RECEIVED | WORKING
→ WAITING_RESPONSE | BLOCKED | TIMED_OUT | FAILED | ABORTED
```

워커의 `DONE` 응답만으로 `COMPLETED_VERIFIED`로 전환하지 않는다.

## IX. Heartbeat 및 Lease 규칙

1. Worker Adapter는 기본 10초마다 heartbeat를 기록한다.
2. heartbeat에는 `worker_id`, `conversation_id`, `state`, `command_id`, `last_activity_at`, `heartbeat_at`, `lease_expires_at`을 포함한다.
3. 30초 동안 heartbeat가 없으면 `STALE`로 판정한다.
4. 60초 동안 heartbeat가 없으면 `OFFLINE`으로 판정하고 새 명령을 금지한다.
5. 답변 생성·도구 실행·DOM 활동이 감지되면 Lease를 갱신한다.
6. Lease 만료만으로 원 작업을 자동 재전송하거나 다른 워커에게 중복 배정하지 않는다.
7. 복구 전 GitHub에 기존 결과가 게시됐는지 먼저 확인한다.

ChatGPT 컨텍스트가 일반 서버처럼 자체 heartbeat API를 호출할 수 없는 경우 Worker Adapter가 프로세스, 대화 ID, 입력창, 답변 생성 표시, 최근 메시지 및 DOM 활동을 이용해 기계 상태를 산출한다.

## X. 무응답 및 복구 규칙

답변 생성 중이거나 도구가 실행 중이면 시간과 관계없이 새로고침하지 않는다.

1. 명령 전달 후 대화가 응답 가능한 `IDLE` 상태인데 새 응답이 5분간 없으면 상태 응답을 1회 요구한다.
2. 상태 요구 후 총 15분간 응답이 없으면 정확한 `conversation_id`를 확인한 뒤 대화를 1회만 새로고침한다.
3. 새로고침 후 기존 응답 또는 GitHub 결과가 나타났는지 먼저 검사한다.
4. 원 작업 명령은 자동 재전송하지 않는다.
5. 총 30분간 유효한 응답이 없으면 `WORKER_NO_RESPONSE`로 실패 처리하고 커맨더에게 이벤트를 보낸다.
6. 로그인 만료나 대화 ID 불일치가 감지되면 즉시 `BLOCKED`로 전환한다.
7. 자동 새로고침은 명령 1건당 최대 1회다.

상태 요구 표준문은 다음과 같다.

```text
COMMAND_ID=CMD-000128

현재 대화는 응답 가능한 상태이나 결과 응답이 확인되지 않았습니다.
원 작업을 다시 실행하지 말고 ACK, RUNNING, RESULT_POSTED, BLOCKED 중 하나로 현재 상태만 답하십시오.
```

## XI. 결과 회수 및 완료 판정

다음 조건을 모두 통과해야 `COMPLETED_VERIFIED`로 판정한다.

1. 응답의 `job_id`, `command_id`, `attempt_id`, `worker_id`가 원 명령과 일치한다.
2. GitHub 결과 URL이 존재하고 지정 저장소·게시물에 속한다.
3. 결과 본문에 작업 요약, 산출물, 검증 결과, 미해결 사항이 기록되어 있다.
4. 코드 작업이면 Commit SHA 또는 PR URL이 존재한다.
5. 요구된 첨부·보고서·파일이 실제로 존재한다.
6. 검증 결과가 완료 기준과 일치한다.
7. 응답 원문 길이와 SHA-256이 내부 원장에 기록된다.
8. 같은 `job_id`의 중복 결과가 없는지 확인한다.

검증 완료 후 커맨더는 `ACK_RESULT`를 기록하고 워커를 `IDLE`로 전환한다.

## XII. Continuous Worker Pool 규칙

1. Worker 2~7은 서로 독립적으로 작업한다.
2. `WORKING` 워커에게 새 작업을 보내지 않는다.
3. `DONE` 워커의 결과를 회수·검증한 뒤 즉시 다음 적합 작업을 배정할 수 있다.
4. 한 명의 느린 워커 때문에 다른 워커의 다음 작업을 중단하지 않는다.
5. 작업 의존성이 있는 경우에만 선행 작업 완료를 기다린다.
6. Wave 번호는 계획·진행률·보고·회고를 위한 태그로 유지하되, 전원 완료 장벽으로 강제하지 않는다.
7. 상태 변경은 Event Inbox에 먼저 영구 기록한 뒤 커맨더를 깨운다.
8. 커맨더가 즉시 응답하지 않아도 이벤트는 ACK될 때까지 보존한다.

## XIII. 커맨더 이벤트 처리 루프

```text
1. 상태 변경 이벤트 수신
2. DONE 결과 회수 및 검증
3. BLOCKED·FAILED·OFFLINE 원인 분류
4. 전체 작업 그래프와 우선순위 재평가
5. IDLE 워커에 다음 작업 배정
6. Worker 1에 필요한 인수인계 변화 기록
7. 이벤트 ACK
8. 다음 이벤트까지 대기
```

지속적인 GitHub 작업 큐 polling 대신 상태 변경 이벤트를 기본으로 사용한다. 다만 Worker Adapter 프로세스 생존 여부를 위한 저빈도 health check는 허용한다.

## XIV. Worker 1 후계자 규칙

Worker 1에는 일반 구현·조사 작업을 배정하지 않는다. 다음 사건이 있을 때 인수인계 업데이트를 보낸다.

- 전체 목표·범위 변경
- 중요한 구조·기술 결정
- 주요 Wave 또는 마일스톤 종료
- 핵심 자산·저장소·경로 추가 또는 이동
- 치명적 실패, 원인 및 해결 방법
- 전체 진행률과 미완료 작업 변화
- 새 커맨더가 반드시 이어받아야 할 다음 행동

새 커맨더는 Worker 1 인수인계, GitHub 원장, Dispatcher 명령 원장, Worker 2~7 상태를 순서대로 읽은 뒤 작업을 재개한다.

## XV. 관제 및 로그 요구사항

패널은 다음을 표시한다.

- 현재 Wave와 전체 작업번호
- 워커별 현재 작업번호와 GitHub 게시물 번호
- `IDLE`, `RECEIVED`, `WORKING`, `WAITING`, `BLOCKED`, `DONE`, `FAILED`, `OFFLINE`
- 마지막 heartbeat 시각과 Lease 잔여시간
- 누적 명령·완료·오류·취소 횟수
- 현재 `command_id`, `attempt_id`, `job_id`
- 최근 상태 변경과 오류 코드

로그는 최소한 다음 필드를 가진 append-only 이벤트로 보존한다.

```text
timestamp, event_id, worker_id, job_id, command_id, attempt_id,
global_work_no, worker_work_no, wave_id, conversation_id,
previous_state, new_state, action, retry_count, refresh_count,
github_repository, github_post_number, result_url,
error_code, error_message, response_sha256
```

토큰, 쿠키, 로그인 세션, 인증 헤더는 로그나 GitHub 게시물에 기록하지 않는다.

## XVI. 금지사항

- 워커 상태를 확인하지 않고 명령 전송
- `WORKING` 워커에 중복 명령 전송
- 대화 이름만 보고 대상 선택
- GitHub 게시물 번호만 전달하고 저장소를 생략
- `DONE` 문자열만으로 완료 판정
- Lease 만료만으로 즉시 다른 워커에 재배정
- 답변 생성 중 대화 새로고침
- 동일 원 작업의 자동 반복 전송
- 패널 UI 자동 클릭을 권위 지휘 방식으로 사용
- 과거 GitHub Queue/Polling/Claim/Receipt 구조 복원

## XVII. 커맨더 발행 체크리스트

```text
[ ] 대상 worker_id와 conversation_id가 일치한다.
[ ] 워커가 IDLE이며 heartbeat와 Lease가 유효하다.
[ ] GitHub repository/type/number가 정확하다.
[ ] 동일 job_id의 완료 결과가 없다.
[ ] job_id/command_id/attempt_id/request_id가 기록됐다.
[ ] 의존성이 충족됐다.
[ ] 명령이 전송 전에 QUEUED로 원장에 기록됐다.
[ ] 결과 게시 위치와 검증 기준이 명확하다.
[ ] 무응답 복구가 원 작업을 반복 전송하지 않도록 설정됐다.
[ ] 완료 후 ACK_RESULT와 다음 작업 배정이 계획됐다.
```
