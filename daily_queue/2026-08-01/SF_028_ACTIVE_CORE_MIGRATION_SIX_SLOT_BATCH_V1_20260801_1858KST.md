# SF_028_ACTIVE_CORE_MIGRATION — SIX SLOT BATCH V1

BATCH_ID: SF_028_ACTIVE_CORE_MIGRATION_SIX_SLOT_BATCH_V1_20260801_1858KST
BATCH_VERSION: V1
CONSTITUTION_VERSION: 2.1.2-COMPACT
TARGET_TASK: SF_028_SOURCE_FACTORY_ACTIVE_CORE_MIGRATION
COMMANDER_FUNCTION_CLASS: BATCH_COMMANDER / DISPATCH_COMMANDER / GATE_COMMANDER
REPO: anbin1900-crypto/source-factory-core
OLD_ROOT_CANDIDATES:
- E:\YOLLA\source-factory-core
- D:\SOURCE FACTORY\source-factory-core
NEW_ROOT_CANDIDATES:
- E:\YOLLA\source-factory-active-core
- D:\SOURCE FACTORY\source-factory-active-core

## USER_GOAL

기존 소스팩토리 폴더가 약 4.7GB까지 커졌다. 25,000개 후보군에서 다시 250개를 선별하는 방식은 중지한다. 별도 새 폴더를 만들고, 현재 사용 중인 런타임에서 실제 도달 가능한 검증 소스와 설치 기준 파일만 새 Active Core 폴더로 이전한다. 새 폴더 단독 검증이 완료되면 구버전 폴더는 삭제 가능 상태로 판정한다.

## GLOBAL_BOUNDARY

이번 batch는 Active Core 이주 준비와 검증 작업이다. OLD_ROOT 직접 삭제 금지. production source 수정 금지. 026 one-flow verifier 실행 금지. PC Agent service 시작 금지. GPT/browser/external API/middleware/production deploy 금지. 25,000개 후보군 전체 복사 금지. reports 전체, daily_queue 전체, staging 전체, extracted 전체, node_modules, .git, zip/archive/cache 전체 복사 금지.

## COMMON_TARGET_STRUCTURE

NEW_ROOT는 아래 구조를 목표로 한다.

```text
source-factory-active-core/
  _CONSTITUTION_V2_COMPACT/
  src/
    queue/
    pc_agent/
    runtime_pipeline/
    gpt_browser_bridge/
  tools/
  rules/
  config/
  state/
  reports/
    install_verify/
  install/
  README_ACTIVE_CORE.md
  ACTIVE_CORE_MANIFEST.json
```

## SLOT_MAP

SLOT_01:
  prompt_file: daily_queue/2026-08-01/SLOT_01_SF028_SIZE_AUDIT_AND_OLD_ROOT_MAP_PROMPT_V1_20260801_1858KST.md
  worker_function_class: INSPECTOR_WORKER
  task_goal: OLD_ROOT 4.7GB 원인 분석과 삭제 후보 크기 감사. 삭제하지 않고 원장화만 수행.
  dependency_status: INDEPENDENT
  expected_artifact: state/SF_028_SIZE_AUDIT.json, state/SF_028_DELETE_CANDIDATE_SIZE_AUDIT.json

SLOT_02:
  prompt_file: daily_queue/2026-08-01/SLOT_02_SF028_RUNTIME_REACHABILITY_TRACE_PROMPT_V1_20260801_1858KST.md
  worker_function_class: INSPECTOR_WORKER / TEST_FIXTURE_WORKER
  task_goal: 현재 package/runtime/pc_agent/queue entrypoint에서 실제 도달 가능한 파일 graph 작성.
  dependency_status: INDEPENDENT
  expected_artifact: state/SF_028_RUNTIME_REACHABILITY_GRAPH.json

SLOT_03:
  prompt_file: daily_queue/2026-08-01/SLOT_03_SF028_ACTIVE_CORE_COPY_WORKER_PROMPT_V1_20260801_1858KST.md
  worker_function_class: RUN_SCRIPT_WORKER
  task_goal: NEW_ROOT 생성 및 검증된 active core 파일만 복사. 금지 폴더 전체 복사 금지.
  dependency_status: DEPENDS_ON_SLOT
  depends_on_slot: SLOT_02 preferred, but may use commander seed list if SLOT_02 not complete
  expected_artifact: NEW_ROOT, ACTIVE_CORE_MANIFEST.json, MIGRATION_COPY_REPORT.json

