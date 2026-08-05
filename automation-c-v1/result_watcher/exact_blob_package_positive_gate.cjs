'use strict';

const {
  parseResultComment,
  fetchAllPagesWithRestart,
} = require('./rc6_package_acceptance_adapter.cjs');

const REPORTED_OUTCOMES = new Set(['PASS', 'BLOCKED', 'FAIL', 'NO_WORK']);
const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function memberPath(item) {
  return normalizePath(item.package_path || item.PACKAGE_RELATIVE_PATH || item.path || item.SOURCE_PATH || item.source_path);
}

function memberBlob(item) {
  return String(item.blob_sha1 || item.SOURCE_BLOB_SHA1 || item.source_blob_sha1 || '').toLowerCase();
}

function memberSha256(item) {
  return String(item.sha256 || item.SOURCE_SHA256 || item.source_sha256 || '').toLowerCase();
}

function memberSize(item) {
  return Number(item.size_bytes || item.SOURCE_SIZE_BYTES || item.source_size_bytes || item.size || 0);
}

function uniqueMemberMap(members = []) {
  const map = new Map();
  for (const member of members) {
    const path = memberPath(member);
    if (!path) throw new Error('MEMBER_PATH_MISSING');
    if (map.has(path)) throw new Error(`DUPLICATE_MEMBER_PATH:${path}`);
    map.set(path, member);
  }
  return map;
}

function missingSet(required = [], observed = []) {
  const have = new Set(observed.map(normalizePath));
  return required.map(normalizePath).filter((item) => !have.has(item));
}

function evaluateExactBlobPackage({ authority, candidate, targetVersion }) {
  if (!authority || !candidate) throw new Error('AUTHORITY_AND_CANDIDATE_REQUIRED');
  const authorityMembers = uniqueMemberMap(authority.members || authority.SOURCE_MEMBERS || []);
  const candidateMembers = uniqueMemberMap(candidate.members || candidate.MEMBERS || []);
  const requiredCount = Number(authority.required_member_count || authority.SOURCE_MEMBER_COUNT || authorityMembers.size);

  const missingMembers = [];
  const blobMismatches = [];
  const hashMismatches = [];
  const sizeMismatches = [];
  const invalidAuthorityBlob = [];
  const invalidAuthorityHash = [];

  for (const [path, required] of authorityMembers.entries()) {
    const observed = candidateMembers.get(path);
    const requiredBlob = memberBlob(required);
    const requiredHash = memberSha256(required);
    const requiredSize = memberSize(required);
    if (!SHA1_RE.test(requiredBlob)) invalidAuthorityBlob.push(path);
    if (!SHA256_RE.test(requiredHash)) invalidAuthorityHash.push(path);
    if (!observed) {
      missingMembers.push(path);
      continue;
    }
    if (memberBlob(observed) !== requiredBlob) blobMismatches.push(path);
    if (memberSha256(observed) !== requiredHash) hashMismatches.push(path);
    if (memberSize(observed) !== requiredSize) sizeMismatches.push(path);
  }

  const requiredRuntimeHooks = authority.required_runtime_hooks || [];
  const requiredRendererHooks = authority.required_renderer_hooks || [];
  const missingRuntimeHooks = missingSet(requiredRuntimeHooks, candidate.runtime_hooks || []);
  const missingRendererHooks = missingSet(requiredRendererHooks, candidate.renderer_hooks || []);
  const smokeLoaded = candidate.smoke_loaded_components || candidate.smoke?.loaded_components || [];
  const missingSmokeMembers = missingSet([...authorityMembers.keys()], smokeLoaded);

  const checks = {
    IMMUTABLE_BLOB_SHA_17_OF_17:
      requiredCount === 17 && authorityMembers.size === 17 && candidateMembers.size === 17 &&
      missingMembers.length === 0 && invalidAuthorityBlob.length === 0 && blobMismatches.length === 0,
    EXACT_SOURCE_SHA256_AND_SIZE_17_OF_17:
      requiredCount === 17 && authorityMembers.size === 17 && candidateMembers.size === 17 &&
      missingMembers.length === 0 && invalidAuthorityHash.length === 0 &&
      hashMismatches.length === 0 && sizeMismatches.length === 0,
    BASELINE_RESOLVER_VALIDATED: candidate.baseline_resolver_validated === true,
    BASELINE_RECURSIVE_CLONE: candidate.baseline_recursive_clone === true,
    TARGET_TIME_LAUNCHER_BACKUP: candidate.target_time_launcher_backup === true,
    RUNTIME_AND_RENDERER_HOOKS_COMPLETE:
      missingRuntimeHooks.length === 0 && missingRendererHooks.length === 0 &&
      requiredRuntimeHooks.length > 0 && requiredRendererHooks.length > 0,
    FULL_COMPONENT_SMOKE:
      candidate.smoke_status === 'PASS' && missingSmokeMembers.length === 0 && smokeLoaded.length >= 17,
    ROLLBACK_AND_PRESERVATION_READBACK:
      candidate.rollback_readback_verified === true && candidate.preservation_readback_verified === true,
  };

  const targetVersionMatch = String(candidate.target_version || '') === String(targetVersion || authority.target_version || '');
  const technicallyAccepted = Object.values(checks).every(Boolean) && targetVersionMatch;
  const targetPcAccepted = technicallyAccepted && candidate.target_pc_accepted === true;

  return {
    schema: 'C_MODE_EXACT_BLOB_PACKAGE_ACCEPTANCE_V1',
    REPORTED: true,
    TECHNICALLY_ACCEPTED: technicallyAccepted,
    INSTALLABLE_RUNTIME: technicallyAccepted,
    TARGET_PC_PENDING: technicallyAccepted && !targetPcAccepted,
    TARGET_PC_ACCEPTED: targetPcAccepted,
    TARGET_VERSION_MATCH: targetVersionMatch,
    CHECKS: checks,
    FAILED_CHECKS: Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name)
      .concat(targetVersionMatch ? [] : ['TARGET_VERSION_MISMATCH']),
    DETAILS: {
      required_member_count: requiredCount,
      authority_member_count: authorityMembers.size,
      candidate_member_count: candidateMembers.size,
      missing_members: missingMembers,
      blob_mismatches: blobMismatches,
      hash_mismatches: hashMismatches,
      size_mismatches: sizeMismatches,
      invalid_authority_blob: invalidAuthorityBlob,
      invalid_authority_hash: invalidAuthorityHash,
      missing_runtime_hooks: missingRuntimeHooks,
      missing_renderer_hooks: missingRendererHooks,
      missing_smoke_members: missingSmokeMembers,
    },
    STATE_SEPARATION: {
      REPORTED: 'GitHub result comment exists and correlates to RESULT_KEY',
      TECHNICALLY_ACCEPTED: 'all exact blob, hash, size, baseline, hook, smoke and rollback gates pass',
      TARGET_PC_ACCEPTED: 'technically accepted package also has a live target-PC receipt',
    },
  };
}

