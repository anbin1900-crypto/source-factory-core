'use strict';

const crypto = require('crypto');
const { SENSITIVE_KEY_PATTERN, SENSITIVE_VALUE_PATTERNS } = require('./constants');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseWaveNumber(value) {
  const match = text(value).toUpperCase().match(/(?:WAVE[_-]?)?(\d+)$/);
  return match ? Number(match[1]) : null;
}

function parseKstMinute(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}) KST$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const epoch = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);
  if (!Number.isFinite(epoch)) return null;
  return {
    canonical: `${year}-${month}-${day} ${hour}:${minute} KST`,
    epoch
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

function duplicatePromptKey(prompt) {
  const source = normalizePrompt(prompt);
  return sha256([
    source.role_id,
    source.directive_id,
    source.wave_id,
    source.directive_registered_at_kst
  ].join('|'));
}

function normalizePrompt(input) {
  const source = isObject(input) ? input : {};
  return {
    role_id: text(source.role_id),
    directive_id: text(source.directive_id),
    wave_id: text(source.wave_id),
    directive_registered_at_kst: text(source.directive_registered_at_kst),
    duplicate_prompt_key: text(source.duplicate_prompt_key),
    platform_id: text(source.platform_id),
    service_id: text(source.service_id),
    domain_pack_id: text(source.domain_pack_id),
    payload: isObject(source.payload) ? source.payload : {}
  };
}

function normalizeAuthority(input) {
  const source = isObject(input) ? input : {};
  return {
    a1_control_pr: number(source.a1_control_pr),
    target_pc_accepted_comment: number(source.target_pc_accepted_comment),
    target_pc_terminal: text(source.target_pc_terminal),
    resident_monitoring_comment: number(source.resident_monitoring_comment),
    canonical_runtime_root: text(source.canonical_runtime_root),
    runtime_version: text(source.runtime_version),
    target_pc_accepted: source.target_pc_accepted === true,
    runtime_health_status: text(source.runtime_health_status).toUpperCase(),
    monitoring_status: text(source.monitoring_status)
  };
}

function normalizeContext(input) {
  const source = isObject(input) ? input : {};
  return {
    snapshot_id: text(source.snapshot_id),
    captured_at_kst: text(source.captured_at_kst),
    valid_until_kst: text(source.valid_until_kst),
    freshness: text(source.freshness).toUpperCase(),
    runtime_version: text(source.runtime_version),
    runtime_health_status: text(source.runtime_health_status).toUpperCase(),
    role_id: text(source.role_id),
    wave_id: text(source.wave_id),
    platform_id: text(source.platform_id),
    service_id: text(source.service_id),
    domain_pack_id: text(source.domain_pack_id)
  };
}

function normalizeLedger(input) {
  return (Array.isArray(input) ? input : []).map((entryInput) => {
    const entry = isObject(entryInput) ? entryInput : {};
    return {
      role_id: text(entry.role_id),
      directive_id: text(entry.directive_id),
      wave_id: text(entry.wave_id),
      duplicate_prompt_key: text(entry.duplicate_prompt_key),
      result_accepted: entry.result_accepted === true,
      result_comment: number(entry.result_comment)
    };
  });
}

function containsSensitiveValue(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => containsSensitiveValue(item, `${path}[${index}]`, findings));
    return findings;
  }
  if (isObject(value)) {
    Object.entries(value).forEach(([key, nested]) => {
      const nextPath = `${path}.${key}`;
      if (SENSITIVE_KEY_PATTERN.test(key)) findings.push(`SENSITIVE_KEY:${nextPath}`);
      containsSensitiveValue(nested, nextPath, findings);
    });
    return findings;
  }
  if (typeof value === 'string') {
    SENSITIVE_VALUE_PATTERNS.forEach((pattern) => {
      if (pattern.test(value)) findings.push(`SENSITIVE_VALUE:${path}`);
    });
  }
  return findings;
}

function roleServiceWaveMatches(prompt, context) {
  return prompt.role_id === context.role_id &&
    prompt.wave_id === context.wave_id &&
    prompt.platform_id === context.platform_id &&
    prompt.service_id === context.service_id &&
    prompt.domain_pack_id === context.domain_pack_id;
}

module.exports = {
  isObject,
  text,
  number,
  parseWaveNumber,
  parseKstMinute,
  sha256,
  duplicatePromptKey,
  normalizePrompt,
  normalizeAuthority,
  normalizeContext,
  normalizeLedger,
  containsSensitiveValue,
  roleServiceWaveMatches
};
