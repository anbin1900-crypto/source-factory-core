# 욜라 패널·워크스테이션 전체 구조 및 영구 인수인계 원장

문서 ID: `YOLLA-PANEL-WORKSPACE-MASTER-STRUCTURE-V1-20260809`  
기준 시각: `2026-08-09 KST`  
대상 저장소: `anbin1900-crypto/source-factory-core`  
문서 목적: 기존 대화나 특정 AI 컨텍스트가 사라져도 제3자가 욜라 패널과 워크스테이션의 계보, 구조, 경계, 실행 경로, 상태, 로그, 복구 순서를 이해하고 후속 조사를 시작할 수 있게 한다.

---

## 0. 가장 먼저 읽을 결론

1. `패널`과 `워크스테이션(Workspace)`은 같은 화면이 아니다.
2. 패널은 상태 확인·열기·집중·정렬·재시작·로그 진입을 담당한다.
3. 워크스테이션은 워커 지휘와 사이트 분석·추출을 실행하는 작업면이다.
4. 두 화면은 Electron Host를 공유할 수 있지만 UI 파일, 상태, IPC, 브라우저 세션의 소유권은 분리해야 한다.
5. GitHub에는 V5, Minimal, 역사적 V6 시제품이 함께 존재한다. 이름만 보고 현재 실행 권위로 판단하면 안 된다.
6. 현재 대상 PC 작업 권위로 지시된 루트는 `E:\YOLLA_PANEL_6-1`, 앱 루트는 `E:\YOLLA_PANEL_6-1\app`이다.
7. 과거 PR #84의 `E:\YOLLA\panel-v6`/6.0.2 계통은 중요한 재사용·복구 자료지만, 최신 사용자 지시상 향후 독립 V6의 공식 실행 권위로 자동 승격하지 않는다.
8. 향후 독립 V6부터 모든 실행을 공식 기록한다. 기록되지 않은 실행은 V6 공식 실행으로 판정하지 않는다.
9. 기존 V5, Minimal, 과거 V6, `E:\YOLLA_PANEL_6-1`은 삭제·덮어쓰기 전에 반드시 읽기 전용 Inventory와 Hash를 남긴다.
10. `PRODUCTION`, `READY`, `MERGE`, `LIVE PASS`는 Target-PC Receipt 없이 선언하지 않는다.

---

## I. 사실 등급과 판정 규칙

이 문서는 서로 다른 시점의 GitHub 원장, Target-PC 보고, 사용자 지시를 합친 문서다. 모든 항목은 다음 등급으로 읽는다.

| 등급 | 의미 | 사용 방법 |
|---|---|---|
| `VERIFIED_GITHUB` | GitHub 파일·PR·Commit에서 직접 확인 | 소스/계약 권위로 사용 가능 |
| `VERIFIED_TARGET_PC` | Target-PC 실행 Receipt 또는 사용자 화면 확인이 존재 | 해당 시점의 실가동 증거 |
| `CURRENT_DIRECTIVE` | 사용자의 최신 명시적 지시 | 이전 설계와 충돌하면 우선 적용 |
| `HISTORICAL` | 과거에 유효했으나 현재 권위로 자동 승격 금지 | 복구·비교·재사용 근거 |
| `REPORTED_NOT_REVERIFIED` | 다른 컨텍스트가 보고했으나 현재 문서 작성 시 재실행 검증 안 됨 | 재검증 전 PASS 금지 |
| `DESIGN_REQUIRED` | 앞으로 구현해야 하는 계약 또는 요구사항 | 구현 완료로 오인 금지 |
| `UNKNOWN` | 정확한 파일·Hash·Receipt가 아직 없음 | 추측하지 말고 Inventory 수행 |

권위 충돌 시 우선순위:

```text
사용자의 최신 명시적 지시
→ Target-PC의 최신 비파괴 Readback + Receipt
→ 해당 계보의 최신 GitHub Pointer/Manifest
→ 해당 PR의 최신 Commit/Comment
→ 과거 인수인계 문서
→ 추정 또는 기억
```

---

## II. 역할과 관리 경계

최신 역할:

```text
ROLE=YOLLA_PANEL_V6_MASTER_LOG_RECORDER
MANAGEMENT_AUTHORITY=false
TARGET=향후 독립되는 공식 YOLLA PANEL V6
LOG_START=공식 V6 구축 착수 시점
V5_AND_V6_LOGS=MUST_SEPARATE
UNRECORDED_EXECUTION=NOT_OFFICIAL_V6_EXECUTION
```

이 역할은 패널을 독단적으로 설계·수정·배포하는 관리자가 아니다. 지시, 실행, 파일 변경, 오류, 재시도, 복구, 검증, 인계, 판정을 기록하는 총괄 기록자다.

반드시 기록할 대상:

- 사용자·커맨더·워커의 지시와 응답
- 실행 명령, 입력, 출력, 종료코드, 시작·종료 시각
- 파일 생성·수정·이동·삭제와 SHA-256
- 버전, 브랜치, Commit, PR, 배포, Rollback
- 패널, Workspace, Log Window, BrowserView, Tunnel, Executor 상태
- Command ID, Cycle ID, Context ID, Worker/Seat ID의 상관관계
- 오류, 실패주입, 재시도, 복구, Rollback 과정
- 원본 보존, 변환 계보, 중복 판정, Evidence와 Receipt
- 워커 간 인계, 승인, 독립 수용검증

절대 기록하지 않을 대상:

