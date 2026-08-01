-- PostgreSQL staging shape; local E2E uses SQLite equivalent only.
BEGIN;
CREATE TABLE IF NOT EXISTS yolla_raw_artifact_fixture (
  artifact_id text PRIMARY KEY,
  source_system_id text NOT NULL,
  request_id text NOT NULL,
  dataset_id text NOT NULL,
  sha256 char(64) NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  payload_json jsonb NOT NULL,
  production boolean NOT NULL DEFAULT false CHECK (production = false)
);
CREATE TABLE IF NOT EXISTS yolla_analysis_result_fixture (
  analysis_result_id text PRIMARY KEY,
  artifact_id text NOT NULL REFERENCES yolla_raw_artifact_fixture(artifact_id),
  document_id text NOT NULL,
  document_version_id text NOT NULL,
  result_json jsonb NOT NULL,
  validation_status text NOT NULL,
  production boolean NOT NULL DEFAULT false CHECK (production = false)
);
COMMIT;
