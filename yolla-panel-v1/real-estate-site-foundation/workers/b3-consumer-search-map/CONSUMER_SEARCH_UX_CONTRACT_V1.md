# CONSUMER_SEARCH_UX_CONTRACT_V1

## 1. 문서 권위

```text
PROJECT=YOLLA_AI_REAL_ESTATE_SERVICE
WORKER_ID=B-3
EPIC_ID=RE-W2-E01-CONSUMER-SEARCH-CONTRACT
JOB_ID=B3-JOB-001
DIRECTIVE_ID=A0-SCHEDULE-B3-JOB-001
STATUS=B3_CONSUMER_SEARCH_CONTRACT_PASS
PORTAL_CODE_MUTATION=0
PRODUCTION=false
READY=false
MERGE=false
```

이 문서는 소비자가 욜라를 **부동산 전문 검색도구**로 인식하도록 홈, 구조화 조건검색, 게시판형 목록, 상세, 비교, 관심매물, 저장검색, 전문 중개업소 찾기의 정보구조와 텍스트 와이어프레임을 확정한다. 실제 포털 코드는 변경하지 않는다.

## 2. 확인 근거와 재사용 판정

| 확인 대상 | 확인 내용 | 재사용 판정 |
|---|---|---|
| `yolla-gas-station-portal/main/apps/web/app/page.tsx` | Hero, 자연어 입력, 예시 조건, 결과 건수, 게시판형 표, 상세 링크 | `REUSE_WITH_DOMAIN_REFACTOR` |
| `yolla-gas-station-portal/main/apps/web/app/stations/[uniId]/page.tsx` | 상세 Hero, 배지, 지표 카드, 순위·이력 섹션, 오류·로딩 상태 | `REUSE_WITH_DOMAIN_REFACTOR` |
| Draft PR #5 `apps/web/app/api-status/AllEndpointsBoard.tsx` | 요약 KPI, 검색·선택 필터, 가로 스크롤 표, 행 단위 상세 행동, 주기 갱신 | `REUSE_PATTERN_ONLY` |
| Issue #6 | 소비자 정밀 검색, 자체·외부 매물 구분, 공개·비공개 경계, 공통 코어 방향 | `AUTHORITATIVE_REQUIREMENT` |
| Issue #8 | 검색→목록/지도→상세/비교→문의/원문→관심/저장 흐름 | `AUTHORITATIVE_REQUIREMENT` |

재사용은 화면 패턴과 상태 경계만 대상으로 한다. 주유소 도메인 필드, API 상태 관리 행위, 실제 데이터 호출 코드는 복사하지 않는다.

## 3. 소비자 메뉴와 라우트

| 메뉴 | 라우트 | 목적 |
|---|---|---|
| 홈 | `/` | 대표 검색, 빠른 조건, 추천 지역·매물 |
| 매물 찾기 | `/search` | 구조화 필터와 게시판형 결과 |
| 지도에서 찾기 | `/map` | 동일 SearchState 기반 지도·목록 결과 |
| 매물 상세 | `/listings/{listingId}` | 가격·면적·특징·출처·행동 |
| 매물 비교 | `/compare?ids=...` | 최대 4개 동일 기준 비교 |
| 관심매물 | `/favorites` | 사용자가 저장한 매물 |
| 최근 본 매물 | `/recent` | 최근 열람 이력 |
| 저장검색 | `/saved-searches` | 조건 저장·알림 설정 |
| 전문 중개업소 | `/brokers` | 지역·전문분야·실적 기준 탐색 |
| 중개업소 상세 | `/brokers/{brokerageId}` | 순위 근거·전문분야·공개 매물 |
| 외부 원문 이동 확인 | `/outbound/{listingId}` | 출처·확인시각을 재고지한 뒤 원문 이동 |

## 4. 전역 검색 원칙

