# SLOT_05 — SF_028 ACTIVE CORE VERIFY PROMPT V1

WORKER_ID: SLOT_05_SF028_ACTIVE_CORE_VERIFY_WORKER
TASK_ID: SF_028_ACTIVE_CORE_NEW_ROOT_VERIFY
WORKER_FUNCTION_CLASS: TEST_FIXTURE_WORKER / INSPECTOR_WORKER
REPORT_TO: SF_028_ACTIVE_CORE_MIGRATION_COMMANDER
REPO: anbin1900-crypto/source-factory-core

## GOAL

SLOT_03/SLOT_04가 만든 NEW_ROOT `source-factory-active-core`가 구버전 4.7GB 폴더 없이 단독 운영 기준판이 될 수 있는지 검증한다. 이 worker는 검증만 한다. 삭제하지 않는다. 서비스 시작하지 않는다.

## NEW_ROOT CANDIDATES

```text
E:\YOLLA\source-factory-active-core
D:\SOURCE FACTORY\source-factory-active-core
```

## REQUIRED INPUTS

```text
ACTIVE_CORE_MANIFEST.json
MIGRATION_COPY_REPORT.json
state/SF_028_COMPACT_CONSTITUTION_COPY_REPORT.json
```

있으면 추가로 사용:

```text
state/SF_028_RUNTIME_REACHABILITY_GRAPH.json
state/SF_028_ACTIVE_RUNTIME_CORE_MANIFEST.json
state/SF_028_VERIFY_ONLY_SOURCE_MANIFEST.json
state/SF_028_PENDING_INTEGRATION_SOURCE_LEDGER.json
```

## FORBIDDEN

- OLD_ROOT 삭제 금지
- NEW_ROOT production 실행 금지
- 026 one-flow verifier 실행 금지
- PC Agent service 시작 금지
- GPT/browser/external API/middleware/production deploy 금지
- GitHub write 금지
- reports/daily_queue/staging 전체 복사 금지

## REQUIRED VERIFICATION

1. NEW_ROOT exists
2. Required directory structure exists

```text
_CONSTITUTION_V2_COMPACT/
src/queue/
src/pc_agent/
src/runtime_pipeline/
rules/
state/
reports/install_verify/
install/
```

3. Required compact files exist

```text
_CONSTITUTION_V2_COMPACT/00_AI_SUPER_BOOT_v2_1_2_COMPACT.md
_CONSTITUTION_V2_COMPACT/01_COMPACT_RULE_SCHEMA_v2_1_2.json
_CONSTITUTION_V2_COMPACT/04_COMPACT_INSTALL_AND_REFERENCE_MAP_v2_1_2.json
_CONSTITUTION_V2_COMPACT/FINAL_COMPACT_MANIFEST_v2_1_2.json
```

4. Required runtime files exist

```text
src/queue/local_claim_store.py
src/queue/terminal_receipt_store.py
src/queue/local_worker_lifecycle.py
src/queue/dailyQueueReader.js
src/queue/pythonProcessRunner.js
src/pc_agent/local_command_runner.py
src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json
src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js
```

5. Pending integration check

```text
src/pc_agent/local_pc_agent_mvp.py
```

If present but SLOT 05/06 R3 gate not confirmed, classify as PENDING_INTEGRATION_PRESENT. Do not fail only because pending. But report that installation pack should mark it pending_profile_only.

6. JSON parse

Parse all JSON in required compact/runtime manifest files.

7. Python compile

Compile:

```text
src/queue/local_claim_store.py
src/queue/terminal_receipt_store.py
src/queue/local_worker_lifecycle.py
src/pc_agent/local_command_runner.py
src/pc_agent/local_pc_agent_mvp.py if present
```

8. JavaScript syntax check

Use `node --check` only if node exists. If node is missing, record tests_not_run. Do not fail solely for missing node unless JS runtime is required by current manifest.

```text
src/queue/dailyQueueReader.js
src/queue/pythonProcessRunner.js
src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js
src/gpt_browser_bridge/buttonHandlers.js if present
src/gpt_browser_bridge/diagnostics.js if present
src/gpt_browser_bridge/fileNameSafe.js if present
src/gpt_browser_bridge/stage1SelfCheck.js if present
```

9. Forbidden copied dirs check

FAIL if any of these exist under NEW_ROOT:

```text
.git/
node_modules/
staging/
extracted/
candidate/
backlog/
build/
cache/
temp/
```

YELLOW if reports or daily_queue exists with large historical content. Minimal `reports/install_verify` is allowed.

10. Hash verification

Compare copied file sha256 values against ACTIVE_CORE_MANIFEST/MIGRATION_COPY_REPORT when available.

## OUTPUT FILES

```text
reports/sf028_active_core_verify_<timestamp>/VERIFY_ACTIVE_CORE_REPORT.md
reports/sf028_active_core_verify_<timestamp>/VERIFY_ACTIVE_CORE_REPORT.json
reports/sf028_active_core_verify_<timestamp>/WORKER_REPORT_SLOT_05.md
```

## VERIFY REPORT JSON SCHEMA

```json
{
  "task_id": "SF_028_ACTIVE_CORE_NEW_ROOT_VERIFY",
  "worker_id": "SLOT_05_SF028_ACTIVE_CORE_VERIFY_WORKER",
  "new_root": "",
  "required_dirs_present": true,
  "required_files_present": true,
  "json_parse_pass": true,
  "python_compile_pass": true,
  "js_syntax_status": "PASS|YELLOW_NOT_RUN|FAIL",
  "hash_match_status": "PASS|YELLOW_PARTIAL|FAIL",
  "forbidden_dirs_copied_count": 0,
  "pending_integration": [],
  "external_effect_count": 0,
  "new_root_ready_for_gate": true
}
```

## PASS CRITERIA

- NEW_ROOT exists
- required files present
- JSON parse PASS
- Python compile PASS
- forbidden copied dirs count 0
- hash mismatch 없음
- external effect 0

YELLOW if:
- JS syntax check not run due node missing
- local_pc_agent_mvp.py pending integration
- optional helper missing
- hash data partial

FAIL if:
- required files missing
- JSON/Python required check fails
- forbidden copied dirs found
- old root deletion/service/external effect occurred

## REPORT FORMAT

```text
WORKER_REPORT_START
worker_id: SLOT_05_SF028_ACTIVE_CORE_VERIFY_WORKER
task_id: SF_028_ACTIVE_CORE_NEW_ROOT_VERIFY
worker_function_class: TEST_FIXTURE_WORKER / INSPECTOR_WORKER
new_root:
required_dirs_present:
required_files_present:
json_parse_status:
python_compile_status:
js_syntax_status:
hash_match_status:
forbidden_dirs_copied_count:
pending_integration_count:
files_created:
files_modified:
tests_run:
tests_not_run:
forbidden_operations:
  old_root_delete: NOT_RUN
  service_start: NOT_RUN
  026_oneflow_verifier: NOT_RUN
  github_write: NOT_RUN
  external_effect: 0
class_contract_status:
priority_0_status:
known_risks:
next_needed:
terminal_status: SF_028_SLOT_05_ACTIVE_CORE_VERIFY_PASS | SF_028_SLOT_05_ACTIVE_CORE_VERIFY_YELLOW | SF_028_SLOT_05_ACTIVE_CORE_VERIFY_FAIL
WORKER_REPORT_END
```
