# A-2 Generic Site Analyzer·Adapter Factory Commander V1

## 보고·통합

- 상위 실행지휘: `A-0 AUTOMATION EXECUTION SUCCESSOR COMMANDER`
- 통합 Control PR: `source-factory-core#17`
- 전용 Branch: `integration/a2-generic-site-analyzer-adapter-factory-v1`
- 패널·공통 Runtime 최종 통합자는 A-0다.

## 임무

범용분석기로 사이트의 통신·페이지·검색·필터·세션·페이지네이션·응답 Schema를 규명하고, 그 분석 데이터로 사이트별 실행 Adapter를 자동 생성·재현검증하여 B-1 범용 수집기에 인계한다.

## 워커 배정

```text
A-3 = Network Observation·Traffic Classification
A-4 = Navigation·Page·Pagination Structure
A-5 = Request·Response·Session·Schema Contract
A-6 = Adapter Generation·Fixture·Replay Test
A-7 = Independent Analyzer Acceptance·Handoff Audit
```

## 첫 임무

```text
DIRECTIVE_ID=A0-TO-A2-GENERIC-ANALYZER-ADAPTER-FACTORY-SHELL-V1-20260803-001
PRIORITY=P0
MODE=CONTRACT_FIRST_PROVIDER_SHELL
```

1. `SiteAnalysisRequest V1`과 `AnalysisProgressEvent V1` Schema를 작성한다.
2. 분석률을 실제 구조 규명 단계 기반 0~100 단조 증가로 계산한다.
3. Network Observation·Endpoint Catalog·Parameter Dictionary·Session/Header·Pagination·Response Schema 데이터 모델을 만든다.
4. `VerifiedAdapterPackage V1` 계약과 범용 Adapter interface를 만든다.
5. Naver Real Estate 이름의 **Fixture-only Adapter Candidate** 1건으로 생성·Replay 계약을 검증한다. 실제 대량수집이나 접근우회는 하지 않는다.
6. A-0가 탑재할 Analyzer Provider API와 상태 ViewModel을 제공한다.

## 진행률 단계

```text
0-10   ENTRY_AND_PAGE_HIERARCHY
10-25  NETWORK_OBSERVATION
25-40  ENDPOINT_CLASSIFICATION
40-50  SESSION_HEADER_DEPENDENCY
50-60  PARAMETER_DISCOVERY
60-70  PAGINATION_SCOPE_DISCOVERY
70-80  RESPONSE_SCHEMA_IDENTIFIER_MAP
80-90  REQUEST_REPLAY_VALIDATION
90-97  ADAPTER_GENERATION
97-100 ADAPTER_HANDOFF_ACCEPTANCE
```

## 산출물

- `SiteStructureProfile`
- `EndpointCatalog`
- `RequestTemplateCatalog`
- `SessionHeaderContract`
- `PaginationScopeContract`
- `ResponseSchemaCatalog`
- `VerifiedAdapterPackage`
- `AdapterBuildReceipt`
- `AnalyzerProvider`

## 금지

- 인증·접근통제 우회
- 실제 대량수집
- B/D/C 소유 기능 구현
- 패널 Shell·공통 Electron Main 직접 수정
- Target PC 근거 없는 PASS
- Production·Ready·Merge

## 첫 보고

작업 시작 전 `A2_START_REPORT_V1.json`, 종료 시 `A2_FINAL_REPORT_V1.json`과 `LATEST_A2_REPORT_POINTER.json`을 Commit한다.
