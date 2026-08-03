# YOLLA 일일 Commander Epic 산정·제출 지시문 V1

```text
DIRECTIVE_ID=YOLLA_DAILY_COMMANDER_EPIC_PACKAGE_DIRECTIVE_V1
STATUS=ACTIVE
SCOPE=ALL_AUTOMATION_COMMANDERS
USER_DAILY_INPUT=SHORT_GITHUB_POINTER
OFFICIAL_EPIC_INPUT=GITHUB_COMMITTED_EPIC_JSON
PC_AGENT_IMPORT_FILE=EPIC.json
DOWNLOAD_OUTPUT=FULL_PACKAGE_AND_WORKER_EXPORTS
NEW_RUNTIME=false
NEW_TRANSPORT=false
```

## I. 적용 규칙

본 지시문을 수행하기 전에 다음 파일을 모두 읽는다.

```text
.yolla/automation/YOLLA_AUTOMATION_COMMON_RULES_V2.md
.yolla/automation/COMMANDER_EPIC_SUBMISSION_V2.schema.json
.yolla/automation/COMMANDER_EPIC_SUBMISSION_V2.template.json
.yolla/automation/EPIC_RESULT_V2.schema.json
.yolla/automation/PC_AGENT_AUTOMATION_DB_V1.sql
.yolla/automation/EPIC_TO_PC_AGENT_DB_MAPPING_V1.json
.yolla/automation/EPIC_REVIEW_BATCH_POLICY_V1.json
```

기존 `WORKER_JOB_SCHEDULE_V1`, `LOCAL_DURABLE_FILE_QUEUE_V1`, Correlation·Reporting 계약을 보존한다.

## II. 매일 수행할 임무

커맨더는 현재 그룹에 대해 다음을 수행한다.

```text
현재 목표·최신 지시·워커 역할 조회
→ 기존 EPIC.json과 RESULT.json 조회
→ 완료·미완료·외부차단 범위 계산
→ 워커별 필요한 Epic 수 산정
→ 산정결과 보고
→ 품질한도에 따라 분할 작성·검토
→ 통합 EPIC.json GitHub Commit
→ 워커별 다운로드 파일과 Package 제출
```

산정결과 보고 후 사용자 승인을 기다리지 않고 다음 단계를 계속한다.

## III. 기존 Package 재사용 판단

다음 조건을 모두 충족하면 새 Package를 만들지 않는다.

```text
기존 EPIC.json Schema-valid
GitHub 등록 SHA-256 유효
미완료 Epic 존재
새 목표·역할·소유범위 변경 없음
구조적 결함과 중복 없음
```

이 경우 기존 Package를 계속 사용하고 워커별 남은 Epic 수와 동일 다운로드 파일을 다시 제출한다.

다음 중 하나면 새 `package_id`를 발급한다.

```text
활성 Package 없음
기존 Package 전체 완료
새 목표 또는 신규 워커 발생
역할·소유범위 변경
기존 Package 구조 결함
기존 Package에 없는 신규 업무 발생
```

기존 Package를 덮어쓰지 않는다.

## IV. 워커별 Epic 수 산정

Epic 수는 워커별로 동일하게 맞추지 않는다.

다음을 기준으로 산정한다.

```text
남은 실제 업무량
워커 소유범위
독립 실행 가능성
선행 의존성
동일 Source·동일 검증 공유 여부
한 번의 Assignment로 End-to-End 종결 가능한 크기
보고·배포비용 대비 실제 작업비용
```

분할기준:

```text
여러 독립 결과 혼합
완료조건 불명확
서로 다른 Source·검증·Terminal 필요
→ 분리
```

결합기준:

```text
동일 Source와 검증 공유
하나의 결과 없이는 나머지도 의미 없음
분리 비용이 실제 작업보다 큼
→ 결합
```

## V. Pro 상세검토 분할정책

정확한 Epic을 만들기 위한 내부 운영한도는 다음과 같다.

```text
한 번의 신규 Epic 작성 묶음=최대 15개
한 번의 상세검토 권장=20개
한 번의 상세검토 절대상한=25개
전체 Compact Index 통합검토=최대 100개
100개 초과=실행 Phase별 별도 Package로 분할
```

복잡도 가중치:

```text
일반 Epic=1 Review Unit
타 워커·타 저장소 의존 Epic=2 Review Units
보안·개인정보·Migration·Production·비가역 Epic=3 Review Units
한 상세검토 묶음=최대 25 Review Units
```

상세 Epic이 25개를 초과하면 워커·기능 Lane·의존성 단계별로 20개 내외 묶음으로 나눈다.

각 묶음은 다음을 별도 검증한다.

```text
소유범위
중복
식별자
sequence
측정 가능한 done_when
depends_on
순환 의존성
Placeholder
비밀정보
End-to-End 종결 가능성
```

모든 묶음 검토 후 전체 Epic의 Compact Index와 Dependency Matrix를 다시 통합검토한다.

검토 중 모호성·중복·범위충돌·의존성 불확실성이 하나라도 남으면 해당 묶음을 절반으로 재분할해 다시 작성·검토한다.

## VI. Epic 수 산정보고 형식

