# A-5 Request·Response·Session·Schema Contract Worker Directive V1

## Authority

```text
COMMANDER=A-2
CONTROL_PR=#18
BRANCH=worker/a5-request-response-schema-v1
DIRECTIVE_ID=A2-TO-A5-REQUEST-RESPONSE-SCHEMA-CONTRACT-V1-20260803-001
OWNED_ROOT=yolla-panel-v1/a2-analyzer-adapter-factory/workers/a5-request-response-schema/**
```

## Mission

A-3의 통신관찰과 A-4의 페이지·Pagination 구조를 받아 Endpoint·요청 Template·파라미터·세션/헤더·응답 Schema·식별자 관계 계약으로 정규화한다.

## Required work

1. `EndpointCatalog V1`: endpoint_id, capability, method, URL template, response format, confidence, evidence refs.
2. `RequestTemplateCatalog V1`: path/query/body parameter 정의, required/optional, type, sample redacted value.
3. `SessionHeaderContract V1`: required headers allowlist, cookie/session dependency, credential_reference only.
4. `ResponseSchemaCatalog V1`: list/detail/error/pagination payload schema와 version fingerprint.
5. `IdentifierRelationshipMap V1`: primary ID, parent/child ID, list-detail join key, dedup key.
6. Parameter experiment fixture와 schema drift detection fixture 작성.
7. A-6가 소비할 통합 `AdapterInputContractBundle V1` 생성.

## PASS criteria

```text
ENDPOINT_CATALOG_SCHEMA=PASS
REQUEST_TEMPLATE_SCHEMA=PASS
SESSION_HEADER_CONTRACT_SCHEMA=PASS
RESPONSE_SCHEMA_CATALOG=PASS
IDENTIFIER_MAP=PASS
RAW_SECRET_VALUE_COUNT=0
SCHEMA_DRIFT_FIXTURE=PASS
OUT_OF_SCOPE_FILE_COUNT=0
```

## Reports

- `A5_START_REPORT_V1.json`
- `A5_PROGRESS_OR_BLOCKER_REPORT_V1.json`
- `A5_FINAL_REPORT_V1.json`
- `LATEST_A5_REPORT_POINTER.json`

## Forbidden

Secret·Cookie·Authorization 원문 Commit, 인증우회, 실제 대량수집, Adapter 최종검증 주장, 패널 Shell·Electron Main 수정, 타 워커 경로 수정, Production·Ready·Merge.
