WORKER_REPORT_START
worker_id: SF_028_ACTIVE_CORE_MIGRATION_WORKER_01
task_id: SF_028_SOURCE_FACTORY_ACTIVE_CORE_MIGRATION
old_root: D:\SOURCE FACTORY
new_root: E:\SOURCE FACTORY\source-factory-active-core
files_copied_count: 68
total_new_root_size_bytes: 966859
old_root_size_bytes: NOT_REMEASURED_STRICT_REBUILD
size_reduction_estimate: STRICT_RUNTIME_ONLY
files_created:
  - ACTIVE_CORE_MANIFEST.json, DELETE_OLD_ROOT_READY_REPORT.md, GITHUB_PUBLISH_REPORT.json, INSTALL_ACTIVE_CORE_DEPENDENCIES.ps1, MIGRATION_COPY_REPORT.json, RUNTIME_DEPENDENCY_GRAPH.json, RUN_SF4_ACTIVE_CORE_SAFE_PANEL.bat, SF028_TERMINAL.txt, SOURCE_ROLE_ANALYSIS.json, SOURCE_ROLE_ANALYSIS.md, VERIFY_ACTIVE_CORE_REPORT.json, WORKER_REPORT_SF028.md
files_modified:
  - E_NEW_ROOT_REPLACED_ONLY
verification:
  required_files_present: true
  json_parse: true
  python_compile: true
  js_syntax: true
  manifest_hash: true
  forbidden_dirs_copied: 0
delete_old_root_ready: false
old_root_deleted: false
tests_run:
  - strict explicit runtime dependency closure
  - JSON parse
  - Python py_compile
  - JavaScript node --check
  - SHA-256 manifest verification
tests_not_run:
  - Electron runtime launch
  - PC Agent service
  - 026 one-flow verifier
forbidden_operations:
  old_root_delete: NOT_RUN
  production_source_modify: NOT_RUN
  pc_agent_service: NOT_STARTED
  external_effect: 0
class_contract_status: PASS
priority_0_status: PASS_LOCAL_D_SOURCE_UNMODIFIED
known_risks:
  - node_modules intentionally absent; dependency installation and standalone runtime launch remain pending
  - unresolved explicit references count: 2
next_needed: Install dependencies in NEW_ROOT, run the generated launcher, and verify standalone runtime before any D: deletion decision.
WORKER_REPORT_END

SF_028_ACTIVE_CORE_MIGRATION_YELLOW_REVIEW_NEEDED
