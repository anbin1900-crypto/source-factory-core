'use strict';

const REPORTED_OUTCOMES = new Set(['PASS', 'BLOCKED', 'FAIL', 'NO_WORK']);
const RESULT_RE = /^C_RESULT\|RESULT_KEY=(\d+)\|ROLE=(AUTOMATION-C-W[1-6])\|OUTCOME=(PASS|FAIL|BLOCKED|NO_WORK)\|STATUS=END\|RESULT_COMMIT=([0-9a-f]{40}|NONE)$/m;

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function parseResultComment(comment) {
  const match = String(comment?.body || '').match(RESULT_RE);
  if (!match) return null;
  return {
    result_key: match[1],
    role: match[2],
    outcome: match[3],
    status: 'END',
    result_commit: match[4],
    result_comment: Number(comment.id),
    pr: Number(comment.pr),
    created_at: comment.created_at || null,
  };
}

function toMemberMap(members = []) {
  const map = new Map();
  for (const item of members) {
    const key = normalizePath(item.package_path || item.path || item.source_path || item.install_destination);
    if (!key) throw new Error('MEMBER_PATH_MISSING');
    if (map.has(key)) throw new Error(`DUPLICATE_MEMBER_PATH:${key}`);
    map.set(key, { ...item, normalized_path: key });
  }
  return map;
}

function evaluatePackageProvenance({ authority, candidate, targetVersion }) {
  if (!authority || !candidate) throw new Error('AUTHORITY_AND_CANDIDATE_REQUIRED');
  const authorityMembers = toMemberMap(authority.members || []);
  const candidateMembers = toMemberMap(candidate.members || []);
  const exactHashMismatches = [];
  const missingMembers = [];
  const stubMembers = [];

  for (const [path, required] of authorityMembers.entries()) {
    const observed = candidateMembers.get(path);
    if (!observed) {
      missingMembers.push(path);
      continue;
    }
    const requiredHash = String(required.sha256 || required.source_sha256 || '').toLowerCase();
    const observedHash = String(observed.sha256 || '').toLowerCase();
    if (!requiredHash || observedHash !== requiredHash) exactHashMismatches.push(path);
    const requiredSize = Number(required.size || required.size_bytes || required.source_size_bytes || 0);
    const observedSize = Number(observed.size || observed.size_bytes || 0);
    if (requiredSize > 0 && observedSize > 0 && observedSize < Math.max(512, Math.floor(requiredSize * 0.5))) {
      stubMembers.push(path);
    }
  }

  const requiredHooks = new Set((authority.required_load_hooks || []).map(normalizePath));
  const observedHooks = new Set((candidate.runtime_load_hooks || []).map(normalizePath));
  const missingHooks = [...requiredHooks].filter((hook) => !observedHooks.has(hook));

  const authorityPreservation = authority.preservation || {};
  const candidatePreservation = candidate.preservation || {};
  const preservationMismatches = [];
  for (const key of ['state_root', 'profile_root', 'partition_c', 'partition_repeat']) {
    if (String(candidatePreservation[key] || '') !== String(authorityPreservation[key] || '')) {
      preservationMismatches.push(key);
    }
  }

  const authorityReleaseRoot = normalizePath(authority.release_root);
  const candidateReleaseRoot = normalizePath(candidate.release_root);
  const authoritativePathMismatch = missingMembers.length > 0 ||
    Boolean(authorityReleaseRoot && candidateReleaseRoot && authorityReleaseRoot !== candidateReleaseRoot) ||
    Boolean(candidate.authoritative_path_match === false);

  const rejection = {
    STUB_PAYLOAD_SUBSTITUTION: stubMembers.length > 0 || Boolean(candidate.stub_payload_substitution),
    EXACT_SOURCE_HASH_MISMATCH: exactHashMismatches.length > 0,
    REQUIRED_MEMBER_COUNT_MISMATCH: candidateMembers.size !== Number(authority.required_member_count || authorityMembers.size),
    BASE_RELEASE_NOT_PRESENT_OR_CLONED: !(candidate.base_release_present === true || candidate.base_release_cloned === true),
    RUNTIME_LOAD_HOOK_MISSING: missingHooks.length > 0,
    AUTHORITATIVE_PATH_MISMATCH: authoritativePathMismatch,
    PRESERVATION_PATH_MISMATCH: preservationMismatches.length > 0,
    LAUNCHER_TARGET_NOT_EXECUTABLE: candidate.launcher_target_executable !== true,
    TARGET_VERSION_MISMATCH: String(candidate.target_version || '') !== String(targetVersion || authority.target_version || ''),
  };

  const rejectionReasons = Object.entries(rejection).filter(([, value]) => value).map(([key]) => key);
  const technicallyAccepted = rejectionReasons.length === 0;
  const targetPcAccepted = technicallyAccepted && candidate.target_pc_accepted === true;

  return {
    schema: 'C_MODE_RC6_PACKAGE_ACCEPTANCE_V1',
    REPORTED: true,
    TECHNICALLY_ACCEPTED: technicallyAccepted,
    INSTALLABLE_RUNTIME: technicallyAccepted,
    TARGET_PC_PENDING: technicallyAccepted && !targetPcAccepted,
    TARGET_PC_ACCEPTED: targetPcAccepted,
    REJECTION_REASONS: rejectionReasons,
    REJECTION_FLAGS: rejection,
    DETAILS: {
      authoritative_member_count: Number(authority.required_member_count || authorityMembers.size),
      candidate_member_count: candidateMembers.size,
      missing_members: missingMembers,
      exact_hash_mismatches: exactHashMismatches,
      stub_members: stubMembers,
      missing_load_hooks: missingHooks,
      preservation_mismatches: preservationMismatches,
    },
  };
}

