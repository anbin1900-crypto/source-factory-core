# BROKER DESKTOP INFORMATION ARCHITECTURE V1

```text
PROJECT=YOLLA_AI_REAL_ESTATE_SERVICE
PACKAGE_ID=YOLLA-REAL-ESTATE-SITE-FOUNDATION-20260804-001
WORKER_ID=B-4
EPIC_ID=RE-W3-E01-BROKER-DESKTOP-PERFORMANCE
DIRECTIVE_ID=REAL-ESTATE-COMMANDER-TO-B4-BROKER-DESKTOP-PERFORMANCE-V1-20260804-001
STATUS=DESIGN_CONTRACT_COMPLETE
PRODUCTION=false
READY=false
MERGE=false
```

## I. 목적과 경계

중개업소 화면은 소비자 검색 사이트의 부가 메뉴가 아니라, 매일 업무를 수행하는 별도 데스크톱 제품이다. 본 계약은 `LEFT_NAV + TOP_STATUS + MULTI_TAB_WORKSPACE + RIGHT_ASSISTANT_PANEL`을 고정 골격으로 삼고, 전문 AI가 비활성화되어도 표·필터·상태·작업큐·템플릿만으로 업무가 종결되도록 한다.

본 산출물은 정보구조와 화면·상태 계약만 정의한다. 실제 애플리케이션 코드, Production 연결, Ready 전환, Merge, 외부 데이터 수집은 수행하지 않는다.

## II. 참조 Readback

| 참조 | 확인한 핵심 | 본 설계 반영 |
|---|---|---|
| `yolla-gas-station-portal/main:apps/web/app/page.tsx` | 단일 페이지에서 질의, 표 결과, 상세 링크를 제공 | 표 중심 업무 홈과 행 단위 객체 진입 |
| `yolla-gas-station-portal Draft PR #5` | 검색·기관/상태 필터, 5초 재조회, 행 더블클릭·상세 버튼, 별도 창 상세 | 공통 목록 패턴, 수동 새로고침, 독립 상세 갱신, `DETACH_WINDOW` |
| `yolla-gas-station-portal Issue #6` | 소비자/중개업소 이중 경험, 전국 중개업소 원장, 외부 활동 연결, 공통 코어 | 별도 `/broker/**` 라우트와 원장 연결 상태 |
| `yolla-gas-station-portal Issue #9` | 업무 홈, CRM, 문서, 계약, 홍보, 협업, 내 실적 | 메뉴·객체·작업큐·문서 흐름 전체 |
| `LISTING_SECURITY_POLICY_V1` | 등급별 검색·지도·순위·출력·외부게시 제한 | 공개/내부/소유자/조건매칭/지정공유/최고보안별 행동 제한 |
| `INCREMENTAL_UPDATE_DEDUP_RANKING_CONTRACT_V1` | 순위 필수 필드, 기간·근거·출처·방법론, 비공개 원본 제외 | 모든 순위 카드와 표에 근거기간·출처·갱신시각 표시 |

## III. 제품 경계

### 1. 소비자 화면

- 기본 라우트: `/real-estate/**`
- 익명 또는 소비자 계정 중심
- 밝은 탐색형 레이아웃, 검색·지도·비교 중심
- 공개 매물과 권리 허용 외부 원문 연결만 표시
- 중개업소 내부 TaskQueue, 고객정보, 내부 문서, 순위 상세 근거 원장은 노출하지 않음

### 2. 중개업소 데스크톱

- 기본 라우트: `/broker/**`
- `ACTIVE_OFFICE_MEMBER` 이상만 접근
- 밀도 높은 데스크톱형 레이아웃, 표·필터·상태·탭·큐 중심
- 사업장 원장 연결과 역할 범위가 서버에서 확인된 뒤 데이터 표시
- 순위 산정에는 공개·권리허용 근거만 사용하고 비공개 원본 입력은 0건이어야 함
- 내부 매물·고객·문서는 등급과 권한에 따라 별도 표시하며 순위 산정과 분리

### 3. 시각 경계

