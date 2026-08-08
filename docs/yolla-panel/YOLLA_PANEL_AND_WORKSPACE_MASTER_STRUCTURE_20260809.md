# 욜라 패널·워크스테이션 전체 구조 및 영구 인수인계 원장 V2

문서 ID: `YOLLA-PANEL-WORKSPACE-MASTER-STRUCTURE-V2-20260809`  
이전 기준선: `V1 commit 7d14996a92462f2f4f13029350604b8a881969ee`  
기준 시각: `2026-08-09 KST`  
V2 보강 범위: `03:54~06:06 KST Target-PC Receipt 및 복구 경로 감사`  
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

### 3. 패널 메인화면 — 2026-08-09 R4 적용 기준

이 항목은 V1 작성 당시 `DESIGN_REQUIRED`였으나, 이후 Target-PC R4 Receipt로 실제 적용이 확인됐다.

```text
FACT_GRADE=VERIFIED_TARGET_PC_RECEIPT
OPERATION_ID=PANEL-MAIN-DASHBOARD-DIRECT-APPLY-R4-20260809-051200-001
STATUS=PASS
TERMINAL=YOLLA_PANEL_MAIN_DASHBOARD_BOUND_LIVE_PASS
COMPLETED_AT_KST=2026-08-09T05:18:18.7468789+09:00
OWNER_SURFACE=LEFT_INDEPENDENT_PANEL
```

적용된 기능:

- 서버 상태
- PC Agent 상태
- API 관제장 바로가기
- `http://localhost:3000/` 통합 관리 패널 바로가기
- `http://localhost:3310/` PC 내부 게시판 바로가기
- 실제 Registry 기반 좌석 수
- Workspace 상태와 제어
- 기존 Log Window 진입과 로그 다운로드

상태 Probe의 해당 시점 결과:

```text
SERVER_3000=HTTP_200
API_CONTROL_8130=HTTP_200
LOCAL_BOARD_3310=HTTP_200
PC_AGENT_PROJECTION=STALE
HARDCODED_50_SEAT_LABEL=false
REAL_SEAT_COUNT_RENDERING=true
```

변경된 파일:

```text
E:\YOLLA_PANEL_6-1\app\main.js
E:\YOLLA_PANEL_6-1\app\panel.html
E:\YOLLA_PANEL_6-1\app\panel.css
E:\YOLLA_PANEL_6-1\app\panel.js
E:\YOLLA_PANEL_6-1\app\panel_preload.js
```

변경하지 않은 범위:

```text
WORKSPACE_UI_FILES_CHANGED=0
WORKER_COMMAND_MODULE_FILES_CHANGED=0
SITE_ANALYSIS_MODULE_FILES_CHANGED=0
```

Rollback:

```text
E:\YOLLA_PANEL_6-1\backups\panel-main-dashboard-before-20260809-051755
```

중요한 실제 호환성 사실:

- Panel R4는 현재 `v5:panel:get-service-status`, `v5:panel:open-link` IPC를 사용한다.
- 따라서 `yolla:host:*`는 모듈화 목표 Namespace이고, 모든 현재 Panel IPC가 이미 그 Namespace로 전환됐다고 기록하면 안 된다.
- Panel과 Workspace가 하나의 Electron Process Tree를 공유하므로 `MainWindowTitle` 하나만으로 Panel 창 생존을 판정하지 않는다.
- R4 수용 시 Workspace 제목 `AI YOLLA Panel Workspace V5.11`이 관찰됐다. Root/실행 권위 판정은 제목이 아니라 Process CommandLine, Source Hash, Identity Manifest, Receipt로 한다.
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
STATE_FILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\workspace_state.json
RUNTIME_LOG=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\runtime.log
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

### 4. 현재 Panel 6-1 — 실제 Self-contained Receipt 기준

2026-08-09 03:54 KST의 독립 구축 Receipt:

```text
FACT_GRADE=VERIFIED_TARGET_PC_RECEIPT
STATUS=PASS
TERMINAL=YOLLA_PANEL_6_1_SELF_CONTAINED_LIVE_PASS
IDENTITY=6-1
TARGET_ROOT=E:\YOLLA_PANEL_6-1
SOURCE_MODE=PANEL_V6_SELF_CONTAINED_SOURCE
FILE_COUNT=6167
TOTAL_BYTES=632629871
OPERATIONAL_EXTERNAL_REFERENCE_COUNT=0
```

정확한 Root 파일:

```text
IDENTITY_MANIFEST=E:\YOLLA_PANEL_6-1\YOLLA_PANEL_6-1_IDENTITY.json
HASH_INVENTORY=E:\YOLLA_PANEL_6-1\FILE_HASHES_SHA256.jsonl
LAUNCHER_BAT=E:\YOLLA_PANEL_6-1\RUN_YOLLA_PANEL_6-1_CURRENT.bat
LAUNCHER_PS1=E:\YOLLA_PANEL_6-1\RUN_YOLLA_PANEL_6-1_CURRENT.ps1
APP_ROOT=E:\YOLLA_PANEL_6-1\app
APP_MAIN=E:\YOLLA_PANEL_6-1\app\main.js
ELECTRON=E:\YOLLA_PANEL_6-1\dependencies\electron\electron.exe
STATE_ROOT=E:\YOLLA_PANEL_6-1\state
PROFILE_ROOT=E:\YOLLA_PANEL_6-1\profile
LOG_AUX_ROOT=E:\YOLLA_PANEL_6-1\logs
RECEIPT_ROOT=E:\YOLLA_PANEL_6-1\receipts
BACKUP_ROOT=E:\YOLLA_PANEL_6-1\backups
PC_AGENT_COPY_ROOT=E:\YOLLA_PANEL_6-1\pc-agent
PC_AGENT_BRIDGE=E:\YOLLA_PANEL_6-1\pc-agent\agent\state\source-factory-bridge-v1
```

