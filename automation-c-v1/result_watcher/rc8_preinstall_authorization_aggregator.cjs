'use strict';

const RESULT_RE = /^C_RESULT\|RESULT_KEY=(\d+)\|ROLE=(AUTOMATION-C-W[1-6])\|OUTCOME=(PASS|FAIL|BLOCKED|NO_WORK)\|STATUS=END\|RESULT_COMMIT=([0-9a-f]{40}|NONE)$/m;

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
  };
}

function normalizeSha(value) {
  return String(value || '').toLowerCase();
}

function collectRoleResult({ row, comments }) {
  const matches = (comments || [])
    .map(parseResultComment)
    .filter(Boolean)
    .filter((item) => item.result_key === String(row.result_key))
    .filter((item) => item.role === row.role)
    .filter((item) => item.pr === Number(row.pr))
    .filter((item) => item.result_comment > Number(row.directive_comment));

  if (matches.length > 1) {
    return { role: row.role, state: 'DUPLICATE', matches, reasons: ['DUPLICATE_RESULT'] };
  }
  if (matches.length === 0) {
    return {
      role: row.role,
      state: 'MISSING',
      matches: [],
      reasons: [`MISSING_${row.role.replace('AUTOMATION-C-', '')}`],
    };
  }
  return { role: row.role, state: 'REPORTED', ...matches[0], reasons: [] };
}

function evaluateWorkerScope({ row, report, evidence = {} }) {
  const reasons = [...(report.reasons || [])];
  const expectedResultCommit = normalizeSha(row.expected_result_commit);
  if (report.state === 'REPORTED' && expectedResultCommit && normalizeSha(report.result_commit) !== expectedResultCommit) {
    reasons.push('RESULT_COMMIT_MISMATCH');
  }

  const expectedHead = normalizeSha(row.expected_head);
  const actualHead = normalizeSha(evidence.head || evidence.artifact_head || row.observed_head);
  if (report.state === 'REPORTED' && expectedHead && actualHead !== expectedHead) reasons.push('STALE_HEAD');

  const scopedAccepted = report.state === 'REPORTED' && evidence.scoped_accepted === true && reasons.length === 0;
  if (report.state === 'REPORTED' && report.outcome === 'PASS' && evidence.scoped_accepted !== true) {
    reasons.push('WORKER_PASS_OVERRIDE_REJECTED');
  }

  return {
    ...report,
    expected_result_commit: row.expected_result_commit || null,
    expected_head: row.expected_head || null,
    observed_head: actualHead || null,
    scoped_accepted: scopedAccepted,
    reasons: [...new Set(reasons)],
  };
}

function evaluateArtifact({ w5, expectedManifestSha256, artifact = {} }) {
  const reasons = [...(w5?.reasons || [])];
  const reported = w5?.state === 'REPORTED';
  const expectedManifest = normalizeSha(expectedManifestSha256);
  const observedManifest = normalizeSha(artifact.manifest_sha256);

  if (!reported) {
    return {
      reported: false,
      scoped_accepted: false,
      offline_artifact_accepted: false,
      installable_runtime: false,
      reasons,
    };
  }
  if (!expectedManifest || !observedManifest || expectedManifest !== observedManifest) reasons.push('WRONG_MANIFEST');
  if (artifact.immutable_authority !== true) reasons.push('MUTABLE_ARTIFACT_AUTHORITY');
  if (artifact.offline_gate_passed !== true) reasons.push('OFFLINE_GATE_NOT_PASSED');
  if (artifact.installable_runtime !== true) reasons.push('INSTALLABLE_RUNTIME_NOT_PROVEN');
  if (w5.outcome === 'PASS' && reasons.length > 0) reasons.push('WORKER_PASS_OVERRIDE_REJECTED');

  const scopedAccepted = w5.scoped_accepted === true && reasons.length === 0;
  const offlineAccepted = scopedAccepted && artifact.offline_gate_passed === true;
  const installable = offlineAccepted && artifact.installable_runtime === true;
  return {
    reported,
    scoped_accepted: scopedAccepted,
    offline_artifact_accepted: offlineAccepted,
    installable_runtime: installable,
    reasons: [...new Set(reasons)],
  };
}

