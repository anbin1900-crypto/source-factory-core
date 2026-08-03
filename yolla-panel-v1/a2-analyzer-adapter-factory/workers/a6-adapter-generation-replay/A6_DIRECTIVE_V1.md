# A-6 Adapter Generation·Fixture Replay Worker Directive V1

## Authority

```text
COMMANDER=A-2
CONTROL_PR=#18
BRANCH=worker/a6-adapter-generation-replay-v1
DIRECTIVE_ID=A2-TO-A6-ADAPTER-GENERATION-REPLAY-V1-20260803-001
OWNED_ROOT=yolla-panel-v1/a2-analyzer-adapter-factory/workers/a6-adapter-generation-replay/**
```

## Mission

A-3~A-5의 분석 계약을 실행 가능한 사이트별 Adapter Package로 변환하는 범용 Adapter interface·generator·fixture replay test를 만든다.

## Required work

1. `GenericAdapterInterface V1` 작성: detectSite, prepareSession, discoverScope, buildListRequest, parseListResponse, getNextCursor, buildDetailRequest, parseDetailResponse, getRecordIdentity, normalizeRecord, shouldRetry, getRateLimitPolicy.
2. `AdapterPackageSchema V1`과 Manifest·version·capabilities·contract refs 정의.
3. Generator가 A-5 `AdapterInputContractBundle`에서 코드·config·fixtures·tests 골격을 생성하도록 한다.
4. **Fixture-only** `NAVER_REAL_ESTATE_ADAPTER_CANDIDATE_V1` 생성. 실사이트 호출이나 접근우회는 금지.
5. 목록→다음 페이지→상세→식별자→정규화 Replay test 작성.
6. 실패·schema drift·pagination 종료·retry fixture 작성.
7. B-1 인계용 `VerifiedAdapterPackageCandidate V1`과 `AdapterReplayTestReport V1` 생성.

## PASS criteria

```text
GENERIC_ADAPTER_INTERFACE=PASS
ADAPTER_PACKAGE_SCHEMA=PASS
GENERATOR_DETERMINISM=PASS
FIXTURE_ONLY_NAVER_CANDIDATE=PASS
LIST_REPLAY=PASS
PAGINATION_REPLAY=PASS
DETAIL_REPLAY=PASS
IDENTITY_DEDUP_REPLAY=PASS
SCHEMA_DRIFT_REJECT=PASS
LIVE_SITE_CALL_COUNT=0
OUT_OF_SCOPE_FILE_COUNT=0
```

## Reports

- `A6_START_REPORT_V1.json`
- `A6_PROGRESS_OR_BLOCKER_REPORT_V1.json`
- `A6_FINAL_REPORT_V1.json`
- `LATEST_A6_REPORT_POINTER.json`

## Forbidden

실사이트 호출, 인증·접근통제 우회, 실제 수집, B Collector 구현, Verified 최종수용 자기승인, 패널 Shell·Electron Main 수정, 타 워커 경로 수정, Production·Ready·Merge.
