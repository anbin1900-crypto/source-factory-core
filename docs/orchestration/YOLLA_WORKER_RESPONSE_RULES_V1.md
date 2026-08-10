# YOLLA 워커 답변 규칙 V1

```text
DOCUMENT_ID=YOLLA-WORKER-RESPONSE-RULES-V1
VERSION=1.0.0
STATUS=CANONICAL
EFFECTIVE_DATE=2026-08-10
SCOPE=NEW001/YOLLA 장기 다중 ChatGPT 워커 상태·결과 보고
RECOMMENDED_PROJECT_PATH=docs/orchestration/YOLLA_WORKER_RESPONSE_RULES_V1.md
```

## I. 목적

이 문서는 YOLLA 워커가 커맨더 명령을 수신하고, GitHub 작업지시서를 읽어 작업하며, 상태와 결과를 기계 판독 가능한 형식으로 보고하는 표준 규칙을 정의한다.

워커의 답변은 단순한 “작업완료”가 아니다. 반드시 어느 작업·명령·시도에 대한 결과인지 확인할 수 있어야 한다.

## II. 권위 원칙

1. 커맨더가 전달한 `job_id`, `command_id`, `attempt_id`, `worker_id`를 답변 전체에서 유지한다.
2. 상세 작업지시는 명령에 지정된 GitHub 게시물의 본문과 첨부자료를 권위로 삼는다.
3. 작업 결과는 지정된 GitHub 게시물 또는 명시된 결과 위치에 게시한다.
4. ChatGPT 대화에는 상태와 결과 위치를 표준 JSON으로 보고한다.
5. GitHub 결과 게시가 확인되지 않으면 `DONE`으로 보고하지 않는다.
6. 같은 `job_id`의 기존 결과가 이미 있으면 작업을 반복하지 않고 기존 결과를 보고한다.

## III. 명령 수신 검사

워커는 명령을 받으면 다음을 확인한다.

1. `worker_id`가 자신의 등록 ID와 일치하는가.
2. `command_id`, `job_id`, `attempt_id`가 모두 존재하는가.
3. GitHub `repository`, `type`, `number`가 모두 명시됐는가.
4. 지정 게시물과 첨부자료를 실제로 읽을 수 있는가.
5. 게시물에 목표, 범위, 입력자료, 금지사항, 산출물, 완료 기준이 있는가.
6. 같은 `job_id`의 완료 결과가 이미 게시되어 있는가.
7. 필요한 파일·권한·도구·환경이 준비되어 있는가.

대상 불일치가 발견되면 작업을 시작하지 않고 `BLOCKED`로 보고한다.

## IV. 명령 수신 응답

명령을 수신하고 실행 가능하면 다음 응답을 사용한다.

```json
{
  "worker_id": "WORKER-04",
  "job_id": "JOB-000041",
  "command_id": "CMD-000128",
  "attempt_id": "ATT-001",
  "status": "RECEIVED",
  "instruction_ref": "github:anbin1900-crypto/source-factory-core/issues/123",
  "received_at": "2026-08-10T09:00:00+09:00"
}
```

수신 응답 이후 즉시 작업을 시작할 수 있으면 별도의 장문 설명 없이 진행한다. Worker Adapter가 답변 생성·도구 실행 활동을 감지해 `WORKING` 상태를 산출한다.

## V. 작업 수행 규칙

1. GitHub 게시물과 모든 지정 첨부자료를 먼저 읽는다.
2. 게시물에 기록된 미수행 작업만 수행한다.
3. 이미 완료된 작업과 기존 결과를 중복 생성하지 않는다.
4. 허용된 범위 밖의 파일·서비스·저장소를 변경하지 않는다.
5. 작업 중 발견한 가정·결함·제약을 결과 보고서에 기록한다.
6. 요청된 테스트와 실제 검증을 수행한다.
7. 로컬 완료 주장만 남기지 말고 GitHub 결과·Commit·PR·첨부자료로 근거를 남긴다.
8. 실패를 숨기거나 `PASS`로 바꾸지 않는다.
9. 인증정보, 쿠키, 토큰, 세션 URL, 비밀값을 결과에 게시하지 않는다.

## VI. 워커 상태 응답 규칙

워커가 사용할 수 있는 외부 상태는 다음과 같다.

- `RECEIVED`: 명령과 GitHub 지시서를 정상 수신했다.
- `WORKING`: 작업을 수행 중이다.
- `BLOCKED`: 외부 입력·권한·자료·사용자 결정이 필요하다.
- `RESULT_POSTED`: 결과를 GitHub에 게시했고 커맨더 검증을 기다린다.
- `DONE`: 결과 게시 및 필수 자체 검증을 완료했다.
- `FAILED`: 작업을 완료할 수 없는 실패가 발생했다.
- `ACK`: 무응답 확인 요청을 받았으며 대화가 정상이다.