function aggregatePreinstallAuthorization({
  registry,
  comments = [],
  evidenceByRole = {},
  expectedManifestSha256,
  artifact = {},
  authorizationRequested = false,
  targetPcReceiptAccepted = false,
}) {
  if (!registry || registry.schema !== 'C_MODE_PREINSTALL_REGISTRY_V1') throw new Error('INVALID_REGISTRY');
  if (!Array.isArray(registry.workers) || registry.workers.length !== 5) throw new Error('INVALID_WORKER_SET');

  const roleResults = registry.workers.map((row) => {
    const report = collectRoleResult({ row, comments });
    return evaluateWorkerScope({ row, report, evidence: evidenceByRole[row.role] || {} });
  });

  const w5 = roleResults.find((row) => row.role === 'AUTOMATION-C-W5');
  const artifactGate = evaluateArtifact({ w5, expectedManifestSha256, artifact });
  const allReported = roleResults.every((row) => row.state === 'REPORTED');
  const allScopedAccepted = allReported && roleResults.every((row) => row.scoped_accepted === true) && artifactGate.scoped_accepted;
  const offlineArtifactAccepted = allScopedAccepted && artifactGate.offline_artifact_accepted;
  const installableRuntime = offlineArtifactAccepted && artifactGate.installable_runtime;
  const targetPcAuthorized = installableRuntime && authorizationRequested === true;
  const targetPcAccepted = targetPcAuthorized && targetPcReceiptAccepted === true;

  const reasons = [...new Set([
    ...roleResults.flatMap((row) => row.reasons || []),
    ...artifactGate.reasons,
    ...(authorizationRequested && !installableRuntime ? ['TARGET_PC_AUTHORIZATION_WITHHELD'] : []),
    ...(targetPcReceiptAccepted && !targetPcAuthorized ? ['TARGET_PC_RECEIPT_REJECTED_BEFORE_AUTHORIZATION'] : []),
  ])];

  return {
    schema: 'C_MODE_RC8_PREINSTALL_AUTHORIZATION_AGGREGATOR_V1',
    control_id: registry.control_id,
    wave_id: registry.wave_id,
    registry_sequence: registry.registry_sequence,
    REPORTED: allReported,
    SCOPED_ACCEPTED: allScopedAccepted,
    OFFLINE_ARTIFACT_ACCEPTED: offlineArtifactAccepted,
    INSTALLABLE_RUNTIME: installableRuntime,
    TARGET_PC_AUTHORIZED: targetPcAuthorized,
    TARGET_PC_ACCEPTED: targetPcAccepted,
    FAIL_CLOSED: reasons.length > 0,
    REASONS: reasons,
    WORKERS: roleResults,
    ARTIFACT_GATE: artifactGate,
  };
}

function buildCommanderOutput(result) {
  const workerLines = result.WORKERS.map((row) =>
    `${row.role}|REPORT=${row.state}|SCOPED_ACCEPTED=${row.scoped_accepted}|RESULT_COMMENT=${row.result_comment || 'MISSING'}|REASONS=${row.reasons.length ? row.reasons.join(',') : 'NONE'}`);
  return [
    ...workerLines,
    `REPORTED=${result.REPORTED}`,
    `SCOPED_ACCEPTED=${result.SCOPED_ACCEPTED}`,
    `OFFLINE_ARTIFACT_ACCEPTED=${result.OFFLINE_ARTIFACT_ACCEPTED}`,
    `INSTALLABLE_RUNTIME=${result.INSTALLABLE_RUNTIME}`,
    `TARGET_PC_AUTHORIZED=${result.TARGET_PC_AUTHORIZED}`,
    `TARGET_PC_ACCEPTED=${result.TARGET_PC_ACCEPTED}`,
    `FAIL_CLOSED=${result.FAIL_CLOSED}`,
    `REASONS=${result.REASONS.length ? result.REASONS.join(',') : 'NONE'}`,
  ].join('\n');
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
      schema: 'C_MODE_RC8_PREINSTALL_AGGREGATOR_RESTART_V1',
      last_page: lastPage,
      collected_comment_ids: [...seen],
    },
  };
}

module.exports = {
  parseResultComment,
  collectRoleResult,
  evaluateWorkerScope,
  evaluateArtifact,
  aggregatePreinstallAuthorization,
  buildCommanderOutput,
  fetchAllPagesWithRestart,
};
