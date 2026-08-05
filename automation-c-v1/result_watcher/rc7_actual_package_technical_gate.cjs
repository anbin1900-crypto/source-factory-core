'use strict';

const REPORTED_OUTCOMES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NO_WORK']);
const RESULT_RE = /^C_RESULT\|RESULT_KEY=(\d+)\|ROLE=(AUTOMATION-C-W[1-6])\|OUTCOME=(PASS|FAIL|BLOCKED|NO_WORK)\|STATUS=END\|RESULT_COMMIT=([0-9a-f]{40}|NONE)$/m;

function bool(value) { return value === true; }
function corpusOf(installerText, payloadTexts) {
  return [String(installerText || ''), ...(payloadTexts || []).map(String)].join('\n');
}

function inspectActualPackage({ reportedOutcome, installerText = '', payloadTexts = [], evidence = {}, targetPcAccepted = false }) {
  if (!REPORTED_OUTCOMES.has(reportedOutcome)) throw new Error('INVALID_REPORTED_OUTCOME');
  const corpus = corpusOf(installerText, payloadTexts);

  const w1ResolverBound = bool(evidence.w1ResolverBound) ||
    /(?:w1[_ -]?baseline[_ -]?resolver|baseline[_ -]?resolver\.cjs|resolveBaselineFromW1)/i.test(corpus);
  const w3MainJsTruthBridgeHookBound = bool(evidence.w3MainJsTruthBridgeHookBound) ||
    (/main\.js/i.test(corpus) && /workspace_ui_truth_bridge\.cjs/i.test(corpus) && /(?:require|import|load|hook)/i.test(corpus));
  const fullComponentSmoke = bool(evidence.fullComponentSmoke) ||
    /FULL_COMPONENT_SMOKE(?:_PASS)?/i.test(corpus);
  const temporaryProfileUsed = evidence.temporaryProfileUsed === false ? false :
    (bool(evidence.temporaryProfileUsed) || /temporaryProfile\s*:\s*true/i.test(corpus));
  const singleDownloadArtifact = bool(evidence.singleDownloadArtifact) ||
    (/SELF_CONTAINED_SINGLE_DOWNLOAD/i.test(corpus) && !/Join-Path\s+\$PSScriptRoot\s+['"]rc\d+-payload['"]/i.test(corpus));
  const baselineTreeReadback = bool(evidence.baselineTreeReadback) ||
    (/BASELINE_TREE_(?:BEFORE|PRE)_SHA256/i.test(corpus) && /BASELINE_TREE_(?:AFTER|POST)_SHA256/i.test(corpus));
  const rollbackPreservationReadback = bool(evidence.rollbackPreservationReadback) ||
    (/ROLLBACK_PRESERVATION_READBACK/i.test(corpus) && /LAUNCHER_(?:RESTORED|READBACK)/i.test(corpus));

  const rejectionFlags = {
    W1_RESOLVER_NOT_BOUND: !w1ResolverBound,
    W3_MAIN_JS_TRUTH_BRIDGE_HOOK_NOT_BOUND: !w3MainJsTruthBridgeHookBound,
    FULL_COMPONENT_SMOKE_MISSING: !fullComponentSmoke,
    TEMPORARY_PROFILE_USED: temporaryProfileUsed,
    SPLIT_INSTALLER_PAYLOAD_NOT_SINGLE_DOWNLOAD: !singleDownloadArtifact,
    BASELINE_TREE_READBACK_MISSING: !baselineTreeReadback,
    ROLLBACK_PRESERVATION_READBACK_MISSING: !rollbackPreservationReadback,
  };
  const rejectionReasons = Object.entries(rejectionFlags).filter(([, value]) => value).map(([key]) => key);
  const technicallyAccepted = rejectionReasons.length === 0;
  const targetAccepted = technicallyAccepted && targetPcAccepted === true;

  return {
    schema: 'C_MODE_RC7_ACTUAL_PACKAGE_GATE_V1',
    REPORTED: true,
    REPORTED_OUTCOME: reportedOutcome,
    TECHNICALLY_ACCEPTED: technicallyAccepted,
    INSTALLABLE_RUNTIME: technicallyAccepted,
    TARGET_PC_PENDING: technicallyAccepted && !targetAccepted,
    TARGET_PC_ACCEPTED: targetAccepted,
    EFFECTIVE_OUTCOME: technicallyAccepted ? reportedOutcome : 'BLOCKED',
    PASS_DOES_NOT_OVERRIDE_TECHNICAL_GATE: reportedOutcome === 'PASS' && !technicallyAccepted,
    REJECTION_FLAGS: rejectionFlags,
    REJECTION_REASONS: rejectionReasons,
    EVIDENCE: {
      w1_resolver_bound: w1ResolverBound,
      w3_main_js_truth_bridge_hook_bound: w3MainJsTruthBridgeHookBound,
      full_component_smoke: fullComponentSmoke,
      temporary_profile_used: temporaryProfileUsed,
      single_download_artifact: singleDownloadArtifact,
      baseline_tree_readback: baselineTreeReadback,
      rollback_preservation_readback: rollbackPreservationReadback,
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
    `TECHNICALLY_ACCEPTED=${gate.TECHNICALLY_ACCEPTED}`,
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
      schema: 'C_MODE_RC7_ACTUAL_PACKAGE_GATE_RESTART_V1',
      last_page: lastPage,
      collected_comment_ids: [...seen],
    },
  };
}

module.exports = {
  inspectActualPackage,
  parseResultComment,
  collectExactResult,
  buildCommanderResultComment,
  fetchAllPagesWithRestart,
};
