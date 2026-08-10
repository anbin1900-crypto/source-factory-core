# YOLLA 커맨더용 독립 다중 워커 통신 패널 이용방법 V1

```text
DOCUMENT_ID=YOLLA-COMMANDER-COMMUNICATION-PANEL-USER-GUIDE-V1
VERSION=1.0.0
STATUS=CANONICAL
EFFECTIVE_DATE=2026-08-10
APPLIES_TO=YOLLA Communicator V0.6.1 Commander Control
SCOPE=NEW001/YOLLA 커맨더·후계 커맨더·운영자
RECOMMENDED_PROJECT_PATH=docs/orchestration/YOLLA_COMMANDER_COMMUNICATION_PANEL_USER_GUIDE_V1.md
```

## I. 문서 목적

이 문서는 NEW001/YOLLA 커맨더가 **독립 다중 워커 통신 패널**을 이용해 여러 ChatGPT 워커를 등록·확인하고, GitHub 작업지시서를 기준으로 명령을 보내며, 상태와 결과를 안전하게 회수하는 방법을 설명한다.

이 문서의 핵심 원칙은 다음과 같다.

> 패널은 사용자가 상태를 보는 관제 UI이고, 커맨더의 권위 지휘 경로는 Direct MCP와 Commander Control API다.

커맨더는 패널을 자동 클릭해 워커를 지휘하지 않는다. 사용자는 패널에서 현재 상태를 직관적으로 확인하고, 커맨더는 API로 같은 등록 원장과 명령 원장을 사용한다.

## II. 필수 참조 규칙

작업 전 GitHub의 공용 권위 게시물과 다음 두 문서를 읽는다.

