# YOLLA Workspace V5.2 현재 구조와 3개 작업그룹 분할계획

## I. 문서 목적

이 문서는 2026-08-03 기준 Target PC에서 확인된 실제 상태, 현재 패널·창·연결구조, V5.2 패키지 상태, 그리고 이후 개발을 3개 작업그룹으로 분리한 통합계획을 기록한다.

이 문서는 설계 의도와 실제 관측을 구분한다.

```text
TARGET_PC_CONFIRMED
- V5 Clean Runtime 창 실행
- 50개 좌석·7개 그룹 렌더링
- 좌석·프로젝트·현재 대화 상태 복원
- ChatGPT BrowserView 표시
- 주소 이동과 좌석 전환
- 기존 흰 화면 문제 해소

TARGET_PC_NOT_YET_CONFIRMED
- V5.1 실제 명령 Cycle의 자동 완료 수명주기
- V5.2 고정 로그인 Profile 유지
- V5.2 독립 분석 BrowserView
- V5.2 분석 Artifact 실제 생성
```

## II. 현재 전환 결론

누적된 `safe_panel_v10` Hotfix 체계는 신규 개발 기준선에서 제외한다.

현재 기준선은 다음과 같다.

```text
RUNTIME_BASELINE=YOLLA_WORKSPACE_V5_CLEAN_RUNTIME
LEGACY_SAFE_PANEL_V10=FALLBACK_ONLY
V3_PATCH_CHAIN=RETIRED_FROM_FORWARD_DEVELOPMENT
SINGLE_APPLICATION_RUNTIME=true
INDEPENDENT_ELECTRON_ENTRYPOINT=true
PRODUCTION=false
READY=false
MERGE=false
```

V5는 기존 `safe_panel_v10`을 수정하지 않는 독립 Electron 진입점을 사용한다. 기존 좌석 이름, 그룹 설정, 프로젝트 URL, 현재 대화 URL만 상태 파일로 가져온다.

## III. 현재 패널 구조

```text
YOLLA Control Panel V5.x
├─ Workspace 열기·집중
├─ 패널·Workspace 창 정렬
├─ Workspace 재시작
├─ 상태·로그 폴더 열기
├─ Workspace Renderer 상태
├─ ChatGPT Browser 연결 상태
├─ PC Agent Bridge 관측 상태
└─ 선택 좌석·현재 URL·좌석 수·그룹 수
```

패널은 지휘·상태·복구 진입점이다. 실제 브라우저 업무화면을 패널 내부에 중복 표시하지 않는다.

## IV. 현재 Workspace 창 구조

```text
YOLLA Automation Workspace V5.x
├─ 상단 모드 탭
│  ├─ 워커 지휘
│  └─ 사이트 분석·추출
├─ 왼쪽 Sidebar
│  ├─ 7개 그룹
│  ├─ 50개 논리 좌석
│  ├─ 좌석 표시이름·상태
│  └─ 프로젝트·현재 대화 Binding
├─ 워커 지휘 모드
│  ├─ ChatGPT 전용 주소창
│  ├─ 프로젝트 홈
│  ├─ 현재 대화
│  ├─ 새 컨텍스트
│  └─ 명령 실행·Cycle Ledger
└─ 사이트 분석·추출 모드
   ├─ 분석 전용 주소창
   ├─ 분석 대상 사이트 탐색
   ├─ 현재 페이지 등록
   ├─ 어댑터 선택
   └─ 분석·추출 작업 진입점
```

두 모드의 주소창은 동시에 보이지 않는다. 선택한 모드의 주소창만 표시한다.

## V. 브라우저와 세션 구조

### 1. 워커 BrowserView

```text
PURPOSE=ChatGPT worker command and response
SESSION=shared fixed ChatGPT profile
PROJECT_CONTEXT_BINDING=per seat
DEFAULT_HOME=https://chatgpt.com/projects
```

### 2. 분석 BrowserView

```text
PURPOSE=target site navigation and page discovery
SESSION=separate analyzer session
CHATGPT_CONTEXT_MUTATION=false
CURRENT_PAGE_IS_ANALYSIS_TARGET=true
```

### 3. 로그인 Profile

V5.2부터 버전과 무관한 고정 Profile을 사용한다.

```text
E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
```

설치·업데이트 과정에서 이 경로를 삭제하거나 초기화하지 않는다. 쿠키, 로그인, Local Storage, IndexedDB 등 브라우저 세션 자산은 런타임 소스와 분리한다.

## VI. 상태·원장·Artifact 연결

```text
Workspace State
- seat display names
- group preferences and order
- project_url
- context_url
- last_browser_url

Command Cycle Ledger
- request_id
- cycle_id
- seat_code
- instruction
- prompt
- response
- terminal marker
- transitions

Analysis Artifact
- page.html
- body_text.txt
- links.json
- metadata.json
- screenshot.png
- receipt.json
```

상태, 로그인 Profile, Cycle 원장, 분석 결과는 설치 소스와 분리하며 업데이트 시 보존한다.

## VII. 3개 작업그룹 분할

### GROUP 1 — AUTOMATION·INTEGRATION

책임:

```text
패널과 Workspace Shell
50개 좌석·7개 그룹
ChatGPT 로그인 Profile
좌석별 프로젝트·대화 Binding
명령 작성·전송·응답 회수
Cycle ID 상관관계
좌석 상태 전환
PC Agent 연결
통합·업데이트·Rollback
```

