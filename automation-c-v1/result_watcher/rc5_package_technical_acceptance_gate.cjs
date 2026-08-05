'use strict';

const { parseResultComment } = require('./runtime_result_adapter.cjs');
const { fetchAllPagesWithRestart } = require('./runtime_technical_acceptance_adapter.cjs');

const REPORTED_OUTCOMES = new Set(['PASS', 'BLOCKED', 'FAIL', 'NO_WORK']);
const REJECTION_KEYS = Object.freeze([
  'PACKAGE_DIRECTORY_MISSING',
  'SELF_CONTAINED_PAYLOAD_MISSING',
  'NETWORK_DEPENDENT_INSTALLER',
  'ACTIVE_RUNTIME_ROOT_MISMATCH',
  'FIXED_PROFILE_BINDING_MISSING',
  'UI_PATH_OR_LOAD_ORDER_MISMATCH',
  'REQUIRED_COMPONENT_NOT_LOADED_BY_SMOKE',
  'ROLLBACK_PRESERVATION_NOT_VERIFIED',
]);

function bool(value) { return value === true; }

function evaluateRc5PackageEvidence(evidence = {}) {
  const rejectionFlags = {
    PACKAGE_DIRECTORY_MISSING: !bool(evidence.package_directory_present),
    SELF_CONTAINED_PAYLOAD_MISSING: !bool(evidence.self_contained_payload),
    NETWORK_DEPENDENT_INSTALLER: bool(evidence.network_dependent_installer),
    ACTIVE_RUNTIME_ROOT_MISMATCH: !bool(evidence.active_runtime_root_match),
    FIXED_PROFILE_BINDING_MISSING: !bool(evidence.fixed_profile_binding),
    UI_PATH_OR_LOAD_ORDER_MISMATCH: !bool(evidence.ui_path_and_load_order_match),
    REQUIRED_COMPONENT_NOT_LOADED_BY_SMOKE: !bool(evidence.required_components_loaded_by_smoke),
    ROLLBACK_PRESERVATION_NOT_VERIFIED: !bool(evidence.rollback_preservation_verified),
  };
  const rejectionReasons = REJECTION_KEYS.filter((key) => rejectionFlags[key]);
  const byteExists = bool(evidence.byte_exists);
  const executableSourcePresent = bool(evidence.executable_source_present);
  const installActionPresent = bool(evidence.install_action_present);
  const smokeAndRollbackPresent = bool(evidence.smoke_and_rollback_present);
  const installableRuntime = byteExists && executableSourcePresent && installActionPresent &&
    smokeAndRollbackPresent && rejectionReasons.length === 0;
  const targetPcAccepted = installableRuntime && bool(evidence.target_pc_accepted);

  return {
    ...rejectionFlags,
    REJECTION_REASONS: rejectionReasons,
    REJECTION_COUNT: rejectionReasons.length,
    BYTE_EXISTS: byteExists,
    EXECUTABLE_SOURCE_PRESENT: executableSourcePresent,
    INSTALL_ACTION_PRESENT: installActionPresent,
    SMOKE_AND_ROLLBACK_PRESENT: smokeAndRollbackPresent,
    INSTALLABLE_RUNTIME: installableRuntime,
    TARGET_PC_ACCEPTED: targetPcAccepted,
    TARGET_PC_PENDING: installableRuntime && !targetPcAccepted,
  };
}