- 쿠키 원문
- 로그인 토큰, 비밀번호, 세션 키
- API Key 원문
- 브라우저 Profile 전체 복사본
- 개인정보 가능 원본을 GitHub 공개 문서에 직접 포함하는 행위

---

## III. 버전·계보 지도

| 계보 | 루트/브랜치 | 상태 | 현재 용도 |
|---|---|---|---|
| Legacy V5.10.2.3.7 | `E:\SOURCE FACTORY\.yolla\yolla-panel\releases\v5.10.2.3.7-dispatch-token-recovery` | 과거 안정 기준선 | 보존·복구·비교 |
| V5 Clean/V5.1/V5.2 | `integration/a1-yolla-panel-connection-frontier-v1`, PR #14 | Open/Draft/Unmerged | 50좌석·7그룹·3-Lane 구조 권위 |
| A-0 Successor | `integration/a0-yolla-workspace-automation-successor-v1`, PR #17 | Open/Draft/Unmerged | V5 후임 자동화·통합 원장 |
| Minimal V1/V1.2 | PR #76 및 `yolla-panel-v1/minimal-*` | 별도 단순화 계보 | 장애 격리·복구 참고 |
| 역사적 V6 6.0.2 | `agent/yolla-panel-v6-independent`, PR #84, `E:\YOLLA\panel-v6` | Open/Draft/Unmerged, 최종 Target-PC Receipt 미완료 | 소스·모듈·로그·Executor 재사용 자료 |
| 현재 Panel 6-1 | `E:\YOLLA_PANEL_6-1`, 앱 `E:\YOLLA_PANEL_6-1\app` | 최신 Target-PC 작업 권위로 지시됨 | 현재 Panel/Workspace 수정 대상 |
| 향후 공식 독립 V6 | 새 독립 루트·Runtime·경로를 구축할 예정 | 공식 초기화 전 | 모든 활동을 새 로그 원장으로 기록 |

중요: `PR #84의 V6`, `E:\YOLLA_PANEL_6-1`, `향후 공식 독립 V6`는 이름이 유사해도 동일 대상으로 자동 간주하지 않는다. 결속하려면 별도 `AUTHORITY_MANIFEST`, Target-PC Inventory, Hash, 사용자 확인이 필요하다.

---

## IV. 전체 논리 구조

```text
사용자
  └─ YOLLA Control Panel
      ├─ 시스템·서버·PC Agent·API·DB 상태 관제
      ├─ Workspace 열기·집중·정렬·재시작
      ├─ Log Window/진단 Export 진입
      └─ YOLLA Automation Workspace
          ├─ Worker Command
          │   ├─ 그룹·커맨더·워커(좌석)
          │   ├─ ChatGPT Project/Context Binding
          │   ├─ 명령 전송·응답 회수
          │   └─ Cycle/Receipt/상태
          └─ Site Analysis & Extraction
              ├─ Analyzer BrowserView
              ├─ Site Structure/Profile/Adapter
              ├─ Immutable Page Artifact
              └─ Extraction/Normalization/Evidence/Receipt
```

공통 Host:

```text
Electron Main Process
├─ Window/BrowserView lifecycle
├─ IPC registration
├─ Session/partition binding
├─ State Store
├─ Command Scheduler/Dispatcher
├─ Module Host
├─ Log/Receipt projection
└─ Shutdown/Restart/Recovery
```

---

## V. 패널과 Workspace의 물리적 분리

### 1. 현재 `E:\YOLLA_PANEL_6-1\app` 지시 기준

`CURRENT_DIRECTIVE`로 확인된 파일 경계:

```text
E:\YOLLA_PANEL_6-1\app\
├─ main.js                         # 공통 Electron Host
├─ panel.html                      # 패널 화면
├─ panel.css
├─ panel.js
├─ panel_preload.js
├─ workspace.html                  # Workspace Shell
├─ workspace.css
├─ workspace.js
├─ workspace_preload.js
├─ modules\
│  ├─ worker-command\              # 워커 지휘 모듈
│  └─ site-analysis-extraction\    # 사이트 분석·추출 모듈
└─ state\                          # 실제 위치는 Runtime Manifest로 재확인 필요
```

### 2. UI 소유권

| 영역 | 소유 파일 | 허용 책임 | 금지 |
|---|---|---|---|
| Panel | `panel.*`, `panel_preload.js` | 관제, 바로가기, 상태, Workspace/로그 창 제어 | Worker/Analyzer Profile 직접 조작 |
| Workspace Shell | `workspace.*`, `workspace_preload.js` | 메뉴, Mount Slot, 공통 레이아웃 | 모듈 private state 병합 |
| Electron Host | `main.js` | Window, BrowserView, IPC, session, lifecycle | UI 모듈 소유 데이터의 임의 재해석 |
| Worker Command | `modules\worker-command\**` | 그룹·좌석·명령·응답·Cycle | Analyzer 쿠키/토큰/상태 접근 |
| Site Analysis/Extraction | `modules\site-analysis-extraction\**` | 사이트 탐색·분석·추출·Artifact | Worker ChatGPT Context 변경 |

### 3. 패널 메인화면 요구사항

다음은 사용자가 지정한 패널 요구사항이며, 각 항목은 구현 Receipt가 나오기 전까지 `DESIGN_REQUIRED`다.

- 서버 상태
- PC Agent 상태
- API 관제창 바로가기
- `http://localhost:3000/` 바로가기
- 로컬 게시판 바로가기
- 네트워크 상태와 실시간 로그
- Workspace와 Log Window 복구/열기