| 항목 | 소비자 | 중개업소 |
|---|---|---|
| Shell | SearchShell | DesktopShell |
| 기본 탐색 | 상단 검색·카드·지도 | 좌측 고정 메뉴·상단 상태·다중 탭 |
| 정보밀도 | 낮음~중간 | 중간~높음 |
| 핵심 행동 | 검색·비교·문의·원문 이동 | 등록·배정·후속조치·문서작성·정정 |
| 상세 진입 | 페이지 이동/모달 | WorkTab 기본, 필요 시 별도 창 |
| 권한 실패 | 로그인 또는 공개정보로 복귀 | 접근 거부 + 권한/사업장 상태 표시 |

## IV. DesktopShell 책임 경계

### 1. DesktopShell

DesktopShell은 전역 프레임만 소유한다.

- 현재 사업장, 사용자 역할, 연결상태, 동기화시각을 표시한다.
- LEFT_NAV, TOP_STATUS, MULTI_TAB_WORKSPACE, RIGHT_ASSISTANT_PANEL을 배치한다.
- 활성 탭, 탭 복원, 키보드 단축키, 전역 알림, 세션 만료를 관리한다.
- 도메인 객체의 저장 규칙, 순위 계산, CRM 상태전이는 소유하지 않는다.
- 소비자 라우트를 내부 탭으로 직접 렌더링하지 않는다.

### 2. WorkTab

WorkTab은 한 업무 문맥을 캡슐화한다.

- 키: `workspace_key = object_type + ":" + object_id + ":" + view_mode`
- 동일 키 재진입은 기존 탭을 활성화하며 중복 탭을 만들지 않는다.
- 수정 중 상태, 필터, 스크롤, 선택행을 탭별로 유지한다.
- 탭 종류: `LIST`, `DETAIL`, `EDIT`, `COMPARE`, `DOCUMENT`, `REPORT`, `EXTERNAL_SOURCE`.
- 외부 원문은 새 브라우저 창/탭으로 열고 욜라 편집 상태와 혼합하지 않는다.
- 상세 별도 창은 `DETACH_WINDOW`로 생성하되 권한 재검증과 독립 갱신을 수행한다.

### 3. TaskQueue

TaskQueue는 실행이 필요한 일을 표준 상태로 관리한다.

- 생성 주체: 사용자, 규칙 엔진, 데이터 갱신, 문의 수신, 문서 만료, 정정 요청.
- 상태: `NEW → READY → IN_PROGRESS → WAITING_EXTERNAL → DONE` 또는 `CANCELLED`.
- 필수 필드: task_id, task_type, title, priority, due_at, assignee_id, office_id, related_object_refs, status, source, created_at, updated_at.
- 화면 카드나 AI 답변이 직접 업무 완료를 선언할 수 없으며 Task 상태전이와 감사이벤트가 필요하다.
- 전문 AI 비활성 시에도 규칙 기반 생성·수동 배정·필터·일괄처리로 동작한다.

### 4. RightAssistantPanel

- 컨텍스트 객체 요약, 다음 행동, 템플릿 추천, 체크리스트를 표시한다.
- `AI_DISABLED`일 때 규칙·템플릿·도움말 모드로 자동 전환한다.
- 저장·전송·등급변경·계약 확정은 반드시 본문 WorkTab에서 사용자가 확인한다.
- TOP_SECRET 원본과 허용되지 않은 개인정보를 프롬프트 또는 추천 입력으로 사용하지 않는다.

