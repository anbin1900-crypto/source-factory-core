'use strict';

const { parseResultComment } = require('./runtime_result_adapter.cjs');

const REPORTED_OUTCOMES = new Set(['PASS', 'BLOCKED', 'FAIL', 'NO_WORK']);
const EXECUTABLE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ps1', '.bat', '.cmd', '.exe', '.dll', '.msi']);

function extension(path) {
  const match = String(path || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : '';
}

function normalizeArtifactEvidence(evidence = {}) {
  const paths = [
    ...(evidence.runtimeFiles || []),
    ...(evidence.payloadPaths || []),
  ].map((item) => typeof item === 'string' ? item : (item.package_path || item.source_path || item.install_destination || ''));
  const byteExists = Boolean(evidence.byteExists) || Number(evidence.sizeBytes || 0) > 0 || paths.length > 0;
  const executableSourcePresent = Boolean(evidence.executableSourcePresent) || paths.some((path) => EXECUTABLE_EXTENSIONS.has(extension(path)) && !/\.json$/i.test(path));
  const metadataOnlyArchive = Boolean(evidence.metadataOnlyArchive) || (byteExists && !executableSourcePresent && Boolean(evidence.archiveActionPresent));
  const installActionPresent = Boolean(evidence.installActionPresent);
  const smokePresent = Boolean(evidence.smokePresent);
  const rollbackPresent = Boolean(evidence.rollbackPresent);
  const smokeAndRollbackPresent = smokePresent && rollbackPresent;
  const installableRuntime = byteExists && !metadataOnlyArchive && executableSourcePresent && installActionPresent && smokeAndRollbackPresent;
  const targetPcAccepted = Boolean(evidence.targetPcAccepted);

  return {
    BYTE_EXISTS: byteExists,
    METADATA_ONLY_ARCHIVE: metadataOnlyArchive,
    EXECUTABLE_SOURCE_PRESENT: executableSourcePresent,
    INSTALL_ACTION_PRESENT: installActionPresent,
    SMOKE_AND_ROLLBACK_PRESENT: smokeAndRollbackPresent,
    INSTALLABLE_RUNTIME: installableRuntime,
    TARGET_PC_ACCEPTED: targetPcAccepted,
    TARGET_PC_PENDING: installableRuntime && !targetPcAccepted,
  };
}

function technicalAcceptance(workerOutcome, evidence = {}) {
  if (!REPORTED_OUTCOMES.has(workerOutcome)) throw new Error('INVALID_WORKER_OUTCOME');
  const artifact = normalizeArtifactEvidence(evidence);
  const statuses = {
    REPORTED: true,
    TECHNICALLY_ACCEPTED: artifact.INSTALLABLE_RUNTIME,
    METADATA_ONLY_REJECTED: artifact.METADATA_ONLY_ARCHIVE,
    EXECUTABLE_SOURCE_MISSING: !artifact.EXECUTABLE_SOURCE_PRESENT,
    INSTALL_ACTION_MISSING: !artifact.INSTALL_ACTION_PRESENT,
    SMOKE_OR_ROLLBACK_MISSING: !artifact.SMOKE_AND_ROLLBACK_PRESENT,
    INSTALLABLE_RUNTIME: artifact.INSTALLABLE_RUNTIME,
    TARGET_PC_PENDING: artifact.TARGET_PC_PENDING,
    TARGET_PC_ACCEPTED: artifact.TARGET_PC_ACCEPTED,
  };

  let technicalState = 'TECHNICALLY_ACCEPTED';
  if (statuses.METADATA_ONLY_REJECTED) technicalState = 'METADATA_ONLY_REJECTED';
  else if (statuses.EXECUTABLE_SOURCE_MISSING) technicalState = 'EXECUTABLE_SOURCE_MISSING';
  else if (statuses.INSTALL_ACTION_MISSING) technicalState = 'INSTALL_ACTION_MISSING';
  else if (statuses.SMOKE_OR_ROLLBACK_MISSING) technicalState = 'SMOKE_OR_ROLLBACK_MISSING';
  else if (statuses.TARGET_PC_ACCEPTED) technicalState = 'TARGET_PC_ACCEPTED';
  else if (statuses.TARGET_PC_PENDING) technicalState = 'TARGET_PC_PENDING';

  return {
    report_state: 'REPORTED',
    reported_outcome: workerOutcome,
    effective_outcome: statuses.TECHNICALLY_ACCEPTED ? workerOutcome : 'BLOCKED',
    technical_state: technicalState,
    pass_does_not_override_gate: workerOutcome === 'PASS' && !statuses.TECHNICALLY_ACCEPTED,
    statuses,
    artifact,
  };
}

function collectRuntimeTechnicalAcceptance({ registry, comments, artifactEvidenceByRole = {}, partialFixtures = [] }) {
  if (!registry || registry.schema !== 'C_MODE_WAVE_V2') throw new Error('INVALID_REGISTRY');
  const parsed = (comments || []).map(parseResultComment).filter(Boolean);
  const results = [];

  for (const row of registry.workers || []) {
    const matches = parsed.filter((item) => item.result_key === String(row.result_key) && item.role === row.role && item.pr === row.pr && item.result_comment > row.directive_comment);
    if (matches.length > 1) throw new Error(`DUPLICATE_RESULT:${row.role}`);
    if (matches.length === 0) {
      results.push({ ...row, report_state: 'MISSING', result_comment: null, technical_state: 'NOT_EVALUATED' });
      continue;
    }
    const result = matches[0];
    const evidence = artifactEvidenceByRole[row.role];
    const acceptance = evidence ? technicalAcceptance(result.outcome, evidence) : null;
    results.push({ ...row, ...result, report_state: 'REPORTED', technical_acceptance: acceptance, technical_state: acceptance ? acceptance.technical_state : 'NOT_APPLICABLE' });
  }

  const supplemental = partialFixtures.map((fixture) => ({
    fixture_id: fixture.fixture_id,
    role: fixture.role,
    result_comment: fixture.result_comment,
    result_commit: fixture.result_commit,
    technical_acceptance: technicalAcceptance(fixture.outcome, fixture.evidence),
  }));
  const reported = results.filter((item) => item.report_state === 'REPORTED').length;
  const missing = results.length - reported;
  const commanderLines = results.map((item) => `${item.role}|RESULT_COMMENT=${item.result_comment || 'MISSING'}|REPORT=${item.report_state}|TECHNICAL=${item.technical_state}`);
  for (const fixture of supplemental) commanderLines.push(`${fixture.role}|PARTIAL_FIXTURE=${fixture.fixture_id}|RESULT_COMMENT=${fixture.result_comment}|TECHNICAL=${fixture.technical_acceptance.technical_state}`);

  return {
    schema: 'C_MODE_RUNTIME_TECHNICAL_ACCEPTANCE_V1',
    control_id: registry.control_id,
    wave_id: registry.wave_id,
    registry_sequence: registry.registry_sequence,
    reported,
    missing,
    duplicate: 0,
    results,
    supplemental,
    commander_output: commanderLines.join('\n'),
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
  return { items, restart_state: { schema: 'C_MODE_RUNTIME_TECHNICAL_ACCEPTANCE_RESTART_V1', last_page: lastPage, collected_comment_ids: [...seen] } };
}

module.exports = { normalizeArtifactEvidence, technicalAcceptance, collectRuntimeTechnicalAcceptance, fetchAllPagesWithRestart };