`http://localhost:3000/`은 패널 자체와 동일한 앱으로 간주하지 않는다. DB·외부 서비스 관제 영역으로 분리한다.

---

## VI. Workspace UI 구조

V5 권위에서 확인된 구조:

```text
YOLLA Automation Workspace
├─ 상단 메뉴
│  ├─ 프로젝트
│  ├─ 로그 분석기
│  ├─ 대화
│  ├─ 워커 지정
│  └─ 명령
├─ 좌측 메뉴
│  └─ 그룹 → 커맨더 → 워커/좌석
├─ Worker Command 모드
│  ├─ ChatGPT 전용 주소창
│  ├─ 50개 좌석
│  ├─ 7개 그룹
│  ├─ 프로젝트 URL
│  ├─ 현재 Context URL
│  └─ 명령·Cycle·응답 자동화
└─ Site Analysis & Extraction 모드
   ├─ 분석 전용 주소창
   ├─ 대상 사이트 탐색
   ├─ 현재 페이지 등록
   ├─ Adapter 선택
   └─ 분석·추출 진입점
```

UI 불변 규칙:

- 선택한 모드의 주소창만 표시한다.
- Worker BrowserView는 ChatGPT Project/Context 전용이다.
- Analyzer BrowserView 이동은 Worker의 현재 ChatGPT Context를 변경하지 않는다.
- Native BrowserView가 Drawer/Modal을 가리면 CSS `z-index`만으로 해결하지 않는다. Drawer open 중 detach, close 후 restore한다.
- 동일 사용자 동작이 좌석 Binding과 일반 Navigation을 혼동하지 않게 한다.
- `[워커 지정]`을 누를 때만 현재 ChatGPT Context URL을 선택 좌석에 저장한다.

좌석 상태 표현:

```text
IDLE=GRAY
WORKING=GREEN
ERROR=RED
```

`seat_code`는 지속 식별자이며 표시 이름은 사용자가 바꿀 수 있다. 워커 교체는 같은 좌석을 유지하고 새로운 GPT Context를 결속하는 방식이다.

---

## VII. BrowserView·Profile·Partition 구조

### 1. V5 계보

```text
Worker BrowserView
PURPOSE=ChatGPT command/response
DEFAULT_HOME=https://chatgpt.com/projects
BINDING=per-seat project_url + context_url

Analyzer BrowserView
PURPOSE=target-site navigation/page discovery
CHATGPT_CONTEXT_MUTATION=false
CURRENT_PAGE_IS_ANALYSIS_TARGET=true

FIXED_PROFILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
```

### 2. 역사적 V6 6.0.2 계보

```text
PROFILE_ROOT=E:\YOLLA\panel-v6\profile
GPT_CHATGPT_PARTITION=persist:yolla-v6-worker
GOOGLE_ANALYZER_PARTITION=persist:yolla-v6-analyzer
```

### 3. 현재 Panel 6-1 모듈 경계

```text
WORKER_PARTITION=persist:yolla-v6-worker
ANALYZER_PARTITION=persist:yolla-v6-analyzer

WORKER_STATE=state\worker-command\
ANALYZER_STATE=state\site-analysis-extraction\

WORKER_IPC=yolla:worker:*
ANALYZER_IPC=yolla:site:*
HOST_IPC=yolla:host:*
```

주의: 역사적 V6는 `v6:*`를 공통 IPC prefix로 사용했다. 현재 6-1 지시는 `yolla:worker:*`, `yolla:site:*`, `yolla:host:*`로 더 세분화한다. 둘을 혼합 등록하지 않는다.

세션 보존 원칙:

- Runtime 소스와 Browser Profile을 분리한다.
- 설치/업데이트/복구에서 Profile을 삭제·초기화하지 않는다.
- 쿠키나 토큰을 읽어 로그인 PASS를 선언하지 않는다.
- 전체 Runtime 재시작 후 인증된 화면의 비민감 UI Marker가 보일 때만 로그인 복구 PASS를 기록한다.
- 진단 ZIP과 GitHub 원장에 Profile, cookie, token, password를 넣지 않는다.

---

## VIII. Worker Command 모듈

핵심 책임:

```text
그룹 Registry
→ Commander/Worker/Seat Registry
→ Project URL / Context URL Binding
→ Instruction/Prompt 작성
→ Dispatch
→ Assistant Response 회수
→ Command/Cycle/Wave 상관관계
→ Seat 상태 전환
→ Receipt·원장 기록
```

최소 식별자:

```text
command_id
request_id
cycle_id
wave_id
worker_slot_uid 또는 seat_code
context_id 또는 context_url
directive_registered_at_kst
result_published_at_kst
terminal_status
duplicate_prompt_key
remote_pointer
```

중복 방지 키의 과거 권위 예:

```text
command_id + worker_slot_uid + cycle_id + wave_id
```

동일 완료 Token에 두 번 전송하면 안 된다. `작업완료후` 트리거는 등록 시 기존 완료 상태를 baseline으로 잡고 이후 completion token 증가/변경에만 한 번 실행한다.

명령 성공 판정:

```text
COMMAND_CREATED
→ DISPATCH_ACCEPTED
→ GPT_PROMPT_SUBMITTED
→ WORKER_GPT_RESPONSE_RECEIVED
→ COMMANDER_RESULT_RECEIVED
→ RECEIPT_PERSISTED
```

UI에 메시지가 실제 표시되기 전 `MESSAGE_SENT`를 기록하지 않는다. 응답 원문은 `COMMAND_ID`, `CONTEXT_ID`, `CYCLE_ID`와 결속한다.