워커가 실제로 답변 생성 중일 때 Dispatcher는 UI 활동을 통해 `WORKING`을 판정하므로, 작업을 중단하고 중간 답변을 만들 필요는 없다.

## VII. 상태 확인 요구에 대한 답변

커맨더가 다음과 같은 상태 확인을 보내면 원 작업을 처음부터 다시 수행하지 않는다.

```text
원 작업을 다시 실행하지 말고 ACK, RUNNING, RESULT_POSTED, BLOCKED 중 하나로 현재 상태만 답하십시오.
```

정상 대기 상태라면 다음처럼 답한다.

```json
{
  "worker_id": "WORKER-04",
  "command_id": "CMD-000128",
  "status": "ACK",
  "detail": "READY_FOR_STATUS_RECOVERY",
  "reported_at": "2026-08-10T09:05:00+09:00"
}
```

작업이 계속 진행 중임을 확인할 수 있다면 다음처럼 답한다.

```json
{
  "worker_id": "WORKER-04",
  "command_id": "CMD-000128",
  "status": "WORKING",
  "progress_summary": "GitHub 지시서의 검증 단계 수행 중",
  "reported_at": "2026-08-10T09:05:00+09:00"
}
```

이미 결과를 게시했다면 작업을 반복하지 않고 결과 URL을 반환한다.

## VIII. BLOCKED 답변 규칙

다음 상황에서는 임의로 추측하거나 범위를 확장하지 않고 `BLOCKED`로 보고한다.

- GitHub 게시물이나 첨부자료를 읽을 수 없음
- 명령의 worker ID 또는 대화 대상 불일치
- 필요한 권한·로그인·승인 부족
- 필수 입력자료 누락
- 서로 충돌하는 지시
- 작업 범위를 벗어나는 변경이 필요함
- 사용자 또는 커맨더의 선택 없이는 결과가 달라짐

표준 형식은 다음과 같다.

```json
{
  "worker_id": "WORKER-04",
  "job_id": "JOB-000041",
  "command_id": "CMD-000128",
  "attempt_id": "ATT-001",
  "status": "BLOCKED",
  "error_code": "GITHUB_INSTRUCTION_UNAVAILABLE",
  "blocking_reason": "지정 Issue 첨부자료를 읽을 수 없음",
  "required_action": "첨부 권한 또는 대체 자료 제공",
  "safe_to_retry": true,
  "reported_at": "2026-08-10T09:06:00+09:00"
}
```

`BLOCKED` 상태에서는 원 작업을 반복하거나 다른 방법으로 권한을 우회하지 않는다.

## IX. GitHub 결과 게시 규칙

결과 게시물에는 최소한 다음 내용을 포함한다.

```text
COMMAND_ID
JOB_ID
ATTEMPT_ID
WORKER_ID
작업 목표
수행 내용
변경 파일 또는 산출물
검증 방법
검증 결과
Commit SHA 또는 PR URL
발견된 오류와 해결 내용
남은 문제
다음 권장 작업
완료 시각
```

결과는 기본적으로 지시를 받은 같은 Issue에 댓글로 게시한다. 커맨더가 별도 PR·Issue·게시판 위치를 지정한 경우에만 그 위치를 사용한다.

## X. 완료 답변 계약

GitHub 결과 게시와 자체 검증이 끝난 뒤 다음 JSON을 대화창에 반환한다.

```json
{
  "worker_id": "WORKER-04",
  "job_id": "JOB-000041",
  "command_id": "CMD-000128",
  "attempt_id": "ATT-001",
  "global_work_no": 128,
  "worker_work_no": 19,
  "wave_id": "WAVE-01",
  "status": "DONE",
  "result_summary": "사이트 메뉴 탐색 모듈 구현 및 검증 완료",
  "result_url": "https://github.com/anbin1900-crypto/source-factory-core/issues/123#issuecomment-0000000000",
  "artifact_refs": [
    "commit:abc123def456",
    "report:site-analyzer-test.md"
  ],
  "validation": {
    "status": "PASS",
    "tests_total": 18,
    "tests_passed": 18,
    "tests_failed": 0
  },
  "remaining_issues": [],
  "next_recommendation": "동적 메뉴 탐색 통합 작업 배정",
  "finished_at": "2026-08-10T09:15:00+09:00"
}
```

다음 필드는 완료 응답에서 필수다.

```text
worker_id
job_id
command_id
attempt_id
status
result_summary
result_url
artifact_refs
validation
finished_at
```

## XI. RESULT_POSTED와 DONE의 차이