Self-contained 구축 Receipt:

```text
E:\YOLLA_PANEL_6-1\receipts\YOLLA_PANEL_6_1_INDEPENDENCE_RECEIPT.json
E:\YOLLA\server\approved-ops\receipts\YOLLA_PANEL_6_1_INDEPENDENCE_RECEIPT.json
```

실제 Launcher 환경 결속:

```text
YOLLA_PANEL_61_ROOT=E:\YOLLA_PANEL_6-1
YOLLA_BROWSER_PROFILE_ROOT=E:\YOLLA_PANEL_6-1\profile
AI_YOLLA_TEST_STATE_ROOT=E:\YOLLA_PANEL_6-1\state
YOLLA_PC_AGENT_BRIDGE_ROOT=E:\YOLLA_PANEL_6-1\pc-agent\agent\state\source-factory-bridge-v1
YOLLA_PANEL_IDENTITY=6-1
```

`E:\YOLLA_PANEL_6-1\pc-agent`는 복구·독립성을 위해 복사된 지원 자산 Root다. 현재 Scheduled Task의 실제 PC Operation Executor 권위는 별도 경로에 존재한다.

```text
ACTIVE_EXECUTOR_SCRIPT=
E:\YOLLA\server\yolla-data-ledger-v1\pc-operation-executor-v2\YOLLA_PC_OPERATION_EXECUTOR_V2.ps1

COPIED_RECOVERY_ASSETS=
E:\YOLLA_PANEL_6-1\pc-agent\**
```

복사본을 실행 권위와 혼동하지 않는다. `E:\YOLLA_AUTO_TEST`, `E:\SOURCE FACTORY`, `E:\YOLLA\panel-v6`도 명시적 권위 전환 없이 현재 6-1 Source로 사용하지 않는다.
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

## XVIII. 현재 확인 상태 — 2026-08-09 06:06 KST까지의 증거

### 확인됨

- 6-1 Self-contained Runtime은 `E:\YOLLA_PANEL_6-1`에서 6,167개 파일, 약 632.6MB로 구축됐고 외부 운영 Source Reference 0건으로 PASS했다.
- 실행기는 `RUN_YOLLA_PANEL_6-1_CURRENT.bat` → `RUN_YOLLA_PANEL_6-1_CURRENT.ps1` → 전용 `dependencies\electron\electron.exe` → `app` 순서다.
- Runtime State, Browser Profile, PC Agent 복사 Root가 각각 `state`, `profile`, `pc-agent`로 6-1 내부에 결속됐다.
- Panel 메인 R4는 Target-PC에 적용됐고 서버/API 관제장/게시판 HTTP 200, 실제 좌석 수 표시, PC Agent `STALE` Projection이 확인됐다.
- Panel R4의 정확한 변경 파일 5개와 SHA-256, Rollback 경로가 Receipt에 남아 있다.
- B-1 Worker Command 모듈은 `app\modules\worker-command`에 설치됐고 `yolla:worker:*`, `persist:yolla-v6-worker`, 단일 Browser Transaction Broker가 Runtime Validation PASS했다.
- B-1 설치·Runtime Validation 과정에서 Site Namespace/State/Profile Write Count는 모두 0이었다.
- PC Operation Executor `2.1.3-dual-plane-runner-self-wake`는 2026-08-09 02:43 KST 상태 Receipt가 있으며 Queue Rescan과 Poll-end Self-wake 수용 기록이 존재한다.
- V-1 Site Analysis/Extraction은 Offline Test 24개 Assertion을 통과했지만 Live Capture에서 `screenshot.png:empty`로 실패했고 공통 파일은 자동 Rollback됐다.
- V5, Minimal, 역사적 V6, 현재 6-1은 서로 다른 계보이며 자동으로 같은 실행 권위가 아니다.
- 로그 담당자의 V1 원장은 main 브랜치 Commit `7d14996a92462f2f4f13029350604b8a881969ee`에 존재하고 PR #14 댓글 `5228094386`, PR #84 댓글 `5228094532`에서 연결됐다.

### 완료로 오인하면 안 되는 항목

#### B-1 Worker Command

```text
MODULE_INSTALL=PASS
RUNTIME_ACTIVE=PASS
END_TO_END_WORKER_TO_WORKER_ROUNDTRIP=NOT_PASS
```

실제 B-1→B-2→B-1 Live Relay는 다음 이유로 수용되지 않았다.

- 중간 Relay Object에 `visible_confirmation` 속성이 없어 승인 스크립트 실패
- 같은 Context에서 응답 Poll 중 반복 Navigation/새로고침 발생
- `E:\YOLLA_PANEL_6-1\state\worker-command\...` 직접 Read가 Executor Allowlist 밖이라 실패
- No-refresh Patch는 로컬 영수증을 작성했다고 보고됐으나 GitHub Readback이 종결되지 않음
- 이전 Live Test는 재실행 금지

따라서 다음을 기록하지 않는다.

```text
MANUAL_DISPATCH_LIVE_PASS=false
WORKER_TO_WORKER_CONVERSATION_ROUNDTRIP_PASS=false
FULL_B1_TERMINAL=false
```

#### V-1 Site Analysis·Extraction

```text
OFFLINE_TEST=PASS_24_ASSERTIONS
LIVE_CAPTURE_ACCEPTANCE=FAIL_SCREENSHOT_EMPTY
ROLLBACK_APPLIED=true
MODULE_MANIFEST_LOADED=false
FINAL_LIVE_PASS=false
```

실패한 Module Directory가 보존됐을 수 있으나, 폴더 존재를 활성 모듈 또는 Live PASS로 판정하지 않는다.

### 시간·상태 차이 해석

Panel R4의 `PC_AGENT_STATUS=STALE`와 PC Operation Executor 2.1.3의 상태 Receipt는 서로 모순이 아니다.