---

## IX. Analyzer·Extractor 3-Lane 구조

하나의 Electron Runtime 안에서 소유 경로와 계약을 세 Lane으로 나눈다.

| Lane | 소유 책임 | 생산물 |
|---|---|---|
| Automation·Integration | Panel, Workspace Shell, 좌석, 세션, 명령, Cycle, PC Agent, 통합, Rollback | `WorkerCommandRequest`, `CycleLedger`, `RuntimeStatus` |
| Analyzer | BrowserView, 사이트 탐색, DOM/HTML/본문/링크/Metadata/스크린샷, 페이지 판정, Adapter 선택 | `PageArtifactReceipt`, `AnalysisReceipt` |
| Extractor | Artifact 소비, 필드 후보, 구조화, 정규화, 중복, Evidence, Schema, 재처리 | `ExtractionResult`, `ExtractionReceipt` |

불변 원칙:

```text
ONE_RUNTIME
THREE_OWNERSHIP_LANES
SHARED_VERSIONED_CONTRACTS
IMMUTABLE_HANDOFF_ARTIFACTS
SINGLE_INTEGRATION_OWNER
EXTRACTOR_DEFAULT_INPUT=IMMUTABLE_PAGE_ARTIFACT
LIVE_DOM_EXTRACTION=EXPLICIT_ADAPTER_EXCEPTION_ONLY
```

기본 Artifact:

```text
page.html
body_text.txt
links.json
metadata.json
screenshot.png
receipt.json
```

최소 계약:

```json
{
  "AnalysisRequest": ["analysis_id", "site_id", "requested_url", "adapter_id", "requested_at"],
  "PageArtifactReceipt": ["analysis_id", "final_url", "page_title", "html_sha256", "body_text_sha256", "screenshot_sha256", "link_count", "artifact_root", "status"],
  "ExtractionRequest": ["extraction_id", "analysis_id", "artifact_receipt", "schema_id", "adapter_id"],
  "ExtractionResult": ["extraction_id", "record_count", "output_artifact", "evidence_count", "validation_status", "status"]
}
```

통합 순서:

```text
Automation Shell 안정화
→ Analyzer Page Artifact 1건 PASS
→ Extractor가 Artifact에서 구조화 결과 생성
→ Evidence·Receipt 저장
→ Panel/Workspace에서 상태와 결과 표시
```

---

## X. 역사적 V6 6.0.2 소스 구조

GitHub PR #84의 `agent/yolla-panel-v6-independent` 브랜치에서 직접 확인된 구조다. 현재 시스템에 그대로 적용하라는 뜻이 아니라 복구·재사용을 위한 정확한 소스 지도다.

```text
yolla-panel-v6/
├─ README.md
├─ RUNTIME_MANIFEST.json
├─ V6_BOUNDARY_MANIFEST.json
├─ INSTALL_AI_YOLLA_V6.bat
├─ install-v6.ps1
├─ RUN_AI_YOLLA_V6.bat
├─ RUN_AI_YOLLA_V6.ps1
├─ REMOVE_AI_YOLLA_V6.bat
├─ REMOVE_AI_YOLLA_V6.ps1
├─ START_YOLLA_V6_SERVICES.ps1
├─ RUN_YOLLA_V6_CONTROL.ps1
├─ RUN_YOLLA_V6_EXECUTOR.ps1
├─ V6.Common.ps1
├─ V6.Executor.ps1
├─ V6.Snapshot.ps1
├─ V6.Validate.ps1
├─ control/
│  ├─ package.json
│  ├─ v6_mcp_server.cjs
│  └─ test_v6_mcp_server.cjs
├─ modules/
│  ├─ README.md
│  ├─ V6_MODULE_REGISTRY_V1.json
│  ├─ session-restore/
│  │  └─ SESSION_RESTORE_CONTRACT_V1.json
│  ├─ site-analyzer/
│  │  ├─ V2_SITE_ANALYZER_MODULE_CONTRACT_V1.json
│  │  └─ provider.cjs
│  └─ commander-worker-menu/
│     ├─ B1_COMMANDER_WORKER_MENU_MODULE_CONTRACT_V1.json
│     └─ provider.cjs
└─ runtime/
   ├─ main.js
   ├─ preload.js
   ├─ renderer.js
   ├─ index.html
   ├─ styles.css
   ├─ package.json
   ├─ state_store.cjs
   ├─ session_restore_manager.cjs
   ├─ module_host.cjs
   ├─ command_scheduler.cjs
   ├─ chatgpt_dispatch.cjs
   ├─ log_analyzer.html
   ├─ log_analyzer.css
   ├─ log_analyzer.js
   ├─ log_analyzer_preload.js
   └─ automation-c-v1/
      ├─ c_mode_runtime.cjs
      └─ github_comment_client.cjs
```

6.0.2 Manifest 주요 값:

```text
VERSION=6.0.2
TARGET_ROOT=E:\YOLLA\panel-v6
SOURCE_FILE_COUNT=47
SOURCE_BASELINE_SHA256=902ab7eaa08b71998169084f2a2efcdbaf06a2b2a8a6b3272636b6c954608d05
PR84_HEAD_AT_2026-08-08=258a2aef43738b3854f13498fbb89126019933d9
TARGET_PC_FINAL_RECEIPT=PENDING_AT_LAST_REPORT
```

모듈 규칙:

