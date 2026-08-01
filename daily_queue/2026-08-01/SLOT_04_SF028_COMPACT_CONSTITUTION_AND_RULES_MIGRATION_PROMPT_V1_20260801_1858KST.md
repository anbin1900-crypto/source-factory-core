# SLOT_04 — SF_028 COMPACT CONSTITUTION AND RULES MIGRATION PROMPT V1

WORKER_ID: SLOT_04_SF028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION_WORKER
TASK_ID: SF_028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION
WORKER_FUNCTION_CLASS: DOCS_WORKER / RUN_SCRIPT_WORKER
REPORT_TO: SF_028_ACTIVE_CORE_MIGRATION_COMMANDER
REPO: anbin1900-crypto/source-factory-core

## GOAL

Source Factory Active Core의 운영 기준 파일만 NEW_ROOT에 이전한다. 전체 구버전 헌법 archive를 옮기지 않는다. v2.1.2-COMPACT 기준의 compact boot/schema/contracts/stage4/install map/update report/final manifest와 현재 rules만 복사·검증한다.

## OLD_ROOT CANDIDATES

```text
E:\YOLLA\source-factory-core
D:\SOURCE FACTORY\source-factory-core
D:\SOURCE FACTORY\_CONSTITUTION_V2_COMPACT
```

## NEW_ROOT CANDIDATES

```text
E:\YOLLA\source-factory-active-core
D:\SOURCE FACTORY\source-factory-active-core
```

## REQUIRED COMPACT FILES

```text
_CONSTITUTION_V2_COMPACT/00_AI_SUPER_BOOT_v2_1_2_COMPACT.md
_CONSTITUTION_V2_COMPACT/01_COMPACT_RULE_SCHEMA_v2_1_2.json
_CONSTITUTION_V2_COMPACT/02_WORKER_COMMANDER_CONTRACTS_COMPACT_v2_1_2.md
_CONSTITUTION_V2_COMPACT/03_STAGE4_AUTOMATION_CONTRACT_COMPACT_v2_1_2.md
_CONSTITUTION_V2_COMPACT/04_COMPACT_INSTALL_AND_REFERENCE_MAP_v2_1_2.json
_CONSTITUTION_V2_COMPACT/FINAL_COMPACT_MANIFEST_v2_1_2.json
_CONSTITUTION_V2_COMPACT/V2_1_2_COMPACT_UPDATE_REPORT.md
```

## REQUIRED VALIDATION

1. `FINAL_COMPACT_MANIFEST_v2_1_2.json` JSON parse PASS
2. `01_COMPACT_RULE_SCHEMA_v2_1_2.json` JSON parse PASS
3. `04_COMPACT_INSTALL_AND_REFERENCE_MAP_v2_1_2.json` JSON parse PASS
4. Manifest listed files exist in NEW_ROOT
5. SHA256 of copied compact files matches manifest when manifest hash is available
6. Initial read order preserved:

```text
00_AI_SUPER_BOOT_v2_1_2_COMPACT.md
01_COMPACT_RULE_SCHEMA_v2_1_2.json
```

7. Detailed files classified reference_only or read_when_needed, not mandatory initial load.

## RULES COPY

Copy only current active rules, especially:

```text
rules/powershell51/
```

Do not copy old rule archives unless explicitly referenced by current rule manifest. If uncertain, classify as CONFIG_RULE_REFERENCE_YELLOW and do not include archive.

## FORBIDDEN

- old full v2.0.4 archive copy as active core 금지
- old constitution 전체 복사 금지
- reports/daily_queue/staging/candidates 복사 금지
- OLD_ROOT 삭제 금지
- 026 verifier 실행 금지
- PC Agent service 시작 금지
- 외부효과 금지

## OUTPUT FILES

Inside NEW_ROOT:

```text
_CONSTITUTION_V2_COMPACT/*
rules/powershell51/*
state/SF_028_COMPACT_CONSTITUTION_COPY_REPORT.json
```

Inside OLD_ROOT repo reports/state:

```text
state/SF_028_COMPACT_CONSTITUTION_COPY_REPORT.json
reports/sf028_slot04_compact_constitution_<timestamp>/WORKER_REPORT_SLOT_04.md
```

## COPY REPORT SCHEMA

```json
{
  "task_id": "SF_028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION",
  "worker_id": "SLOT_04_SF028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION_WORKER",
  "old_root": "",
  "new_root": "",
  "compact_files": [],
  "rules_files": [],
  "json_parse": {
    "FINAL_COMPACT_MANIFEST_v2_1_2.json": "PASS|FAIL|MISSING",
    "01_COMPACT_RULE_SCHEMA_v2_1_2.json": "PASS|FAIL|MISSING",
    "04_COMPACT_INSTALL_AND_REFERENCE_MAP_v2_1_2.json": "PASS|FAIL|MISSING"
  },
  "sha256_match": [],
  "initial_read_order_preserved": true,
  "reference_only_files_preserved": true,
  "old_full_archive_copied": false
}
```

## PASS CRITERIA

- all required compact files copied or already present in NEW_ROOT
- JSON parse PASS
- manifest hash check PASS when available
- old full archive not copied
- rules copied only from current active rules path
- external effect 0

## REPORT FORMAT

```text
WORKER_REPORT_START
worker_id: SLOT_04_SF028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION_WORKER
task_id: SF_028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION
worker_function_class: DOCS_WORKER / RUN_SCRIPT_WORKER
old_root:
new_root:
compact_files_copied_count:
rules_files_copied_count:
json_parse_status:
sha256_match_status:
initial_read_order_preserved:
files_created:
files_modified:
tests_run:
tests_not_run:
forbidden_operations:
  old_archive_active_copy: NOT_RUN
  old_root_delete: NOT_RUN
  026_oneflow_verifier: NOT_RUN
  pc_agent_service: NOT_STARTED
  external_effect: 0
class_contract_status:
priority_0_status:
known_risks:
next_needed:
terminal_status: SF_028_SLOT_04_COMPACT_CONSTITUTION_COPY_PASS | SF_028_SLOT_04_COMPACT_CONSTITUTION_COPY_YELLOW | SF_028_SLOT_04_COMPACT_CONSTITUTION_COPY_FAIL
WORKER_REPORT_END
```
