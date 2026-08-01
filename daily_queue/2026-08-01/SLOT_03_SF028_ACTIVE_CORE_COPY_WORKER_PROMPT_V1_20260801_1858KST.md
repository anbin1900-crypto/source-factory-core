# SLOT_03 — SF_028 ACTIVE CORE COPY WORKER PROMPT V1

WORKER_ID: SLOT_03_SF028_ACTIVE_CORE_COPY_WORKER
TASK_ID: SF_028_ACTIVE_CORE_COPY_TO_NEW_ROOT
WORKER_FUNCTION_CLASS: RUN_SCRIPT_WORKER
REPORT_TO: SF_028_ACTIVE_CORE_MIGRATION_COMMANDER
REPO: anbin1900-crypto/source-factory-core

## GOAL

기존 4.7GB OLD_ROOT 안에서 현재 런타임에 필요한 검증 파일만 새 NEW_ROOT 폴더로 복사한다. 구버전 폴더 안에서 정리하지 않는다. 새 폴더를 만들고 필요한 것만 이전한다.

## OLD_ROOT CANDIDATES

```text
E:\YOLLA\source-factory-core
D:\SOURCE FACTORY\source-factory-core
```

## NEW_ROOT CANDIDATES

```text
E:\YOLLA\source-factory-active-core
D:\SOURCE FACTORY\source-factory-active-core
```

우선순위는 OLD_ROOT와 같은 drive의 `source-factory-active-core`다. 이미 존재하면 timestamp suffix를 붙인 preview root를 만들거나, 충돌 상태를 YELLOW로 보고한다. 기존 NEW_ROOT를 덮어쓰지 않는다.

## DEPENDENCY

Preferred input:

```text
state/SF_028_RUNTIME_REACHABILITY_GRAPH.json
state/SF_028_ACTIVE_RUNTIME_CORE_MANIFEST.json
state/SF_028_VERIFY_ONLY_SOURCE_MANIFEST.json
state/SF_028_PENDING_INTEGRATION_SOURCE_LEDGER.json
```

SLOT_02 결과가 없으면 아래 commander seed list만 preview copy 한다. 이 경우 terminal은 PASS가 아니라 YELLOW_REVIEW_NEEDED로 둔다.

## COMMANDER SEED COPY LIST

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
```

Tools copy rule:
Only copy tools explicitly marked RUNTIME_REACHABLE_ACTIVE or VERIFY_ONLY by SLOT_02. Do not copy the whole tools directory.

## FORBIDDEN COPY SET

절대 복사하지 말 것:

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
build/
cache/
temp/
*.zip
*.7z
*.tar
*.gz
old constitution archive
R1/R2/R3 중간 실패 산출물
25,000개 후보군 원본
대용량 Drive pointer 대상
```

## FORBIDDEN OPERATIONS

- OLD_ROOT 삭제 금지
- OLD_ROOT source 수정 금지
- git rm 금지
- 026 verifier 실행 금지
- PC Agent service 시작 금지
- GPT/browser/external API/middleware/production deploy 금지
- NEW_ROOT 기존 파일 덮어쓰기 금지

## REQUIRED NEW_ROOT STRUCTURE

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
  MIGRATION_COPY_REPORT.json
```

## COPY VERIFICATION

For every copied file:
- old_path
- new_path
- size_bytes
- sha256_old
- sha256_new
- hash_match true/false
- classification
- source_basis: reachability_graph | commander_seed

## OUTPUT FILES

Inside NEW_ROOT:

```text
ACTIVE_CORE_MANIFEST.json
MIGRATION_COPY_REPORT.json
README_ACTIVE_CORE.md
```

Inside OLD_ROOT repo reports/state:

```text
state/SF_028_ACTIVE_CORE_COPY_REPORT.json
reports/sf028_slot03_active_core_copy_<timestamp>/WORKER_REPORT_SLOT_03.md
```

## PASS CRITERIA

PASS only if:
- SLOT_02 reachability manifest was used
- NEW_ROOT created
- required files copied
- all copied file hash matches true
- forbidden dirs copied count = 0
- OLD_ROOT deleted false
- no external effect

YELLOW if:
- commander seed list used without SLOT_02 graph
- some optional helper missing
- local_pc_agent_mvp.py remains pending integration
- NEW_ROOT already existed and was not overwritten

FAIL if:
- OLD_ROOT modified/deleted
- forbidden directory copied
- hash mismatch
- service/external effect occurred

## REPORT FORMAT

```text
WORKER_REPORT_START
worker_id: SLOT_03_SF028_ACTIVE_CORE_COPY_WORKER
task_id: SF_028_ACTIVE_CORE_COPY_TO_NEW_ROOT
worker_function_class: RUN_SCRIPT_WORKER
old_root:
new_root:
copy_basis: reachability_graph | commander_seed
files_copied_count:
total_new_root_size_bytes:
forbidden_dirs_copied_count:
files_created:
files_modified:
verification:
  required_files_present:
  manifest_hash_match:
  forbidden_dirs_copied:
  old_root_deleted: false
tests_run:
tests_not_run:
forbidden_operations:
  old_root_delete: NOT_RUN
  old_root_modify: NOT_RUN
  git_rm: NOT_RUN
  026_oneflow_verifier: NOT_RUN
  pc_agent_service: NOT_STARTED
  external_effect: 0
class_contract_status:
priority_0_status:
known_risks:
next_needed:
terminal_status: SF_028_SLOT_03_ACTIVE_CORE_COPY_PASS | SF_028_SLOT_03_ACTIVE_CORE_COPY_YELLOW | SF_028_SLOT_03_ACTIVE_CORE_COPY_FAIL
WORKER_REPORT_END
```
