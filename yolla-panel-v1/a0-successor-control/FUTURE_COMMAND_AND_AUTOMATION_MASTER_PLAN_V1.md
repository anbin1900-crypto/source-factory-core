# YOLLA Workspace 향후 지휘·자동화 마스터 계획 V1

## I. 목적

이 문서는 현재 상위 지휘자의 대화 컨텍스트가 종료되더라도 후임 지휘체계가 중단 없이 다음 목표를 계속 수행하도록 만든 권위 계획이다.

> 패널이 사이트 구조 분석, 사이트별 Adapter 생성, 대량 수집, 문서 분해, AI 의미화, D그룹 Knowledge DB 수용, 분야별 전문 AI 가동, 웹 앱 반영까지 지속적으로 지휘하고 자동 순환시키는 체계를 완성한다.

## II. 공식 권위와 현재 기준선

```text
REPOSITORY=anbin1900-crypto/source-factory-core
UPPER_CONTROL_PR=17
UPPER_BRANCH=integration/a0-yolla-workspace-automation-successor-v1
RUNTIME_BASELINE=YOLLA_WORKSPACE_V5_CLEAN_RUNTIME
TARGET_PC_V5_VISUAL_ACCEPTANCE=PASS
SEAT_COUNT=50
GROUP_COUNT=7
WHITE_SCREEN_REGRESSION=RESOLVED
```

아직 실제 Target PC 종결검증 전인 항목:

```text
V51_ACTUAL_COMMAND_CYCLE_COMPLETION=NOT_YET_CONFIRMED
V52_FIXED_LOGIN_PROFILE=NOT_YET_CONFIRMED
V52_WORKER_ANALYZER_DUAL_BROWSER=NOT_YET_CONFIRMED
V52_ANALYZER_ARTIFACT_AND_ADAPTER_FACTORY=NOT_YET_CONFIRMED
FULL_A2_TO_B_TO_C_TO_D_TO_C_TO_A0_E2E=NOT_YET_CONFIRMED
```

GitHub Remote Head에 Commit된 JSON·Markdown·Pointer만 공식 권위다. Chat과 PR Comment는 Pointer와 비권위 요약으로만 사용한다.

## III. 지휘체계

```text
사용자
└─ A-1 YOLLA Workspace 상위 지휘자
   └─ A-0 Automation Execution Successor Commander
      ├─ A-2 Generic Site Analyzer·Adapter Factory Commander
      ├─ B-1 Collection·DB Materialization Commander
      ├─ C-1 Semantic Knowledge·Domain AI Runtime Commander
      └─ D-1 Knowledge DB Authority Commander
```

### A-1 상위 지휘자

- 제품 방향, 최종 우선순위, 그룹 경계, 수용기준, 충돌조정, 승계 결정을 담당한다.
- 세부 구현을 직접 장기간 소유하지 않는다.
- A-0의 통합 결과와 각 그룹의 권위 보고서를 기준으로 다음 Cycle을 승인·수정한다.

### A-0 실행·통합 후임

- 패널 Shell, Workspace Runtime, 로그인 Profile, 좌석, BrowserView, 명령 Cycle, 상태, 진행률, 업데이트, Rollback, Provider 통합의 단일 소유자다.
- A-2·B·C·D 산출물을 공통 Runtime에 탑재하고 다음 작업을 자동 발행한다.
- 그룹 산출물을 대신 구현하지 않는다.

### A-2·B-1·C-1·D-1

각 Commander는 자신의 전용 PR·Branch·Owned Root·계약·Artifact를 소유하며, 패널 Shell과 공통 Electron Main을 직접 수정하지 않는다.

## IV. 불변 운영원칙

```text
ONE_RUNTIME
ONE_PANEL_SHELL_OWNER=A-0
GROUP_DELIVERY=PROVIDER+VERSIONED_CONTRACT+IMMUTABLE_ARTIFACT
OFFICIAL_AUTHORITY=GITHUB_REMOTE_HEAD_COMMITTED_LEDGER
TARGET_PC_PASS_REQUIRES_TARGET_PC_EVIDENCE
FIXTURE_FIRST_BEFORE_LIVE
NO_AUTH_OR_ACCESS_CONTROL_BYPASS
NO_UNAPPROVED_PRODUCTION
NO_READY
NO_MERGE
```

보존 대상:

```text
E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
workspace_state
project_url/context_url bindings
command cycle ledgers
analysis runs
adapter packages
raw artifacts
DB packages
knowledge release ledgers
```

업데이트는 런타임 파일만 교체하며, 위 상태·Profile·원장은 삭제하거나 초기화하지 않는다.