function evaluateReportedTechnicalState({ reportedOutcome, authority, candidate, targetVersion }) {
  if (!REPORTED_OUTCOMES.has(reportedOutcome)) throw new Error('INVALID_REPORTED_OUTCOME');
  const gate = evaluatePackageProvenance({ authority, candidate, targetVersion });
  return {
    ...gate,
    REPORTED_OUTCOME: reportedOutcome,
    EFFECTIVE_OUTCOME: gate.TECHNICALLY_ACCEPTED ? reportedOutcome : 'BLOCKED',
    PASS_DOES_NOT_OVERRIDE_TECHNICAL_GATE: reportedOutcome === 'PASS' && !gate.TECHNICALLY_ACCEPTED,
  };
}

function collectWaveAcceptance({ registry, comments, packageByRole = {}, authorityByRole = {}, targetVersion }) {
  if (!registry || registry.schema !== 'C_MODE_WAVE_V2') throw new Error('INVALID_REGISTRY');
  const parsed = (comments || []).map(parseResultComment).filter(Boolean);
  const results = [];

  for (const row of registry.workers || []) {
    const matches = parsed.filter((item) => item.result_key === String(row.result_key) && item.role === row.role && item.pr === Number(row.pr) && item.result_comment > Number(row.directive_comment));
    if (matches.length > 1) throw new Error(`DUPLICATE_RESULT:${row.role}`);
    if (matches.length === 0) {
      results.push({ ...row, report_state: 'MISSING', technical_state: 'NOT_EVALUATED', result_comment: null });
      continue;
    }
    const report = matches[0];
    const candidate = packageByRole[row.role];
    const authority = authorityByRole[row.role];
    const acceptance = candidate && authority
      ? evaluateReportedTechnicalState({ reportedOutcome: report.outcome, authority, candidate, targetVersion })
      : null;
    results.push({
      ...row,
      ...report,
      report_state: 'REPORTED',
      technical_state: acceptance ? (acceptance.TECHNICALLY_ACCEPTED ? (acceptance.TARGET_PC_ACCEPTED ? 'TARGET_PC_ACCEPTED' : 'TARGET_PC_PENDING') : 'TECHNICALLY_REJECTED') : 'NOT_APPLICABLE',
      technical_acceptance: acceptance,
    });
  }

  const reported = results.filter((item) => item.report_state === 'REPORTED').length;
  const missing = results.length - reported;
  return {
    schema: 'C_MODE_RC6_WAVE_ACCEPTANCE_RESULT_V1',
    control_id: registry.control_id,
    wave_id: registry.wave_id,
    registry_sequence: registry.registry_sequence,
    reported,
    missing,
    duplicate: 0,
    results,
    commander_output: results.map((item) => `${item.role}|RESULT_COMMENT=${item.result_comment || 'MISSING'}|REPORT=${item.report_state}|TECHNICAL=${item.technical_state}`).join('\n'),
  };
}

async function fetchAllPagesWithRestart(fetchPage, { maxRetries = 5, startPage = 1, restartState = null } = {}) {
  const items = [];
  const seen = new Set(restartState?.collected_comment_ids || []);
  let lastPage = startPage - 1;
  for (let page = startPage; ; page += 1) {
    let response;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        response = await fetchPage(page, attempt);
        if (!response || !Array.isArray(response.items)) throw new Error('MALFORMED_PAGE');
        break;
      } catch (error) {
        if (attempt === maxRetries) throw error;
      }
    }
    for (const item of response.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
    lastPage = page;
    if (!response.has_next) break;
  }
  return {
    items,
    restart_state: {
      schema: 'C_MODE_RC6_ACCEPTANCE_RESTART_V1',
      last_page: lastPage,
      collected_comment_ids: [...seen],
    },
  };
}

module.exports = {
  parseResultComment,
  evaluatePackageProvenance,
  evaluateReportedTechnicalState,
  collectWaveAcceptance,
  fetchAllPagesWithRestart,
};