- 공용 권위 게시물: [source-factory-core Issue #87](https://github.com/anbin1900-crypto/source-factory-core/issues/87)
- [YOLLA 커맨더 지시 규칙 V1](https://github.com/anbin1900-crypto/source-factory-core/blob/main/docs/orchestration/YOLLA_COMMANDER_INSTRUCTION_RULES_V1.md)
- [YOLLA 워커 답변 규칙 V1](https://github.com/anbin1900-crypto/source-factory-core/blob/main/docs/orchestration/YOLLA_WORKER_RESPONSE_RULES_V1.md)

규칙 간 우선순위는 다음과 같다.

1. 사용자의 현재 명시적 지시
2. GitHub 작업 게시물의 목표·범위·금지사항·완료 기준
3. 커맨더 지시 규칙
4. 워커 답변 규칙
5. 이 이용방법

## III. 현재 설치 구조

```text
사용자 관제
  └─ 3340 메인페이지의 자동화프로그램
       └─ YOLLA 독립 다중 워커 통신 패널

커맨더 지휘
  └─ YOLLA_Data_Ledger.pc_health
       └─ YOLLA_Data_Ledger.pc_execute
            └─ RUN_POWERSHELL
                 └─ YOLLA_COMMANDER_CONTROL.ps1
                      └─ 127.0.0.1:37860 Commander Control API
                           ├─ Worker Registry
                           ├─ Durable Command Ledger
                           ├─ Per-worker Dispatcher
                           ├─ Conversation Target Lock
                           └─ Response Archive
```

현재 권위 설치 위치:

```text
E:\YOLLA\yolla-communicator-clean-v06
```

### 고정 경로표

| 구분 | 권위 경로 또는 주소 | 용도 |
|---|---|---|
| 사용자 진입화면 | `http://127.0.0.1:3340/` | 왼쪽 **자동화프로그램**으로 패널 실행 |
| 패널 설치 루트 | `E:\YOLLA\yolla-communicator-clean-v06` | 독립 통신기 전체 설치본 |
| 패널 시작 PowerShell | `E:\YOLLA\yolla-communicator-clean-v06\RUN_YOLLA_COMMUNICATOR_V06.ps1` | 패널 직접 시작 |
| 패널 시작 BAT | `E:\YOLLA\yolla-communicator-clean-v06\RUN_YOLLA_COMMUNICATOR_V06.bat` | 사용자 수동 시작 |
| 커맨더 공식 helper | `E:\YOLLA\yolla-communicator-clean-v06\scripts\YOLLA_COMMANDER_CONTROL.ps1` | Direct MCP에서 모든 지휘 Action 실행 |
| Commander Control API | `http://127.0.0.1:37860` | PC 내부 loopback 제어 API |
| API health | `http://127.0.0.1:37860/health` | 무인증 생존 확인 |
| 앱 메인 소스 | `E:\YOLLA\yolla-communicator-clean-v06\app\main.js` | Registry·원장·Dispatcher·API |
| 패널 화면 소스 | `E:\YOLLA\yolla-communicator-clean-v06\app\index.html` | 사용자 관제 화면 |
| 워커 레지스트리 | `E:\YOLLA\yolla-communicator-clean-v06\state\WORKER_REGISTRY.json` | 등록 워커 권위 원장 |
| 통신 원장 | `E:\YOLLA\yolla-communicator-clean-v06\state\COMMUNICATION_LEDGER.json` | 명령·상태 전이·오류 기록 |
| 응답 원문 | `E:\YOLLA\yolla-communicator-clean-v06\state\command-responses\` | 명령별 응답 원문 |
| 전용 로그인 프로필 | `E:\YOLLA\yolla-communicator-clean-v06\profile-v06-clean` | 패널 전용 ChatGPT 로그인 상태 |
| Direct Executor | `http://127.0.0.1:32110/mcp` | YOLLA PC Direct Executor V3 |

Commander Control API는 PC 내부의 `127.0.0.1:37860`에만 바인딩한다. 외부 URL이나 터널 주소로 직접 공개하지 않는다.

## IV. 사용자 자연어 지시 자동 실행 규칙

### 1. 실행 트리거

다음과 같거나 같은 의미의 사용자 지시가 들어오면 이 규칙을 즉시 적용한다.

```text
독립 다중 워커 통신 패널을 통해 작업을 지시해줘.
독립 다중 워커 통신 패널로 워커들에게 명령해줘.
등록된 워커들에게 작업을 배정해줘.
커맨더가 패널을 이용해서 워커 결과를 회수해줘.
다음 Wave를 독립 통신 패널로 실행해줘.
```

이 지시는 **계획서 작성 요청이 아니라 실제 지휘 실행 요청**으로 해석한다. 사용자가 별도로 “계획만”, “설계만”, “실행하지 마라”라고 제한한 경우에만 실행을 보류한다.

### 2. 다음 커맨더의 필수 행동

사용자가 위와 같이 지시하면 커맨더는 사용자에게 설치 경로나 PowerShell 실행을 다시 묻지 않고 다음을 수행한다.

1. 현재 도구에서 `YOLLA_Data_Ledger` 앱과 `pc_health`, `pc_execute`를 실제 탐색한다.
2. `pc_health`를 호출한다.
3. `READY`이면 `pc_execute(operation=RUN_POWERSHELL)`를 사용한다.
4. `parameters.command`에서 다음 helper를 직접 호출한다.

   ```text
   E:\YOLLA\yolla-communicator-clean-v06\scripts\YOLLA_COMMANDER_CONTROL.ps1
   ```

5. `STATUS`와 `LIST_WORKERS`를 조회한다.
6. 대상 워커마다 `PROBE_WORKER`를 실행해 등록 대화와 실제 대화가 일치하는지 확인한다.
7. 상세 작업지시가 없다면 GitHub `anbin1900-crypto/source-factory-core`에 목표·범위·입력·금지·산출물·완료 기준이 있는 작업 게시물을 먼저 만든다.
8. 워커 대화에는 GitHub 저장소 전체 이름과 Issue 번호를 포함한 짧은 표준 명령을 보낸다.
9. 워커별로 고유 `request_id`를 사용해 `SEND_COMMAND`를 실행한다.
10. 반환된 `command_id`와 `attempt_id`를 원장·진행보고에 보존한다.
11. `WAIT_COMMAND` 또는 `COMMAND_STATUS`로 상태와 응답을 회수한다.
12. 결과 게시물·Commit·PR·시험을 확인한 뒤 다음 작업을 연속 배정한다.

### 3. 다중 워커 자동 선택 규칙

사용자가 특정 워커를 지정하지 않고 “워커들에게 지시해줘”라고 말하면 다음 기준으로 선택한다.

1. Worker 1은 후계자이므로 일반 실행 작업에서 제외한다.
2. `READY`이고 `target_matched=true`인 실행 워커만 선택한다.
3. `WORKING`, `SUBMITTING`, `WAITING_READY` 워커에는 새 명령을 보내지 않는다.
4. 작업 의존성과 워커 역할을 기준으로 작업을 분배한다.
5. 같은 작업을 여러 워커에 중복 배정하지 않는다. 독립 검증을 의도한 경우에만 별도 `job_id`와 검증 목적을 명시한다.
6. 완료된 워커부터 결과를 회수·검증하고 다음 적합 작업을 배정한다.
7. 중요한 목표·구조·진행률 변화는 Worker 1에게 인수인계 작업으로 별도 전달한다.

### 4. 연결 표면이 보이지 않을 때

- `YOLLA_Data_Ledger` 앱 자체가 현재 대화에 노출되지 않았다면 터널 장애로 추측하지 않고 `CHAT_APP_NOT_ATTACHED`로 보고한다.
- 앱은 보이지만 실제 탐색 후에도 `pc_execute` 호출 표면이 없다면 `DIRECT_MCP_TOOL_NOT_EXPOSED_IN_THIS_CONTEXT`로 보고한다.
- `pc_health`가 `READY`가 아니면 워커 명령을 보내지 않고 반환된 실제 상태와 오류를 보고한다.
- `pc_health=READY`인데 Commander Control `STATUS`가 실패하면 고정 경로의 패널 시작 스크립트와 `127.0.0.1:37860/health`를 점검한다.
- 연결 확인을 실제로 시도하기 전에 “이 컨텍스트에서는 PC에 접근할 수 없다”고 단정하지 않는다.

### 5. 실행 완료 보고

커맨더는 최소한 다음 내용을 사용자에게 보고한다.

```text
현재 Wave
대상 워커
워커별 job_id / command_id
현재 상태
완료·작업 중·대기·오류 수
회수한 GitHub 결과 URL
검증 결과
다음 배정
```

## V. 역할 구분

| 역할 | 책임 |
|---|---|
| 사용자 | 패널에서 워커·상태·최근 응답을 확인하고 필요한 판단을 내린다. |
| 커맨더 | 작업을 분해하고 GitHub 지시 게시물을 만든 뒤 API로 워커에게 배정하고 결과를 검증한다. |
| Dispatcher | 워커 등록, 대상 잠금, 명령 대기열, 상태 전이, 응답 저장을 기계적으로 처리한다. |
| Worker 1 | 후계자 전용. 목표·구조·결정·진행률·실패·다음 단계를 축적한다. |
| Worker 2~7 | 기본 실행 워커 풀. 서로 독립적으로 작업한다. |
| 추가 워커 | 별도 역할을 부여한 뒤 동일 규칙으로 실행 풀 또는 예비 풀에 넣는다. |

패널에 커맨더 대화나 현재 컨텍스트가 등록돼 있더라도, 명시적 목적 없이 커맨더 자신에게 실행 명령을 보내지 않는다.

## VI. 가장 빠른 이용 순서

1. `pc_health`를 호출해 Direct Executor가 `READY`인지 확인한다.
2. Commander Control `STATUS`를 조회해 API가 `READY`인지 확인한다.
3. `LIST_WORKERS`로 등록 워커와 상태를 확인한다.
4. 작업을 보낼 워커에 `PROBE_WORKER`를 실행한다.
5. `target_matched=true`이며 상태가 `READY`인지 확인한다.
6. GitHub에 상세 작업 게시물을 만든다.
7. 저장소 전체 이름과 Issue 번호를 포함한 짧은 명령을 만든다.
8. 고유한 `request_id`로 `SEND_COMMAND`를 실행한다.
9. 반환된 `command_id`와 `attempt_id`를 보존한다.
10. `WAIT_COMMAND` 또는 `COMMAND_STATUS`로 상태와 응답을 회수한다.
11. GitHub 결과 URL·Commit·PR·시험 결과를 독립 검증한다.
12. 검증 완료 후에만 작업을 완료로 판정하고 다음 작업을 배정한다.

## VII. 패널 화면 이용방법

### 1. 패널 열기

사용자는 다음 순서로 패널을 연다.

1. [http://127.0.0.1:3340/](http://127.0.0.1:3340/)을 연다.
2. 왼쪽 메뉴의 **자동화프로그램**을 누른다.
3. `YOLLA 독립 다중 워커 통신 패널` 창이 실행되거나 기존 창이 앞으로 나온다.

반복 클릭해도 같은 단일 인스턴스를 사용한다. 구형 `automation.html`은 사용하지 않는다.

### 2. 상단 버튼

- **ChatGPT 로그인**: 독립 패널 전용 프로필에 최초 1회 로그인한다.
- **+ 워커 등록**: 워커 이름과 ChatGPT 전체 대화 URL을 등록한다.

기존 6-1 패널의 프로필·쿠키·partition을 복사하거나 재사용하지 않는다.

### 3. 왼쪽 등록 워커 영역

각 워커 카드에는 다음 정보가 표시된다.

- 워커 이름
- 현재 상태
- 등록된 ChatGPT 대화 URL

카드를 선택하면 오른쪽에 해당 워커의 상세 화면이 열린다.

### 4. 선택 워커 영역

선택된 워커 화면에는 다음 기능이 있다.

- 현재 워커 상태
- 등록 URL
- 대상 잠금 결과
- **ChatGPT 보기**
- **수정**
- **삭제**
- 명령어 입력
- 파일 첨부
- 응답 중지
- 선택 워커에게 전송
- 최근 명령 ID
- 최근 응답 또는 최근 오류

### 5. 대상 잠금

다음 문구가 확인돼야 송신할 수 있다.

```text
대상 잠금 확인: <conversation_id>
```

등록된 `conversation_id`와 실제 열린 대화 ID가 다르면 송신하지 않는다. 워커 이름이나 창의 위치만 보고 대상을 판단하지 않는다.

## VIII. 워커 등록방법

### 1. 준비

등록하려는 ChatGPT 대화의 **전체 URL**을 준비한다. 대화 목록 URL이나 ChatGPT 홈 주소가 아니라 `/c/<conversation_id>`가 포함된 실제 대화 URL이어야 한다.

### 2. 등록

1. **+ 워커 등록**을 누른다.
2. 역할이 드러나는 이름을 입력한다.
3. 정확한 전체 대화 URL을 입력한다.
4. 저장한다.
5. 등록 후 **ChatGPT 보기**로 창을 연다.
6. `PROBE_WORKER`로 대화 ID 일치를 검사한다.

권장 이름:

```text
1번워커-SUCCESSOR
2번워커-SITE-MAP
3번워커-DYNAMIC-NAV
4번워커-EXTRACTION
5번워커-VALIDATION
6번워커-UI-UX
7번워커-INTEGRATION
```

역할이 바뀌면 이름은 수정할 수 있지만 작업 중인 워커의 이름·URL·등록정보는 변경하지 않는다.

### 3. 중복 방지

같은 대화 URL 또는 같은 `conversation_id`는 두 워커로 등록할 수 없다. 중복 등록 시 `DUPLICATE_CONVERSATION_URL`로 차단된다.

## IX. 현재 패널 상태와 색상

| 패널 상태 | 색상 | 의미 | 커맨더 행동 |
|---|---|---|---|
| `READY` | 녹색 | 명령을 받을 수 있다. | 대상 잠금 확인 후 새 작업 배정 |
| `COMPLETED` | 녹색 | 응답 회수가 끝났다. | 결과를 검증한 뒤 다음 작업 결정 |
| `WORKING` | 파란색 | 워커가 답변·작업 중이다. | 건드리지 않고 기다림 |
| `SUBMITTING` | 파란색 | 명령을 입력·전송 중이다. | 중복 전송 금지 |
| `LOADING` | 파란색 | 대화 화면을 불러오는 중이다. | 로딩 종료 후 재확인 |
| `QUEUED` | 주황색 | 명령이 원장 대기열에 있다. | 재전송하지 않음 |
| `WAITING_READY` | 주황색 | 이전 답변 종료를 기다린다. | 기존 답변 종료 후 자동 전송 대기 |
| `ABORTED` | 주황색 | 커맨더가 명령을 중지했다. | 취소 결과 확인 후 필요 시 새 명령 |
| `TARGET_MISMATCH` | 빨간색 | 등록 대화와 실제 대화가 다르다. | 송신 금지, URL·대화 ID 재확인 |
| `ERROR` | 빨간색 | 명령·로그인·대상·앱 오류다. | 최근 오류와 원장을 확인 |
| `NEEDS_LOGIN` | 빨간색 | 독립 프로필 로그인이 필요하다. | 사용자가 전용 창에 로그인 |
| `NOT_OPENED` | 회색 | 워커 창을 아직 열어 확인하지 않았다. | OPEN/PROBE 실행 |

현재 V0.6.1의 UI 상태명과 장기 오케스트레이션 규칙의 `IDLE`, `RECEIVED`, `DONE`, `FAILED`, `OFFLINE`은 완전히 같은 계층이 아니다. 현재 UI의 `READY`는 운영 규칙의 `IDLE`에 가깝고, 현재 UI의 `COMPLETED`는 응답 회수 완료를 뜻한다. 최종 `COMPLETED_VERIFIED`는 커맨더가 GitHub 결과를 검증한 뒤 별도로 판정한다.

## X. 커맨더 API 이용방법

### 1. 지원 Action

| Action | 용도 |
|---|---|
| `HEALTH` | 무인증 API 생존 확인 |
| `STATUS` | 버전·상태·워커/명령 집계 |
| `LIST_WORKERS` | 전체 등록 워커 조회 |
| `REGISTER_WORKER` | 이름과 URL로 워커 등록 |
| `UPDATE_WORKER` | 워커 이름·URL 수정 |
| `DELETE_WORKER` | 워커 등록 삭제 |
| `PROBE_WORKER` | 로그인·대상 대화·상태 확인 |
| `OPEN_WORKER` | 워커 창 열기 |
| `SEND_COMMAND` | 명령 접수 후 즉시 `command_id` 반환 |
| `SEND_AND_WAIT` | 명령 접수 후 최종 상태까지 대기 |
| `COMMAND_STATUS` | 특정 명령 상태·응답 조회 |
| `LIST_COMMANDS` | 조건별 최근 명령 조회 |
| `CANCEL_COMMAND` | 대기 또는 진행 명령 취소 |
| `WAIT_COMMAND` | 특정 명령의 완료·오류·중지까지 대기 |

### 2. 기본 helper 호출

```powershell
$control = 'E:\YOLLA\yolla-communicator-clean-v06\scripts\YOLLA_COMMANDER_CONTROL.ps1'

& $control -Action STATUS
& $control -Action LIST_WORKERS
& $control -Action PROBE_WORKER -WorkerId 'WORKER-ID'
```

### 3. 명령 전송

```powershell
& $control -Action SEND_COMMAND `
  -WorkerId 'WORKER-ID' `
  -Directive 'GitHub anbin1900-crypto/source-factory-core의 Issue #123을 읽고 미수행 작업을 수행한 뒤 같은 Issue에 결과를 게시하십시오.' `
  -RequestId 'WAVE-01-WORKER-04-JOB-000041'
```

첨부파일이 있으면 PC의 실제 절대경로를 전달한다.

```powershell
& $control -Action SEND_COMMAND `
  -WorkerId 'WORKER-ID' `
  -Directive 'GitHub anbin1900-crypto/source-factory-core의 Issue #123을 읽고 작업하십시오.' `
  -Files @('E:\YOLLA\inputs\sample.zip') `
  -RequestId 'WAVE-01-WORKER-04-JOB-000041'
```

### 4. 결과 회수

```powershell
& $control -Action WAIT_COMMAND `
  -CommandId 'YOLLA-COMM-...' `
  -TimeoutSeconds 600
```

짧게 상태만 확인할 때:

```powershell
& $control -Action COMMAND_STATUS -CommandId 'YOLLA-COMM-...'
```

최근 오류 명령을 확인할 때:

```powershell
& $control -Action LIST_COMMANDS -StatusFilter 'ERROR' -Limit 20
```

### 5. Direct MCP에서 호출

커맨더는 먼저 `YOLLA_Data_Ledger.pc_health`를 호출한다. `READY`일 때 `pc_execute`의 `RUN_POWERSHELL`을 사용해 위 helper를 실행한다.

```text
operation=RUN_POWERSHELL
parameters.command=& 'E:\YOLLA\yolla-communicator-clean-v06\scripts\YOLLA_COMMANDER_CONTROL.ps1' -Action STATUS
```

API 토큰을 명령 본문에 넣지 않는다. helper가 PC 내부 토큰 파일을 읽어 loopback API에 전달한다.

## XI. GitHub 게시물 기반 명령 발행

상세 작업 내용은 GitHub Issue에 기록하고 워커 대화에는 위치와 수행·보고 규칙만 보낸다.

### 1. 작업 게시물 필수 항목

```text
JOB_ID
WAVE_ID
작업 목표
작업 범위
입력 자료
금지사항
산출물
완료 기준
검증 방법
결과 게시 위치
```

### 2. 워커에게 보내는 표준문

```text
[YOLLA WORK ORDER V1]
JOB_ID=JOB-000041
WORKER_ID=WORKER-04
WAVE_ID=WAVE-01

먼저 GitHub anbin1900-crypto/source-factory-core Issue #87의 표준 운영규칙을 읽으십시오.
그다음 GitHub anbin1900-crypto/source-factory-core Issue #123의 본문과 첨부자료를 읽고,
명시된 미수행 작업을 수행하십시오.

완료 후 결과를 Issue #123에 게시하고,
이 대화에는 command_id, status, result_url, validation을 표준 JSON으로 보고하십시오.
같은 JOB_ID의 기존 결과가 있으면 작업을 반복하지 말고 기존 결과 URL을 보고하십시오.
```

저장소를 생략한 `#123을 읽어라` 형식은 사용하지 않는다.

## XII. 명령 상태 감시

현재 명령 상태의 정상 흐름은 다음과 같다.

```text
QUEUED
→ WAITING_READY 또는 SUBMITTING
→ WORKING
→ COMPLETED
```

오류·취소 분기:

```text
QUEUED | WAITING_READY | SUBMITTING | WORKING
→ ERROR | ABORTED
```

판정 규칙:

1. `QUEUED`: 원장에 접수됐으므로 다시 보내지 않는다.
2. `WAITING_READY`: 워커가 이전 답변 중이므로 자동 전송을 기다린다.
3. `SUBMITTING`: 대상 대화에 입력 중이므로 패널과 API에서 중복 조작하지 않는다.
4. `WORKING`: 답변 생성 중이므로 새로고침·수정·삭제·새 명령을 금지한다.
5. `COMPLETED`: 응답 원문이 저장됐으므로 GitHub 결과를 검증한다.
6. `ERROR`: `error`와 대상 대화·로그인·첨부·재시작 여부를 확인한다.
7. `ABORTED`: 취소된 명령을 같은 `request_id`로 다시 보내지 않는다.

## XIII. 무응답 복구

답변 생성 표시나 도구 활동이 있으면 시간과 관계없이 새로고침하지 않는다.

1. 명령 전달 후 대화가 입력 가능한데 5분간 새 응답이 없으면 상태 확인을 1회 보낸다.
2. 상태 확인 후 총 15분간 응답이 없으면 대상 `conversation_id`를 다시 확인한다.
3. 정확한 대화가 맞을 때만 명령당 최대 1회 새로고침한다.
4. 새로고침 후 기존 응답 또는 GitHub 결과가 생겼는지 먼저 확인한다.
5. 원 작업 명령을 자동 재전송하지 않는다.
6. 총 30분간 유효한 응답이 없으면 `WORKER_NO_RESPONSE`로 실패 판정한다.

상태 확인 문구:

```text
COMMAND_ID=<기존 command_id>

현재 대화는 응답 가능한 상태이나 결과 응답이 확인되지 않았습니다.
원 작업을 다시 실행하지 말고 ACK, WORKING, RESULT_POSTED, BLOCKED 중 하나로 현재 상태만 답하십시오.
```

## XIV. 완료 검증

`COMPLETED` 또는 워커의 `DONE`만 보고 완료 처리하지 않는다. 다음을 모두 확인한다.

1. `job_id`, `command_id`, `attempt_id`, `worker_id` 일치
2. 지정 GitHub 저장소의 결과 URL 존재
3. 요구 산출물 존재
4. Commit SHA 또는 PR URL 존재
5. 시험·검증 결과 존재
6. 실패·미해결 사항 기록
7. 응답 원문 길이와 SHA-256 기록
8. 같은 `job_id`의 중복 결과 없음

모두 통과한 경우에만 내부 판정을 `COMPLETED_VERIFIED`로 바꾸고 워커를 다음 작업에 사용한다.

## XV. 취소와 재시작

### 1. 취소

- 잘못된 대상이나 잘못된 지시가 확정됐을 때만 `CANCEL_COMMAND`를 사용한다.
- `WORKING` 중 취소는 워커 답변 중지 동작을 수반할 수 있다.
- 취소 후에는 기존 명령의 GitHub 결과가 이미 생성됐는지 확인한다.
- 재시도는 새로운 `request_id`와 `attempt_id`를 사용하고 이유를 기록한다.

### 2. 앱 재시작

- `QUEUED`, `WAITING_READY`는 재시작 후 재개된다.
- 재시작 당시 `SUBMITTING`, `WORKING`이던 명령은 중복 전송 방지를 위해 `APP_RESTARTED_DURING_COMMAND` 오류로 닫힌다.
- 재시작 후 원 작업을 자동 재전송하지 않는다.
- 먼저 ChatGPT 대화와 GitHub 결과를 확인한 뒤 새 시도를 결정한다.

## XVI. 로그와 오류 확인

### 1. 권위 원장

```text
E:\YOLLA\yolla-communicator-clean-v06\state\WORKER_REGISTRY.json
E:\YOLLA\yolla-communicator-clean-v06\state\COMMUNICATION_LEDGER.json
E:\YOLLA\yolla-communicator-clean-v06\state\command-responses\
```

- `WORKER_REGISTRY.json`: 워커 이름·대화·현재 상태·최근 명령
- `COMMUNICATION_LEDGER.json`: 명령·상태 전이·오류 이벤트
- `command-responses`: 명령별 응답 원문

토큰 파일과 로그인 프로필은 로그 조사 대상이라도 화면·보고서·GitHub에 노출하지 않는다.

### 2. 주요 오류

| 오류 | 의미 | 조치 |
|---|---|---|
| `CHATGPT_LOGIN_REQUIRED` | 전용 프로필 로그인이 필요함 | 사용자가 ChatGPT 로그인 버튼으로 로그인 |
| `TARGET_CONVERSATION_MISMATCH` | 등록 대화와 열린 대화가 다름 | 등록 URL 확인 후 PROBE |
| `TARGET_CHANGED_DURING_RUN` | 작업 중 대상 대화가 바뀜 | 전송 금지, 실제 대화와 결과 확인 |
| `TARGET_CHANGED_AFTER_SEND` | 전송 직후 대상이 바뀜 | 응답 회수 중단, 오발송 여부 확인 |
| `DUPLICATE_CONVERSATION_URL` | 같은 대화를 중복 등록함 | 기존 워커 등록 사용 |
| `REQUEST_ID_CONFLICT` | 같은 요청 ID에 다른 내용 사용 | 기존 명령 확인 후 새 request_id 사용 |
| `ATTACHMENT_FILE_NOT_FOUND` | 첨부 PC 경로가 없음 | 실제 절대경로 확인 |
| `CANNOT_EDIT_WORKING_WORKER` | 작업 중 워커 수정 시도 | 작업 종료 후 수정 |
| `CANNOT_DELETE_WORKING_WORKER` | 작업 중 워커 삭제 시도 | 작업 종료 후 삭제 |
| `APP_RESTARTED_DURING_COMMAND` | 전송·작업 중 앱 재시작 | 기존 대화와 GitHub 결과 확인 후 재시도 판단 |
| `COMMAND_WAIT_TIMEOUT` | helper 대기시간 초과 | COMMAND_STATUS로 실제 상태 확인 |

오류가 발생하면 무조건 재전송하지 않고 다음 순서로 조사한다.

```text
STATUS
→ LIST_WORKERS
→ PROBE_WORKER
→ COMMAND_STATUS
→ COMMUNICATION_LEDGER 이벤트
→ ChatGPT 실제 대화
→ GitHub 결과 존재 여부
→ 재시도 또는 다른 워커 배정
```

## XVII. Continuous Worker Pool 운영

Wave는 기록·진행률 관리를 위해 유지하지만 느린 워커를 기다리는 전원 완료 장벽으로 사용하지 않는다.

```text
Worker 2 DONE → 결과 검증 → 즉시 다음 적합 작업
Worker 3 WORKING → 유지
Worker 4 READY → 새 작업 배정
Worker 5 ERROR → 원인 분석
Worker 6 WAITING_READY → 자동 전송 대기
Worker 7 READY → 새 작업 배정
```

한 워커에는 한 번에 명령 1건만 실행한다. 서로 다른 READY 워커는 병렬로 사용할 수 있다.

## XVIII. 현재 버전에서 보이는 것과 아직 남은 것

현재 V0.6.1에서 확인 가능한 항목:

- 워커 등록 수
- 워커별 현재 상태
- 대상 대화 잠금
- 최근 명령 ID
- 최근 응답 또는 오류
- 전체 활성·대기·완료 명령 집계
- 명령별 응답 원문·길이·SHA-256

아직 패널 UI에 완전 구현되지 않은 항목:

- 워커별 명시적 heartbeat 시각
- Lease 잔여시간
- `global_work_no`, `worker_work_no`, `wave_id` 전용 표시
- `IDLE/RECEIVED/BLOCKED/DONE/FAILED/OFFLINE` 통합 색상 체계
- 오류 로그 전용 검색·필터 화면
- 상태 변경 이벤트가 커맨더를 자동으로 깨우는 완전한 Event Inbox
- 결과 검증 후 다음 작업을 자동 생성하는 오케스트레이션

이 항목은 커맨더 지시 규칙의 목표 계약이며, UI에 보이지 않는 값을 현재 구현됐다고 추정하지 않는다.

## XIX. 커맨더 시작 체크리스트

```text
[ ] Direct Executor pc_health가 READY다.
[ ] Commander Control STATUS가 READY다.
[ ] 등록 워커 수와 역할을 확인했다.
[ ] 대상 worker_id와 conversation_id가 일치한다.
[ ] 대상 워커가 READY다.
[ ] GitHub Issue #87의 표준 운영규칙을 읽었다.
[ ] 상세 작업 게시물의 repository/type/number가 정확하다.
[ ] 기존 동일 job_id 결과가 없다.
[ ] 고유 request_id를 만들었다.
[ ] SEND_COMMAND가 command_id를 반환했다.
[ ] 완료 후 GitHub 결과·Commit·시험을 검증할 준비가 됐다.
```

## XX. 커맨더 종료·인수인계 체크리스트

```text
[ ] 모든 진행 명령의 command_id와 상태를 기록했다.
[ ] COMPLETED 결과를 검증했다.
[ ] ERROR/BLOCKED 작업의 원인과 다음 조치를 기록했다.
[ ] Worker 1 후계자에게 목표·결정·진행률·실패·다음 단계를 갱신했다.
[ ] GitHub 권위 게시물에 결과와 검증 근거를 남겼다.
[ ] 토큰·쿠키·세션·실제 비공개 대화 URL을 게시하지 않았다.
```

## XXI. 절대 금지사항

- 패널 UI 자동 클릭을 권위 통신 방식으로 사용
- 워커 상태와 대상 잠금을 확인하지 않고 전송
- `WORKING` 또는 `SUBMITTING` 워커에 중복 전송
- 답변 생성 중 새로고침
- 저장소 이름 없이 Issue 번호만 지시
- `DONE` 문자열만으로 완료 판정
- 같은 `request_id`를 다른 명령에 재사용
- 작업 중 워커 URL 수정·삭제
- 토큰·쿠키·로그인 세션·인증 헤더 공개
- GitHub Queue/Polling/Claim/Receipt 운반 구조 복원
- YOLLA 6-1 실행파일·프로필·partition 재사용

이 이용방법은 V0.6.1의 실제 기능을 기준으로 하며, 향후 패널 기능이 변경되면 버전·화면·상태표·API Action을 함께 갱신한다.