- `RESULT_POSTED`: GitHub 결과는 게시했지만 필수 검증 또는 산출물 확인이 아직 남아 있다.
- `DONE`: GitHub 결과 게시, 필수 산출물 생성, 자체 검증이 모두 끝났다.
- `COMPLETED_VERIFIED`: 커맨더가 결과를 독립적으로 확인한 뒤 내부적으로 부여하는 상태다. 워커가 스스로 선언하지 않는다.

워커는 커맨더가 `ACK_RESULT`를 보낼 때까지 해당 명령의 식별정보와 결과 URL을 유지한다.

## XII. 실패 답변 규칙

작업이 복구 불가능하게 실패했을 때 다음 형식으로 보고한다.

```json
{
  "worker_id": "WORKER-04",
  "job_id": "JOB-000041",
  "command_id": "CMD-000128",
  "attempt_id": "ATT-001",
  "status": "FAILED",
  "error_code": "VALIDATION_FAILED",
  "error_summary": "필수 시험 사이트 3개 중 2개에서 탐색 실패",
  "completed_parts": [
    "정적 메뉴 수집기 구현",
    "시험 사이트 1 검증"
  ],
  "artifact_refs": [
    "commit:abc123def456",
    "log:validation-failure.json"
  ],
  "safe_to_retry": true,
  "retry_recommendation": "동적 렌더링 대기 조건 수정 후 새 attempt_id로 재시도",
  "reported_at": "2026-08-10T09:15:00+09:00"
}
```

실패했더라도 생성된 유효 산출물과 검증 로그는 GitHub 결과 게시물에 남긴다.

## XIII. 중복 명령 및 재시작 규칙

1. 같은 `job_id`와 같은 지시 게시물을 다시 받으면 기존 결과를 먼저 검색한다.
2. 검증 가능한 기존 결과가 있으면 작업을 반복하지 않고 `RESULT_POSTED`와 기존 URL을 반환한다.
3. 같은 `command_id`가 다시 도착하면 새 작업으로 취급하지 않는다.
4. 새로운 `attempt_id`가 있더라도 커맨더가 재시도 이유를 명시하지 않으면 임의 재실행하지 않는다.
5. 대화 새로고침 후에는 마지막 명령, GitHub 결과, 현재 대화 ID를 확인한 뒤 상태만 복원한다.
6. 새로고침 자체를 새로운 명령으로 해석하지 않는다.
7. 일부 작업이 완료된 상태에서 재시도할 경우 완료 부분을 재사용하고 중복 변경을 피한다.

## XIV. Worker 1 후계자 답변 규칙

Worker 1은 일반 실행 결과 대신 인수인계 상태를 관리한다. 업데이트 요청을 받으면 다음 항목을 GitHub 권위 인수인계 게시물에 기록하고 결과 URL을 보고한다.

```text
전체 목표
현재 아키텍처
확정된 결정사항
현재 Wave 및 전체 진행률
Worker 2~7의 역할과 상태
핵심 저장소·경로·문서·산출물
완료 작업
진행 중 작업
BLOCKED·FAILED 작업과 원인
실패에서 얻은 교훈
다음 커맨더가 수행할 우선순위
최종 갱신 시각
```

후계자는 추측으로 진행률을 만들지 않고 Dispatcher 원장과 GitHub 결과로 확인된 내용만 기록한다.

## XV. 금지사항

- 식별자 없이 “완료” 또는 “작업완료”만 답변
- GitHub 결과 URL 없이 `DONE` 보고
- 다른 워커의 명령 수행
- 같은 `job_id`의 작업 중복 실행
- 오류·실패·테스트 실패 은폐
- 결과가 없는데 `PASS` 보고
- 권한을 우회하거나 요청 범위를 임의 확장
- 토큰·쿠키·세션·인증정보 게시
- 새로고침 후 원 작업 자동 반복
- 커맨더 검증 전 `COMPLETED_VERIFIED` 선언

## XVI. 워커 완료 전 체크리스트

```text
[ ] worker_id/job_id/command_id/attempt_id가 원 명령과 일치한다.
[ ] 지정 GitHub 게시물과 첨부자료를 모두 읽었다.
[ ] 기존 동일 job_id 결과의 중복 여부를 확인했다.
[ ] 게시물의 완료 기준을 충족했다.
[ ] 요청된 테스트와 실제 검증을 수행했다.
[ ] 결과를 지정 GitHub 위치에 게시했다.
[ ] 결과 URL과 Commit·PR·산출물 참조가 유효하다.
[ ] 실패와 남은 문제를 숨기지 않았다.
[ ] 비밀정보가 결과에 포함되지 않았다.
[ ] 대화 답변이 유효한 표준 JSON이다.
```
