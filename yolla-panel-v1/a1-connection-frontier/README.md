# YOLLA Workspace V5.x

## 현재 기준선

현재 Forward Development 기준선은 누적 Hotfix 기반 `safe_panel_v10`이 아니라 독립 Electron 진입점을 사용하는 `YOLLA Workspace V5 Clean Runtime`이다.

```text
RUNTIME_BASELINE=YOLLA_WORKSPACE_V5_CLEAN_RUNTIME
SEAT_COUNT=50
GROUP_COUNT=7
LEGACY_SAFE_PANEL_V10=FALLBACK_ONLY
V3_PATCH_CHAIN=RETIRED_FROM_FORWARD_DEVELOPMENT
PRODUCTION=false
READY=false
MERGE=false
```

Target PC에서 실제 확인된 사항:

```text
V5_CLEAN_RUNTIME_LAUNCH=PASS
WORKSPACE_VISUAL_ACCEPTANCE=PASS
50_SEATS_RENDERED=PASS
7_GROUPS_RENDERED=PASS
CHATGPT_BROWSER_VIEW=PASS
PROJECT_CONTEXT_BINDING_RESTORED=PASS
WHITE_SCREEN_REGRESSION=RESOLVED
```

아직 Target PC에서 최종 확인되지 않은 사항:

```text
V51_ACTUAL_COMMAND_CYCLE_COMPLETION=NOT_YET_CONFIRMED
V52_FIXED_LOGIN_PROFILE=NOT_YET_CONFIRMED
V52_ANALYZER_BROWSER_VIEW=NOT_YET_CONFIRMED
V52_ANALYSIS_ARTIFACT=NOT_YET_CONFIRMED
```

## 현재 창 구조

```text
YOLLA Control Panel V5.x
└─ 상태·열기·집중·정렬·재시작·로그 진입

YOLLA Automation Workspace V5.x
├─ 워커 지휘
│  ├─ ChatGPT 전용 주소창
│  ├─ 50개 좌석·7개 그룹
│  ├─ 프로젝트·현재 대화 Binding
│  └─ 명령·Cycle·응답 자동화
└─ 사이트 분석·추출
   ├─ 분석 전용 주소창
   ├─ 대상 사이트 탐색
   ├─ 현재 페이지 등록
   ├─ 어댑터 선택
   └─ 분석·추출 진입점
```

선택한 모드의 주소창만 표시한다.

## 브라우저 구조

```text
Worker BrowserView
- ChatGPT 전용
- 좌석별 프로젝트·대화 Binding
- 고정 로그인 Profile 사용

Analyzer BrowserView
- 일반 사이트 탐색 전용
- 현재 페이지를 분석 대상으로 사용
- ChatGPT 현재 대화를 변경하지 않음
```

고정 로그인 Profile:

```text
E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
```

## 3개 작업그룹

### 1. Automation·Integration

패널, Workspace Shell, 좌석, 로그인 Profile, 프로젝트·대화 Binding, 실제 명령 전송, Cycle ID, 상태 전환, PC Agent, 통합·업데이트·Rollback을 소유한다.

### 2. Analyzer

분석 BrowserView, 사이트 탐색, 현재 페이지 선택, HTML·본문·링크·Metadata·스크린샷, 페이지 유형 판정, 어댑터 선택, 불변 Page Artifact 생성을 소유한다.

### 3. Extractor

Page Artifact를 입력으로 받아 필드 후보, 구조화 추출, 정규화, 중복 판정, Evidence 연결, Schema 검증, 추출 Receipt와 증분 재처리를 소유한다.

기본 원칙:

```text
ONE_RUNTIME
THREE_OWNERSHIP_LANES
SHARED_VERSIONED_CONTRACTS
IMMUTABLE_HANDOFF_ARTIFACTS
SINGLE_INTEGRATION_OWNER
EXTRACTOR_DEFAULT_INPUT=IMMUTABLE_PAGE_ARTIFACT
```

세 그룹을 세 개의 Electron 앱으로 만들지 않는다. 하나의 V5 런타임 안에서 소유 경로와 계약을 분리한다.

## 현재 문서

- `v5/CURRENT_YOLLA_WORKSPACE_V52_ARCHITECTURE_AND_THREE_LANE_PLAN.md`
- `v5/YOLLA_WORKSPACE_V52_CURRENT_STATE.json`
- `v5/THREE_LANE_INTEGRATION_CONTRACT_V1.json`
- `v5/LATEST_YOLLA_WORKSPACE_V52_POINTER.json`

## Package 계보

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

## 다음 E2E

```text
워커 지시
→ 분석 대상 사이트 탐색
→ Page Artifact 생성
→ 구조화 추출
→ Evidence·Receipt 저장
→ 패널에서 상태와 결과 확인
```

PR #14는 Open·Draft·Unmerged로 유지한다.