## V. 단계별 지휘계획

### PHASE 0 — 지휘권·승계 기반 종결

목표:

- A-0 PR #17과 그룹 PR #18~#21의 역할헌장·첫 지시·보고규칙을 활성화한다.
- 각 Commander가 START Report를 Commit한다.

PASS Gate:

```text
A0_START_REPORT=COMMITTED
A2_START_REPORT=COMMITTED
B1_START_REPORT=COMMITTED
C1_START_REPORT=COMMITTED
D1_INTEGRATION_START_REPORT=COMMITTED
POINTERS_READABLE_FROM_REMOTE_HEAD=true
```

### PHASE 1 — V5.2 Target PC 안정화

A-0 우선 수행:

1. 고정 `userData`와 Browser Profile을 버전 독립 경로로 사용한다.
2. 업데이트 후 ChatGPT 로그인 Session이 유지되는지 확인한다.
3. 워커 전용 BrowserView와 분석 전용 BrowserView를 분리한다.
4. 선택한 탭의 주소창만 한 개 표시한다.
5. V5 안정판·workspace_state·Cycle Ledger를 보존한다.
6. 설치·종료·재실행·PC 재부팅 후 상태복원을 검증한다.

PASS Gate:

```text
LOGIN_SESSION_AFTER_UPDATE=PASS
LOGIN_SESSION_AFTER_RESTART=PASS
WORKER_BROWSER_VIEW=PASS
ANALYZER_BROWSER_VIEW=PASS
WORKER_CONTEXT_UNCHANGED_AFTER_ANALYZER_NAVIGATION=PASS
TAB_SPECIFIC_SINGLE_ADDRESS_BAR=PASS
STATE_PRESERVATION=PASS
```

### PHASE 2 — 실제 워커 명령 자동화 종결

A-0 수행:

```text
selected seat
→ saved context open
→ dynamic cycle ID
→ actual ChatGPT prompt dispatch
→ seat RUNNING
→ exact ROLE/CYCLE_ID result recovery
→ PASS/BLOCKED/ERROR classification
→ seat final state
→ durable cycle receipt
```

PASS Gate:

```text
ACTUAL_PROMPT_DISPATCH=PASS
ACTUAL_GPT_RESPONSE=PASS
EXACT_ROLE_MATCH=PASS
EXACT_CYCLE_ID_MATCH=PASS
STATUS_TRANSITION=PASS
DUPLICATE_ACTIVE_CYCLE_REJECT=PASS
RESTART_RECOVERY_OR_EXPLICIT_ABORT=PASS
```

### PHASE 3 — A-2 범용 사이트 분석기·Adapter Factory

A-2 수행:

1. 사이트 주소로 이동하고 사용자의 정상 브라우저 조작을 관찰한다.
2. Network·페이지·검색·필터·세션·헤더·페이지네이션·응답 Schema를 규명한다.
3. 분석 진행률을 실제 완료단계 기반으로 표시한다.
4. SiteStructureProfile과 VerifiedAdapterPackage를 생성한다.
5. Fixture-only Adapter Candidate 1건을 Replay 검증한다.
6. A-0에 Analyzer Provider와 Progress ViewModel을 인계한다.

진행률 원칙:

```text
progress_is_based_on_completed_work=true
progress_is_monotonic_after_scope_freeze=true
elapsed_time_based_fake_progress=false
```

PASS Gate:

```text
SITE_ANALYSIS_CONTRACT=PASS
PROGRESS_EVENT=PASS
ENDPOINT_CATALOG=PASS
PAGINATION_CONTRACT=PASS
RESPONSE_SCHEMA=PASS
ADAPTER_GENERATION=PASS
REPLAY_FIXTURE=PASS
A2_TO_B_HANDOFF=PASS
```

### PHASE 4 — B 범용 수집·DB Materialization

B-1 수행:

1. A-2의 VerifiedAdapterPackage를 로드한다.
2. 범위·quota·schedule·page/cursor 반복 계획을 만든다.
3. Fixture-first 수집, Retry, Resume, 증분 처리 계약을 검증한다.
4. Raw response와 Metadata를 불변 Artifact로 보존한다.
5. 정규화·중복제거 후 SQLite/DB Package를 생성한다.
6. DIntakeRequest를 만든다.
7. A-0에 Collector Provider와 진행률을 인계한다.

PASS Gate:

```text
VERIFIED_ADAPTER_CONSUMPTION=PASS
COLLECTION_RETRY_RESUME=PASS
RAW_ARTIFACT_SHA256_READBACK=PASS
NORMALIZED_DATASET=PASS
DB_PACKAGE=PASS
B_TO_D_HANDOFF=PASS
```