function applyRc5PackageGate(workerOutcome, evidence = {}) {
  if (!REPORTED_OUTCOMES.has(workerOutcome)) throw new Error('INVALID_WORKER_OUTCOME');
  const packageVerdict = evaluateRc5PackageEvidence(evidence);
  const technicallyAccepted = packageVerdict.INSTALLABLE_RUNTIME;
  return {
    REPORTED: true,
    REPORTED_OUTCOME: workerOutcome,
    TECHNICALLY_ACCEPTED: technicallyAccepted,
    INSTALLABLE_RUNTIME: packageVerdict.INSTALLABLE_RUNTIME,
    TARGET_PC_PENDING: packageVerdict.TARGET_PC_PENDING,
    TARGET_PC_ACCEPTED: packageVerdict.TARGET_PC_ACCEPTED,
    EFFECTIVE_OUTCOME: technicallyAccepted ? workerOutcome : 'BLOCKED',
    PASS_DOES_NOT_OVERRIDE_TECHNICAL_GATE: workerOutcome === 'PASS' && !technicallyAccepted,
    PACKAGE_VERDICT: packageVerdict,
  };
}

function collectRc5PackageTechnicalAcceptance({ registry, comments, packageEvidenceByRole = {} }) {
  if (!registry || registry.schema !== 'C_MODE_WAVE_V2') throw new Error('INVALID_REGISTRY');
  const parsed = (comments || []).map(parseResultComment).filter(Boolean);
  const results = [];

  for (const row of registry.workers || []) {
    const matches = parsed.filter((item) => item.result_key === String(row.result_key) &&
      item.role === row.role && item.pr === row.pr && item.result_comment > row.directive_comment);
    if (matches.length > 1) throw new Error(`DUPLICATE_RESULT:${row.role}`);
    if (matches.length === 0) {
      results.push({ ...row, report_state: 'MISSING', result_comment: null, technical_state: 'NOT_EVALUATED' });
      continue;
    }
    const result = matches[0];
    const evidence = packageEvidenceByRole[row.role];
    const gate = evidence ? applyRc5PackageGate(result.outcome, evidence) : null;
    results.push({
      ...row,
      ...result,
      report_state: 'REPORTED',
      technical_state: gate ? (gate.TECHNICALLY_ACCEPTED ?
        (gate.TARGET_PC_ACCEPTED ? 'TARGET_PC_ACCEPTED' : 'TECHNICALLY_ACCEPTED_TARGET_PC_PENDING') :
        'TECHNICAL_GATE_REJECTED') : 'NOT_APPLICABLE',
      technical_acceptance: gate,
    });
  }

  const reported = results.filter((item) => item.report_state === 'REPORTED').length;
  const missing = results.length - reported;
  const commanderLines = results.map((item) => {
    const gate = item.technical_acceptance;
    const rejections = gate?.PACKAGE_VERDICT?.REJECTION_REASONS?.join(',') || 'NONE';
    return `${item.role}|RESULT_COMMENT=${item.result_comment || 'MISSING'}|REPORTED=${item.report_state === 'REPORTED'}|TECHNICALLY_ACCEPTED=${gate?.TECHNICALLY_ACCEPTED ?? 'N/A'}|INSTALLABLE_RUNTIME=${gate?.INSTALLABLE_RUNTIME ?? 'N/A'}|TARGET_PC_ACCEPTED=${gate?.TARGET_PC_ACCEPTED ?? 'N/A'}|REJECTIONS=${rejections}`;
  });

  return {
    schema: 'C_MODE_RC5_PACKAGE_TECHNICAL_ACCEPTANCE_V1',
    control_id: registry.control_id,
    wave_id: registry.wave_id,
    registry_sequence: registry.registry_sequence,
    target_version: registry.target_version || null,
    reported,
    missing,
    duplicate: 0,
    results,
    commander_output: commanderLines.join('\n'),
  };
}

async function fetchAllPagesForRc5(fetchPage, options = {}) {
  return fetchAllPagesWithRestart(fetchPage, {
    maxRetries: options.maxRetries ?? 5,
    startPage: options.startPage ?? 1,
    restartState: options.restartState ?? null,
  });
}

module.exports = {
  REJECTION_KEYS,
  evaluateRc5PackageEvidence,
  applyRc5PackageGate,
  collectRc5PackageTechnicalAcceptance,
  fetchAllPagesForRc5,
};