SLOT_04:
  prompt_file: daily_queue/2026-08-01/SLOT_04_SF028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION_PROMPT_V1_20260801_1858KST.md
  worker_function_class: DOCS_WORKER / RUN_SCRIPT_WORKER
  task_goal: compact constitution v2.1.2와 rules/install reference만 NEW_ROOT에 이전하고 JSON/hash 검증.
  dependency_status: INDEPENDENT
  expected_artifact: NEW_ROOT/_CONSTITUTION_V2_COMPACT, state/SF_028_COMPACT_CONSTITUTION_COPY_REPORT.json

SLOT_05:
  prompt_file: daily_queue/2026-08-01/SLOT_05_SF028_ACTIVE_CORE_VERIFY_PROMPT_V1_20260801_1858KST.md
  worker_function_class: TEST_FIXTURE_WORKER / INSPECTOR_WORKER
  task_goal: NEW_ROOT 단독 검증. 필수 파일 존재, JSON parse, Python compile, JS syntax, forbidden copied dirs 검사.
  dependency_status: DEPENDS_ON_SLOT
  depends_on_slot: SLOT_03 and SLOT_04
  expected_artifact: reports/sf028_active_core_verify_<timestamp>/VERIFY_ACTIVE_CORE_REPORT.md

SLOT_06:
  prompt_file: daily_queue/2026-08-01/SLOT_06_SF028_MIGRATION_GATE_AND_OLD_ROOT_DELETE_READINESS_PROMPT_V1_20260801_1858KST.md
  worker_function_class: INSPECTOR_WORKER / GATE_COMMANDER_ASSISTANT
  task_goal: SLOT_01~05 결과 intake 후 DELETE_OLD_ROOT_READY 여부 판정. 직접 삭제는 금지.
  dependency_status: DEPENDS_ON_SLOT
  depends_on_slot: SLOT_01, SLOT_02, SLOT_03, SLOT_04, SLOT_05
  expected_artifact: reports/sf028_migration_gate_<timestamp>/DELETE_OLD_ROOT_READY_REPORT.md

## SEND_ORDER

1. SLOT_01
2. SLOT_02
3. SLOT_04
4. SLOT_03
5. SLOT_05
6. SLOT_06

SLOT_03은 SLOT_02 결과가 있으면 graph 기준으로 복사하고, 없으면 commander seed list 기준으로 preview 복사만 수행한다. SLOT_06은 SLOT_05 검증 없이는 PASS를 주장하지 않는다.

## ACTIVE_CORE_SEED_LIST

```text
_CONSTITUTION_V2_COMPACT/00_AI_SUPER_BOOT_v2_1_2_COMPACT.md
_CONSTITUTION_V2_COMPACT/01_COMPACT_RULE_SCHEMA_v2_1_2.json
_CONSTITUTION_V2_COMPACT/02_WORKER_COMMANDER_CONTRACTS_COMPACT_v2_1_2.md
_CONSTITUTION_V2_COMPACT/03_STAGE4_AUTOMATION_CONTRACT_COMPACT_v2_1_2.md
_CONSTITUTION_V2_COMPACT/04_COMPACT_INSTALL_AND_REFERENCE_MAP_v2_1_2.json
_CONSTITUTION_V2_COMPACT/FINAL_COMPACT_MANIFEST_v2_1_2.json
_CONSTITUTION_V2_COMPACT/V2_1_2_COMPACT_UPDATE_REPORT.md
src/queue/local_claim_store.py
src/queue/terminal_receipt_store.py
src/queue/local_worker_lifecycle.py
src/queue/dailyQueueReader.js
src/queue/pythonProcessRunner.js
src/pc_agent/local_command_runner.py
src/pc_agent/local_pc_agent_mvp.py
src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json
src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js
src/gpt_browser_bridge/buttonHandlers.js
src/gpt_browser_bridge/diagnostics.js
src/gpt_browser_bridge/fileNameSafe.js
src/gpt_browser_bridge/stage1SelfCheck.js
rules/powershell51/
tools/source_factory_oneflow_*.py currently verified/used only
tools/*verify*.py install/runtime relevant only
```

## FORBIDDEN_COPY_SET

```text
.git/
node_modules/
reports/ 전체
daily_queue/ 전체
staging/
extracted/
candidate/
backlog/
dist 구버전
zip / 7z / tar / gz archive 전체
old constitution archive
R1/R2/R3 중간 실패 산출물
25,000개 후보군 원본
대용량 Drive pointer 대상
```

## FINAL_BATCH_SUCCESS

SF_028_ACTIVE_CORE_MIGRATION_BATCH_READY means prompt files posted only. It does not mean migration PASS.

SF_028_ACTIVE_CORE_MIGRATION_PASS requires SLOT_05 verify PASS and SLOT_06 delete-readiness gate PASS. OLD_ROOT deletion must be separate commander/user approval after gate.
