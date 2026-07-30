WORKER_REPORT_START
worker_id: SOURCE_FACTORY_CORE_STAGED_STATIC_CHECK_WORKER_005
task_id: SOURCE_FACTORY_CORE_STAGED_P0_STATIC_CHECK
worker_function_class: STATIC_CHECK_WORKER / PROMOTION_CANDIDATE_CLASSIFIER
files_created:
  - reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS.md
  - reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS.json
  - reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS.csv
  - WORKER_REPORT_005.md
files_modified: []
patch_requests_created: []
report_only_artifacts:
  - staged SHA/static check results
  - promotion candidate list
tests_run:
  - staged manifest read
  - staged file existence check
  - staged SHA-256 check
  - JSON parse check where applicable
  - Node --check where available/applicable
  - Python py_compile where available/applicable
tests_not_run:
  - source execution
  - final src promotion
  - production runtime
class_contract_status: READY_FOR_COMMANDER_REVIEW
priority_0_status: STATIC_CHECK_COMPLETE_IF_TOTAL_RESULTS_GT_0
known_risks:
  - static checks are not runtime proof
  - PROMOTION_CANDIDATE still requires manual Commander review
next_needed:
  - submit static check reports
  - run 006 promotion plan after review
WORKER_REPORT_END