- Panel은 `pc-agent\agent\state\source-factory-bridge-v1`의 최근 활동을 Projection한다.
- Executor Receipt는 별도 Scheduled Task/실행기 Plane의 상태를 기록한다.
- 관측 시각과 판정 근거가 다르므로 둘을 하나의 `CONNECTED` 값으로 합치지 않는다.

PCV2 상태 Receipt에는 Target PC가 `Windows 11 Home`, OS Version `10.0.26200`으로 기록됐다. 과거 지시의 `TARGET_PC_OS=WINDOWS_10`과 다르므로 현재 복구자는 실제 OS를 다시 Readback한 뒤 호환성 판단을 해야 한다.

### 여전히 재검증할 항목

- 현재 시각의 Electron Process Tree와 정확 CommandLine
- 현재 `FILE_HASHES_SHA256.jsonl` 전체 Hash 및 Core 파일 Drift
- Panel, Workspace, Log Window의 현재 전체 재시작 복구
- B-1 No-refresh Patch 로컬 Receipt와 현재 `index.cjs` Hash
- B-1 실제 메시지 1회 전송·표시·응답회수·Relay 왕복
- V-1 `screenshot.png:empty` 교정 후 Live Capture와 Module Manifest Load
- 현재 PC Agent Bridge 최신 Heartbeat
- 현재 Executor Claim/Receipt 진행성과 `0x800710E0` 재발 여부
- 로컬 게시판 파일 첨부 기능의 실제 Live PASS
- 향후 공식 독립 V6의 최종 Root/Version/Logger 위치
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

## XX. 운영정책 적용 원칙

첨부된 `YOLLA_EFFICIENCY_RATIONALITY_SPEED_FIRST_OPERATING_POLICY_V1`은 이 원장의 복구 실행 원칙으로 사용한다. 다만 속도 우선은 증거·백업·Rollback Gate를 생략한다는 뜻이 아니다.

```text
ONE_OWNER_END_TO_END=true
READ_ONLY_EVIDENCE_FIRST=true
MINIMAL_SAFE_CHANGE=true
RETRY_AFTER_CAUSE_CORRECTION=true
ROLLBACK_ON_FAILED_ACCEPTANCE=true
SECOND_EXECUTOR_CREATE=false
UNNECESSARY_APPROVAL_GATE=false
FALSE_PASS=false
```

적용 순서:

1. 한 작업 소유자가 Inventory부터 최종 Receipt까지 연결한다.
2. 다른 계보나 모듈 소유권을 침범하지 않는 최소 변경만 한다.
3. 실패하면 원인을 분류하고 같은 입력을 맹목적으로 반복하지 않는다.
4. 교정 후 재시도하고, 수용 Gate를 통과하지 못하면 준비된 Backup으로 되돌린다.
5. 보고는 간결하게 하되 Root, 변경 파일, Hash, Receipt, Rollback, 미완료 항목은 생략하지 않는다.

이 정책은 B-1과 V-1의 소유권을 합치거나, Host가 도메인 로직을 가져가거나, Target-PC Receipt 없이 `PASS`를 선언할 권한을 주지 않는다.

---

## XXI. V1 원장 재분석 결과와 V2 보강 이유

V1 원장은 계보 분리와 사실 등급 정의는 적절했지만, 컨텍스트 없이 실제 복구를 시작하기에는 다섯 가지 공백이 있었다.

1. 6-1 구축·Panel R4·B-1·V-1의 03:54~06:06 KST 실제 Receipt가 반영되지 않았다.
2. `DESIGN_REQUIRED`와 이미 구현된 기능이 섞여 있었다.
3. 절대경로가 부족하고 `...\runtime.log` 같은 축약 경로가 남아 있었다.
4. 파일 목록은 있었지만 Launcher→Host→Preload→Renderer→State/Profile 관계가 한눈에 연결되지 않았다.
5. “설치됨”, “Runtime Active”, “실제 End-to-End PASS”가 분리되지 않아 과대판정 위험이 있었다.

V2는 기존 내용을 삭제하지 않고 다음을 보강한다.

```text
CURRENT_6_1_ABSOLUTE_PATHS=ADDED
FILE_RELATIONSHIP_MAP=ADDED
LATEST_RECEIPT_STATE=ADDED
RECOVERY_DECISION_ORDER=ADDED
CONTEXT_EXPIRY_BOOTSTRAP=ADDED
V1_LOG_RECORDER_AUDIT=ADDED
STALE_OR_CONFLICTING_CLAIMS=CORRECTED
```

---

## XXII. 6-1 중요 파일 절대경로·역할·관계

### 1. 부팅·권위 파일

| 절대경로 | 역할 | 직접 관계 | 복구 우선도 |
|---|---|---|---|
| `E:\YOLLA_PANEL_6-1\YOLLA_PANEL_6-1_IDENTITY.json` | Root·Identity·State/Profile/Electron/PC Agent 경계 선언 | Launcher와 Inventory가 가리키는 대상 확인 | P0 |
| `E:\YOLLA_PANEL_6-1\FILE_HASHES_SHA256.jsonl` | 설치 당시 및 후속 갱신 파일 Hash 원장 | 실제 파일과 Drift 비교 | P0 |
| `E:\YOLLA_PANEL_6-1\RUN_YOLLA_PANEL_6-1_CURRENT.bat` | 사용자/Task 진입점 | PowerShell Launcher 호출 | P0 |
| `E:\YOLLA_PANEL_6-1\RUN_YOLLA_PANEL_6-1_CURRENT.ps1` | 환경변수·Root·Profile·State·Bridge 결속 후 Electron 실행 | `electron.exe`와 `app` 연결 | P0 |
| `E:\YOLLA_PANEL_6-1\dependencies\electron\electron.exe` | 6-1 전용 Electron 실행 파일 | `app\package.json`과 `app\main.js` 실행 | P0 |
| `E:\YOLLA_PANEL_6-1\app\package.json` | 앱 이름·버전·Main Entry | `main=main.js` | P0 |
| `E:\YOLLA_PANEL_6-1\app\main.js` | 공통 Electron Host | 모든 창, BrowserView, IPC, Session, State Projection의 중앙 결속점 | P0 |