```text
YOLLA_EPIC_COUNT_PLAN_V1
PACKAGE_DECISION=<REUSE_EXISTING|CREATE_NEW>
PACKAGE_ID=<PACKAGE_ID>
PROJECT_ID=<PROJECT_ID>
GROUP_ID=<GROUP_ID>
COMMANDER_ID=<COMMANDER_ID>
WORKER_COUNT=<COUNT>
TOTAL_EPIC_COUNT=<COUNT>
REVIEW_BATCH_COUNT=<COUNT>

WORKER_EPIC_COUNTS:
- WORKER_ID=<ID> | TOTAL=<COUNT> | COMPLETED=<COUNT> | REMAINING=<COUNT> | NEW=<COUNT> | REVIEW_BATCHES=<COUNT> | REASON=<RATIONALE>

DUPLICATE_EPIC_COUNT=0
UNRESOLVED_SCOPE_CONFLICT_COUNT=0
DEPENDENCY_REVIEW=<PASS|FAIL>
```

## VII. 공식 Epic 원본

공식 PC Agent 입력은 하나다.

```text
EPIC.json
```

권위 경로:

```text
.yolla/epics/<PACKAGE_ID>/EPIC.json
```

`COMMANDER_EPIC_SUBMISSION_V2.schema.json` 검증을 통과해야 한다.

## VIII. 다운로드 제출물

커맨더는 다음 파일을 실제 다운로드로 제출한다.

```text
EPIC_PACKAGE_<PACKAGE_ID>.zip
EPIC.json
EPIC_COUNT_PLAN.json
EPIC_PACKAGE_MANIFEST.json
EPIC_<WORKER_ID>.json  # 워커별 각각
```

ZIP 내부구조:

```text
EPIC_PACKAGE_<PACKAGE_ID>.zip
├── EPIC.json
├── EPIC_COUNT_PLAN.json
├── EPIC_PACKAGE_MANIFEST.json
└── workers/
    ├── EPIC_<WORKER_ID_1>.json
    ├── EPIC_<WORKER_ID_2>.json
    └── ...
```

### 워커별 Export 규칙

워커별 파일은 통합 `EPIC.json`에서 해당 워커 한 명만 추출한 편의 Export다.

```text
통합 Metadata 유지
workers 배열에는 해당 워커 한 명만 포함
Epic 순서와 내용은 통합 EPIC.json과 Byte-equivalent JSON value
독립 권위 아님
PC Agent 공식 Import 대상 아님
```

PC Agent 공식 Import는 통합 `EPIC.json`만 사용한다.

## IX. Manifest 필수항목

```text
schema_version=YOLLA_EPIC_PACKAGE_MANIFEST_V1
package_id
project_id
group_id
commander_id
official_epic_file
source_repository
source_control_pr
source_branch
source_commit_sha
files[]:
  path
  role
  sha256
  size_bytes
  worker_id|null
worker_count
epic_count
review_batch_count
schema_validation
dependency_validation
manifest_created_at
```

모든 파일의 SHA-256과 크기를 기록한다.

GitHub에 Commit된 `EPIC.json`과 다운로드 `EPIC.json`은 바이트 단위로 동일해야 한다.

## X. GitHub 등록 Pointer

```text
YOLLA_EPIC_REGISTRATION_V2
PACKAGE_ID=<PACKAGE_ID>
PROJECT_ID=<PROJECT_ID>
GROUP_ID=<GROUP_ID>
COMMANDER_ID=<COMMANDER_ID>
EPIC_FILE_PATH=.yolla/epics/<PACKAGE_ID>/EPIC.json
EPIC_COMMIT_SHA=<EXACT_40_HEX_SHA>
EPIC_SHA256=<EXACT_64_HEX_SHA256>
WORKER_COUNT=<COUNT>
EPIC_COUNT=<COUNT>
REVIEW_BATCH_COUNT=<COUNT>
```

## XI. 완료조건

다음을 모두 충족하기 전에는 완료로 보고하지 않는다.

```text
Epic 수 산정보고 완료
모든 상세검토 Batch PASS
전체 Compact Index·Dependency Matrix 통합검토 PASS
EPIC.json Schema PASS
중복 Epic 0
미해결 Scope 충돌 0
순환 의존성 0
GitHub Commit·Readback PASS
GitHub와 다운로드 EPIC.json SHA-256 일치
Manifest 검증 PASS
전체 Package와 워커별 파일 실제 다운로드 제공
```

## XII. 최종 응답 형식

```text
STATUS=<PASS|BLOCKED_EXTERNAL>
PACKAGE_DECISION=<REUSE_EXISTING|CREATE_NEW>
PACKAGE_ID=<PACKAGE_ID>
REPOSITORY=<OWNER/REPOSITORY>
CONTROL_PR=#<NUMBER>
EPIC_FILE_PATH=<PATH>
EPIC_COMMIT_SHA=<SHA>
EPIC_SHA256=<SHA256>
WORKER_COUNT=<COUNT>
EPIC_COUNT=<COUNT>
REVIEW_BATCH_COUNT=<COUNT>
SCHEMA_VALIDATION=<PASS|FAIL>
DEPENDENCY_VALIDATION=<PASS|FAIL>
MANIFEST_VALIDATION=<PASS|FAIL>
DOWNLOADS=<FULL_PACKAGE_AND_ALL_WORKER_FILES>
```