이 그룹은 현재 V5/V5.1에서 진행하던 자동화 작업을 계속 소유한다.

소유 경로 제안:

```text
yolla-workspace/runtime/**
yolla-workspace/panel/**
yolla-workspace/worker-automation/**
yolla-workspace/integration/**
yolla-workspace/contracts/common/**
```

### GROUP 2 — ANALYZER

책임:

```text
분석 BrowserView와 분석 주소창
대상 사이트 탐색
현재 페이지 선택
DOM·HTML·본문·링크·Metadata·스크린샷 수집
페이지 유형 판정
어댑터 선택
분석 결과와 Evidence 생성
Page Artifact 불변 저장
```

Analyzer는 구조화된 최종 레코드를 확정하지 않는다. Extractor가 재현 가능하게 소비할 Page Artifact를 만든다.

소유 경로 제안:

```text
yolla-workspace/analyzer/**
yolla-workspace/contracts/analysis/**
yolla-workspace/adapters/discovery/**
```

### GROUP 3 — EXTRACTOR

책임:

```text
Page Artifact 소비
필드 후보 생성
구조화 추출
정규화·타입 변환
중복 판정
Evidence 위치 연결
추출 Receipt
출력 Schema 검증
재실행·증분처리
```

기본 원칙은 live BrowserView나 live DOM에 직접 의존하지 않는 것이다.

```text
DEFAULT_INPUT=IMMUTABLE_PAGE_ARTIFACT
LIVE_DOM_EXTRACTION=EXPLICIT_ADAPTER_EXCEPTION_ONLY
```

소유 경로 제안:

```text
yolla-workspace/extractor/**
yolla-workspace/contracts/extraction/**
yolla-workspace/adapters/extraction/**
```

## VIII. 그룹 간 최소 계약

### 1. AnalysisRequest

```json
{
  "analysis_id": "ANL-...",
  "site_id": "SITE-...",
  "requested_url": "https://example.com/page",
  "adapter_id": "GENERIC",
  "requested_at": "ISO-8601"
}
```

### 2. PageArtifactReceipt

```json
{
  "analysis_id": "ANL-...",
  "final_url": "https://example.com/page",
  "page_title": "...",
  "html_sha256": "...",
  "body_text_sha256": "...",
  "screenshot_sha256": "...",
  "link_count": 0,
  "artifact_root": "...",
  "status": "PASS"
}
```

### 3. ExtractionRequest

```json
{
  "extraction_id": "EXT-...",
  "analysis_id": "ANL-...",
  "artifact_receipt": ".../receipt.json",
  "schema_id": "...",
  "adapter_id": "GENERIC"
}
```

### 4. ExtractionResult

```json
{
  "extraction_id": "EXT-...",
  "record_count": 0,
  "output_artifact": "...",
  "evidence_count": 0,
  "validation_status": "PASS",
  "status": "PASS"
}
```

## IX. 통합 원칙

세 그룹을 세 개의 Electron 앱으로 만들지 않는다.

```text
ONE_RUNTIME
THREE_OWNERSHIP_LANES
SHARED_VERSIONED_CONTRACTS
IMMUTABLE_HANDOFF_ARTIFACTS
SINGLE_INTEGRATION_OWNER
```

통합 순서:

```text
Automation Shell 안정화
→ Analyzer가 Page Artifact 생성
→ Extractor가 Artifact에서 구조화 결과 생성
→ Automation이 상태·진행·결과를 패널에 표시
```

동일 파일을 세 그룹이 동시에 수정하지 않도록 소유 경로를 분리한다. 공통 계약 변경은 `contracts/`에서만 수행하고 버전을 올린다.

## X. 현재 Package 계보

```text
V5.0 CLEAN REBUILD
SHA256=23b173aeb0271a4284b104a0c50248ed9baf8e70e32ed34d27c0edf4a0b54a55
TARGET_PC_VISUAL_ACCEPTANCE=PASS

V5.1 COMMAND LIFECYCLE
SHA256=726dbc9bc278d38f14047b1f9a3d729c41a9576eb0b9dd17bdb203aa50dd7318
TARGET_PC_LAUNCH=OBSERVED
ACTUAL_COMMAND_CYCLE_ACCEPTANCE=NOT_YET_CONFIRMED
SESSION_REGRESSION=OBSERVED

V5.2 SESSION + ANALYZER
SHA256=96731d281a138048d96d8f2a99900805d2ee15711666a2f3f4d33d994ac8d544
BUILD_VALIDATION=PASS
TARGET_PC_EXECUTION=NOT_YET_OBSERVED
```

## XI. 다음 우선순위

```text
P0-1 V5.2 Target PC 로그인 유지 검증
P0-2 워커 명령 Cycle 실제 PASS
P0-3 분석 BrowserView 탐색·현재 페이지 등록 PASS
P0-4 Page Artifact 1건 생성 PASS
P0-5 Extractor 계약과 Fixture 1건 PASS
P0-6 세 그룹 통합 E2E 1건 PASS
```

최종 E2E:

```text
워커 지시
→ 분석 대상 사이트 탐색
→ Page Artifact 생성
→ 구조화 추출
→ Evidence·Receipt 저장
→ 패널에서 상태와 결과 확인
```