- 모듈 소유자는 Registry와 자기 Contract만 읽는다.
- 자기 `owned_root` 안에서만 수정한다.
- `runtime/main.js`, `renderer.js`, `index.html`을 직접 수정하지 않는다.
- 새 UI 위치는 `new_mount_slot`, 새 Host 기능은 `new_host_capability` 요청으로 처리한다.
- 다른 모듈 private 파일 직접 import, 임의 IPC, Legacy state 직접 쓰기, secret persistence를 금지한다.

---

## XI. Runtime·State·Log·Receipt 디렉터리

### 1. Legacy V5.10.2.3.7

```text
RELEASE=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\v5.10.2.3.7-dispatch-token-recovery
LAUNCHER=E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat
STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2
STATE_FILE=...\workspace_state.json
RUNTIME_LOG=...\runtime.log
PROFILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
```

Legacy 핵심 Source Hash:

```text
workspace.js          527893e252516a1fbe6e37c1cb9f0efa934fd0e5aeca1b198dc8c1d8f0e6eb12
workspace.html        4328ef3973f64b0c194076a79463127fcc5a580dd846551504f90db65bcc4acb
workspace.css         7f9a805e48e54f3fbf4144c731783982f7f4cc1aa90ed0c10cbd81dd666016d2
workspace_preload.js  aa54293dc053537f8afbfd62413efb6001984a4193d3b19652d684fff9b816c3
main.js               e31ee5cbb9c46b0b5e6c22c6efd7cf63679828046ce230b80cd4f797e59a4934
```

### 2. Minimal V1.2

```text
RELEASE=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\yolla-minimal-v1.2-observability
STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1
PROFILE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile-minimal-v1
LAUNCHER_BAT=E:\SOURCE FACTORY\RUN_AI_YOLLA_MINIMAL_V1_2.bat
LAUNCHER_PS1=E:\SOURCE FACTORY\RUN_AI_YOLLA_MINIMAL_V1_2.ps1
```

주요 상태:

```text
workspace_state.json
runtime.log
LATEST_RUNTIME_RECEIPT.json
automation-c-v1\C_MODE_STATE.json
automation-c-v1\REPEAT_COMMANDS.json
automation-c-v1\work_control_events.jsonl
commands\SCHEDULED_COMMANDS.json
dispatch-receipts\*.json
automation-c-v1\dispatch-receipts\*.json
commands\receipts\*.json
```

### 3. 역사적 V6 6.0.2

```text
E:\YOLLA\panel-v6\
├─ releases\6.0.2\
├─ state\
├─ profile\
├─ logs\
├─ receipts\
├─ imports\
├─ staging\
├─ dependencies\
├─ control\
└─ executor\
   ├─ inbox\
   ├─ processing\
   ├─ archive\
   └─ receipts\
```

### 4. 현재 Panel 6-1

```text
AUTHORITY_ROOT=E:\YOLLA_PANEL_6-1
AUTHORITY_APP=E:\YOLLA_PANEL_6-1\app
WORKER_STATE=E:\YOLLA_PANEL_6-1\state\worker-command\   # 최종 Manifest로 확인 필요
ANALYZER_STATE=E:\YOLLA_PANEL_6-1\state\site-analysis-extraction\ # 최종 Manifest로 확인 필요
```

`E:\YOLLA_AUTO_TEST`와 과거 V5 Release는 명시적 지시 없이는 수정하지 않는다.

---

## XII. 로그 창과 진단 Export

Legacy V5 Log Window 소스:

```text
log_status.html
log_status.js
log_status.css
log_status_preload.js
main.js:createLogStatusWindow
main.js:getLogStatusSnapshot
main.js:downloadLogExport
```

Legacy V5 Log IPC:

```text
v5:panel:open-log-status
v5:log-status:get-snapshot
v5:logs:download
v5:log-status:event
v5:log-status:open-folder
```

Minimal V1.2 Log IPC:

```text
minimal:log-analyzer:open
minimal:log-analyzer:get-snapshot
minimal:log-analyzer:export
minimal:log-analyzer:open-folder
minimal:log-analyzer:event
```

진단 ZIP 기본 포함 대상:

```text
DIAGNOSTIC_SUMMARY.json
README.txt
runtime.log
LATEST_RUNTIME_RECEIPT.json
workspace_state.json
C_MODE_STATE.json
REPEAT_COMMANDS.json
work_control_events.jsonl
SCHEDULED_COMMANDS.json
최근 dispatch/command receipts
```

진단 ZIP 제외 대상:

```text
Browser Profile
cookies
login tokens
cache
passwords
API keys
```

로그 분석 신호:

```text
ERROR FAIL BLOCKED TIMEOUT CONFLICT INVALID
MISSING RETRY WAIT CARRYOVER PARTIAL
```

---

## XIII. 향후 공식 V6 로그 계약

다음은 `DESIGN_REQUIRED`인 공식 로그 구조다. 실제 V6 초기화 시 정확한 Root를 Manifest로 확정한다.

```text
<V6_ROOT>\logs\
├─ events\YYYY-MM-DD\events.jsonl
├─ commands\YYYY-MM-DD\commands.jsonl
├─ files\YYYY-MM-DD\file_changes.jsonl
├─ runtime\YYYY-MM-DD\runtime.jsonl
├─ browser\YYYY-MM-DD\browser.jsonl
├─ network\YYYY-MM-DD\network.jsonl
├─ errors\YYYY-MM-DD\errors.jsonl
├─ handoffs\YYYY-MM-DD\handoffs.jsonl
├─ receipts\<COMMAND_ID>\*.json
├─ snapshots\<TIMESTAMP>\inventory.json
└─ indexes\LATEST.json
```