실행 사슬:

```text
RUN_YOLLA_PANEL_6-1_CURRENT.bat
→ RUN_YOLLA_PANEL_6-1_CURRENT.ps1
→ 환경변수 5개와 --user-data-dir=E:\YOLLA_PANEL_6-1\profile
→ E:\YOLLA_PANEL_6-1\dependencies\electron\electron.exe
→ E:\YOLLA_PANEL_6-1\app\package.json
→ E:\YOLLA_PANEL_6-1\app\main.js
```

### 2. 독립 Panel 파일

```text
E:\YOLLA_PANEL_6-1\app\panel.html
E:\YOLLA_PANEL_6-1\app\panel.css
E:\YOLLA_PANEL_6-1\app\panel.js
E:\YOLLA_PANEL_6-1\app\panel_preload.js
```

관계:

```text
main.js
→ Panel BrowserWindow 생성
→ panel_preload.js가 제한된 IPC Bridge 노출
→ panel.html이 DOM 구조 제공
→ panel.css가 Panel 전용 Layout 제공
→ panel.js가 상태를 Projection하고 버튼을 IPC에 결속
```

R4 기준 Hash:

```text
app\main.js           28f93bbf9aee51cb849cc7ccc3454042fe43121a8d4e36b1b28b4341ea5154f3
app\panel.html        7ef788f9f15be7fee0f1092bf4e05d3c4ea3bf42d4c41532ff052e288ab21f11
app\panel.css         89a5ad7caa04cba5caa9cb2f1072c59a40f215058bb5e3a02927176eb4b206bb
app\panel.js          63c681630cbe9f433a9346b0eb89f29b03045a5a5082961eca249c1e0941c2e3
app\panel_preload.js  fcd17498352fd546413520090286230da585d92c6cfc399d2d592e8bd9d31ba3
```

이 Hash는 05:18 KST R4 Receipt 기준이다. 이후 Drift 여부는 현재 Inventory로 다시 판정한다.

### 3. Workspace Shell 파일

```text
E:\YOLLA_PANEL_6-1\app\workspace.html
E:\YOLLA_PANEL_6-1\app\workspace.css
E:\YOLLA_PANEL_6-1\app\workspace.js
E:\YOLLA_PANEL_6-1\app\workspace_preload.js
```

관계:

```text
main.js
→ Workspace BrowserWindow와 BrowserView Slot 관리
→ workspace_preload.js가 Host/Module IPC를 제한 노출
→ workspace.html이 Shell/Mount Slot 제공
→ workspace.css가 공통 Layout 제공
→ workspace.js가 모드 전환·공통 Projection·기존 UI Adapter 수행
```

04:43 KST Readback 및 05:56 KST V-1 Source Guard 기준:

```text
app\workspace.js          91f8da591297c50be3c9cf97f18edff74ba65239cdd6085969d9517067359a83
app\workspace.html        1a23fdc433f93df238ea13fed58123f01b1db0cf44a519ef56275d0fc85ff43b
app\workspace.css         63a8faf0f39725f5557f91bb574ea78477e9df84d37f18aaae23c9efd4620e53
app\workspace_preload.js  3adf7eacd3536055b714cee5475f6cb3fa2249c8612114c1da74accb16adf9bd
```

V-1 R3B가 공통 파일을 변경하려다 실패했고 자동 Rollback했으므로, `workspace_preload.js`의 후속 V-1 Patch Hash를 현재 권위로 사용하지 않는다.

### 4. Registry·공통 State·Log

```text
REGISTRY=E:\YOLLA_PANEL_6-1\app\registry.json
WORKSPACE_STATE=E:\YOLLA_PANEL_6-1\state\workspace_state.json
RUNTIME_LOG=E:\YOLLA_PANEL_6-1\state\runtime.log
LATEST_RUNTIME_RECEIPT=E:\YOLLA_PANEL_6-1\state\LATEST_RUNTIME_RECEIPT.json
AUX_LOG_ROOT=E:\YOLLA_PANEL_6-1\logs
```

관계:

```text
app\registry.json
→ 그룹·역할·기본 좌석 정의

state\workspace_state.json
→ 사용자 선택·좌석 Profile·현재 Mode·Context Binding의 지속 State

state\runtime.log
→ main.js의 현재 V5 호환 Log Sink

logs\
→ 6-1 독립 Root가 보유하는 보조/후속 로그 영역
```

