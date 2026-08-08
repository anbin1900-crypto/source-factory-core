# A-3 Network Observation·Traffic Classification Worker Directive V1

## Authority

```text
COMMANDER=A-2
CONTROL_PR=#18
BRANCH=worker/a3-network-observation-v1
DIRECTIVE_ID=A2-TO-A3-NETWORK-OBSERVATION-CONTRACT-V1-20260803-001
OWNED_ROOT=yolla-panel-v1/a2-analyzer-adapter-factory/workers/a3-network-observation/**
```

## Mission

범용 사이트 분석기가 브라우저에서 관찰한 XHR·Fetch·Document·WebSocket·GraphQL·Media·Static 요청을 안전하게 기록하고, 기능별 통신 후보로 분류할 수 있는 계약·Fixture·테스트를 만든다.

## Required work

1. `NetworkObservationEvent V1` JSON Schema 작성.
2. 요청·응답 Metadata 모델: URL, method, resource_type, initiator, status, timing, request/response headers allowlist, body format, size, redirect chain.
3. 민감정보 Redaction 정책: Cookie, Authorization, API key, 개인식별값 원문 저장 금지. `credential_reference`와 redacted hash만 허용.
4. 기능분류 규칙: PAGE_ENTRY, REGION_DISCOVERY, SEARCH, FILTER, LIST, DETAIL, PAGINATION, MAP_MOVE, AUTH_SESSION, STATIC, UNKNOWN.
5. 동일 Endpoint의 파라미터 변화 비교 모델과 observation grouping key 작성.
6. Fixture trace bundle 1건과 deterministic classifier test 작성.
7. A-4/A-5가 소비할 `TrafficClassificationCatalog V1` 생성.

## PASS criteria

```text
JSON_SCHEMA=PASS
NODE_OR_PYTHON_TESTS=PASS
SENSITIVE_VALUE_EXPOSURE_COUNT=0
FIXTURE_EVENT_COUNT>=12
CLASSIFICATION_TYPES>=8
UNKNOWN_EVENT_PRESERVED=true
OUT_OF_SCOPE_FILE_COUNT=0
```

## Reports

- `A3_START_REPORT_V1.json`
- `A3_PROGRESS_OR_BLOCKER_REPORT_V1.json`
- `A3_FINAL_REPORT_V1.json`
- `LATEST_A3_REPORT_POINTER.json`

## Forbidden

실제 사이트 대량수집, 인증우회, 실계정 Secret 저장, 패널 Shell·Electron Main 수정, 타 워커 경로 수정, Production·Ready·Merge.