공통 Event Schema:

```json
{
  "schema_version": "YOLLA_V6_LOG_EVENT_V1",
  "event_id": "EVT-...",
  "event_time_kst": "ISO-8601+09:00",
  "observed_time_kst": "ISO-8601+09:00",
  "actor_type": "USER|COMMANDER|WORKER|RUNTIME|EXECUTOR|RECORDER",
  "actor_id": "...",
  "event_type": "DIRECTIVE|EXEC_START|EXEC_END|FILE_CHANGE|STATE_CHANGE|ERROR|RETRY|RECOVERY|ROLLBACK|HANDOFF|ACCEPTANCE",
  "system": "PANEL|WORKSPACE|WORKER_COMMAND|ANALYZER|EXTRACTOR|EXECUTOR|TUNNEL|DB|API",
  "command_id": null,
  "cycle_id": null,
  "wave_id": null,
  "context_id": null,
  "target": "...",
  "status_before": null,
  "status_after": null,
  "exit_code": null,
  "evidence_paths": [],
  "sha256_before": null,
  "sha256_after": null,
  "secret_redaction_count": 0,
  "fact_grade": "VERIFIED_TARGET_PC",
  "recorder": "YOLLA_PANEL_V6_MASTER_LOG_RECORDER"
}
```

파일 변경 로그 추가 필드:

```text
operation=CREATE|MODIFY|MOVE|DELETE
path_before
path_after
size_before
size_after
sha256_before
sha256_after
backup_path
rollback_command_or_procedure
```

명령 Receipt 필수 필드:

```text
command_id
issued_at_kst
claimed_at_kst
started_at_kst
completed_at_kst
issuer
executor
action
target
input_sha256
exit_code
terminal_status
output_summary
evidence_paths
retry_count
parent_command_id
```

로그 무결성 규칙:

- JSONL 한 줄은 하나의 불변 이벤트다.
- 수정이 필요하면 기존 행을 덮어쓰지 않고 `CORRECTION` 이벤트를 추가한다.
- 큰 원문은 파일로 저장하고 로그에는 Path·크기·Hash만 기록한다.
- 시간은 KST ISO-8601과 필요한 경우 UTC를 함께 기록한다.
- 실행 시작과 종료는 별도 이벤트로 기록한다.
- 실패도 성공과 같은 중요도로 기록한다.
- `CLAIMED`, `RUNNING`, `PASS`, `FAIL`, `BLOCKED`, `UNKNOWN`을 혼용하지 않는다.

---

## XIV. Command Bus·PC Executor·Tunnel

Source Factory의 기본 흐름:

```text
GitHub Daily Queue/Directive
→ Prompt/Command Materialization
→ Local PC Executor/Browser Runtime
→ Worker Output 수집
→ WORKER_REPORT/Receipt 추출
→ SHA/Manifest 검증
→ Commander Gate 판정
→ GitHub 원장 갱신
```

저장소 운영 원칙:

```text
GitHub=원장, Prompt, 보고서, 상태, 작은 Source
대용량 저장소=ZIP, DB dump, 실사이트 Evidence, 원본 Archive
Local PC=실제 Browser, DB Runtime, 대형 파일 생성, Runner 실행
```

역사적 V6 Local Executor 허용 Action:

```text
STATUS
SNAPSHOT
VALIDATE
START_PANEL
STOP_PANEL
INSTALL_UPDATE
```

금지:

```text
ARBITRARY_SHELL_ALLOWED=false
LEGACY_TARGET_ALLOWED=false
MAXIMUM_PARALLEL_COMMANDS=1
```

역사적 V6 MCP:

```text
LOCAL_MCP=http://127.0.0.1:8610/mcp
HEALTH=http://127.0.0.1:8610/health
API_KEY_ENV=YOLLA_V6_RUNTIME_API_KEY
API_KEY_WRITTEN_TO_FILE=false
PUBLIC_INBOUND_PORT_REQUIRED=false
```

최신 V6에서 이 Endpoint를 재사용할지는 새 Manifest에서 결정한다. 과거 Endpoint가 있다고 해서 현재 Tunnel 연결을 PASS로 판정하지 않는다.

---

## XV. 알려진 장애와 재발 방지

| 장애 | 원인/상태 | 재발 방지 |
|---|---|---|
| 흰 화면 | 과거 Runtime/경로/BrowserView 결속 문제, V5에서 복구 보고 | Window 생성만 보지 말고 Renderer, preload, BrowserView, profile, state Receipt 확인 |
| `SCHEDULE_WORKER_BROWSER_VIEW_NOT_READY` | 역사적 V5 `main.js:2306` 진단 | Scheduler가 BrowserView ready gate를 통과한 뒤 Dispatch |
| Queue 재기동 고착 | Worker 시작 시 Queue를 한 번만 읽고 실행 중 유입 명령이 남는 구조 | 지속 Poll/Wake, 처리 상태와 Claim 분리, 새 명령 시 재기동 보장 |
| `0x800710E0` | Scheduled Task가 이미 실행 중인 상태에서 `IgnoreNew` 정책으로 새 시작 거부 | 단일 인스턴스 상태를 정상/고착으로 구분하고 heartbeat/last progress 확인 |
| Receipt 없음 | 자식 프로세스가 부모 승인 Runner의 출력 파이프를 붙잡은 가능성 | 장기 자식 `Start-Process`로 분리, 표준출력 capture 경계 명시 |
| PowerShell 5.1 `ArgumentList` null | `ProcessStartInfo.ArgumentList` 미지원 | quoted `.Arguments` 문자열 사용 |
| 공백 경로 `E:\SOURCE` 절단 | Process start quoting 누락 | 실행 파일/인수 각각 quote, Target-PC 실제 경로 Smoke |
| `STARTING`을 실패로 오판 | Receipt 파일 존재를 Terminal로 오인 | polling 후 PASS/FAIL Terminal만 판정 |
| 모듈 경로 결함 | Source layout과 installed flattened layout 차이 | 두 layout 모두 resolve하는 regression test |
| BrowserView가 UI를 덮음 | Native View가 DOM z-index보다 위 | 필요 시 detach/restore |
| 세션 회귀 | Profile과 Runtime/Release 결속 또는 덮어쓰기 | 고정 Profile 분리, update 시 불변 Hash/경로 검증 |