## V. 고정 화면 골격

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP_STATUS: 사업장 | 원장연결 | 사용자역할 | 동기화 | 긴급알림 | 내 작업수 │
├──────────────┬────────────────────────────────────────────┬─────────────────┤
│ LEFT_NAV     │ MULTI_TAB_WORKSPACE                        │ RIGHT_ASSISTANT │
│ 업무 홈      │ [업무 홈][매물#123][고객#77][계약서#18]   │ 객체 요약       │
│ 내 실적      │                                            │ 다음 행동       │
│ 매물         │ 표 / 필터 / 상세 / 편집 / 미리보기         │ 체크리스트       │
│ 외부 발견    │                                            │ 템플릿          │
│ 문의·상담    │                                            │                 │
│ 고객·거래처  │                                            │ AI/규칙 모드    │
│ 일정         │                                            │                 │
│ 문서·계약    │                                            │                 │
│ 홍보         │                                            │                 │
│ 협업         │                                            │                 │
└──────────────┴────────────────────────────────────────────┴─────────────────┘
```

## VI. LEFT_NAV 정보구조

1. **업무 홈** — 오늘 할 일, 지연업무, 신규문의, 매물 만료, 문서 만료, 최신 외부 발견.
2. **내 실적** — 종합·지역·전문분야·매물종류·거래유형·콘텐츠·최신성 순위와 근거.
3. **매물** — 공개/내부/소유자전용/조건매칭/지정공유/최고보안 매물.
4. **외부 발견** — 외부 부동산 사이트·블로그·카페·유튜브의 발견 위치와 확인 상태.
5. **문의·상담** — 신규 문의, 상담 기록, 후속 연락, 응답 SLA.
6. **고객·거래처** — 개인 고객과 협력 거래처를 구분하되 관계관리 기반은 공유.
7. **매칭** — 고객 희망조건과 공개·허용 매물의 규칙 기반 연결.
8. **일정** — 방문, 연락, 계약, 갱신, 문서 기한.
9. **문서·계약** — 서식, 표준계약서, 버전·시행일·출처, PDF 미리보기.
10. **법률·자료** — 법령·판례·행정자료 검색 진입과 근거 저장.
11. **홍보 제작** — 전단지, 블로그·카페·SNS·유튜브 템플릿.
12. **협업** — 게시판, 자료실, 댓글, 알림, 담당자 배정.
13. **설정** — 사업장 연결, 직원·역할, 알림, 외부채널, 정정 이력.

## VII. 업무 홈 계약

### 우선순위 A — 즉시 행동

- 오늘 기한 Task
- 신규 문의 및 미응답 SLA 초과
- 계약·방문 일정
- 매물 종료/갱신 필요
- 사업장 원장 연결 충돌 또는 정정 대기

### 우선순위 B — 운영 현황

- 공개/비공개 매물 상태별 건수
- 고객 후속 연락 예정
- 문서·계약서 작성 중
- 외부 발견 신규/변경/종료 의심
- 순위 변동과 근거 완전성 경고

### 우선순위 C — 개선 제안

- 오래된 공개 매물
- 출처 확인 필요 외부 게시물
- 활동이 없는 채널
- 문의 대비 응답률 저하
- 템플릿으로 생성 가능한 홍보 작업

모든 위젯은 `열기`, `작업 생성`, `담당자 배정`, `필터 적용` 중 하나 이상의 비-AI 행동을 제공한다.

## VIII. 가입 직후 사업장 연결과 내 실적 상태 흐름

```text
ACCOUNT_CREATED
  → REGISTRY_MATCHING
  → AUTO_LINKED_VERIFIED
      → PERFORMANCE_BOOTSTRAPPING
      → PERFORMANCE_READY
  또는
  → CANDIDATES_FOUND
      → USER_CONFIRMATION_REQUIRED
      → LINK_REVIEW_PENDING
      → ACTIVE_LINK
      → PERFORMANCE_BOOTSTRAPPING
      → PERFORMANCE_READY
  또는
  → NO_MATCH / CONFLICT / SUSPENDED
      → CORRECTION_TASK_CREATED
      → EVIDENCE_SUBMITTED
      → REVIEWED
      → ACTIVE_LINK 또는 REJECTED
```

### 상태별 표시

- `REGISTRY_MATCHING`: 원장 검색 중, 예상 소요시간 대신 현재 단계와 재시도 버튼 표시.
- `CANDIDATES_FOUND`: 상호, 대표자 공개정보, 주소 일부, 등록번호 마스킹 비교.
- `ACTIVE_LINK`: office_id와 registry_record_id 연결, 연결 근거와 확인일 표시.
- `PERFORMANCE_BOOTSTRAPPING`: 공개·권리허용 근거 수집/계산 상태를 항목별로 표시.
- `PERFORMANCE_READY`: 순위, 외부 발견, 최신성·활동·문의 지표 표시.
- `CONFLICT`: 동일 원장 다중 주장, 폐업·이전·상호변경 등 충돌 유형 표시.
- `SUSPENDED`: 원장 상태 또는 회원 권한 문제로 데이터 변경 차단.

### 정정 흐름

1. 사용자가 연결정보 또는 외부 발견 항목에서 `정정 요청`을 선택한다.
2. 정정 유형, 주장 내용, 근거 링크/문서, 공개 가능 범위를 제출한다.
3. `CORRECTION_REVIEW` Task가 생성되고 원본 값은 보존된다.
4. 검토자는 `ACCEPTED`, `PARTIALLY_ACCEPTED`, `REJECTED`, `MORE_EVIDENCE_REQUIRED` 중 하나를 기록한다.
5. 승인 시 연결 revision 또는 외부 발견 relation이 갱신되고 관련 순위는 재계산 대기 상태가 된다.
6. 모든 단계에 요청자, 검토자, 시각, 사유, 전후 값 해시를 감사기록으로 남긴다.

## IX. 내 실적과 순위 표시 원칙

각 순위는 반드시 다음을 함께 표시한다.

- 순위 유형과 범위
- 현재 순위 / 비교 모집단 수
- 점수와 점수 구성요소
- 근거기간 `period_start`·`period_end`
- 출처 `source_refs`
- 근거 `evidence_refs`
- 산정 방법론 버전
- 최종 갱신시각
- 근거 완전성 및 게시 가능 상태
- 동점 처리 규칙
- 정정 요청 행동

### 순위 차원

| 차원 | 예시 범위 | 필수 주석 |
|---|---|---|
| 종합 | 전국 전체 | 공개·권리허용 근거만 사용 |
| 지역 | 시도, 시군구 | 행정구역 코드와 모집단 수 |
| 전문분야 | 아파트, 상가, 토지 등 | 전문분야 분류 버전 |
| 매물종류 | 주택, 오피스텔, 상업용 등 | 공개 매물 projection 기준 |
| 거래유형 | 매매, 전세, 월세, 임대 | 기간과 표본 수 |
| 콘텐츠 | 블로그·카페·유튜브·자체 게시물 | 권리상태와 활동 근거 |
| 최신성 | 최근 확인·갱신·응답 | 오래된 자료의 감점 규칙 |

`OVERALL`, `REGION`, `SPECIALTY`, `TRANSACTION_TYPE`은 D그룹 순위 계약과 직접 정렬한다. `LISTING_TYPE`, `CONTENT_ACTIVITY`, `FRESHNESS`는 동일 필수필드와 비공개 원본 제외 규칙을 따르는 확장 차원으로 제안하며 D그룹 방법론 승인 전에는 `PROVISIONAL`로 표시한다.

## X. 외부 발견 위치와 지표

외부 발견 표의 최소 열:

- 채널: `REAL_ESTATE_SITE`, `BLOG`, `CAFE`, `YOUTUBE`, `OTHER_PUBLIC_WEB`
- 출처명, 원문 URL, 게시물 제목
- 발견 위치: 검색어/카테고리, 페이지, 노출 순번 또는 영상/채널 위치
- 최초 발견, 마지막 확인, 마지막 변경
- 상태: `DISCOVERED`, `ACTIVE_UNCHANGED`, `ACTIVE_CHANGED`, `ENDED_SUSPECTED`, `ENDED_CONFIRMED`, `RIGHTS_BLOCKED`, `UNREACHABLE_RETRYABLE`
- 사업장 연결 확신도와 근거
- 최신성 점수, 활동 횟수, 문의 전환 집계
- 권리상태와 허용 행동: 보기, 원문 이동, 정정 요청
- 원문 재게시 여부: 기본 `false`

### 문의 지표

- 신규 문의 수
- 유효 문의 수
- 최초응답 중앙시간
- SLA 내 응답률
- 방문예약 전환
- 계약진행 전환
- 출처별 문의
- 집계기간, 집계시각, 개인정보 비식별 기준

## XI. 객체 연결

```text
Organization/Office
 ├─ Membership/Role
 ├─ Listing
 │   ├─ Inquiry
 │   ├─ CustomerRequirementMatch
 │   ├─ Document/Contract
 │   ├─ Appointment
 │   └─ MarketingAsset
 ├─ Customer
 │   ├─ Inquiry/Consultation
 │   ├─ Requirement
 │   └─ Appointment
 ├─ Counterparty
 │   └─ Relationship/Deal
 ├─ ExternalDiscovery
 │   └─ CorrectionCase
 └─ PerformanceSnapshot
     ├─ RankingRecord
     └─ MetricSeries
```

고객과 거래처는 `RelationshipParty` 기반 식별·연락처·동의·태그 구조를 공유하지만, 고객은 수요·상담 중심, 거래처는 협업·공급·계약관계 중심으로 분리한다.

## XII. 문서·홍보 흐름

### 서식·표준계약서

`TEMPLATE_SELECTED → SOURCE_VERSION_VERIFIED → DRAFT → REVIEW_REQUIRED → APPROVED → GENERATED → SIGNING/DELIVERY → ARCHIVED`

필수 메타데이터: template_id, version, effective_from, source_authority, source_url, checksum, generated_at, related_listing_id, related_customer_id, approver_id.

### 전단지·외부 게시물

`LISTING_SELECTED → SECURITY_CHECK → RIGHTS_CHECK → TEMPLATE_EDIT → PREVIEW → APPROVAL → EXPORT_OR_PUBLISH_HANDOFF`

- PUBLIC만 기본 생성 허용.
- OFFICE_INTERNAL은 명시적 승인된 공개용 사본이 없으면 생성 금지.
- OWNER_ONLY, CONDITION_MATCH_PRIVATE, DESIGNATED_SHARE, TOP_SECRET은 외부 게시물 생성 금지.
- 원문 외부 콘텐츠를 복제하지 않고 링크·출처·허용 범위만 사용한다.

## XIII. 목록·상세 새창 패턴 재사용

1. 목록은 서버 데이터의 필터·상태·갱신시각을 표시한다.
2. 행 클릭은 기본 WorkTab 상세를 연다.
3. `별도 창` 행동은 상세 비교, 문서 미리보기, 장시간 모니터링에만 제공한다.
4. 별도 창은 URL에 object_id와 view_mode만 전달하며 민감 원본 값을 넣지 않는다.
5. 창이 열릴 때 서버 권한을 다시 확인한다.
6. 동일 객체 별도 창은 안정된 window key로 재사용한다.
7. 5초 고정 갱신은 기본값이 아니며, 문의/외부상태 등 필요한 화면만 `POLLING`, 나머지는 `MANUAL` 또는 이벤트 갱신을 사용한다.

## XIV. Wave 2 소유경로 후보

```text
apps/real-estate-web/app/(broker)/**
packages/workspace-ui-core/**
packages/crm-core/**
packages/document-core/**
domains/real-estate/broker-workspace/**
docs/real-estate/broker-desktop/**
```

공유 인증·권한·매물 보안·순위 원장 계약은 각각 해당 단일 소유자의 계약을 소비하며 워커 3/B-4가 재정의하지 않는다.

## XV. 수용 점검

- 메뉴·라우트와 DesktopShell·WorkTab·TaskQueue 책임 경계: 정의 완료.
- 가입 직후 사업장 연결부터 내 실적·외부 게시물 위치: 상태 흐름 정의 완료.
- 종합·지역·전문분야·매물종류·거래유형·콘텐츠·최신성 순위: 기간·출처·갱신시각 필수화.
- 소비자와 중개업소: 라우트·권한·시각 경계 분리.
- 전문 AI 없음: 모든 핵심 흐름에 표·필터·상태·작업큐·템플릿 대체 경로 존재.
- 비공개 원본 순위 입력: 0.
- Production/Ready/Merge: 모두 false.
