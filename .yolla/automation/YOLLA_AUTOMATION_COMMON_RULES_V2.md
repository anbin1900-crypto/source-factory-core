# YOLLA 공통 자동화·Commander Epic 제출 호환규칙 V2

```text
POLICY_ID=YOLLA_AUTOMATION_COMMON_RULES_V2
STATUS=ACTIVE_COMPATIBILITY_LAYER
SCOPE=ALL_AUTOMATION_GROUPS
OFFICIAL_AUTOMATION_RUNTIME=WORKER_JOB_SCHEDULE_V1
OFFICIAL_TRANSPORT=LOCAL_DURABLE_FILE_QUEUE_V1
COMMANDER_INPUT=YOLLA_COMMANDER_EPIC_SUBMISSION_V2
RESULT_AUTHORITY=GITHUB_REMOTE_COMMITTED_RESULT_JSON
PR_COMMENT_ROLE=POINTER_ONLY
NEW_RUNTIME=false
NEW_TRANSPORT=false
PRODUCTION=false
READY=false
MERGE=false
```

## I. 목적

모든 자동화 그룹의 커맨더가 워커별 실행 Epic을 동일한 `EPIC.json` 형식으로 제출하고,
기존 PC Agent 자동화 Runtime이 이를 기존 `WORKER_JOB_SCHEDULE_V1`로 변환하여
사용자 수동 전달 없이 워커별 작업을 순차·병렬 실행하도록 한다.

이 문서는 기존 자동화 Runtime·Queue·상관관계·보고 계약을 대체하지 않는다.
`EPIC.json`은 커맨더의 불변 작업계획 입력이며, Runtime 상태 원장이 아니다.

## II. 사용자의 유일한 지시

```text
GitHub의 `.yolla/automation/YOLLA_AUTOMATION_COMMON_RULES_V2.md`를 읽고,
규칙에 따라 각 워커의 실행 Epic을 GitHub에 `EPIC.json`으로 게시한 후
PC Agent가 즉시 사용할 수 있는 동일 파일을 다운로드로 제출하라.
```

사용자는 워커별 프롬프트 작성, 순번 관리, 결과 확인, 다음 작업 전달을 수행하지 않는다.

## III. 기존 권위 보존

다음 기존 계약을 그대로 보존한다.

```text
WORKER_JOB_SCHEDULE_V1
A0_EXECUTION_QUEUE_AND_AUTOMATION_CYCLE_V1
A0_REPORTING_AND_HANDOFF_CONTRACT_V1
YOLLA_SOURCE_FACTORY_PC_AGENT_INTEGRATION_CONTRACT_V1
LOCAL_DURABLE_FILE_QUEUE_V1
P1_COMMAND_CORRELATION_CONTRACT
```

이 규칙으로 다음을 새로 만들지 않는다.

```text
두 번째 PC Agent Runtime
두 번째 Queue·Transport
두 번째 Schedule Runner
경쟁 GitHub Result Watcher
기존 Runtime과 병렬인 별도 상태 원장
```

## IV. 역할

### 1. 커맨더

커맨더는 다음만 수행한다.

```text
공동규칙 읽기
→ 담당 워커별 Epic 작성
→ EPIC.json Schema 검증
→ GitHub 권위 경로에 Commit
→ Control PR에 Pointer 댓글 게시
→ Commit된 것과 Byte가 동일한 EPIC.json 다운로드 제출
```

### 2. PC Agent

PC Agent는 다음을 수행한다.

```text
EPIC.json 수신
→ GitHub Commit본·SHA-256 대조
→ Schema·의존성·식별자 검증
→ 기존 WORKER_JOB_SCHEDULE_V1로 결정론적 변환
→ 기존 Worker Route에 결속
→ 워커 간 병렬·같은 워커 내부 순차 배포
→ GitHub Commit 결과 감시
→ PASS 후 다음 Epic 자동 배포
→ 재시작 후 Latest Committed State부터 재개
```

### 3. 워커

워커는 PC Agent가 지정한 `EPIC_ID` 한 건만 End-to-End로 수행한다.

```text
분석
→ 수정
→ 실행
→ 실패 분석
→ 직접 교정
→ 재실행
→ 검증
→ GitHub Commit
→ Result JSON Commit
→ PR Pointer 댓글
```

첫 실패는 Terminal이 아니다.

## V. 커맨더 제출물

커맨더가 제출하는 파일은 하나다.

```text
EPIC.json
```

ZIP, YAML, 워커별 TXT, 중복 설명 보고서는 기본 제출물로 사용하지 않는다.

권위 경로:

```text
.yolla/epics/<PACKAGE_ID>/EPIC.json
```

Schema:

```text
.yolla/automation/COMMANDER_EPIC_SUBMISSION_V2.schema.json
```

