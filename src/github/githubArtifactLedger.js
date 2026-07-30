export function createArtifactLedgerEntry(input) {
  const required = ['artifact_id', 'file_name', 'sha256'];
  for (const key of required) {
    if (!input[key]) throw new Error(`Missing required artifact field: ${key}`);
  }
  return {
    artifact_id: input.artifact_id,
    storage: input.storage || 'GITHUB',
    path_or_url: input.path_or_url || '',
    file_name: input.file_name,
    size_bytes: input.size_bytes ?? null,
    sha256: input.sha256,
    content_type: input.content_type || 'application/octet-stream',
    status: input.status || 'RECORDED_UNVERIFIED',
    verified: Boolean(input.verified),
    created_at: input.created_at || new Date().toISOString(),
    notes: input.notes || []
  };
}

export function appendArtifactLedgerEntry(ledger, entry) {
  const current = Array.isArray(ledger?.artifacts) ? ledger.artifacts : [];
  return {
    ...ledger,
    updated_at: new Date().toISOString(),
    artifacts: [...current, entry]
  };
}
