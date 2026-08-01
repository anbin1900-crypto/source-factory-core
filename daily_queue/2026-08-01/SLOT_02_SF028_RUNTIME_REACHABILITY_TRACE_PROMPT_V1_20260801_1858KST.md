# SLOT_02 — SF_028 RUNTIME REACHABILITY TRACE PROMPT V1

WORKER_ID: SLOT_02_SF028_RUNTIME_REACHABILITY_TRACE_WORKER
TASK_ID: SF_028_RUNTIME_REACHABILITY_TRACE
WORKER_FUNCTION_CLASS: INSPECTOR_WORKER / TEST_FIXTURE_WORKER
REPORT_TO: SF_028_ACTIVE_CORE_MIGRATION_COMMANDER
REPO: anbin1900-crypto/source-factory-core

## GOAL

25,000개 후보군을 다시 선별하지 않는다. 현재 실제 런타임 entrypoint에서 import/require/call/config 참조를 따라가며 Active Core 후보 graph를 만든다.

## OLD_ROOT CANDIDATES

```text
E:\YOLLA\source-factory-core
D:\SOURCE FACTORY\source-factory-core
```

## PRIMARY ENTRYPOINTS

반드시 아래 순서로 확인한다.

```text
package.json
src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json
src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js
src/pc_agent/local_pc_agent_mvp.py
src/pc_agent/local_command_runner.py
src/queue/local_claim_store.py
src/queue/terminal_receipt_store.py
src/queue/local_worker_lifecycle.py
src/queue/dailyQueueReader.js
src/queue/pythonProcessRunner.js
```

## SECONDARY HELPERS

도달성이 확인되면 포함 후보로 둔다.

```text
src/gpt_browser_bridge/buttonHandlers.js
src/gpt_browser_bridge/diagnostics.js
src/gpt_browser_bridge/fileNameSafe.js
src/gpt_browser_bridge/stage1SelfCheck.js
rules/powershell51/
tools/source_factory_oneflow_*.py
tools/*verify*.py
tools/*install*.py
tools/*runtime_pipeline*.py
tools/*claim*.py
tools/*receipt*.py
tools/*pc_agent*.py
```

## FORBIDDEN

- 파일 삭제 금지
- 파일 이동 금지
- NEW_ROOT 복사 금지. 이 worker는 trace만 한다.
- 026 verifier 실행 금지
- PC Agent service 시작 금지
- 전체 reports/daily_queue/staging/candidate/backlog를 active로 분류 금지
- 실행하지 않은 PASS 주장 금지

## TRACE RULES

Python:
- ast.parse로 import/import_from 추출
- pathlib/open/json 참조 문자열 후보 추출
- subprocess.run 호출 후보 추출
- 동적 import는 risk_flags에 기록

JavaScript:
- import ... from 추출
- require(...) 추출
- fs.readFile/path 후보 추출
- child_process 호출 후보 추출

JSON:
- path, script, module, registry, command, file, target 필드 추출

Markdown/report/prompt:
- runtime source로 포함하지 않는다.
- 다만 compact constitution/rules/install reference는 CONFIG_RULE_REFERENCE로 분류 가능하다.

## CLASSIFICATION

각 파일은 아래 중 하나로 분류한다.

```text
RUNTIME_REACHABLE_ACTIVE
VERIFY_ONLY
CONFIG_RULE_REFERENCE
PROMPT_OR_REPORT_REFERENCE
CANDIDATE_BACKLOG
ARCHIVE_OR_DELETE_CANDIDATE
PENDING_INTEGRATION
```

특별 규칙:
`src/pc_agent/local_pc_agent_mvp.py`는 runtime reachable이면 포함 후보이나, SLOT 05/06 R3 통합 gate 확인이 없으면 PENDING_INTEGRATION으로 둔다.

## OUTPUT FILES

```text
state/SF_028_RUNTIME_REACHABILITY_GRAPH.json
state/SF_028_ACTIVE_RUNTIME_CORE_MANIFEST.json
state/SF_028_VERIFY_ONLY_SOURCE_MANIFEST.json
state/SF_028_PENDING_INTEGRATION_SOURCE_LEDGER.json
state/SF_028_ARCHIVE_BACKLOG_POINTER.json
reports/sf028_slot02_runtime_reachability_<timestamp>/WORKER_REPORT_SLOT_02.md
```

## GRAPH SCHEMA

```json
{
  "task_id": "SF_028_RUNTIME_REACHABILITY_TRACE",
  "worker_id": "SLOT_02_SF028_RUNTIME_REACHABILITY_TRACE_WORKER",
  "old_root": "",
  "current_head": "",
  "entrypoints": [],
  "nodes": [
    {
      "path": "",
      "type": "python|javascript|json|markdown|rule|unknown",
      "reachable_from": [],
      "imports": [],
      "config_refs": [],
      "subprocess_refs": [],
      "classification": "",
      "risk_flags": [],
      "include_in_new_root": false
    }
  ],
  "edges": []
}
```

## PASS CRITERIA

- entrypoints 식별 완료
- runtime reachable active 후보 목록 생성
- verify-only 목록 생성
- pending integration 목록 생성
- 25,000개 후보군은 backlog pointer로만 분리
- 삭제/복사/외부효과 없음

## REPORT FORMAT

```text
WORKER_REPORT_START
worker_id: SLOT_02_SF028_RUNTIME_REACHABILITY_TRACE_WORKER
task_id: SF_028_RUNTIME_REACHABILITY_TRACE
worker_function_class: INSPECTOR_WORKER / TEST_FIXTURE_WORKER
old_root:
current_head:
entrypoints_found:
runtime_reachable_active_count:
verify_only_count:
pending_integration_count:
candidate_backlog_count:
files_created:
files_modified:
tests_run:
tests_not_run:
forbidden_operations:
  file_delete: NOT_RUN
  file_move: NOT_RUN
  new_root_copy: NOT_RUN
  026_oneflow_verifier: NOT_RUN
  pc_agent_service: NOT_STARTED
  external_effect: 0
class_contract_status:
priority_0_status:
known_risks:
next_needed:
terminal_status: SF_028_SLOT_02_RUNTIME_REACHABILITY_TRACE_PASS | SF_028_SLOT_02_RUNTIME_REACHABILITY_TRACE_YELLOW | SF_028_SLOT_02_RUNTIME_REACHABILITY_TRACE_FAIL
WORKER_REPORT_END
```
