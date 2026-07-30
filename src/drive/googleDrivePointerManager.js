export function createDrivePointer(input) {
  if (!input.artifact_id) throw new Error('artifact_id is required');
  if (!input.file_name) throw new Error('file_name is required');
  return {
    artifact_id: input.artifact_id,
    storage: 'GOOGLE_DRIVE',
    drive_path_or_url: input.drive_path_or_url || '',
    file_name: input.file_name,
    size_bytes: input.size_bytes ?? null,
    sha256: input.sha256 || '',
    content_type: input.content_type || 'application/octet-stream',
    created_at: input.created_at || new Date().toISOString(),
    created_by: input.created_by || '',
    status: input.status || 'POINTER_ONLY_UNVERIFIED',
    verified: Boolean(input.verified),
    verification: input.verification || {
      size_match: null,
      sha256_match: null,
      zip_crc_pass: null,
      manifest_match: null
    },
    notes: input.notes || []
  };
}

export function markDrivePointerVerified(pointer, verification) {
  return {
    ...pointer,
    verified: Boolean(
      verification?.size_match &&
      verification?.sha256_match &&
      (verification?.zip_crc_pass ?? true) &&
      (verification?.manifest_match ?? true)
    ),
    verification: {
      ...pointer.verification,
      ...verification
    },
    verified_at: new Date().toISOString()
  };
}