function evaluateReportedExactBlobState({ reportedOutcome, authority, candidate, targetVersion }) {
  if (!REPORTED_OUTCOMES.has(reportedOutcome)) throw new Error('INVALID_REPORTED_OUTCOME');
  const gate = evaluateExactBlobPackage({ authority, candidate, targetVersion });
  return {
    ...gate,
    REPORTED_OUTCOME: reportedOutcome,
    EFFECTIVE_OUTCOME: gate.TECHNICALLY_ACCEPTED ? reportedOutcome : 'BLOCKED',
    PASS_DOES_NOT_OVERRIDE_TECHNICAL_GATE: reportedOutcome === 'PASS' && !gate.TECHNICALLY_ACCEPTED,
  };
}

function collectExactBlobWave({ registry, comments, packageByRole = {}, authorityByRole = {}, targetVersion }) {
  if (!registry || registry.schema !== 'C_MODE_WAVE_V2') throw new Error('INVALID_REGISTRY');
  const parsed = (comments || []).map(parseResultComment).filter(Boolean);
  const results = [];
  for (const row of registry.workers || []) {
    const matches = parsed.filter((item) => item.result_key === String(row.result_key) &&
      item.role === row.role && item.pr === Number(row.pr) && item.result_comment > Number(row.directive_comment));
    if (matches.length > 1) throw new Error(`DUPLICATE_RESULT:${row.role}`);
    if (matches.length === 0) {
      results.push({ ...row, report_state: 'MISSING', result_comment: null, technical_state: 'NOT_EVALUATED' });
      continue;
    }
    const report = matches[0];
    const candidate = packageByRole[row.role];
    const authority = authorityByRole[row.role];
    const acceptance = candidate && authority
      ? evaluateReportedExactBlobState({ reportedOutcome: report.outcome, authority, candidate, targetVersion })
      : null;
    results.push({
      ...row,
      ...report,
      report_state: 'REPORTED',
      technical_state: acceptance
        ? (acceptance.TARGET_PC_ACCEPTED ? 'TARGET_PC_ACCEPTED' : acceptance.TECHNICALLY_ACCEPTED ? 'TARGET_PC_PENDING' : 'TECHNICALLY_REJECTED')
        : 'NOT_APPLICABLE',
      technical_acceptance: acceptance,
    });
  }
  return {
    schema: 'C_MODE_EXACT_BLOB_WAVE_ACCEPTANCE_RESULT_V1',
    control_id: registry.control_id,
    wave_id: registry.wave_id,
    registry_sequence: registry.registry_sequence,
    reported: results.filter((x) => x.report_state === 'REPORTED').length,
    missing: results.filter((x) => x.report_state === 'MISSING').length,
    duplicate: 0,
    results,
    commander_output: results.map((item) =>
      `${item.role}|RESULT_COMMENT=${item.result_comment || 'MISSING'}|REPORT=${item.report_state}|TECHNICAL=${item.technical_state}`).join('\n'),
  };
}

module.exports = {
  normalizePath,
  evaluateExactBlobPackage,
  evaluateReportedExactBlobState,
  collectExactBlobWave,
  fetchAllPagesWithRestart,
};
