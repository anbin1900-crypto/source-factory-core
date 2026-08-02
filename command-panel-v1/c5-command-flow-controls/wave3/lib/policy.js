'use strict';

const core = require('./core');
const { DECISIONS, REQUIRED_AUTHORITY } = require('./constants');

function decision(admitted, code, findings, prompt, extra = {}) {
  return {
    admitted,
    decision: code,
    findings,
    prompt_identity: {
      role_id: prompt.role_id,
      directive_id: prompt.directive_id,
      wave_id: prompt.wave_id,
      directive_registered_at_kst: prompt.directive_registered_at_kst,
      duplicate_prompt_key: prompt.duplicate_prompt_key,
      platform_id: prompt.platform_id,
      service_id: prompt.service_id,
      domain_pack_id: prompt.domain_pack_id
    },
    dispatch_contract: admitted ? {
      authority: 'sfApi.stage4.dispatchNextPrompt',
      plan_only: true,
      actual_dispatch_performed: false,
      new_transport_created: false,
      manual_prompt_composition_count: 0
    } : null,
    ...extra
  };
}

function exactAuthorityFindings(authority) {
  const findings = [];
  Object.entries(REQUIRED_AUTHORITY).forEach(([key, expected]) => {
    if (authority[key] !== expected) findings.push(`A1_AUTHORITY_MISMATCH:${key}`);
  });
  if (authority.target_pc_accepted !== true) findings.push('A1_TARGET_PC_NOT_ACCEPTED');
  return findings;
}

function evaluateRuntimeAdmission(input) {
  const source = core.isObject(input) ? input : {};
  const prompt = core.normalizePrompt(source.prompt);
  const authority = core.normalizeAuthority(source.runtime_authority);
  const context = core.normalizeContext(source.context_snapshot);
  const ledger = core.normalizeLedger(source.ledger);
  const now = core.parseKstMinute(source.now_kst);
  const required = [];

  if (!prompt.role_id) required.push('ROLE_ID_MISSING');
  if (!prompt.directive_id) required.push('DIRECTIVE_ID_MISSING');
  if (!prompt.wave_id || core.parseWaveNumber(prompt.wave_id) === null) required.push('WAVE_ID_MISSING_OR_INVALID');
  if (!prompt.directive_registered_at_kst || !core.parseKstMinute(prompt.directive_registered_at_kst)) required.push('DIRECTIVE_REGISTERED_AT_KST_MISSING_OR_INVALID');
  if (!prompt.duplicate_prompt_key) required.push('DUPLICATE_PROMPT_KEY_MISSING');
  if (!prompt.platform_id || !prompt.service_id || !prompt.domain_pack_id) required.push('SERVICE_IDENTITY_MISSING');
  if (!now) required.push('NOW_KST_MISSING_OR_INVALID');
  if (required.length) return decision(false, DECISIONS.FAIL_CLOSED, required, prompt);

  const authorityFindings = exactAuthorityFindings(authority);
  if (authorityFindings.length) {
    return decision(false, DECISIONS.REJECT_RUNTIME_UNVERIFIED, authorityFindings, prompt, { runtime_authority: authority });
  }

  if (!context.snapshot_id || !context.captured_at_kst || !context.valid_until_kst) {
    return decision(false, DECISIONS.REJECT_STALE_PC_CONTEXT, ['CONTEXT_SNAPSHOT_MISSING'], prompt);
  }
  const captured = core.parseKstMinute(context.captured_at_kst);
  const validUntil = core.parseKstMinute(context.valid_until_kst);
  if (!captured || !validUntil || context.freshness !== 'FRESH' || captured.epoch > now.epoch || validUntil.epoch < now.epoch) {
    return decision(false, DECISIONS.REJECT_STALE_PC_CONTEXT, ['CONTEXT_NOT_FRESH_AT_ADMISSION_TIME'], prompt);
  }

  if (context.runtime_version !== authority.runtime_version) {
    return decision(false, DECISIONS.REJECT_RUNTIME_VERSION_MISMATCH, ['CONTEXT_RUNTIME_VERSION_DOES_NOT_MATCH_A1_AUTHORITY'], prompt);
  }

  if (!core.roleServiceWaveMatches(prompt, context)) {
    return decision(false, DECISIONS.REJECT_ROLE_SERVICE_WAVE_MISMATCH, ['ROLE_SERVICE_WAVE_CONTEXT_MISMATCH'], prompt);
  }

  const computedKey = core.duplicatePromptKey(prompt);
  if (computedKey !== prompt.duplicate_prompt_key) {
    return decision(false, DECISIONS.REJECT_DUPLICATE, ['DUPLICATE_PROMPT_KEY_INVALID'], prompt, { computed_duplicate_prompt_key: computedKey });
  }

  const exactDuplicate = ledger.find((entry) => entry.duplicate_prompt_key === prompt.duplicate_prompt_key);
  if (exactDuplicate) {
    return decision(false, DECISIONS.REJECT_DUPLICATE, ['DUPLICATE_PROMPT_KEY_ALREADY_OBSERVED'], prompt);
  }

  const acceptedReplay = ledger.find((entry) => entry.role_id === prompt.role_id && entry.directive_id === prompt.directive_id && entry.result_accepted);
  if (acceptedReplay) {
    return decision(false, DECISIONS.REJECT_ALREADY_ACCEPTED, ['DIRECTIVE_RESULT_ALREADY_ACCEPTED'], prompt);
  }

  const promptWave = core.parseWaveNumber(prompt.wave_id);
  const latestWave = ledger
    .filter((entry) => entry.role_id === prompt.role_id)
    .map((entry) => core.parseWaveNumber(entry.wave_id))
    .filter((value) => value !== null)
    .reduce((maximum, value) => Math.max(maximum, value), -Infinity);
  if (Number.isFinite(latestWave) && promptWave < latestWave) {
    return decision(false, DECISIONS.REJECT_STALE_WAVE, ['PROMPT_WAVE_OLDER_THAN_LATEST_OBSERVED'], prompt);
  }

  if (['BLOCKED', 'FAILED', 'OFFLINE', 'UNHEALTHY'].includes(authority.runtime_health_status) ||
      ['BLOCKED', 'FAILED', 'OFFLINE', 'UNHEALTHY'].includes(context.runtime_health_status)) {
    return decision(false, DECISIONS.REJECT_RUNTIME_HEALTH_BLOCKED, ['RUNTIME_HEALTH_BLOCKED'], prompt);
  }

  const sensitiveFindings = core.containsSensitiveValue(prompt.payload);
  if (sensitiveFindings.length) {
    return decision(false, DECISIONS.REJECT_SENSITIVE_PAYLOAD, sensitiveFindings, prompt);
  }

  return decision(true, DECISIONS.ADMIT_RUNTIME_DISPATCH, [], prompt, {
    runtime_authority: authority,
    context_snapshot: context,
    computed_duplicate_prompt_key: computedKey,
    context_freshness: 'FRESH',
    runtime_version_bound: true,
    role_service_wave_match: true,
    duplicate_prompt_key_valid: true,
    accepted_result_replay: false,
    runtime_health_not_blocked: true
  });
}

module.exports = {
  DECISIONS,
  REQUIRED_AUTHORITY,
  exactAuthorityFindings,
  evaluateRuntimeAdmission
};