`logs\` 폴더 존재만으로 Runtime이 그곳에 쓰고 있다고 판단하지 않는다. 현재 Host 계보에서는 `state\runtime.log`가 실제 Log Sink다.

04:43 KST Readback:

```text
app\registry.json  a3c557ef1195459ade0ab18c469c27b9c93b1fddef1d6d94a0a6e7bd84f6a44a
```

### 5. Worker Command 모듈

```text
MODULE_ROOT=E:\YOLLA_PANEL_6-1\app\modules\worker-command
ENTRY=E:\YOLLA_PANEL_6-1\app\modules\worker-command\index.cjs
MANIFEST=E:\YOLLA_PANEL_6-1\app\modules\worker-command\module.json
TEST=E:\YOLLA_PANEL_6-1\app\modules\worker-command\test.cjs
STATE_ROOT=E:\YOLLA_PANEL_6-1\state\worker-command
PARTITION=persist:yolla-v6-worker
IPC=yolla:worker:*
ROLLBACK=E:\YOLLA_PANEL_6-1\rollback\B1_WORKER_COMMAND_20260809-045542
```

설치 당시 Hash:

```text
index.cjs   96f48af4490d9a37fb56a441fb7e380aa8640bb118a2ae7fb8c5ef7f034d4199
module.json ed8c4c20ab7c1b3e9771351204093f858b4ce0cad1ed03a531f7015366060654
test.cjs    da003e720c5a36e8de95ba27322fe6a5116f9ee1b990d588ffb889d4d7a5e076
```

05:36 KST Runtime Validation의 `index.cjs` Hash는 다음으로 바뀌었다.

```text
59dce2e690effd116c5ec21f531fb25ec7e3e51c079f06bb89c846b91bef7ca1
```

05:58 KST No-refresh Patch가 `index.cjs`를 다시 변경했을 가능성이 있으나 GitHub Readback이 종결되지 않았다. 따라서 현재 `index.cjs` Hash는 Inventory/로컬 Patch Receipt를 읽기 전 `UNKNOWN`이다.

권장 State 하위구조:

```text
E:\YOLLA_PANEL_6-1\state\worker-command\registry
E:\YOLLA_PANEL_6-1\state\worker-command\commands
E:\YOLLA_PANEL_6-1\state\worker-command\attempts
E:\YOLLA_PANEL_6-1\state\worker-command\cycles
E:\YOLLA_PANEL_6-1\state\worker-command\dispatch-ledger
E:\YOLLA_PANEL_6-1\state\worker-command\schedule
E:\YOLLA_PANEL_6-1\state\worker-command\group-loop
E:\YOLLA_PANEL_6-1\state\worker-command\context-recovery
E:\YOLLA_PANEL_6-1\state\worker-command\receipts
E:\YOLLA_PANEL_6-1\state\worker-command\runtime
```

각 하위 폴더의 실제 존재와 현재 파일은 새 Inventory에서 확인한다. 설계 경로를 실파일 존재로 오인하지 않는다.

### 6. Site Analysis·Extraction 모듈

```text
MODULE_ROOT=E:\YOLLA_PANEL_6-1\app\modules\site-analysis-extraction
HOST_ADAPTER=E:\YOLLA_PANEL_6-1\app\modules\site-analysis-extraction\main\host_adapter.cjs
STATE_ROOT=E:\YOLLA_PANEL_6-1\state\site-analysis-extraction
PARTITION=persist:yolla-v6-analyzer
PROFILE_ROOT=E:\YOLLA_PANEL_6-1\profile
IPC=yolla:site:*
ROLLBACK_SCRIPT=E:\YOLLA_PANEL_6-1\backups\v1-site-analysis-extraction\V1-20260809-055613\ROLLBACK_V1_SITE_ANALYSIS_EXTRACTION.ps1
```

현재 판정:

```text
OFFLINE_SOURCE_AND_TEST=PASS
LIVE_MODULE_BINDING=FAIL
COMMON_FILES_ROLLED_BACK=true
FAILED_MODULE_PRESERVED=true
MODULE_MANIFEST_LOADED=false
```

폴더가 남아 있어도 Host가 로드하지 않으면 비활성이다.

### 7. Legacy Automation 파일의 6-1 Readback

04:43 KST Readback에서 확인된 실제 상태:

```text
EXISTS:
E:\YOLLA_PANEL_6-1\app\command_cycle.cjs
E:\YOLLA_PANEL_6-1\app\automation-v1\schedule_runtime.cjs
E:\YOLLA_PANEL_6-1\app\automation-v1\src\scheduleRunner.js
E:\YOLLA_PANEL_6-1\app\automation-v1\src\scheduleCore.js
E:\YOLLA_PANEL_6-1\app\automation-v1\src\nextJobDispatcher.js
E:\YOLLA_PANEL_6-1\app\automation-v1\src\githubResultWatcher.js
E:\YOLLA_PANEL_6-1\app\automation-v2\src\commanderWorkerRelay.js
E:\YOLLA_PANEL_6-1\app\automation-v2\src\twoModeAutomationRuntime.js
E:\YOLLA_PANEL_6-1\app\automation-v2\src\epicResultValidator.js

MISSING_AT_READBACK:
E:\YOLLA_PANEL_6-1\app\context_recovery.cjs
E:\YOLLA_PANEL_6-1\app\automation-v2\group_loop_runtime.cjs
E:\YOLLA_PANEL_6-1\app\automation-v2\src\groupCommanderWorkerLoop.js
```

V5에 존재했던 파일명을 근거로 6-1에도 있다고 가정하지 않는다. 누락 파일을 새로 만들기 전에 B-1 모듈이 해당 책임을 대체했는지 확인한다.

### 8. Receipt·Command Bus·Executor

```text
LOCAL_APPROVED_RECEIPTS=E:\YOLLA\server\approved-ops\receipts
ACTIVE_EXECUTOR=E:\YOLLA\server\yolla-data-ledger-v1\pc-operation-executor-v2\YOLLA_PC_OPERATION_EXECUTOR_V2.ps1
TASK_NAME=YOLLA PC Operation Executor V2
TASK_WATCHDOG=YOLLA PC Operation Executor V2 Watchdog
```

GitHub Command Bus:

```text
REPOSITORY=anbin1900-crypto/yolla-real-estate-data-engine
BRANCH=command/d-group-domain-knowledge-db-foundation-v1
ROOT=COMMAND_CENTER/REPORTS/D_GROUP/DOMAIN_KNOWLEDGE_DB_FOUNDATION_V1/PC_OPERATION_COMMAND_BUS_V2
INBOX=<ROOT>/INBOX
CLAIMS=<ROOT>/CLAIMS
RECEIPTS=<ROOT>/RECEIPTS
```

관계:

```text
GitHub INBOX Command
→ PC Executor Claim
→ Target-PC 승인 Script/File Read/Status
→ Local authoritative Receipt
→ GitHub RECEIPTS Readback
→ PR #188 Pointer/Incident 기록
```

PC Executor Wrapper `FAILED`와 내부 승인 스크립트의 실제 결과가 다를 수 있다. 특히 빈 Exit 값 회귀가 보고됐으므로 Local authoritative Receipt를 반드시 별도 Readback한다.

---

## XXIII. 파일 소유권과 변경 경계

```text
Panel UI Owner
→ panel.html / panel.css / panel.js / panel_preload.js
→ 필요한 최소 main.js Panel IPC

