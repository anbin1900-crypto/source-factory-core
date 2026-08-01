# SLOT 04 — SF_028 Compact Constitution and Rules Migration Package Report

GENERATED_AT_KST: 2026-08-01T19:18:00+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
PROMPT_COMMIT: `0b1f3ee32779484ce7b0f65fda69b109f1c1d57f`
BATCH_COMMIT: `a8e0c105e2cbf1d7b06530e86d43f368599a0a38`

## Result

The supplied v2.1.2-COMPACT package was preflight-validated and an idempotent PowerShell 5.1 migration/validation script was published.

Preflight findings:

- required compact files: 7/7 present
- required JSON parse: 3/3 PASS
- manifest-listed hashes: 6/6 PASS
- initial read order: PASS
- detailed files classified reference-only/read-when-needed: PASS
- old full archive included: NO
- migration script static gates: PASS
- user Windows `D:` copy: NOT_EXECUTED_FROM_CHATGPT_RUNTIME

Published artifacts:

- script commit: `6789d116dedcc347bbd9ca78362cdd5eeb564c46`
- preflight ledger commit: `bcff54fbd011ee6ea73cc8c91e655233de5e3f8b`

The script performs only the requested operations:

1. Copies the exact seven compact files to `D:\SOURCE FACTORY\source-factory-active-core\_CONSTITUTION_V2_COMPACT`.
2. Copies allowed current files only from `rules\powershell51`.
3. Excludes archive/deprecated rule candidates.
4. Parses the three required JSON files.
5. Compares manifest SHA256 and source/destination SHA256 values.
6. Verifies the two-file initial read order and reference-only expansion policy.
7. Writes `SF_028_COMPACT_CONSTITUTION_COPY_REPORT.json` to both NEW_ROOT and OLD_ROOT state paths.
8. Writes the local SLOT 04 Worker report under OLD_ROOT reports.

## Local execution command

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\SOURCE FACTORY\source-factory-core\tools\SF_028_MIGRATE_COMPACT_CONSTITUTION_AND_RULES.ps1" `
  -OldRepoRoot "D:\SOURCE FACTORY\source-factory-core" `
  -CompactSourceRoot "D:\SOURCE FACTORY\_CONSTITUTION_V2_COMPACT" `
  -NewRoot "D:\SOURCE FACTORY\source-factory-active-core"
```

WORKER_REPORT_START
worker_id: SLOT_04_SF028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION_WORKER
task_id: SF_028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION
worker_function_class: DOCS_WORKER / RUN_SCRIPT_WORKER
old_root: D:\SOURCE FACTORY\source-factory-core
compact_source_root: D:\SOURCE FACTORY\_CONSTITUTION_V2_COMPACT
new_root: D:\SOURCE FACTORY\source-factory-active-core
compact_files_copied_count: 0_FROM_CHATGPT_RUNTIME
rules_files_copied_count: 0_FROM_CHATGPT_RUNTIME
json_parse_status: PASS_3_OF_3_PREFLIGHT
sha256_match_status: PASS_6_OF_6_MANIFEST_PREFLIGHT
initial_read_order_preserved: true
files_created:
  - tools/SF_028_MIGRATE_COMPACT_CONSTITUTION_AND_RULES.ps1
  - state/SF_028_COMPACT_CONSTITUTION_MIGRATION_PACKAGE_PREFLIGHT.json
  - reports/sf028_slot04_compact_constitution_package_20260801_1918/WORKER_REPORT_SLOT_04.md
files_modified: []
tests_run:
  - supplied compact package required-file presence: PASS_7_OF_7
  - JSON parse: PASS_3_OF_3
  - manifest hash validation: PASS_6_OF_6
  - initial read order validation: PASS
  - reference-only classification validation: PASS
  - PowerShell script static structure gates: PASS
tests_not_run:
  - user Windows D drive copy and destination readback: NOT_ACCESSIBLE_FROM_CHATGPT_RUNTIME
  - rules/powershell51 live enumeration: DEFERRED_TO_LOCAL_SCRIPT
  - SLOT 05 standalone Active Core verification: NOT_SLOT_04_SCOPE
forbidden_operations:
  old_archive_active_copy: NOT_RUN
  old_root_delete: NOT_RUN
  026_oneflow_verifier: NOT_RUN
  pc_agent_service: NOT_STARTED
  external_effect: 0
class_contract_status: COMPLIANT_PACKAGE_READY
priority_0_status: COMPLIANT_NO_PRODUCTION_SOURCE_MODIFICATION
known_risks:
  - Actual D-drive copy and destination hash readback require one local script execution.
  - Archive/deprecated rule candidates are intentionally excluded and surfaced as CONFIG_RULE_REFERENCE_YELLOW.
next_needed: RUN_LOCAL_SCRIPT_THEN_SLOT_05_ACTIVE_CORE_STANDALONE_VERIFY
terminal_status: SF_028_SLOT_04_COMPACT_CONSTITUTION_COPY_YELLOW
WORKER_REPORT_END
