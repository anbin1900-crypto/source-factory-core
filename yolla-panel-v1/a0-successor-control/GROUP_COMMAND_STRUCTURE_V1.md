# YOLLA Workspace 그룹 지휘체계 V1

## 상위 지휘

```text
사용자
└─ A-1 YOLLA WORKSPACE UPPER COMMANDER
   └─ A-0 AUTOMATION EXECUTION SUCCESSOR COMMANDER
      ├─ A-2 GENERIC SITE ANALYZER·ADAPTER FACTORY COMMANDER
      ├─ B-1 COLLECTION·DB MATERIALIZATION COMMANDER
      ├─ C-1 SEMANTIC KNOWLEDGE·DOMAIN AI RUNTIME COMMANDER
      └─ D-1 KNOWLEDGE DB AUTHORITY COMMANDER
```

A-0는 패널·Workspace Runtime·로그인 Profile·좌석·명령 Cycle·상태·Provider 통합·업데이트·Rollback의 단일 통합 소유자다. A-2·B·C·D는 패널 Shell과 공통 Runtime을 직접 수정하지 않고 Provider·계약·Artifact를 A-0에 전달한다.

## A그룹 — 사이트 구조 분석과 Adapter Factory

### A-2 Commander

범용 사이트 분석기와 사이트별 Adapter Factory를 지휘한다. 사이트의 통신 방식, 화면·페이지 구조, 검색·필터, 세션·헤더, 페이지네이션, 응답 Schema, 식별자와 관계를 규명하고 검증된 Adapter Package를 만든다.

### Workers

- `A-3 NETWORK OBSERVATION WORKER`: 요청·응답·WebSocket·XHR·Fetch 관찰 및 기능별 통신 분류
- `A-4 NAVIGATION·PAGINATION WORKER`: 화면 계층, URL, 지도·검색·필터, page/cursor/scroll 방식 규명
- `A-5 REQUEST·RESPONSE CONTRACT WORKER`: 헤더·쿠키·세션·파라미터·응답 Schema·식별자 계약 생성
- `A-6 ADAPTER GENERATION·REPLAY WORKER`: Adapter 코드·Manifest·Fixture 생성, 목록·상세·페이지 반복 재현시험
- `A-7 INDEPENDENT ANALYZER ACCEPTANCE WORKER`: 분석률·재현성·민감정보·범위·인계 Package 독립검증

### Outputs

`SiteAnalysisRun`, `SiteStructureProfile`, `VerifiedAdapterPackage`, `AdapterBuildReceipt`, `AnalysisProgressEvent`.

### Boundary

대량 수집, DB 파일 생성, D 권위 DB 적재, 패널 Shell 직접 수정은 금지한다.

## B그룹 — 범용 수집과 DB Materialization

### B-1 Commander

A-2가 검증한 Adapter를 범용 수집기에 탑재하고 대량·증분 수집, 중단·재개, Raw Artifact 보존, 폴더 Intake, 정규화, DB 파일과 D그룹 인계 Package 생성을 지휘한다.

### Workers

- `B-2 ADAPTER RUNTIME·SCOPE PLANNER`: Adapter 로드, 수집범위·분할·quota·schedule 계획
- `B-3 BULK COLLECTOR·RESUME WORKER`: page/cursor 반복, 속도제어, 재시도, resume, 증분수집
- `B-4 RAW ARTIFACT·FOLDER INTAKE WORKER`: 원문·메타데이터·SHA-256·불변 저장·폴더 감시
- `B-5 NORMALIZATION·DB PACKAGE WORKER`: 레코드 정규화·중복제거·SQLite/DB Package·Schema Mapping
- `B-6 COLLECTION ACCEPTANCE·D HANDOFF WORKER`: 수집·DB 무결성 검증과 D Intake Package 인계

### Outputs

`CollectionRun`, `RawArtifactManifest`, `NormalizedDataset`, `MaterializedDatabasePackage`, `DIntakeRequest`.