Workspace Shell Owner
→ workspace.html / workspace.css / workspace.js / workspace_preload.js
→ Module Mount와 공통 Layout만

B-1
→ app\modules\worker-command\**
→ state\worker-command\**
→ yolla:worker:*
→ persist:yolla-v6-worker

V-1
→ app\modules\site-analysis-extraction\**
→ state\site-analysis-extraction\**
→ yolla:site:*
→ persist:yolla-v6-analyzer

Electron Host Integrator
→ main.js의 공통 Window/BrowserView/Session/IPC Adapter
→ 각 모듈 private 업무 로직 소유 금지

Log Recorder
→ 사실·경로·Hash·Receipt·Rollback·실패·교정 기록
→ 구현 소유권 없음
```

`main.js`와 `workspace_preload.js`는 여러 Owner가 필요한 최소 Adapter를 추가하는 공유 충돌 지점이다. 이 두 파일을 바꾸기 전에는 반드시 현재 Hash를 읽고, 기존 Panel/B-1/V-1 Marker를 보존하는 Patch를 생성한다.

---

## XXIV. 무컨텍스트 복구 Runbook

### 1. 첫 10분 — 쓰기 금지 Readback

다음 순서로만 읽는다.

```text
1. E:\YOLLA_PANEL_6-1\YOLLA_PANEL_6-1_IDENTITY.json
2. E:\YOLLA_PANEL_6-1\FILE_HASHES_SHA256.jsonl
3. E:\YOLLA_PANEL_6-1\RUN_YOLLA_PANEL_6-1_CURRENT.ps1
4. E:\YOLLA_PANEL_6-1\app\package.json
5. E:\YOLLA_PANEL_6-1\app\main.js의 Version/Marker/Path 상수
6. Electron Process CommandLine
7. state\workspace_state.json과 최신 Receipt의 수정시각
8. profile 폴더 존재·크기·최종 수정시각만 확인
9. PC Executor Task 상태·LastRun·LastResult·정확 Script CommandLine
10. GitHub Command Bus 최신 Claim/Receipt
```

금지:

```text
프로세스 종료
Scheduled Task 재시작
Profile 삭제
State 초기화
Launcher 재작성
과거 V5/V6 복사
Git reset/checkout으로 Target-PC Source 덮어쓰기
```

### 2. 권위 판정

현재 실행 권위는 다음이 모두 맞아야 한다.

```text
PROCESS_EXECUTABLE=
E:\YOLLA_PANEL_6-1\dependencies\electron\electron.exe

PROCESS_APP_PATH=
E:\YOLLA_PANEL_6-1\app

PROCESS_USER_DATA_DIR=
E:\YOLLA_PANEL_6-1\profile

IDENTITY_ROOT=
E:\YOLLA_PANEL_6-1
```

창 제목에 V5.11이 남아 있어도 위 네 항목이 6-1이면 6-1 Process다. 반대로 제목에 6-1이 있어도 CommandLine이 다른 Root면 현재 권위로 판정하지 않는다.

### 3. Backup Gate

수정 전 최소 보존:

```text
E:\YOLLA_PANEL_6-1\YOLLA_PANEL_6-1_IDENTITY.json
E:\YOLLA_PANEL_6-1\FILE_HASHES_SHA256.jsonl
E:\YOLLA_PANEL_6-1\app\main.js
E:\YOLLA_PANEL_6-1\app\package.json
E:\YOLLA_PANEL_6-1\app\panel.*
E:\YOLLA_PANEL_6-1\app\workspace.*
E:\YOLLA_PANEL_6-1\app\modules\<TARGET_MODULE>\**
E:\YOLLA_PANEL_6-1\state\<TARGET_SCOPE>\**
```

Profile은 파일 단위로 수정하지 않는다. 필요 시 전체 Profile의 읽기 전용 Snapshot/복사 가능성만 검토하고 Secret·Cookie를 GitHub에 올리지 않는다.

### 4. 정상 기동

정확한 Launcher:

```text
E:\YOLLA_PANEL_6-1\RUN_YOLLA_PANEL_6-1_CURRENT.bat
```

검증 순서:

```text
Launcher Exit/STARTED Receipt
→ Root Electron Process CommandLine
→ Panel Renderer
→ Workspace Renderer
→ Log Window
→ Worker BrowserView
→ Analyzer BrowserView
→ State Load
→ Profile 로그인 화면 Marker
→ Module별 Runtime Status
```

한 단계가 실패해도 이후 상태를 `PASS`로 추정하지 않는다.

### 5. 증상별 복구

#### 흰 화면

```text
main.js Syntax
→ package.json main Entry
→ preload 파일 존재·Syntax
→ renderer HTML/JS/CSS 존재
→ DevTools/Runtime Error
→ BrowserView Bounds/Attach
→ Profile Lock
→ State JSON Parse
```

Profile 삭제는 금지한다.

#### Panel은 없고 Workspace 제목만 보임

하나의 Root Electron Process가 두 창을 공유할 수 있다. `MainWindowTitle` 한 값만 보지 말고 Panel Source Hash, Renderer Load, BrowserWindow 목록, R4 Marker를 확인한다.

#### 워커 화면이 반복 새로고침

```text
B-1 Live Dispatch 즉시 중지
→ 이전 Command 재실행 금지
→ same-context navigation count 확인
→ response poll과 navigation 분리
→ visible send proof 확인
→ 한 번만 새 bounded test
```

#### V-1 screenshot가 0 byte

```text
Panel/B-1 공통 Hash 보존
→ V-1 Module만 격리
→ capture timing/page readiness/screenshot write 확인
→ 기존 R3B Rollback 상태 확인
→ Offline 24 Assertion 재사용
→ Live Capture만 교정 후 재시험
```

#### Executor가 Running인데 Claim이 없음

```text
Task State
→ LastRunTime / LastTaskResult
→ 정확 Script Path의 PowerShell Process
→ Heartbeat / Last Progress
→ Inbox/Claim/Receipt 최신시각
→ 0x800710E0 / IgnoreNew / Stale Instance 판정
```

두 번째 Executor를 만들지 않는다. 실제 Stale Process가 확정된 경우에만 정확한 Script Path의 단일 Instance를 복구한다.

#### Receipt가 없음

장기 자식 Process가 승인 Runner의 stdout/stderr Handle을 보유했는지 확인한다. Panel/Control/Executor 자식은 분리 로그로 Redirect하고 부모 Receipt 반환을 막지 않게 한다.

### 6. Rollback 우선순위

```text
Panel R4 실패
→ E:\YOLLA_PANEL_6-1\backups\panel-main-dashboard-before-20260809-051755