### PHASE 5 — C 문서 분해·AI 의미화

C-1 수행:

1. 수집 데이터와 법률·판례·편람·서류를 의미단위로 분해한다.
2. Source span과 Evidence를 보존한다.
3. 분야·개념·관계·적용조건·적용대상·중요도를 분류한다.
4. KnowledgeCandidateBundle을 생성한다.
5. D Intake 계약에 따라 제출한다.

PASS Gate:

```text
DOCUMENT_UNIT_BUNDLE=PASS
SOURCE_SPAN_PRESERVATION=PASS
SEMANTIC_CLASSIFICATION=PASS
EVIDENCE_BINDING=PASS
KNOWLEDGE_CANDIDATE_BUNDLE=PASS
C_TO_D_HANDOFF=PASS
```

### PHASE 6 — D Knowledge DB 수용·Release

D-1 수행:

1. B MaterializedDatabasePackage와 C KnowledgeCandidateBundle을 Intake한다.
2. Source·Provenance·Schema·Evidence·중복·충돌·개정·버전을 검증한다.
3. 수용·부분수용·거절 Receipt를 생성한다.
4. KnowledgeRelease, QueryContract, CitationContract, RevisionLedger를 발행한다.
5. 실제 DB 권위는 `yolla-real-estate-data-engine` D-1 PR #188의 정책을 따른다.

PASS Gate:

```text
CANONICAL_SCHEMA_MAPPING=PASS
EVIDENCE_VALIDATION=PASS
ACCEPTANCE_RECEIPT=PASS
KNOWLEDGE_VERSION=PASS
QUERY_CONTRACT=PASS
CITATION_CONTRACT=PASS
D_TO_C_RELEASE=PASS
```

### PHASE 7 — C 분야별 전문 AI Runtime

C-1 수행:

```text
D KnowledgeRelease
+ common model
+ domain prompt
+ domain tools
+ query/citation contract
= domain specialist AI
```

최초 논리좌석 후보:

```text
AI-REAL-ESTATE-01
AI-LAW-01
AI-GAS-STATION-01
AI-HAZMAT-01
AI-API-01
```

PASS Gate:

```text
KNOWLEDGE_VERSION_BOUND=PASS
QUERY=PASS
CITATION=PASS
EVIDENCE_TRACE=PASS
AI_RUNTIME_RECEIPT=PASS
C_TO_A0_PROVIDER_HANDOFF=PASS
```

### PHASE 8 — 패널 통합·웹 앱 자동화

A-0 수행:

최종 탭 목표:

```text
[워커 자동화]
[사이트 구조 분석]
[어댑터 관리]
[대량 수집]
[문서 분해·AI 의미화]
[DB 변환]
[지식 DB]
[AI 좌석]
[전체 Cycle]
```

패널은 각 Lane의 Provider를 탑재하고 다음 진행률을 동시에 표시한다.

```text
사이트 구조 분석률
Adapter 생성·검증률
수집률
자료 분해율
AI 의미 분류율
DB 변환률
D그룹 수용률
전문 AI 연결률
웹 앱 반영률
```

PASS Gate:

```text
ONE_RUNTIME=PASS
PROVIDER_ISOLATION=PASS
FULL_PROGRESS_VIEW=PASS
ERROR_AND_BLOCKER_VISIBILITY=PASS
RETRY_AND_RESUME_CONTROL=PASS
RESULT_REOPEN=PASS
FULL_MINIMUM_E2E=PASS
```

## VI. 자동 순환 알고리즘

```text
1. A-0가 다음 P0 Job을 선택한다.
2. Directive와 Cycle ID를 Commit한다.
3. 대상 Commander가 START Report를 Commit한다.
4. Commander가 워커를 병렬 배정한다.
5. 각 Lane은 ProgressEvent와 Artifact를 Commit한다.
6. A-0는 계약검증 후 다음 Lane에 인계한다.
7. 실패는 RETRYABLE/BLOCKED_EXTERNAL/TERMINAL_ERROR로 분류한다.
8. 재시도 가능하면 동일 Cycle의 attempt를 증가시킨다.
9. 외부 차단이면 이벤트 대기상태로 전환하고 다른 독립 Job을 진행한다.
10. 완료 후 FINAL Report와 Pointer를 갱신한다.
11. A-0가 전체 상태를 패널에 반영한다.
12. 미완료 Backlog 중 다음 Job을 자동 발행한다.
```

상태 표준:

```text
PENDING
ASSIGNED
RUNNING
ARTIFACT_READY
VALIDATING
ACCEPTED
INTEGRATED
AI_ACTIVE
COMPLETED
BLOCKED_EXTERNAL
RETRYABLE_ERROR
TERMINAL_ERROR
CANCELLED
```