1. 자연어 검색은 선택 기능이며, 실패하거나 비활성화되어도 구조화 필터만으로 같은 결과를 만들 수 있어야 한다.
2. 필수 구조화 조건은 지역, 거래유형, 보증금, 월세, 매매가, 면적, 방 수, 옵션, 입주일이다.
3. 검색조건은 URL로 직렬화되어 새로고침·공유·뒤로가기 후에도 복원된다.
4. 게시판형 목록과 지도는 동일한 `SearchState`를 소비한다.
5. 자체 매물과 외부 원문 연결 매물은 같은 행 안에서도 배지·행동·출처를 다르게 표시한다.
6. 소비자 Payload에는 비공개 원본 주소, 비공개 좌표, 소유자 연락처, 내부 메모, 매칭 대상자 식별정보를 포함하지 않는다.

## 5. 핵심 화면 텍스트 와이어프레임

### 5.1 홈 `/`

```text
[상단] 욜라 부동산 | 매물 찾기 | 지도 | 전문 중개업소 | 관심매물 | 저장검색
[Hero] "조건에 맞는 집을 정확하게 찾으세요"
[검색창] 자연어 입력(선택) + [조건으로 찾기]
[빠른조건] 지역 | 거래유형 | 가격 | 면적 | 방 수 | 입주일
[추천영역] 최근 확인 매물 / 인기 지역 / 전문 중개업소
[신뢰영역] 자체 매물·외부 원문 매물 표시 기준 안내
```

### 5.2 구조화 조건검색 `/search`

```text
[검색요약] 서울 강남구 · 월세 · 보증금 5천 이하 · 월 200 이하
[FilterBar]
 지역(시도>시군구>읍면동)
 거래유형(매매/전세/월세/단기)
 매매가 또는 보증금/월세
 전용면적
 방 수/욕실 수
 옵션
 입주 가능일
 매물 출처(전체/욜라 자체/외부 원문)
[행동] 조건 초기화 | 검색 | 조건 저장
[결과도구] 결과 건수 | 정렬 | 목록/지도 전환
```

### 5.3 게시판형 목록 `/search?view=list`

```text
[고정 상단] SearchState 요약 + 필터 수정
[표 헤더]
 선택 | 출처 | 매물명/요약 | 지역 | 거래 | 가격 | 면적 | 방 | 입주 | 확인시각 | 행동
[자체 매물 행]
 [욜라 자체] 문의 가능 | 상세 | 관심 | 비교
[외부 매물 행]
 [외부 원문] 출처명 · 최종확인시각 | 상세 요약 | 원문 보기 | 관심 | 비교
[하단] 페이지 이동 또는 cursor 더보기
```

### 5.4 지도형 결과 `/map`

```text
[좌측/하단 목록] 현재 영역 공개 매물
[지도] 공개 가능한 마커·군집만 표시
[상단] 동일 SearchState 필터 / 이 지역 재검색 / 목록 보기
[선택 카드] 가격 · 면적 · 방 · 출처 · 확인시각
[자체 매물 행동] 상세 / 문의
[외부 매물 행동] 상세 요약 / 원문 보기
```

이 Epic에서는 VWorld 구현 계약을 확정하지 않는다. 지도는 후속 Epic이 소비할 `map.bounds`, `map.zoom`, `map.search_as_map_moves`, `selected_listing_id` 상태만 예약한다.

### 5.5 매물 상세 `/listings/{listingId}`

```text
[Hero] 공개 제목 · 거래유형 · 가격 · 공개 지역
[출처띠]
 자체: "욜라 자체 매물 · 욜라에서 문의"
 외부: "외부 원문 연결 · 출처 · 최종확인시각 · 원문에서 확인"
[핵심지표] 전용/공급면적 · 방/욕실 · 층 · 방향 · 입주일
[본문] 공개 설명 · 옵션 · 건물/주변 정보 · 공개 위치
[신뢰] 정보 확인시각 · 변경 가능성 · 신고
[행동]
 자체: 문의하기 / 전화요청 / 관심 / 비교
 외부: 원문 보기 / 관심 / 비교
```

### 5.6 매물 비교 `/compare`

```text
[비교 대상] 최대 4개
[공통 행] 출처 | 거래가격 | 면적 | 평당가 | 방/욕실 | 층 | 입주일 | 옵션 | 확인시각
[출처별 행동]
 자체: 문의하기
 외부: 각 원문 보기
[누락값] "-"와 "원문 확인 필요"를 구분
```

