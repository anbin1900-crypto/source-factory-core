WORKER_REPORT_START
worker_id: SF_028_ACTIVE_CORE_MIGRATION_WORKER_01
task_id: SF_028_SOURCE_FACTORY_ACTIVE_CORE_MIGRATION
old_root: D:\SOURCE FACTORY
new_root: E:\SOURCE FACTORY\source-factory-active-core
files_copied_count: 140
total_new_root_size_bytes: 2064103
old_root_size_bytes: 5091958995
size_reduction_estimate: {"bytes_reduced": 5089894892, "percent_reduced": 99.9595}
files_created:
  - ACTIVE_CORE_MANIFEST.json
  - MIGRATION_COPY_REPORT.json
  - VERIFY_ACTIVE_CORE_REPORT.json
  - DELETE_OLD_ROOT_READY_REPORT.md
  - WORKER_REPORT_SF028.md
  - SOURCE_ROLE_ANALYSIS.json
  - SOURCE_ROLE_ANALYSIS.md
  - RUNTIME_DEPENDENCY_GRAPH.json
  - GITHUB_PUBLISH_REPORT.json
files_modified:
  - NONE_IN_OLD_ROOT
verification:
  required_files_present: false
  json_parse: true
  python_compile: true
  js_syntax: true
  manifest_hash: true
  forbidden_dirs_copied: 0
delete_old_root_ready: false
old_root_deleted: false
tests_run:
  - required file presence
  - JSON parse
  - Python py_compile
  - JavaScript node --check
  - manifest SHA-256 recomputation
  - forbidden path scan
tests_not_run:
  - 026 one-flow verifier
  - PC Agent service
  - Electron runtime launch
  - external API or middleware
forbidden_operations:
  old_root_delete: NOT_RUN
  production_source_modify: NOT_RUN
  pc_agent_service: NOT_STARTED
  external_effect: GITHUB_REPORT_ONLY_IF_PUBLISHED
class_contract_status: FAIL
priority_0_status: PASS_OLD_ROOT_UNMODIFIED
known_risks:
  - static dependency analysis can miss paths constructed entirely at runtime; full SAFE directory is therefore retained
  - node_modules is forbidden from migration, so npm dependency installation is required before standalone Electron launch
  - unresolved_reference_count=424
next_needed: Correct missing or failed validation items and rerun SF_028.
WORKER_REPORT_END

SF_028_ACTIVE_CORE_MIGRATION_FAIL
