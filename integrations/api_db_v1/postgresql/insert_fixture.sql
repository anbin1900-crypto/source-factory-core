-- Parameters: artifact metadata and analysis result JSON.
INSERT INTO yolla_raw_artifact_fixture
(artifact_id, source_system_id, request_id, dataset_id, sha256, mime_type, byte_size, payload_json, production)
VALUES (:artifact_id, :source_system_id, :request_id, :dataset_id, :sha256, :mime_type, :byte_size, CAST(:payload_json AS jsonb), false)
ON CONFLICT (artifact_id) DO NOTHING;

INSERT INTO yolla_analysis_result_fixture
(analysis_result_id, artifact_id, document_id, document_version_id, result_json, validation_status, production)
VALUES (:analysis_result_id, :artifact_id, :document_id, :document_version_id, CAST(:result_json AS jsonb), :validation_status, false)
ON CONFLICT (analysis_result_id) DO NOTHING;