B-1 실패
→ E:\YOLLA_PANEL_6-1\rollback\B1_WORKER_COMMAND_20260809-045542
→ 단, 이후 Panel R4 Hash를 덮어쓰지 않도록 파일별 복구

V-1 실패
→ E:\YOLLA_PANEL_6-1\backups\v1-site-analysis-extraction\V1-20260809-055613\ROLLBACK_V1_SITE_ANALYSIS_EXTRACTION.ps1
→ R3B Receipt상 이미 Rollback 적용

전체 6-1 손상
→ Identity + Inventory + Independence Receipt로 손상 범위 확정
→ Profile/State 보존
→ 정확 Source 계보와 Hash가 일치할 때만 재구축
```

전체 Root를 과거 V5 또는 역사적 V6로 덮어쓰는 것은 복구가 아니라 권위 교체이므로 사용자 지시와 새 Manifest가 필요하다.

---

## XXV. 실제 상태 수용 Gate

| 영역 | 설치/존재 | Runtime | 실제 기능 | 현재 판정 |
|---|---:|---:|---:|---|
| 6-1 Self-contained Root | PASS | PASS | Panel/Workspace Process Tree 관찰 | PASS as of 03:54 KST |
| Panel Main R4 | PASS | PASS | 3000/8130/3310 HTTP 200, 실제 좌석 수 | PASS as of 05:18 KST |
| B-1 Worker Command | PASS | PASS | B-1→B-2→B-1 Roundtrip | NOT PASS |
| V-1 Site Analysis | Source/Offline PASS | Rollback 후 Manifest 미로드 | Live screenshot Capture | FAIL_ROLLED_BACK |
| PC Executor 2.1.3 | PASS | Self-wake 수용 기록 | 현재 시각 Claim 진행 | READBACK_REQUIRED |
| Local Board | HTTP 200 | 서비스 응답 | 파일 첨부 | READBACK_REQUIRED |

이 표의 “현재”는 영구 상태가 아니라 기록된 관측시각 기준이다. 새 작업자는 최신 Readback으로 갱신한다.

---

## XXVI. 기존 로그 담당자 기록 감사

확인한 원본:

```text
DOCUMENT_PATH=
docs/yolla-panel/YOLLA_PANEL_AND_WORKSPACE_MASTER_STRUCTURE_20260809.md

V1_COMMIT=
7d14996a92462f2f4f13029350604b8a881969ee

V1_SHA256=
f80b20e5ad94d4bf073d920a597efb7a3106be7d7ccec87f423a6bb3d05d947b

PR14_POINTER_COMMENT=
5228094386

PR84_POINTER_COMMENT=
5228094532
```

감사 결론:

- V1의 계보 분리, 사실 등급, Secret 금지, 비파괴 복구 원칙은 유지한다.
- 05:18 이후 Receipt가 반영되지 않은 것은 문서 작성시점 차이이며 허위기록으로 보지 않는다.
- 다만 V1의 `DESIGN_REQUIRED` Panel 항목, 6-1 미확인 경로, B-1/V-1 상태는 현재 증거로 교정해야 한다.
- 과거 V5의 50좌석 설명은 역사적 구조 설명으로 유지하되 현재 Panel의 좌석 수는 Registry 실값만 표시한다.
- `yolla:host:*`는 목표 경계이고 실제 Panel R4의 `v5:panel:*` 호환 IPC가 남아 있음을 병기한다.
- V2는 V1 Commit을 삭제·재작성한 것처럼 숨기지 않고, 같은 파일의 후속 Commit으로 계보를 보존한다.

---

## XXVII. 증거 읽기 순서

1. 이 V2 문서
2. 6-1 Independence Receipt
3. Panel R4 Receipt
4. B-1 Install Receipt
5. B-1 Runtime Validation Receipt
6. B-1 Worker Command Successor Handoff
7. V-1 R3B Terminal Receipt
8. PCV2 2.1.3 Status Receipt
9. PR #188 최신 Claim/Receipt
10. Target-PC 현재 Readback

GitHub 증거 경로:

```text
anbin1900-crypto/yolla-real-estate-data-engine
branch: command/d-group-domain-knowledge-db-foundation-v1

