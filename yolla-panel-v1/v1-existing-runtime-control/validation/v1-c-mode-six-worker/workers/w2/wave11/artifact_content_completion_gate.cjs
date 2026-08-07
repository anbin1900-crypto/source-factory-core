'use strict';

const REPORTED_OUTCOMES = new Set(['PASS', 'BLOCKED', 'FAIL', 'NO_WORK']);
const EXECUTABLE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ps1', '.bat', '.cmd', '.exe', '.dll', '.msi']);

function extname(path) {
  const match = String(path || '').toLowerCase().match(/(\.[a-z0-9]+)(?:[?#].*)?$/);
  return match ? match[1] : '';
}

function extractPayloadPaths(text) {
  const paths = [];
  const patterns = [
    /\bPath\s*=\s*'([^']+)'/gi,
    /\bPath\s*=\s*"([^"]+)"/gi,
    /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(\S+)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) paths.push(match[1].replace(/["';,)]+$/g, ''));
  }
  return [...new Set(paths)];
}

function classifyArtifactContent(evidence = {}) {
  const content = Buffer.isBuffer(evidence.bytes)
    ? evidence.bytes.toString('utf8')
    : String(evidence.content ?? evidence.bytes ?? '');
  const sizeBytes = Number.isFinite(Number(evidence.sizeBytes))
    ? Number(evidence.sizeBytes)
    : Buffer.byteLength(content, 'utf8');
  const payloadPaths = evidence.payloadPaths || extractPayloadPaths(content);
  const executableSourcePresent = payloadPaths.some((path) => EXECUTABLE_EXTENSIONS.has(extname(path))) ||
    Boolean(evidence.embeddedExecutableSource);
  const archiveActionPresent = /\b(compress-archive|tar\s+-[a-z]*c|zip\s+)/i.test(content);
  const installActionPresent = Boolean(evidence.installActionPresent) ||
    /\b(msiexec|install-package|copy-item|xcopy|robocopy|expand-archive|start-process\s+[^\r\n]*(setup|install)|npm\s+(ci|install)|node\s+[^\r\n]*(apply|install))\b/i.test(content);
  const smokeActionPresent = Boolean(evidence.smokeActionPresent) ||
    /\b(smoke[-_ ]?test|health[-_ ]?check|verify[-_ ]?runtime|node\s+--check)\b/i.test(content);
  const rollbackActionPresent = Boolean(evidence.rollbackActionPresent) ||
    /(^|[\r\n])\s*(:rollback|goto\s+rollback|call\s+[^\r\n]*rollback|powershell[^\r\n]*(restore|rollback)|copy-item[^\r\n]*backup)/im.test(content);
  const byteExists = sizeBytes > 0;
  const metadataOnlyArchive = byteExists && archiveActionPresent && payloadPaths.length > 0 && !executableSourcePresent;
  const smokeAndRollbackPresent = smokeActionPresent && rollbackActionPresent;
  const installableRuntime = byteExists && !metadataOnlyArchive && executableSourcePresent &&
    installActionPresent && smokeAndRollbackPresent;
  const targetPcAccepted = Boolean(evidence.targetPcAccepted || evidence.targetPcReceipt === 'PASS');

  return {
    BYTE_EXISTS: byteExists,
    METADATA_ONLY_ARCHIVE: metadataOnlyArchive,
    EXECUTABLE_SOURCE_PRESENT: executableSourcePresent,
    INSTALL_ACTION_PRESENT: installActionPresent,
    SMOKE_AND_ROLLBACK_PRESENT: smokeAndRollbackPresent,
    INSTALLABLE_RUNTIME: installableRuntime,
    TARGET_PC_ACCEPTED: targetPcAccepted,
    SIZE_BYTES: sizeBytes,
    PAYLOAD_PATHS: payloadPaths,
    CLASSIFICATION: !byteExists ? 'BYTE_MISSING' : metadataOnlyArchive ? 'METADATA_ONLY_ARCHIVE' :
      installableRuntime ? (targetPcAccepted ? 'TARGET_PC_ACCEPTED' : 'INSTALLABLE_RUNTIME_PENDING_TARGET_PC') :
        'NON_INSTALLABLE_ARTIFACT',
  };
}

function evaluateTechnicalAcceptance(workerOutcome, artifactVerdict) {
  if (!REPORTED_OUTCOMES.has(workerOutcome)) throw new Error('INVALID_WORKER_OUTCOME');
  const technicalState = artifactVerdict.TARGET_PC_ACCEPTED ? 'TARGET_PC_ACCEPTED' :
    artifactVerdict.INSTALLABLE_RUNTIME ? 'PENDING_TARGET_PC_ACCEPTANCE' : 'ARTIFACT_CONTENT_REJECTED';
  return {
    report_state: 'REPORTED',
    reported_outcome: workerOutcome,
    effective_outcome: artifactVerdict.INSTALLABLE_RUNTIME ? workerOutcome : 'BLOCKED',
    technical_state: technicalState,
    outcome_override_applied: workerOutcome === 'PASS' && !artifactVerdict.INSTALLABLE_RUNTIME,
    artifact: artifactVerdict,
  };
}

function collectWaveWithCarryover({ currentRows, currentComments, carryover, carryoverComments, artifactByRole = {} }) {
  const byKey = new Map();
  for (const comment of currentComments || []) {
    if (!REPORTED_OUTCOMES.has(comment.outcome)) continue;
    const key = `${comment.role}:${comment.resultKey}`;
    if (byKey.has(key)) throw new Error('DUPLICATE_RESULT');
    byKey.set(key, comment);
  }
  const current = (currentRows || []).map((row) => {
    const hit = byKey.get(`${row.role}:${row.resultKey}`);
    const base = hit ? { ...row, status: 'REPORTED', resultComment: hit.id, outcome: hit.outcome }
      : { ...row, status: 'MISSING', resultComment: null, outcome: null };
    if (hit && artifactByRole[row.role]) {
      base.technicalAcceptance = evaluateTechnicalAcceptance(hit.outcome, artifactByRole[row.role]);
    }
    return base;
  });

  const carryMatches = (carryoverComments || []).filter((item) =>
    item.role === carryover.role && item.resultKey === carryover.resultKey && REPORTED_OUTCOMES.has(item.outcome));
  if (carryMatches.length > 1) throw new Error('DUPLICATE_CARRYOVER_RESULT');
  const carry = carryMatches.length === 1
    ? { ...carryover, status: 'REPORTED', resultComment: carryMatches[0].id, outcome: carryMatches[0].outcome,
      attributedWave: carryover.wave }
    : { ...carryover, status: 'ACTIVE_CARRYOVER', resultComment: null, outcome: null,
      attributedWave: carryover.wave };

  const reported = current.filter((item) => item.status === 'REPORTED').length;
  const complete = reported === current.length;
  const commanderLines = current.map((item) =>
    `${item.role}|RESULT_COMMENT=${item.resultComment || 'MISSING'}|OUTCOME=${item.outcome || 'MISSING'}|TECHNICAL=${item.technicalAcceptance?.technical_state || 'NOT_APPLICABLE'}`);
  commanderLines.push(`${carry.role}|CARRYOVER_WAVE=${carry.wave}|RESULT_COMMENT=${carry.resultComment || 'PENDING'}|STATUS=${carry.status}`);
  if (complete) commanderLines.push('작업완료 결과수집 완료');

  return {
    schema: 'C_MODE_WAVE_RESULT_V1',
    current,
    carryover: carry,
    summary: { expected: current.length, reported, missing: current.length - reported, duplicate: 0 },
    commanderOutput: commanderLines.join('\n'),
    commanderFooter: complete ? '작업완료 결과수집 완료' : null,
  };
}

async function fetchAllPages(fetchPage, { maxRetries = 5, startPage = 1, restartState = null } = {}) {
  const all = [];
  const seen = new Set(restartState?.collectedCommentIds || []);
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
      all.push(item);
    }
    lastPage = page;
    if (!response.has_next) break;
  }
  return {
    items: all,
    restartState: { schema: 'C_MODE_ARTIFACT_GATE_RESTART_V1', lastPage, collectedCommentIds: [...seen] },
  };
}

module.exports = {
  classifyArtifactContent,
  evaluateTechnicalAcceptance,
  collectWaveWithCarryover,
  fetchAllPages,
};