절대 같은 실수를 반복하지 않을 규칙:

```text
Do not overwrite stable releases.
Do not modify original browser profiles.
Do not delete historical state before backup and hash.
Do not claim Target-PC PASS from offline tests.
Do not treat STARTING as FAIL.
Do not use ProcessStartInfo.ArgumentList on Windows PowerShell 5.1.
Do not assume process Running means queue progress.
Do not mark MESSAGE_SENT before the message is visible in the actual UI.
Do not merge V5, Minimal, historical V6, and 6-1 state namespaces.
```

---

## XVI. 제3자 복구·조사 절차

### Phase 0 — 쓰기 금지

처음에는 파일 수정, 프로세스 종료, Task 재시작, 설치, Git checkout/reset을 하지 않는다.

### Phase 1 — Target-PC Inventory

다음 루트의 존재, 파일 수, 최종 수정시각, Launcher, Manifest, 주요 Hash를 읽는다.

```text
E:\YOLLA_PANEL_6-1
E:\YOLLA\panel-v6
E:\SOURCE FACTORY\.yolla\yolla-panel\releases
E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2
E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1
E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile-minimal-v1
```

### Phase 2 — 실행 상태

확인 대상:

- Electron/Node/PowerShell PID, Parent PID, 시작시각, CommandLine
- `YOLLA PC Operation Executor V2` Scheduled Task 상태
- Queue inbox/processing/archive/receipt 개수와 최신 시각
- Panel, Workspace, Log Window 각각의 Window 존재
- Worker/Analyzer BrowserView Ready 상태
- localhost 서비스 3000/8610 등 실제 Listener와 Health
- 최신 runtime.log, Receipt, state revision

### Phase 3 — GitHub Read Order

1. 이 문서
2. PR #14와 V5 권위 문서
3. PR #17 Successor Pointer
4. Legacy Active Runtime Source Authority Pointer
5. Minimal V1/V1.2 Pointer와 Handoff
6. PR #84의 역사적 V6 README/Manifest/Module Registry
7. `E:\YOLLA_PANEL_6-1`의 최신 Local Manifest/Inventory
8. Cross-group 실행 원장이 필요하면 `yolla-real-estate-data-engine` PR #188

### Phase 4 — 권위 판정

다음 표를 작성한 뒤에만 수정한다.

```text
candidate_name
root
launcher
source_version
manifest_sha256
main_js_sha256
state_root
profile_root
ipc_prefixes
last_receipt
last_live_pass
known_failures
write_authority
```

### Phase 5 — 최소 Smoke

1. 기존 파일 Hash 보존
2. 정확한 Launcher 실행
3. 설치/실행 Exit Code
4. Renderer PASS
5. Panel/Workspace/Log Window 확인
6. Worker BrowserView 로그인 Marker
7. Analyzer BrowserView 분리 확인
8. 상태 저장 후 전체 재시작
9. 로그인·Window·좌석 Binding 복구 확인
10. 테스트 Command 1건 End-to-End Receipt

### Phase 6 — 수정

수정 전:

- 대상 파일과 소유 모듈 확인
- Backup과 `sha256_before` 기록
- 변경 범위를 한 모듈로 제한
- Rollback 절차 정의

수정 후:

- Syntax/static test
- Offline test
- Source/installed layout test
- Target-PC Smoke
- `sha256_after`, Exit Code, Receipt 기록
- GitHub 원장 갱신

---

## XVII. GitHub 권위 문서와 링크

저장소: `https://github.com/anbin1900-crypto/source-factory-core`

주요 PR:

- V5 구조 권위: `https://github.com/anbin1900-crypto/source-factory-core/pull/14`
- 자동화 후임 Control: `https://github.com/anbin1900-crypto/source-factory-core/pull/17`
- 역사적 V6 소스: `https://github.com/anbin1900-crypto/source-factory-core/pull/84`
- Cross-group 실행 원장: `https://github.com/anbin1900-crypto/yolla-real-estate-data-engine/pull/188`

V5 권위 파일:

```text
yolla-panel-v1/a1-connection-frontier/v5/CURRENT_YOLLA_WORKSPACE_V52_ARCHITECTURE_AND_THREE_LANE_PLAN.md
yolla-panel-v1/a1-connection-frontier/v5/YOLLA_WORKSPACE_V52_CURRENT_STATE.json
yolla-panel-v1/a1-connection-frontier/v5/THREE_LANE_INTEGRATION_CONTRACT_V1.json
yolla-panel-v1/a1-connection-frontier/v5/LATEST_YOLLA_WORKSPACE_V52_POINTER.json
```