COMMAND_CENTER/REPORTS/D_GROUP/DOMAIN_KNOWLEDGE_DB_FOUNDATION_V1/PC_OPERATION_COMMAND_BUS_V2/RECEIPTS/
  YOLLA-PANEL-6-1-INDEPENDENCE-R3-RECEIPT-READ-20260809-035600-001.json
  PANEL-MAIN-DASHBOARD-DIRECT-APPLY-RECEIPT-READ-R4-20260809-051850-001.json
  B1-WORKER-COMMAND-INSTALL-RECEIPT-READ-20260809-050021-001.json
  B1-WORKER-COMMAND-RUNTIME-VALIDATION-READ-20260809-053701-001.json
  B1-WORKER-TO-WORKER-LIVE-RELAY-RUN-20260809-054200-001.json
  B1-WORKER-TO-WORKER-SOURCE-STATE-READ-20260809-054400-001.json
  B1-WORKER-SUBMIT-NO-REFRESH-PATCH-RUN-20260809-060001-001.json
  V1-SITE-MODULE-DEPLOY-TERMINAL-READ-R3B-20260809-055800-001.json
  PCV2-V2-1-3-STATUS-20260809-024200-001.json

docs/YOLLA_PANEL_6_1_WORKER_COMMAND_SUCCESSOR_HANDOFF_20260809.md
```

---

## XXVIII. 컨텍스트 만료 후 즉시 사용하는 Bootstrap Envelope

```text
ROLE=YOLLA_PANEL_WORKSPACE_RECOVERY_SUCCESSOR
AUTHORITY_ROOT=E:\YOLLA_PANEL_6-1
AUTHORITY_APP=E:\YOLLA_PANEL_6-1\app
MASTER_DOCUMENT=docs/yolla-panel/YOLLA_PANEL_AND_WORKSPACE_MASTER_STRUCTURE_20260809.md
OPERATING_POLICY=YOLLA_EFFICIENCY_RATIONALITY_SPEED_FIRST_OPERATING_POLICY_V1

READ_ONLY_FIRST=true
PROFILE_DELETE=false
STATE_RESET=false
LEGACY_ROOT_OVERWRITE=false
SECOND_EXECUTOR_CREATE=false
PASS_BY_PROCESS_EXISTENCE=false
PASS_BY_FOLDER_EXISTENCE=false
PASS_BY_WINDOW_TITLE=false

FIRST_READ=
YOLLA_PANEL_6-1_IDENTITY.json,
FILE_HASHES_SHA256.jsonl,
RUN_YOLLA_PANEL_6-1_CURRENT.ps1,
app\package.json,
app\main.js,
state\workspace_state.json,
latest receipts,
exact process command lines

CURRENT_KNOWN=
SELF_CONTAINED_ROOT_PASS,
PANEL_R4_PASS_AS_OF_2026-08-09T05:18:18+09:00,
B1_INSTALLED_RUNTIME_ACTIVE_ROUNDTRIP_NOT_PASS,
V1_OFFLINE_PASS_LIVE_CAPTURE_FAIL_ROLLED_BACK,
PCV2_2_1_3_CURRENT_STATUS_REQUIRES_READBACK

RECOVERY_ORDER=
INVENTORY,
AUTHORITY_DECISION,
BACKUP,
MINIMAL_FIX,
RUN,
VERIFY,
ROLLBACK_ON_FAILURE,
CORRECT,
RETRY,
FINAL_RECEIPT

REPORT_REQUIRED=
CURRENT_ROOT,
CURRENT_PROCESS_COMMAND_LINE,
CORE_HASH_DRIFT,
STATE_PROFILE_PRESERVED,
MODULE_SPECIFIC_RESULT,
ROLLBACK_PATH,
USER_ACTION_COUNT,
EXTERNAL_BLOCKER,
FINAL_TERMINAL
```

---

## XXIX. V2 변경 이력

```text
CHANGE_ID=YOLLA-PANEL-WORKSPACE-MASTER-STRUCTURE-V2-20260809
CHANGED_AT_KST=2026-08-09
ACTOR=YOLLA_PANEL_UI_AND_STRUCTURE_OWNER
SCOPE=MASTER_STRUCTURE_RECOVERY_LEDGER
BEFORE=V1_1030_LINES_BASELINE
AFTER=V2_RECEIPT_AUDITED_ABSOLUTE_PATH_AND_RECOVERY_EXPANSION
EVIDENCE=TARGET_PC_RECEIPTS_AND_GITHUB_POINTERS
V1_COMMIT=7d14996a92462f2f4f13029350604b8a881969ee
ROLLBACK=GITHUB_FILE_VERSION_HISTORY
DECISION=SUPERSEDE_V1_STATUS_NOT_V1_LINEAGE
```

---

## XXX. 인수인계 Terminal (V2)

```text
DOCUMENT_STATUS=PUBLISHED_AUDITED_V2
THIRD_PARTY_READINESS=STRUCTURE_RECOVERY_AND_STATUS_TRIAGE_READY
CURRENT_6_1_SELF_CONTAINED=PASS_AS_OF_2026-08-09T03:54:05+09:00
PANEL_MAIN_R4=PASS_AS_OF_2026-08-09T05:18:18+09:00
B1_MODULE_INSTALL=PASS
B1_RUNTIME_ACTIVE=PASS
B1_END_TO_END_ROUNDTRIP=NOT_PASS
V1_OFFLINE_TEST=PASS_24_ASSERTIONS
V1_LIVE_BINDING=FAILED_ROLLED_BACK
PCV2_VERSION=2.1.3_DUAL_PLANE_RUNNER_SELF_WAKE
CURRENT_LIVE_STATE=REQUIRES_NEW_READBACK
PROFILE_DELETE_COUNT=0
SECRET_EXPOSURE_COUNT=0
```

이 문서를 읽은 후에도 확실하지 않은 사항은 추정하지 않는다. `UNKNOWN`으로 남기고 Target-PC 비파괴 Readback으로 종결한다. 구조·폴더·Process 존재는 기능 PASS가 아니며, 최신 Receipt가 이전 상태를 명시적으로 대체할 때만 상태를 승격한다.
