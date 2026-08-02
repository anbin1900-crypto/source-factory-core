'use strict';

const ACCEPTED_TERMINAL = 'A1_PC_AGENT_WINDOWS_RUNTIME_V1_TARGET_PC_ACCEPTED';
const MONITORING_STATUS = 'A1_PC_AGENT_12_18_21_SOURCE_AND_STATIC_VALIDATION_PASS_TARGET_PC_EXECUTION_READY';
const WAVE_ID = 'WAVE_3';
const DIRECTIVE_ID = 'C1-TO-C2-AI-YOLLA-PC-ENVIRONMENT-REGISTRY-WAVE3-V1-20260802-001';
const DUPLICATE_PROMPT_KEY = '12dada416d1bf9a969bce71795e8c9727d9e5a76e9fb782d5c11353ca325ab83';
const FORBIDDEN_FIELD_NAMES = new Set([
  'credential', 'credentials', 'credential_value', 'environment_variable',
  'environment_variables', 'env_value', 'secret', 'secrets', 'token',
  'access_token', 'refresh_token', 'password', 'api_key', 'ssh_key',
  'private_key', 'browser_data', 'browser_profile', 'cookies', 'cookie',
  'personal_file_content', 'file_content'
]);

class RuntimeEnvironmentError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuntimeEnvironmentError';
    this.code = code;
    this.details = details;
  }
}

