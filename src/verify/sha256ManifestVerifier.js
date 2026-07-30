import crypto from 'node:crypto';
import fs from 'node:fs/promises';

export async function sha256File(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function verifyManifestEntry({ filePath, expectedSha256, expectedSizeBytes = null }) {
  const stat = await fs.stat(filePath);
  const actualSha256 = await sha256File(filePath);
  return {
    filePath,
    expectedSha256,
    actualSha256,
    sha256_match: actualSha256.toLowerCase() === String(expectedSha256).toLowerCase(),
    expectedSizeBytes,
    actualSizeBytes: stat.size,
    size_match: expectedSizeBytes == null ? null : stat.size === expectedSizeBytes
  };
}

export function summarizeVerification(results) {
  return {
    total: results.length,
    sha256_pass: results.filter((r) => r.sha256_match).length,
    size_pass: results.filter((r) => r.size_match === true).length,
    failed: results.filter((r) => r.sha256_match === false || r.size_match === false)
  };
}
