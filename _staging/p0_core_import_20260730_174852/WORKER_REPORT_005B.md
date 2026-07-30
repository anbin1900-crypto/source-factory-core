WORKER_REPORT_START
worker_id: SOURCE_FACTORY_STAGED_CORE_STATIC_CHECK_WORKER_005B
task_id: SOURCE_FACTORY_STAGED_P0_CORE_STATIC_CHECK_V3
worker_function_class: STATIC_CHECK_WORKER / NONFATAL_NATIVE_CHECK_WORKER
files_created:
  - reports/SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.md
  - reports/SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.json
  - reports/SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.csv
  - WORKER_REPORT_005B.md
files_modified: []
patch_requests_created: []
report_only_artifacts:
  - per-file static check results
  - promotion candidate counts
tests_run:
  - staging manifest read
  - staged file path resolution
  - SHA-256 comparison
  - node --check for JS where applicable
  - JSON parse check where applicable
  - PowerShell parser check where applicable
tests_not_run:
  - runtime execution
  - src promotion
  - Google Drive upload
class_contract_status: READY_FOR_COMMANDER_REVIEW
priority_0_status: STATIC_CHECK_V3_COMPLETE_IF_TOTAL_CHECKED_GT_0
known_risks:
  - static check only
  - promotion candidates still require manual review
next_needed:
  - review promotion candidates
  - create 006 src promotion plan
WORKER_REPORT_END