역사적 V6 권위 파일:

```text
yolla-panel-v6/README.md
yolla-panel-v6/RUNTIME_MANIFEST.json
yolla-panel-v6/V6_BOUNDARY_MANIFEST.json
yolla-panel-v6/LATEST_YOLLA_PANEL_V6_POINTER.json
yolla-panel-v6/modules/V6_MODULE_REGISTRY_V1.json
yolla-panel-v6/modules/session-restore/SESSION_RESTORE_CONTRACT_V1.json
yolla-panel-v6/modules/site-analyzer/V2_SITE_ANALYZER_MODULE_CONTRACT_V1.json
yolla-panel-v6/modules/commander-worker-menu/B1_COMMANDER_WORKER_MENU_MODULE_CONTRACT_V1.json
```

Legacy/Minimal 인수인계:

```text
yolla-panel-v1/minimal-v1/handoffs/YOLLA_PANEL_WORKSPACE_FULL_SUCCESSOR_HANDOFF_20260808_V1.md
yolla-panel-v1/v1-existing-runtime-control/LATEST_C_MODE_ACTIVE_RUNTIME_SOURCE_AUTHORITY_POINTER.json
yolla-panel-v1/v1-existing-runtime-control/LATEST_C_MODE_COMPLETION_HANDOFF_POINTER.json
yolla-panel-v1/minimal-v1/LATEST_YOLLA_MINIMAL_V1_2_OBSERVABILITY_POINTER.json
```

---

## XVIII. 현재 확인 상태

### 확인됨

- V5 Clean Runtime의 창/좌석/그룹/BrowserView 구조가 GitHub PR #14에 존재한다.
- V5 Target-PC에서 50좌석, 7그룹, ChatGPT BrowserView, 프로젝트 Context Binding, 흰 화면 복구가 과거 PASS로 기록됐다.
- V5는 Automation/Analyzer/Extractor의 3-Lane, One Runtime 구조다.
- Legacy V5.10.2.3.7 경로와 핵심 Source Hash가 인수인계 문서에 존재한다.
- Minimal V1/V1.2의 State, Profile, Log, Launcher 구조가 문서화돼 있다.
- 역사적 V6 6.0.2의 47개 Source Manifest와 72개 PR 변경 파일이 GitHub에 존재한다.
- 역사적 V6의 Session Restore, Site Analyzer, Commander/Worker Menu 모듈 계약이 존재한다.
- 현재 6-1의 Panel/Workspace 파일 경계, Worker/Analyzer 모듈 경계, IPC/partition 경계가 최신 지시 자료에 정의돼 있다.
- 최신 역할은 향후 공식 V6의 총괄 로그기록자다.

### 미확인 또는 재검증 필요

- `E:\YOLLA_PANEL_6-1` 전체 파일 Inventory와 SHA-256
- 6-1의 정확 Launcher, installed release, dependencies, state/log/receipt 실제 Root
- 6-1의 Panel/Workspace/Log Window 전체 재시작 복구 Live PASS
- 6-1 Worker Command 모듈의 실제 End-to-End 메시지/응답 Receipt
- 6-1 Site Analysis/Extraction 모듈의 실제 Artifact/Receipt
- PR #84 V6 6.0.2의 최종 Target-PC Receipt
- 현재 Tunnel, MCP, PC Executor의 실시간 연결 상태
- localhost:3000의 현재 서비스와 패널 링크의 실제 동작
- 로컬 게시판 설치·첨부 기능의 실제 Live PASS
- 향후 공식 독립 V6의 최종 Root, 버전, 런타임, Logger 설치 위치

---

## XIX. 다음 문서 갱신 규칙

이 문서는 완결된 정적 설명서가 아니라 상위 인수인계 원장이다.

갱신 시:

1. 기존 사실을 조용히 덮어쓰지 않는다.
2. 변경일, 변경자, 근거, 이전 값, 새 값을 기록한다.
3. `VERIFIED`, `REPORTED`, `DESIGN`, `UNKNOWN`을 구분한다.
4. 새 Runtime은 새 버전/Root/Manifest/Receipt를 가진다.
5. GitHub Commit 링크와 Target-PC Evidence Path를 함께 남긴다.
6. Secret은 기록하지 않는다.
7. 삭제는 Backup/Hash/Rollback 정보 없이는 기록상 승인하지 않는다.

변경 이력 형식:

```text
CHANGE_ID=
CHANGED_AT_KST=
ACTOR=
DIRECTIVE_ID=
SCOPE=
BEFORE=
AFTER=
EVIDENCE=
SHA256_BEFORE=
SHA256_AFTER=
ROLLBACK=
DECISION=
```

---

## XX. 인수인계 Terminal

```text
DOCUMENT_STATUS=PUBLISHED_BASELINE
THIRD_PARTY_READINESS=STRUCTURE_AND_RECOVERY_START_READY
TARGET_PC_CURRENT_LIVE_STATE=REQUIRES_READBACK
CURRENT_6_1_FULL_INVENTORY=REQUIRED
FUTURE_OFFICIAL_V6_INITIALIZED=false
V6_MASTER_LOG_RECORDER_ROLE=ACTIVE_WAITING_FOR_INITIALIZATION
SECRET_EXPOSURE_COUNT=0
```

이 문서를 읽은 후에도 확실하지 않은 사항은 추정하지 말고 `UNKNOWN`으로 남긴 뒤 Target-PC 비파괴 Readback으로 종결한다.