### 1. 필수 최상위 필드

```text
schema_version
package_id
project_id
group_id
commander_id
created_at
registration
workers
```

### 2. Worker 필수 필드

```text
worker_id
worker_slot_uid
repository
control_pr
enabled
epics
```

### 3. Epic 필수 필드

```text
sequence
epic_id
directive_id
title
instruction
done_when
depends_on
expected_terminal
retry_limit
```

### 4. EPIC.json 금지 필드

```text
status
attempt
result
result_pointer
local_pc_path
worker_session
credential
token
secret
dispatch_prompt
runtime_state
```

실행상태와 결과는 입력 파일에 덮어쓰지 않는다.

## VI. Epic 작성규칙

1. 한 Epic은 한 워커가 한 번의 배정 범위에서 End-to-End로 종결할 수 있는 결과 단위다.
2. 워커별 Epic 개수를 동일하게 맞추지 않는다.
3. `sequence`는 워커별로 1부터 시작하며 중복 없이 연속되어야 한다.
4. `epic_id`와 `directive_id`는 패키지 전체에서 고유해야 한다.
5. `done_when`은 실제 PASS 판정이 가능한 측정 조건이어야 한다.
6. `depends_on`은 같은 `EPIC.json` 안의 `epic_id`만 참조한다.
7. 순환 의존성을 금지한다.
8. 비밀값·토큰·인증정보를 기록하지 않는다.
9. Commit 후 작업내용 변경이 필요하면 기존 파일을 덮어쓰지 않고 새 `package_id`를 발급한다.
10. 비가역 외부효과는 명시적 사용자 권한 없이는 Epic 실행범위에 포함하지 않는다.

## VII. GitHub 등록

커맨더는 `EPIC.json`을 권위 경로에 Commit한 뒤 같은 Control PR에 다음 Pointer를 게시한다.

```text
YOLLA_EPIC_REGISTRATION_V2
PACKAGE_ID=<PACKAGE_ID>
PROJECT_ID=<PROJECT_ID>
GROUP_ID=<GROUP_ID>
COMMANDER_ID=<COMMANDER_ID>
EPIC_FILE_PATH=.yolla/epics/<PACKAGE_ID>/EPIC.json
EPIC_COMMIT_SHA=<EXACT_40_HEX_SHA>
EPIC_SHA256=<EXACT_64_HEX_SHA256>
WORKER_COUNT=<COUNT>
EPIC_COUNT=<COUNT>
```

PR 댓글은 Pointer다. 공식 입력은 정확한 Commit에 저장된 `EPIC.json`이다.

## VIII. 기존 Schedule로의 결정론적 변환

PC Agent는 `EPIC.json`을 기존 `WORKER_JOB_SCHEDULE_V1`로 변환한다.

| EPIC.json | WORKER_JOB_SCHEDULE_V1 / Runtime |
|---|---|
| `package_id` | `schedule_id`, `cycle_id` |
| `project_id` | `project_id` |
| `commander_id` | `commander` |
| `worker_id` | `workers` key |
| `worker_slot_uid` | `worker_slot_uid` |
| `repository` | job `repository` |
| `control_pr` | job `pr` |
| `sequence` | job `order` |
| `epic_id` | `job_id`, `assignment_id` |
| `directive_id` | `directive_id` |
| `instruction` | job `command`의 작업 본문 |
| `depends_on` | job `depends_on` |
| `expected_terminal` | job `expected_terminal` |
| `retry_limit` | job `retry_limit` |

PC Agent가 생성하는 식별자:

```text
command_id=CMD--<PACKAGE_ID>--<EPIC_ID>
cycle_id=<PACKAGE_ID>
wave_id=SEQ-<SEQUENCE_3_DIGITS>
assignment_id=<EPIC_ID>
source_github_ref=<REPOSITORY>@<EPIC_COMMIT_SHA>:<EPIC_FILE_PATH>
duplicate_prompt_key=SHA256(command_id + worker_slot_uid + cycle_id + wave_id)
```

`work_id`, `execution_id`, `attempt_id`는 기존 Queue 계약에 따라 Runtime이 생성한다.

## IX. 작업 선택과 배포

각 워커에서 다음 조건을 모두 만족하는 Epic 중 `sequence`가 가장 낮은 한 건을 선택한다.

```text
유효 PASS Result가 없음
depends_on의 모든 Epic이 PASS
같은 worker_slot_uid에서 다른 Epic이 RUNNING이 아님
Worker Route가 활성 상태
```

실행방식:

```text
워커 간=병렬
같은 워커 내부=순차
한 번의 Dispatch=Epic 1건
```

워커에게 “미완료 작업을 스스로 찾아라”라고 지시하지 않는다.
PC Agent가 정확한 `EPIC_ID`를 지정한다.

