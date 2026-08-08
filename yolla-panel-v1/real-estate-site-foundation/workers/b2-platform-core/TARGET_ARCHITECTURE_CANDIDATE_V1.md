# 욜라 AI 부동산 서비스 목표 아키텍처 후보 V1

## I. 판정

`yolla-gas-station-portal`의 현재 `main`은 **주유소 데이터 포털의 실행 가능한 로컬 골격**이다. FastAPI·Next.js·PostgreSQL/PostGIS·파일 적재·CI·Windows 부트스트랩 패턴은 재사용 가치가 있으나, 회원·게시판·댓글·자료실·사용자 파일·알림·범용 감사로그는 구현되어 있지 않다.

Draft PR #4와 #5에는 각각 수집 재개·SHA-256 Manifest, API 상태 게시판·상세·시험 실행 패턴이 있으나 둘 다 **Open Draft Unmerged**이므로 안정 코어로 간주하지 않는다. 알고리즘과 UI 패턴만 후보로 추출하며 원본 브랜치를 수정하지 않는다.

## II. 현재 소스와 후보의 경계

| 권위 | 상태 | 재사용 판단 |
|---|---|---|
| `main@40c78809926f827c283085f7867497ce01075411` | 현재 안정 기준 | 기존 주유소 서비스는 그대로 보존하고 공통 패턴만 추출 |
| Draft PR #4 `98d75399...` | 미병합 수집 자동화 | 날짜 분할, Manifest, Resume 개념은 수정 재사용; Opinet DOM·스케줄은 도메인 유지 |
| Draft PR #5 `458b4851...` | 미병합 API 상태 패널 | 게시판형 목록·필터·상세 행동은 수정 재사용; API Registry와 실행 원장은 API 도메인 소유 |

## III. 목표 트리

```text
apps/
├─ web/                              # 기존 주유소 웹, 이동·파괴 금지
├─ api/                              # 기존 주유소 API, 이동·파괴 금지
├─ real-estate-web/                  # 소비자·중개업소·관리자 웹
└─ real-estate-api/                  # 부동산 서비스 API

packages/
├─ platform-core/                    # B-2: ID, 오류, 페이지, 요청·이벤트 계약
├─ ui-core/                          # B-2: 목록·상세·폼·상태 공통 UI
├─ board-core/                       # B-2: 게시판·게시물·카테고리·공개범위
├─ file-core/                        # B-2: 첨부 메타·Checksum·Storage Port
├─ notification-core/                # B-2: 알림 Inbox·Delivery Port
├─ audit-core/                       # B-2: 범용 감사 이벤트
├─ auth-core/                        # B-5 소유 후보
├─ organization-core/                # B-5 소유 후보
├─ map-core/                         # B-3 소유 후보
├─ document-core/                    # B-4 소유 후보
└─ api-registry-core/                # B-6 또는 API/Data 소유 후보

domains/
├─ gas-station/                      # 장기적으로 기존 주유소 도메인 추출, 즉시 이동 금지
└─ real-estate/                      # 매물·중개업소·CRM 등 부동산 도메인

services/
├─ data-pipeline/                    # 기존 주유소 파이프라인 보존
├─ opinet-collector/                 # 기존·Draft Opinet 수집기 보존
└─ external-source-ingestion/        # 외부 부동산 출처 수집, 별도 워커 소유

docs/
└─ real-estate/
   └─ architecture/                  # B-2 설계 권위
```

## IV. 추가 방식

1. 기존 `apps/web`, `apps/api`, `database/init`, `services/data-pipeline`, `services/opinet-collector`를 대규모 이동하지 않는다.
2. `apps/real-estate-web`과 `apps/real-estate-api`를 새로 추가하고 공통 패키지를 참조한다.
3. 기존 `compose.yaml`은 주유소 회귀 기준으로 유지한다. 부동산 서비스는 별도 compose 파일 또는 additive profile로 연결한다.
4. 기존 CI는 주유소 회귀 권위로 유지하고, 공통 패키지 및 부동산 앱의 독립 빌드·테스트 Gate를 추가한다.
5. 데이터베이스는 주유소 테이블에 부동산 필드를 혼입하지 않는다. 공통 인프라와 도메인 스키마를 명시적으로 분리한다.

## V. 공통 코어 의존 방향

