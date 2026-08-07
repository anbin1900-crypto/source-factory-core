'use strict';

const REPORTED_OUTCOMES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NO_WORK']);
const RESULT_RE = /^C_RESULT\|RESULT_KEY=(\d+)\|ROLE=(AUTOMATION-C-W[1-6])\|OUTCOME=(PASS|FAIL|BLOCKED|NO_WORK)\|STATUS=END\|RESULT_COMMIT=([0-9a-f]{40}|NONE)$/m;

function equal(a, b) { return String(a ?? '') === String(b ?? ''); }
function trueValue(v) { return v === true; }

function inspectArtifactGateV2({ reportedOutcome, candidate = {}, expected = {} }) {
  if (!REPORTED_OUTCOMES.has(reportedOutcome)) throw new Error('INVALID_REPORTED_OUTCOME');

  const resolverExact = trueValue(candidate.resolver?.exact_bundle_match) &&
    equal(candidate.resolver?.source_sha256, expected.resolver?.source_sha256) &&
    equal(candidate.resolver?.bundle_manifest_sha256, expected.resolver?.bundle_manifest_sha256);

  const uiExact = trueValue(candidate.ui?.exact_hook_bundle_match) &&
    trueValue(candidate.ui?.exact_rollback_bundle_match) &&
    equal(candidate.ui?.hook_sha256, expected.ui?.hook_sha256) &&
    equal(candidate.ui?.rollback_sha256, expected.ui?.rollback_sha256);

  const manifestCompared = trueValue(candidate.manifest?.compared_to_expected) &&
    equal(candidate.manifest?.expected_manifest_sha256, expected.manifest_sha256) &&
    equal(candidate.manifest?.observed_manifest_sha256, expected.manifest_sha256);

  const requiredComponents = Number(expected.smoke?.required_component_count || 0);
  const executedComponents = Number(candidate.smoke?.executed_component_count || 0);
  const smokeDeep = trueValue(candidate.smoke?.full_component) &&
    trueValue(candidate.smoke?.behavioral_execution) &&
    requiredComponents > 0 && executedComponents >= requiredComponents &&
    trueValue(candidate.smoke?.resolver_invoked) &&
    trueValue(candidate.smoke?.registry_invoked) &&
    trueValue(candidate.smoke?.result_watcher_invoked) &&
    trueValue(candidate.smoke?.repeat_runtime_invoked) &&
    trueValue(candidate.smoke?.ui_bridge_invoked) &&
    trueValue(candidate.smoke?.rollback_invoked);

  const preservationMatches = ['state_root', 'profile_root', 'partition_c', 'partition_repeat', 'work_control_path', 'dispatch_receipt_path']
    .every((key) => equal(candidate.preservation?.[key], expected.preservation?.[key]));

  const immutableArchive = candidate.archive?.authority_type === 'IMMUTABLE_COMMIT' &&
    /^[0-9a-f]{40}$/.test(String(candidate.archive?.commit || '')) &&
    trueValue(candidate.archive?.byte_readback) &&
    trueValue(candidate.archive?.member_manifest_pinned);

  const offlineBase = resolverExact && uiExact && manifestCompared && smokeDeep && preservationMatches && immutableArchive;
  const targetReceiptValid = trueValue(candidate.target_pc?.execution_authorized) &&
    trueValue(candidate.target_pc?.receipt_verified) &&
    trueValue(candidate.target_pc?.evidence_complete) &&
    trueValue(candidate.target_pc?.live_execution_performed);
  const prematureTargetClaim = trueValue(candidate.target_pc?.pass_claimed) && !(offlineBase && targetReceiptValid);

  const rejectionFlags = {
    SIMPLIFIED_RESOLVER_SUBSTITUTION: !resolverExact,
    SIMPLIFIED_UI_HOOK_OR_ROLLBACK_SUBSTITUTION: !uiExact,
    SELF_GENERATED_MANIFEST_WITHOUT_EXPECTED_MANIFEST_COMPARISON: !manifestCompared,
    SHALLOW_COMPONENT_SMOKE: !smokeDeep,
    WRONG_PRESERVATION_PATHS: !preservationMatches,
    PREMATURE_TARGET_PC_PASS: prematureTargetClaim,
    MUTABLE_BRANCH_ONLY_ARCHIVE_AUTHORITY: !immutableArchive,
  };
  const rejectionReasons = Object.entries(rejectionFlags).filter(([, value]) => value).map(([key]) => key);
  const offlineAccepted = rejectionReasons.length === 0;
  const installableRuntime = offlineAccepted && trueValue(candidate.installable_runtime_evidence);
  const targetPcAccepted = installableRuntime && targetReceiptValid;

  return {
    schema: 'C_MODE_RC8_ACTUAL_ARTIFACT_GATE_V2',
    REPORTED: true,
    REPORTED_OUTCOME: reportedOutcome,
    OFFLINE_ARTIFACT_ACCEPTED: offlineAccepted,
    INSTALLABLE_RUNTIME: installableRuntime,
    TARGET_PC_PENDING: installableRuntime && !targetPcAccepted,
    TARGET_PC_ACCEPTED: targetPcAccepted,
    EFFECTIVE_OUTCOME: offlineAccepted ? reportedOutcome : 'BLOCKED',
    PASS_DOES_NOT_OVERRIDE_TECHNICAL_GATE: reportedOutcome === 'PASS' && !offlineAccepted,
    REJECTION_FLAGS: rejectionFlags,
    REJECTION_REASONS: rejectionReasons,
    EVIDENCE: {
      resolver_exact: resolverExact,
      ui_hook_and_rollback_exact: uiExact,
      expected_manifest_compared: manifestCompared,
      full_component_behavioral_smoke: smokeDeep,
      preservation_paths_exact: preservationMatches,
      immutable_archive_authority: immutableArchive,
      target_pc_receipt_valid: targetReceiptValid,
    },
  };
}