### 5.7 관심매물 `/favorites`

```text
[그룹] 전체 | 자체 매물 | 외부 원문 | 가격변경 | 확인 만료
[목록] 저장일 · 현재 상태 · 마지막 확인시각
[행동] 상세 | 비교 추가 | 삭제
[외부 만료] 원문 재확인 안내
```

### 5.8 저장검색 `/saved-searches`

```text
[저장 조건 카드] 이름 · 조건 요약 · 결과 수 · 마지막 실행
[알림] 신규 매물 / 가격 변경 / 외부 원문 확인 만료
[주기] 즉시 / 일 1회 / 주 1회 / 끔
[행동] 실행 | 수정 | 복제 | 삭제
```

### 5.9 전문 중개업소 `/brokers`

```text
[필터] 지역 · 전문분야 · 취급 거래유형 · 공개 매물 보유
[행] 중개업소명 · 지역 · 전문분야 · 종합/지역/전문 순위 · 산정 근거 · 최종갱신
[행동] 상세 · 공개 매물 보기 · 상담 요청
```

## 6. 자체 매물과 외부 원문 매물 구분

| 항목 | `YOLLA_DIRECT` | `EXTERNAL_LINK` |
|---|---|---|
| 기본 배지 | `욜라 자체 매물` | `외부 원문 연결` |
| 출처 | 욜라 등록 중개업소 | 외부 사이트/블로그/카페/영상 등 명시 |
| 최종확인시각 | 필수 | 필수 |
| 상세 | 욜라 내부 상세 | 욜라 요약 상세 + 원문 안내 |
| 주요 CTA | `문의하기` | `원문 보기` |
| 보조 CTA | 관심·비교·신고 | 관심·비교·신고 |
| 원문 URL | 선택 | 필수 |
| 클릭 추적 | 내부 문의 이벤트 | 비식별 outbound 이벤트 |
| 오해 방지 | 등록 중개업소와 책임 범위 표시 | 욜라가 원문 내용·가용성을 보증하지 않음을 표시 |

## 7. 반응형 경계

- 데스크톱 1280px 이상: FilterBar + 표, 또는 지도 60%/목록 40%.
- 태블릿 768~1279px: 필터 Drawer, 카드형 목록, 지도/목록 탭.
- 모바일 767px 이하: 핵심 조건 Chip, 하단 Sheet 필터, 단일 카드 열, 주요 CTA 고정.
- 가로 표는 보조 표현이다. 모바일에서 필수 정보를 숨기지 않고 카드로 재배치한다.

## 8. 재사용 컴포넌트 후보

```text
SearchHero          <- main page Hero + query form 패턴
StructuredFilterBar <- PR #5 검색·select 필터 패턴
ListingDataGrid     <- main 결과 table + PR #5 board table 패턴
ListingDetailShell  <- station detail Hero/metric/detailSection 패턴
SourceDisclosure    <- 신규 공통 출처 배지·확인시각·책임문구
CompareMatrix       <- 신규
SavedSearchCard     <- 신규
BrokerRankingRow    <- station rank card를 도메인 변경하여 재사용
```

## 9. 제안 소유경로

```text
apps/real-estate-web/app/(consumer)/**
packages/search-ui-core/**
packages/map-core/**
docs/real-estate/consumer/**
yolla-panel-v1/real-estate-site-foundation/workers/b3-consumer-search-map/**
```

소유경로 최종 확정 전 실제 애플리케이션 파일 생성·이동은 하지 않는다.

## 10. 수용 검증

```text
ROUTE_COUNT=11
WIREFRAME_COUNT=9
STRUCTURED_FILTER_REQUIRED_FIELDS=9
SOURCE_TYPE_CONFUSION_COUNT=0
PRIVATE_ORIGINAL_FIELD_COUNT=0
PORTAL_CODE_MUTATION_COUNT=0
PRODUCTION=false
READY=false
MERGE=false
RESULT=B3_CONSUMER_SEARCH_CONTRACT_PASS
```