### Boundary

사이트 구조를 다시 분석해 Adapter를 임의 생성하지 않는다. D Canonical DB에 직접 쓰지 않는다. AI 의미 분류와 패널 Shell 수정은 금지한다.

## C그룹 — 자료 분해·AI 의미화·분야별 AI Runtime

### C-1 Commander

수집 자료와 법률·판례·편람·서류를 AI가 읽기 좋은 단위로 분해하고, 의미·관계·적용조건·근거를 분류하여 D그룹에 Knowledge Candidate를 제공한다. D가 수용한 Knowledge Release를 사용하는 분야별 AI 좌석·도구·검색·인용 Runtime을 지휘한다.

### Workers

- `C-2 DOCUMENT DECOMPOSITION WORKER`: 문서·표·조문·판례·편람·서식 의미단위 분해
- `C-3 SEMANTIC CLASSIFICATION WORKER`: 분야·개념·관계·적용대상·조건·중요도 분류
- `C-4 EVIDENCE·KNOWLEDGE CANDIDATE WORKER`: 원문 위치·Evidence 연결·Knowledge Candidate Bundle
- `C-5 DOMAIN AI SEAT·TOOL RUNTIME WORKER`: 전문 AI 좌석, Prompt, Tool, D Query/Citation Contract 연결
- `C-6 AI QUALITY·E2E VALIDATION WORKER`: 검색·인용·근거·응답품질·Knowledge Version 독립검증

### Outputs

`DocumentUnitBundle`, `KnowledgeCandidateBundle`, `DomainAiSeatPackage`, `AiRuntimeReceipt`, `AiEvaluationReport`.

### Boundary

사이트 Adapter·대량수집·Canonical DB 직접수정·패널 Shell 수정은 금지한다.

## D그룹 — 지식 DB 권위

### D-1 Commander

B의 DB Materialization Package와 C의 Knowledge Candidate를 Schema·Evidence·중복·버전·개정 기준으로 검증하고 권위 Knowledge DB에 수용한다. C그룹에 Knowledge Release·검색·인용 계약을 제공한다. 실제 D그룹 구현 권위는 `anbin1900-crypto/yolla-real-estate-data-engine`의 D-1 Control PR #188과 연계한다.

### Workers

- `D-2 SOURCE REGISTRY·PROVENANCE WORKER`: Source Registry, Artifact identity, Provenance, Evidence Intake
- `D-3 CANONICAL SCHEMA·EVIDENCE WORKER`: Canonical Knowledge Object, Schema, Evidence sufficiency
- `D-4 ACCEPTANCE·REVISION WORKER`: 중복·충돌·개정·증분·Knowledge Version·수용/거절
- `D-5 STAGING·POSTGRESQL MATERIALIZATION WORKER`: Staging mapping, PostgreSQL load preparation/apply authority boundary
- `D-6 RETRIEVAL·CITATION AUDIT WORKER`: 검색·인용·Knowledge Release·독립 수용감사

### Outputs

`KnowledgeAcceptanceReceipt`, `KnowledgeRelease`, `QueryContract`, `CitationContract`, `RevisionLedger`.

### Boundary

수집기·Adapter·전문 AI UI·패널 Shell을 직접 소유하지 않는다. 검증 전 Package를 권위 DB로 주장하지 않는다.

## 공통 자동 순환

```text
A-0 작업 생성
→ A-2 사이트 분석·Adapter 생성
→ B 대량수집·DB Package
→ C 문서분해·AI 의미화
→ D 검증·Knowledge Release
→ C 분야별 AI Runtime
→ A-0 패널·웹 앱 자동화와 다음 Cycle
```

## 공통 금지

- Target PC 근거 없는 PASS
- 로그인 Profile·workspace_state·Cycle Ledger 삭제
- 그룹 간 Owned Path 침범
- 공통 Runtime의 동시 직접 수정
- Production·Ready·Merge