function fail(condition, code, message, details = {}) {
  if (!condition) throw new RuntimeEnvironmentError(code, message, details);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function scanSensitiveFields(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitiveFields(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    fail(!FORBIDDEN_FIELD_NAMES.has(normalized), 'SENSITIVE_FIELD_REJECT', `forbidden sensitive field: ${key}`, { path: `${path}.${key}` });
    scanSensitiveFields(nested, `${path}.${key}`);
  }
}

function minutesBetween(earlier, later) {
  const start = Date.parse(earlier);
  const end = Date.parse(later);
  fail(Number.isFinite(start) && Number.isFinite(end) && end >= start, 'INVALID_FRESHNESS_TIME', 'freshness timestamps are invalid');
  return Math.floor((end - start) / 60000);
}

function validateAuthority(environment) {
  const authority = environment.authority || {};
  fail(authority.repository === 'anbin1900-crypto/yolla-real-estate-data-engine', 'A1_AUTHORITY_REPOSITORY_MISMATCH', 'A-1 authority repository mismatch');
  fail(authority.a1_control_pr === 142, 'A1_AUTHORITY_PR_MISMATCH', 'A-1 control PR mismatch');
  fail(authority.target_pc_accepted_comment === 5153045063, 'A1_ACCEPTANCE_COMMENT_MISMATCH', 'Target PC acceptance comment mismatch');
  fail(authority.target_pc_terminal === ACCEPTED_TERMINAL, 'MISSING_ACCEPTED_TERMINAL_REJECT', 'accepted Target PC terminal missing or mismatched');
  fail(authority.resident_monitoring_comment === 5155863538, 'A1_MONITORING_COMMENT_MISMATCH', 'resident monitoring comment mismatch');
  fail(authority.resident_monitoring_status === MONITORING_STATUS, 'A1_MONITORING_STATUS_MISMATCH', 'resident monitoring status mismatch');
  for (const field of ['report_commit', 'report_blob', 'pointer_commit', 'manager_source_commit']) {
    fail(/^[0-9a-f]{40}$/.test(authority[field] || ''), 'INVALID_A1_GIT_AUTHORITY', `${field} must be a 40-char Git SHA`);
  }
}

function validateFreshness(environment) {
  const freshness = environment.context_freshness || {};
  const actualAge = minutesBetween(freshness.published_at, freshness.evaluated_at);
  fail(actualAge === freshness.age_minutes, 'FRESHNESS_AGE_MISMATCH', 'stored freshness age differs from timestamps', { actual_age: actualAge, stored_age: freshness.age_minutes });
  fail(Number.isInteger(freshness.maximum_age_minutes) && freshness.maximum_age_minutes > 0, 'INVALID_FRESHNESS_POLICY', 'maximum age must be positive');
  fail(actualAge <= freshness.maximum_age_minutes, 'STALE_CONTEXT_REJECT', 'context authority is stale', { age_minutes: actualAge, maximum_age_minutes: freshness.maximum_age_minutes });
  fail(freshness.status === 'FRESH_AT_WAVE3_DISPATCH', 'FRESHNESS_STATUS_MISMATCH', 'fresh context status mismatch');
  return actualAge;
}

function validateRuntimeEnvironment(environment) {
  fail(environment && typeof environment === 'object' && !Array.isArray(environment), 'INVALID_ENVIRONMENT', 'environment object is required');
  scanSensitiveFields(environment);
  fail(environment.environment_id === 'AI_YOLLA_RUNTIME_ENVIRONMENT', 'WRONG_ENVIRONMENT_ID', 'environment id mismatch');
  fail(environment.platform_id === 'AI_YOLLA' && environment.component_id === 'AI_YOLLA_RUNTIME', 'WRONG_PLATFORM_COMPONENT', 'platform/component mismatch');
  const wave = environment.wave_metadata || {};
  fail(wave.wave_id === WAVE_ID && wave.directive_id === DIRECTIVE_ID && wave.duplicate_prompt_key === DUPLICATE_PROMPT_KEY, 'WAVE_METADATA_MISMATCH', 'Wave 3 metadata mismatch');
  validateAuthority(environment);
  const runtime = environment.runtime || {};
  fail(runtime.runtime_version === '1.0.0-20260802', 'RUNTIME_VERSION_MISMATCH', 'runtime version mismatch');
  fail(runtime.manager_hotfix_version === '1.0.1-manager-status', 'MANAGER_HOTFIX_MISMATCH', 'manager hotfix mismatch');
  fail(runtime.canonical_runtime_root === 'D:\\YOLLA_PC_BRIDGE', 'RUNTIME_ROOT_MISMATCH', 'runtime root mismatch');
  fail(Array.isArray(runtime.context_file_names) && runtime.context_file_names.length === 2, 'CONTEXT_FILE_NAME_MISMATCH', 'two context file names required');
  fail(runtime.context_file_names.every((name) => !name.includes('\\') && !name.includes('/')), 'CONTEXT_PATH_CONTENT_FORBIDDEN', 'only context file names may be stored');
  const accepted = environment.target_pc_acceptance || {};
  fail(accepted.task_registered === true, 'TASK_REGISTRATION_MISSING', 'scheduled task registration not accepted');
  fail(accepted.supervisor_process_count === 1 && accepted.worker_process_count === 1, 'PROCESS_COUNT_MISMATCH', 'accepted process counts must be one supervisor and one worker');
  fail(accepted.controlled_request === 'PASS', 'CONTROLLED_REQUEST_MISSING', 'controlled request PASS missing');
  fail(accepted.duplicate_execution_count === 0, 'DUPLICATE_EXECUTION_REJECT', 'duplicate execution count must be zero');
  fail(accepted.worker_crash_recovery === 'PASS' && accepted.full_runtime_restart === 'PASS' && accepted.result_persistence === 'PASS', 'RECOVERY_ACCEPTANCE_MISSING', 'recovery acceptance is incomplete');
  const monitoring = environment.resident_monitoring || {};
  fail(monitoring.authority_state === 'SOURCE_AND_STATIC_VALIDATION_PASS_TARGET_PC_EXECUTION_READY', 'MONITORING_STATE_MISMATCH', 'resident monitoring state mismatch');
  fail(monitoring.actual_target_pc_monitoring_execution === 'NOT_ASSERTED_BY_THIS_REGISTRY', 'ACTUAL_MONITORING_OVERCLAIM', 'registry must not claim actual monitoring execution');
  const ageMinutes = validateFreshness(environment);
  const safety = environment.safety || {};
  fail(safety.actual_pc_command_count === 0 && safety.actual_pc_file_read_count === 0 && safety.sensitive_value_count === 0, 'SAFETY_COUNTER_NONZERO', 'PC command/read/sensitive counters must be zero');
  return { status: 'PASS', environment_id: environment.environment_id, age_minutes: ageMinutes, accepted_terminal: authorityTerminal(environment) };
}

function authorityTerminal(environment) {
  return environment.authority && environment.authority.target_pc_terminal;
}

function getService(serviceRegistry, serviceId) {
  fail(serviceRegistry && Array.isArray(serviceRegistry.services), 'INVALID_SERVICE_REGISTRY', 'service registry services required');
  const service = serviceRegistry.services.find((candidate) => candidate.service_id === serviceId);
  fail(Boolean(service), 'UNKNOWN_SERVICE', `unknown service_id: ${serviceId}`);
  return service;
}

function createServiceEnvironmentContext(environment, serviceRegistry, serviceId) {
  validateRuntimeEnvironment(environment);
  const service = getService(serviceRegistry, serviceId);
  fail(service.platform_id === 'AI_YOLLA', 'SERVICE_PLATFORM_MISMATCH', 'service platform mismatch');
  fail(service.shared_core_id === 'AI_YOLLA_COMMON_CORE', 'SERVICE_CORE_MISMATCH', 'service common core mismatch');
  fail(service.separate_runtime === false && service.source_clone === false, 'SERVICE_RUNTIME_CLONE_FORBIDDEN', 'service must share the common runtime');
  return {
    platform_id: service.platform_id,
    component_id: 'AI_YOLLA_RUNTIME',
    service_id: service.service_id,
    domain_pack_id: service.domain_pack_id,
    role_id: service.role_id,
    official_name_ko: service.official_name_ko,
    environment_id: environment.environment_id,
    runtime_version: environment.runtime.runtime_version,
    target_pc_terminal: environment.authority.target_pc_terminal,
    environment_freshness: environment.context_freshness.status,
    context_authority_comment: environment.context_freshness.authority_comment,
    wave_id: environment.wave_metadata.wave_id,
    directive_id: environment.wave_metadata.directive_id,
    duplicate_prompt_key: environment.wave_metadata.duplicate_prompt_key,
    actual_pc_command_count: 0,
    actual_pc_file_read_count: 0
  };
}

module.exports = {
  ACCEPTED_TERMINAL,
  MONITORING_STATUS,
  WAVE_ID,
  DIRECTIVE_ID,
  DUPLICATE_PROMPT_KEY,
  FORBIDDEN_FIELD_NAMES,
  RuntimeEnvironmentError,
  scanSensitiveFields,
  minutesBetween,
  validateAuthority,
  validateFreshness,
  validateRuntimeEnvironment,
  getService,
  createServiceEnvironmentContext
};