```text
apps/*
  ├─> domains/*
  └─> packages/*

domains/*
  └─> packages/*

packages/ui-core
  └─> packages/platform-core

packages/board-core
  ├─> packages/platform-core
  └─> packages/file-core (interface only)

packages/file-core
  └─> packages/platform-core

packages/notification-core
  └─> packages/platform-core event envelope

packages/audit-core
  └─> packages/platform-core event envelope
```

금지 방향:

```text
packages/* -> domains/*
packages/* -> apps/*
gas-station -> real-estate
real-estate -> gas-station
ui-core -> DB
notification-core -> domain DB direct access
audit-core -> domain DB direct access
```

## VI. 실제 구현 확인 결과

| 기능 | 판정 | 근거 |
|---|---|---|
| 회원 | 미구현 | `station_master.membership_status`는 사업장 Projection 상태일 뿐 사용자·세션·인증 구현이 아님 |
| 게시판 | 범용 코어 미구현 | README에서 커뮤니티를 후속 모듈로 명시; PR #5는 API 상태 전용 표 |
| 댓글 | 미구현 | Entity·API·UI 없음 |
| 자료실 | 미구현 | 문서/자료 라이브러리 Entity·Route 없음 |
| 파일·첨부 | 사용자 기능 미구현 | CSV/XLS 적재와 Receipt 파일만 존재하며 업로드 권한·첨부 메타·Storage Port 없음 |
| 알림 | 미구현 | Inbox·읽음 상태·Delivery Channel 없음 |
| 감사로그 | 부분 구현 | 수집·문자교정·API 실행용 운영 원장은 있으나 Actor/Resource/Action 범용 감사 계약은 없음 |
| 관리자 패턴 | Draft 후보 | PR #5의 목록·필터·상세·등록·시험 UI는 추출 후보이나 미병합·API 전용 |

## VII. B-2 Wave 2 소유경로 후보

```text
packages/platform-core/**
packages/ui-core/**
packages/board-core/**
packages/file-core/**
packages/notification-core/**
packages/audit-core/**
docs/real-estate/architecture/**
```

B-2가 소유하지 않는 경로:

```text
packages/auth-core/**
packages/organization-core/**
packages/map-core/**
packages/document-core/**
packages/api-registry-core/**
domains/real-estate/**
services/external-source-ingestion/**
```

## VIII. 중복 개발 방지 규칙

1. 공통 계약은 단일 소유자만 수정한다.
2. 다른 워커는 공통 계약을 복제하지 않고 버전된 import 또는 JSON Schema로 소비한다.
3. Draft PR의 코드는 병합 전에는 안정 코어가 아니다.
4. 도메인 특화 SQL·DOM Selector·필드명을 공통 패키지에 복사하지 않는다.
5. UI 추출 시 데이터 Fetch와 도메인 타입을 분리하고, Columns·Actions·Filters를 주입한다.
6. 공통 이벤트는 `event_id`, `event_type`, `schema_version`, `occurred_at`, `actor_ref`, `resource_ref`, `correlation_id`, `payload_ref`를 최소 필드로 한다.
7. 모든 새 패키지는 단독 Unit Test와 기존 주유소 회귀 Test를 함께 통과해야 한다.

## IX. Wave 2 최소 백로그 후보

1. `platform-core`: 오류 Envelope·Page/Cursor·Correlation·Event Envelope.
2. `ui-core`: DataBoard·DetailShell·FormShell·Status/Loading/Error/Empty.
3. `file-core`: FileRef·Attachment·Checksum·Storage Port·Download Policy.
4. `board-core`: Board/Post/Category/Visibility/Moderation 및 Comment Port.
5. `notification-core`: Notification·Inbox·Read State·Delivery Port.
6. `audit-core`: AuditEvent·Actor/Resource/Action/Outcome·Before/After Ref.

수용 Gate는 패키지별 Schema Test, import 방향 검사, B-2 owned path 외 수정 0, 기존 주유소 CI 회귀 PASS다.

## X. 안전 경계

```text
PORTAL_SOURCE_MUTATION=0
DRAFT_PR_MUTATION=0
PRODUCTION_ACTION=0
READY_TRANSITION=0
MERGE_ACTION=0
SECRET_OR_PERSONAL_DATA_COMMITTED=0
```
