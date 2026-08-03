# A-4 Navigation·Page·Pagination Structure Worker Directive V1

## Authority

```text
COMMANDER=A-2
CONTROL_PR=#18
BRANCH=worker/a4-navigation-pagination-v1
DIRECTIVE_ID=A2-TO-A4-NAVIGATION-PAGINATION-CONTRACT-V1-20260803-001
OWNED_ROOT=yolla-panel-v1/a2-analyzer-adapter-factory/workers/a4-navigation-pagination/**
```

## Mission

사이트의 화면 계층·URL 전이·검색·필터·지도 이동·목록·상세·페이지네이션 방식을 분석 데이터로 표현하고, 수집범위와 반복 종료조건을 재현 가능한 계약으로 만든다.

## Required work

1. `SiteNavigationGraph V1` Schema: node, edge, trigger, URL pattern, required state.
2. `PageTypeCatalog V1`: ENTRY, SEARCH, REGION, MAP, LIST, DETAIL, LOGIN_REQUIRED, ERROR, UNKNOWN.
3. pagination 유형: PAGE_NUMBER, CURSOR, OFFSET_LIMIT, INFINITE_SCROLL, MAP_TILE_OR_BBOX, NESTED_SCOPE, NONE.
4. scope freeze·termination·duplicate-loop 방지 규칙 작성.
5. 필터·정렬·지역·좌표·줌 변경 시 상태 전이 모델 작성.
6. A-3 Fixture trace를 소비하는 Fixture navigation replay 1건 작성.
7. A-5/A-6 인계용 `PaginationScopeContract V1` 생성.

## PASS criteria

```text
NAVIGATION_GRAPH_SCHEMA=PASS
PAGE_TYPE_COUNT>=8
PAGINATION_TYPE_COUNT>=6
TERMINATION_RULE_PRESENT=true
DUPLICATE_LOOP_GUARD=PASS
SCOPE_FREEZE_PROGRESS_RULE=PASS
FIXTURE_REPLAY=PASS
OUT_OF_SCOPE_FILE_COUNT=0
```

## Reports

- `A4_START_REPORT_V1.json`
- `A4_PROGRESS_OR_BLOCKER_REPORT_V1.json`
- `A4_FINAL_REPORT_V1.json`
- `LATEST_A4_REPORT_POINTER.json`

## Forbidden

실제 대량수집, 인증우회, 사이트별 Adapter 최종확정, 패널 Shell·Electron Main 수정, 타 워커 경로 수정, Production·Ready·Merge.
