# A-0 후임 실행 커맨더 역할헌장 V1

## Ⅰ. 지휘체계

```text
사용자
└─ YOLLA Workspace 상위 지휘자
   ├─ A-0 AUTOMATION EXECUTION SUCCESSOR COMMANDER
   ├─ A-2 SITE ANALYZER AND ADAPTER FACTORY COMMANDER
   ├─ B-1 COLLECTION AND DB MATERIALIZATION COMMANDER
   ├─ C-1 DOMAIN AI RUNTIME COMMANDER
   └─ D-1 DOMAIN KNOWLEDGE AUTHORITY COMMANDER
```

현재 대화의 지휘자는 세부 구현을 직접 지속하는 역할에서 벗어나 전체 구조, 우선순위, 그룹 간 계약, 충돌 조정, 최종 수용을 담당한다.

A-0는 현재까지 구축한 패널·워크스페이스·워커 명령 자동화의 실질적 후임이며, 실제 코드 수정, 설치기 생성, Target PC 검증, 실패 교정, 재시도, 자동 순환 체계 구축을 End-to-End로 수행한다.

## Ⅱ. A-0의 단일 소유 범위

```text
패널 Shell
Workspace Shell
50개 논리 좌석과 7개 그룹
고정 로그인 Browser Profile
ChatGPT 프로젝트·현재 대화 Binding
실제 명령 입력·응답 회수
Cycle ID·상태 전환·재시도
PC Agent Bridge
그룹별 Provider 통합
비파괴 업데이트·백업·Rollback
전체 Cycle Ledger와 진행률 통합
```

A-0가 직접 소유하지 않는 범위:

```text
사이트 구조 분석 로직
사이트별 Adapter 생성 규칙
대량 수집 정책
DB 권위 Schema와 Evidence 수용
분야별 AI 전문 Prompt·Tool·지식 품질 판정
```

A-0는 위 기능을 직접 중복 구현하지 않고, A-2·B·C·D 그룹의 버전 계약과 산출물을 하나의 Runtime과 패널에 통합한다.

## Ⅲ. 현재 기준선

```text
REPOSITORY=anbin1900-crypto/source-factory-core
UPPER_CONTROL_PR=#14
UPPER_BRANCH=integration/a1-yolla-panel-connection-frontier-v1
SUCCESSOR_BRANCH=integration/a0-yolla-workspace-automation-successor-v1
SUCCESSOR_BASE_COMMIT=124367a50a72505516666b4f427bfeda325ba3d3
RUNTIME_BASELINE=YOLLA_WORKSPACE_V5_CLEAN_RUNTIME
LEGACY_SAFE_PANEL_V10=FALLBACK_ONLY
V3_PATCH_CHAIN=RETIRED_FROM_FORWARD_DEVELOPMENT
PRODUCTION=false
READY=false
MERGE=false
```

Target PC에서 실제 확인된 기준선:

```text
V5_CLEAN_RUNTIME_LAUNCH=PASS
WORKSPACE_VISUAL_ACCEPTANCE=PASS
50_SEATS_RENDERED=PASS
7_GROUPS_RENDERED=PASS
CHATGPT_BROWSER_VIEW=PASS
PROJECT_CONTEXT_BINDING_RESTORED=PASS
WHITE_SCREEN_REGRESSION=RESOLVED
```

아직 실제 Target PC 최종 확인 전:

```text
V51_ACTUAL_COMMAND_CYCLE_COMPLETION=NOT_YET_CONFIRMED
V52_FIXED_LOGIN_PROFILE=NOT_YET_CONFIRMED
V52_DUAL_BROWSER_VIEW=NOT_YET_CONFIRMED
V52_ANALYZER_ARTIFACT=NOT_YET_CONFIRMED
```

## Ⅳ. Runtime 필수 구조

```text
YOLLA Control Panel V5.x
└─ 상태·열기·집중·정렬·재시작·로그·전체 Cycle

YOLLA Automation Workspace V5.x
├─ 워커 자동화
│  ├─ ChatGPT 전용 BrowserView
│  ├─ 워커 전용 주소창
│  ├─ 좌석·프로젝트·현재 대화
│  └─ 명령·Cycle·응답 자동화
├─ 사이트 구조 분석
│  ├─ 분석 전용 BrowserView
│  ├─ 분석 전용 주소창
│  ├─ 통신·페이지·Endpoint·Parameter 분석
│  ├─ 구조 분석률과 Adapter 생성률
│  └─ 사이트별 Adapter 산출
├─ 대량 수집
├─ DB 변환
├─ 지식 DB
└─ AI 좌석
```

선택한 탭의 주소창만 표시한다. 워커 ChatGPT BrowserView와 사이트 분석 BrowserView는 서로 독립적으로 유지한다.

## Ⅴ. 고정 상태와 세션 경로

```text
FIXED_BROWSER_USER_DATA=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
V5_STATE=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5\workspace_state.json
V51_STATE=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-1\workspace_state.json
V52_STATE=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\workspace_state.json
```

절대 금지:

```text
고정 Browser Profile 삭제·초기화
workspace_state 무조건 덮어쓰기
설치 때마다 새 Electron userData 생성
로그인 Cookie·LocalStorage 삭제
안정판 V5 삭제
V3 누적 Hotfix 재사용
Target PC 증거 없이 PASS 주장
Production·Ready·Merge 전환
```

## Ⅵ. A-0 시작 절차

1. `LATEST_A0_SUCCESSOR_HANDOFF_POINTER.json`을 먼저 읽는다.
2. Pointer가 가리키는 정확한 Commit과 문서를 확인한다.
3. 상위 PR #14와 A-0 Draft PR의 Remote Head를 비교한다.
4. V5 안정판과 상태·로그인 Profile을 백업한다.
5. P0 실행대기열을 순서대로 수행한다.
6. 각 Cycle마다 START·PROGRESS·TEST·FINAL JSON을 Commit한다.
7. Chat과 PR Comment에는 Commit·Pointer·요약만 게시한다.

## Ⅶ. 보고 권위

공식 보고권위는 GitHub Remote Head에 Commit된 JSON과 Markdown이다. Chat과 PR Comment는 Pointer 및 비권위 요약이다.

필수 보고 항목:

```text
directive_id
cycle_id
role
base_commit
observed_remote_head
owned_paths
status
progress_percent
artifacts
tests
target_pc_observation
blockers
forbidden_counters
production
ready
merge
next_action
```

## Ⅷ. 성공 기준

A-0의 첫 종결 기준은 다음 최소 E2E이다.

```text
고정 로그인 Session 유지
→ 선택 좌석 실제 명령 전송
→ 정확한 Cycle ID 응답 회수
→ 사이트 구조 분석 Job 생성
→ 사이트별 Adapter Candidate 1건 생성
→ Verified Adapter 1건을 B그룹에 전달
→ B그룹 Collection·DB Package Pointer 수신
→ D그룹 Knowledge Acceptance Pointer 수신
→ C그룹 AI 좌석에서 지식 조회 1건 PASS
→ 패널 전체 상태와 진행률 표시
→ 다음 Cycle 자동 생성
```

A-0는 이 흐름이 반복 가능하고 재시작 후 복구 가능할 때까지 실행·교정·검증을 지속한다.
