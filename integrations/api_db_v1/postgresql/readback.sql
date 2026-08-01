SELECT a.artifact_id, a.source_system_id, a.request_id, a.dataset_id, a.sha256,
       r.analysis_result_id, r.document_id, r.document_version_id, r.validation_status
FROM yolla_raw_artifact_fixture a
JOIN yolla_analysis_result_fixture r ON r.artifact_id = a.artifact_id
WHERE a.artifact_id = :artifact_id;
