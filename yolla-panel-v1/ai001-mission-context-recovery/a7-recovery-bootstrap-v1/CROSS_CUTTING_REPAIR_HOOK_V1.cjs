'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function safeJoin(root, relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error(`UNSAFE_PATH:${relative}`);
  const resolved = path.resolve(root, relative);
  const base = path.resolve(root) + path.sep;
  if (!(resolved + path.sep).startsWith(base) && resolved !== path.resolve(root)) throw new Error(`PATH_TRAVERSAL:${relative}`);
  return resolved;
}
function inspectArtifact(root, item) {
  const file = safeJoin(root, item.path);
  const result = { path: item.path, type: item.type || 'artifact', required: item.required !== false, exists: fs.existsSync(file), issues: [] };
  if (/\.(tmp|partial|writing)$/i.test(item.path)) result.issues.push('temporary_suffix');
  if (!result.exists) {
    if (result.required) result.issues.push('missing_required_file');
    return result;
  }
  const stat = fs.statSync(file);
  result.size_bytes = stat.size;
  if (stat.size === 0) result.issues.push('zero_byte_file');
  if (item.json === true || /\.json$/i.test(item.path)) {
    try { JSON.parse(fs.readFileSync(file, 'utf8')); } catch { result.issues.push('malformed_json'); }
  }
  result.sha256 = sha256File(file);
  if (item.expected_sha256 && item.expected_sha256 !== result.sha256) result.issues.push('sha256_mismatch');
  return result;
}
function inspectControlState(checkpoint) {
  const issues = [];
  if (checkpoint.receipt && checkpoint.receipt.status === 'WRITING') issues.push({ type: 'receipt_status_WRITING', path: checkpoint.receipt.path || null });
  if (checkpoint.commit && checkpoint.commit.status === 'PENDING') issues.push({ type: 'commit_status_PENDING', ref: checkpoint.commit.ref || null });
  return issues;
}
function inspectAndRepair({ root, checkpoint, apply = false }) {
  const artifacts = (checkpoint.artifacts || []).map(item => inspectArtifact(root, item));
  const controlIssues = inspectControlState(checkpoint);
  const repairable = [];
  const nonrepairable = [];
  for (const artifact of artifacts) {
    for (const issue of artifact.issues) {
      if (['temporary_suffix','zero_byte_file','malformed_json','sha256_mismatch'].includes(issue)) repairable.push({ issue, path: artifact.path });
      else if (issue === 'missing_required_file') repairable.push({ issue, path: artifact.path, action: 'mark_missing_for_regeneration' });
      else nonrepairable.push({ issue, path: artifact.path });
    }
  }
  for (const issue of controlIssues) repairable.push(issue);
  const actions = [];
  if (apply) {
    for (const item of repairable) {
      if (!item.path) continue;
      const file = safeJoin(root, item.path);
      if (!fs.existsSync(file)) { actions.push({ action: 'regenerate_required', path: item.path }); continue; }
      if (['temporary_suffix','zero_byte_file','malformed_json','sha256_mismatch'].includes(item.issue)) {
        const quarantine = file + `.quarantine-${Date.now()}`;
        fs.renameSync(file, quarantine);
        actions.push({ action: 'quarantine_corrupt_partial', path: item.path, quarantine: path.relative(root, quarantine) });
      }
    }
  }
  return {
    schema_version: 'CROSS_CUTTING_REPAIR_HOOK_V1',
    repairable_count: repairable.length,
    nonrepairable_count: nonrepairable.length,
    repairable,
    nonrepairable,
    artifacts,
    actions,
    repair_ready: nonrepairable.length === 0
  };
}
module.exports = { inspectAndRepair, safeJoin, sha256File };