## X. 워커 Dispatch 최소본문

```text
REPOSITORY=<REPOSITORY>
CONTROL_PR=#<CONTROL_PR>
PACKAGE_ID=<PACKAGE_ID>
WORKER_ID=<WORKER_ID>
WORKER_SLOT_UID=<WORKER_SLOT_UID>
EPIC_ID=<EPIC_ID>
DIRECTIVE_ID=<DIRECTIVE_ID>
COMMAND_ID=<COMMAND_ID>
CYCLE_ID=<CYCLE_ID>
WAVE_ID=<WAVE_ID>
DUPLICATE_PROMPT_KEY=<DUPLICATE_PROMPT_KEY>

GitHub에 Commit된 EPIC.json에서 위 EPIC_ID 한 건만 읽고 End-to-End로 수행하라.
완료 후 Result Schema에 맞는 RESULT.json을 Commit하고 같은 PR에는 Pointer만 게시하라.
```

## XI. 결과 권위

결과 Schema:

```text
.yolla/automation/EPIC_RESULT_V2.schema.json
```

권위 결과 경로:

```text
.yolla/results/<PACKAGE_ID>/<EPIC_ID>/<ATTEMPT_ID>/RESULT.json
```

PR 댓글 형식:

```text
YOLLA_EPIC_RESULT_POINTER_V2
PACKAGE_ID=<PACKAGE_ID>
EPIC_ID=<EPIC_ID>
ATTEMPT_ID=<ATTEMPT_ID>
TERMINAL_STATUS=<PASS|BLOCKED_EXTERNAL>
RESULT_FILE_PATH=<PATH>
RESULT_COMMIT_SHA=<EXACT_40_HEX_SHA>
RESULT_SHA256=<EXACT_64_HEX_SHA256>
```

PC Agent는 댓글 문구만으로 PASS 처리하지 않는다.
정확한 Commit의 Result JSON을 Readback하고 Schema·SHA·상관관계 필드를 검증한다.

## XII. Terminal과 재시도

외부 공개 Terminal:

```text
PASS
BLOCKED_EXTERNAL
```

기존 Runtime 내부 상태와 `DUPLICATE_PROMPT_SUPPRESSED` 등 기존 내부 Terminal은 그대로 보존한다.

`BLOCKED_EXTERNAL`은 다음 조건을 모두 충족할 때만 허용한다.

1. 담당 범위 안의 합리적 교정·재실행을 수행함
2. 동일 실패가 두 번 반복되면 Source·명령·경로·순서·도구·방법 중 하나 이상을 변경함
3. 남은 원인이 권한·계정·외부 서비스·물리장치 등 담당 범위 밖임
4. 정확한 실패 증거와 필요한 외부조치가 Result에 기록됨

## XIII. 중복실행·재시작

1. 동일 `duplicate_prompt_key`의 유효 PASS가 있으면 재실행하지 않는다.
2. 동일 Payload의 중복 제출은 기존 Runtime의 중복억제 Receipt로 종결한다.
3. 같은 워커에서는 동시에 하나의 Epic만 RUNNING으로 유지한다.
4. 재시작 시 GitHub Commit 결과와 기존 Schedule State를 Readback한 뒤 다음 미완료 Epic부터 재개한다.
5. 완료된 Epic을 기본적으로 재실행하지 않는다.
6. GitHub 입력 SHA와 다운로드 파일 SHA가 다르면 Dispatch하지 않는다.

## XIV. 기존 보고계약과의 관계

기존 START·PROGRESS·TEST·BLOCKER·FINAL 보고계약은 해당 작업이 요구할 때 유지한다.

이 V2가 공통 자동화를 위해 반드시 요구하는 최소 결과는 다음뿐이다.

```text
Remote Commit
Schema-valid RESULT.json
Control PR Pointer
```

기존 작업별 계약이 더 엄격하면 기존 계약이 우선한다.
PR 댓글을 공식 결과 원본으로 승격하지 않는다.

## XV. 비가역 외부효과

다음은 별도 사용자 권한 없이는 수행하지 않는다.

```text
공개 Production 배포
결제·정산
외부 고객 발송
복구본 없는 원본 삭제
비밀정보 외부 게시
Merge 또는 Ready 전환
```

## XVI. 충돌 시 우선순위

```text
1. 사용자의 최신 명시적 지시
2. 기존 Runtime·Transport·Correlation·Reporting 권위계약
3. 본 V2 호환규칙
4. 프로젝트별 Epic
```

본 V2는 기존 계약을 단순화된 커맨더 입력과 연결하는 호환계층이다.
기존 Runtime을 대체하거나 기존 권위를 약화하지 않는다.