function parseResultComment(comment) {
  const match = String(comment?.body || '').match(RESULT_RE);
  if (!match) return null;
  return {
    result_key: match[1], role: match[2], outcome: match[3], status: 'END',
    result_commit: match[4], result_comment: Number(comment.id), pr: Number(comment.pr),
  };
}

function collectExactResult({ comments = [], resultKey, role, pr, directiveComment }) {
  const matches = comments.map(parseResultComment).filter(Boolean).filter((item) =>
    item.result_key === String(resultKey) && item.role === role && item.pr === Number(pr) &&
    item.result_comment > Number(directiveComment));
  if (matches.length > 1) throw new Error('DUPLICATE_RESULT');
  return matches.length === 1 ? { report_state: 'REPORTED', ...matches[0] } :
    { report_state: 'MISSING', result_key: String(resultKey), role, pr: Number(pr), result_comment: null };
}

function buildCommanderResultComment({ role, resultComment, gate }) {
  return [
    `${role}|RESULT_COMMENT=${resultComment || 'MISSING'}`,
    `REPORTED=${gate.REPORTED}`,
    `OFFLINE_ARTIFACT_ACCEPTED=${gate.OFFLINE_ARTIFACT_ACCEPTED}`,
    `INSTALLABLE_RUNTIME=${gate.INSTALLABLE_RUNTIME}`,
    `TARGET_PC_PENDING=${gate.TARGET_PC_PENDING}`,
    `TARGET_PC_ACCEPTED=${gate.TARGET_PC_ACCEPTED}`,
    `EFFECTIVE_OUTCOME=${gate.EFFECTIVE_OUTCOME}`,
    `REJECTIONS=${gate.REJECTION_REASONS.length ? gate.REJECTION_REASONS.join(',') : 'NONE'}`,
  ].join('|');
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
      seen.add(item.id); items.push(item);
    }
    lastPage = page;
    if (!response.has_next) break;
  }
  return {
    items,
    restart_state: {
      schema: 'C_MODE_RC8_ARTIFACT_GATE_V2_RESTART_V1',
      last_page: lastPage,
      collected_comment_ids: [...seen],
    },
  };
}

module.exports = { inspectArtifactGateV2, parseResultComment, collectExactResult, buildCommanderResultComment, fetchAllPagesWithRestart };
