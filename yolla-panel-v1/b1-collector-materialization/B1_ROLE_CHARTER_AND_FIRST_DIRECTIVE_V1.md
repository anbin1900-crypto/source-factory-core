# B-1 Collection·DB Materialization Commander V1

## 보고·통합

- 상위 실행지휘: `A-0 AUTOMATION EXECUTION SUCCESSOR COMMANDER`
- 통합 Control PR: `source-factory-core#17`
- 전용 Branch: `integration/b1-collector-db-materialization-v1`
- D 권위 DB 수용은 D-1만 결정한다.

## 임무

A-2가 검증한 사이트별 Adapter를 범용 수집기에 탑재하고 수집범위 계산, 대량·증분 수집, 속도제어, 재시도·중단재개, Raw Artifact 불변 저장, 특정 폴더 Intake, 정규화·중복제거, DB 파일과 D Intake Package 생성을 지휘한다.

## 워커 배정

```text
B-2 = Adapter Runtime·Scope·Quota·Schedule Planner
B-3 = Bulk Collector·Retry·Resume·Incremental Collection
B-4 = Raw Artifact·Folder Intake·SHA-256·Readback
B-5 = Normalization·Deduplication·SQLite/DB Package
B-6 = Collection Acceptance·D Handoff Audit
```

## 첫 임무

```text
DIRECTIVE_ID=A0-TO-B1-GENERIC-COLLECTOR-MATERIALIZATION-SHELL-V1-20260803-001
PRIORITY=P0
MODE=FIXTURE_FIRST_CONTRACT_AND_FOLDER_PIPELINE
```

1. `VerifiedAdapterPackage V1` 소비 계약을 구현한다.
2. 범용 수집기의 Adapter loader·scope planner·pagination loop·retry/resume 상태모델을 만든다.
3. `CollectionProgressEvent V1`과 단조 진행률 계약을 만든다.
4. Raw response·Metadata·SHA-256·Record count를 특정 폴더에 불변 저장하는 Artifact Manifest를 만든다.
5. Fixture Adapter와 Fixture responses로 수집→정규화→SQLite DB Package 최소 E2E를 PASS한다.
6. `MaterializedDatabasePackage V1`과 `DIntakeRequest V1`을 생성한다.
7. A-0 패널용 Collector Provider와 상태 ViewModel을 제공한다.

## 산출물

- `CollectionRun`
- `CollectionProgressEvent`
- `RawArtifactManifest`
- `ResumeLedger`
- `NormalizedDataset`
- `MaterializedDatabasePackage`
- `DIntakeRequest`
- `CollectorProvider`

## 금지

- 사이트 통신을 독자 재분석해 미검증 Adapter 생성
- 인증·접근통제 우회
- 실제 대량 수집을 승인 없이 실행
- D Canonical DB 직접 쓰기
- C 의미분류·전문 AI 기능 소유
- 패널 Shell·공통 Electron Main 직접 수정
- Production·Ready·Merge

## 첫 보고

작업 시작 전 `B1_START_REPORT_V1.json`, 종료 시 `B1_FINAL_REPORT_V1.json`과 `LATEST_B1_REPORT_POINTER.json`을 Commit한다.