## VII. Wave·보고·검증 규칙

### Wave

- 한 Wave는 `지시 → 수행 → 보고 → 수용/재지시` 한 회다.
- 서로 Owned Path가 겹치지 않는 작업만 병렬화한다.
- 공통 Runtime 수정은 A-0 한 명만 수행한다.

### 공식 보고

각 Commander는 최소 다음을 Commit한다.

```text
START_REPORT
PROGRESS_REPORT 또는 BLOCKER_REPORT
TEST_REPORT
FINAL_REPORT
LATEST_REPORT_POINTER
```

보고서 필수 필드:

```text
role
cycle_id
directive_id
branch
observed_remote_head
owned_paths
status
progress_percent
artifacts
tests
forbidden_counters
blockers
next_action
production
ready
merge
reported_at
```

### PASS 조건

- Build·정적 테스트 PASS는 Target PC PASS가 아니다.
- Target PC 실행, 로그인 유지, 실제 ChatGPT 입력·응답, 실제 Artifact, 실제 DB 적재는 각각 별도 증거가 있어야 한다.
- CI Runner가 실행되지 않았으면 CI PASS를 주장하지 않는다.

## VIII. 우선순위 정책

```text
P0 = 현재 E2E를 막는 단일 병목
P1 = 다음 Lane 인계를 위한 계약·Provider
P2 = 품질·진단·관측성·성능
P3 = 편의 UI·확장 기능
```

A-0는 항상 다음 순서로 선택한다.

```text
1. 데이터 손실·로그인 만료·Runtime 불안정
2. 현재 최소 E2E 병목
3. 그룹 간 계약 부재
4. Target PC 수용검증
5. 자동 재시도·복구
6. 확장 기능
```

## IX. 중단·보류 조건

즉시 중단 또는 HOLD:

```text
LOGIN_PROFILE_LOSS_RISK
WORKSPACE_STATE_OVERWRITE_RISK
CROSS_GROUP_OWNED_PATH_CONFLICT
AUTH_OR_ACCESS_CONTROL_BYPASS
UNAPPROVED_PAID_OPERATION
UNAPPROVED_PRODUCTION_CONNECTION
SENSITIVE_CREDENTIAL_EXPOSURE
CANONICAL_DB_DIRECT_WRITE_OUTSIDE_D_AUTHORITY
```

부분 실패 시 전체를 폐기하지 않는다. 마지막 PASS Artifact와 Pointer를 보존하고 실패 Lane만 교정한다.

## X. 지휘자 컨텍스트 종료 시 승계

새 상위 지휘자 또는 A-0는 다음 순서로 읽는다.

```text
1. LATEST_FUTURE_COMMAND_PLAN_POINTER.json
2. FUTURE_COMMAND_AND_AUTOMATION_MASTER_PLAN_V1.md
3. COMMAND_PHASE_GATE_ROADMAP_V1.json
4. COMMANDER_CONTEXT_FAILOVER_AND_SUCCESSION_POLICY_V1.json
5. LATEST_A0_SUCCESSOR_HANDOFF_POINTER.json
6. LATEST_GROUP_ROLE_ASSIGNMENT_POINTER.json
7. 각 Commander의 LATEST_REPORT_POINTER
8. 실제 Remote Head와 Target PC Receipt
```

승계자는 첫 작업으로 `SUCCESSOR_ACCEPTANCE_REPORT`를 Commit하고, 이전 대화 기억이 아닌 GitHub 원장으로 현재 상태를 재구성한다.

## XI. 최종 완료 정의

다음이 모두 실제 증거와 함께 PASS할 때만 초기 자동화 기반이 완료된다.

```text
V5_RUNTIME_STABLE
LOGIN_SESSION_PERSISTENT
WORKER_COMMAND_CYCLE_AUTOMATED
GENERIC_ANALYZER_GENERATES_VERIFIED_ADAPTER
GENERIC_COLLECTOR_MATERIALIZES_DB_PACKAGE
DOCUMENTS_DECOMPOSED_AND_SEMANTICALLY_CLASSIFIED
D_KNOWLEDGE_RELEASE_PUBLISHED
DOMAIN_AI_USES_VERSIONED_KNOWLEDGE_WITH_CITATIONS
PANEL_CONTINUOUSLY_ORCHESTRATES_THE_PIPELINE
FULL_E2E_RESTART_RECOVERY_PASS
```

그 이후 웹 앱은 전문 AI를 실제 업무 흐름에 연결하는 별도 Product Cycle로 전개한다.
