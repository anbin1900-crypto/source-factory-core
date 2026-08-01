BEGIN;
DELETE FROM yolla_analysis_result_fixture WHERE artifact_id = :artifact_id;
DELETE FROM yolla_raw_artifact_fixture WHERE artifact_id = :artifact_id;
ROLLBACK;
