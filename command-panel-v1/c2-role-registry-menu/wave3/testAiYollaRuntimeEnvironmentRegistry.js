'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const environment = require('./AI_YOLLA_RUNTIME_ENVIRONMENT_V1.json');
const services = require('../wave2/AI_YOLLA_PANEL_SERVICE_REGISTRY_V1.json');
const {
  RuntimeEnvironmentError,
  validateRuntimeEnvironment,
  createServiceEnvironmentContext,
  scanSensitiveFields
} = require('./aiYollaRuntimeEnvironmentRegistry');

function copy(value) { return JSON.parse(JSON.stringify(value)); }
function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof RuntimeEnvironmentError && error.code === code);
}

test('A1_TARGET_PC_AUTHORITY_BINDING=PASS', () => {
  const result = validateRuntimeEnvironment(environment);
  assert.equal(result.accepted_terminal, 'A1_PC_AGENT_WINDOWS_RUNTIME_V1_TARGET_PC_ACCEPTED');
});

test('RUNTIME_ENVIRONMENT_SCHEMA semantic validation=PASS', () => {
  const result = validateRuntimeEnvironment(environment);
  assert.equal(result.status, 'PASS');
  assert.equal(result.age_minutes, 231);
});

test('target PC accepted runtime facts preserved', () => {
  assert.equal(environment.target_pc_acceptance.task_registered, true);
  assert.equal(environment.target_pc_acceptance.supervisor_process_count, 1);
  assert.equal(environment.target_pc_acceptance.worker_process_count, 1);
  assert.equal(environment.target_pc_acceptance.duplicate_execution_count, 0);
});

test('resident monitoring does not overclaim actual execution', () => {
  assert.equal(environment.resident_monitoring.actual_target_pc_monitoring_execution, 'NOT_ASSERTED_BY_THIS_REGISTRY');
  assert.equal(environment.context_freshness.source_kind, 'GITHUB_AUTHORITY_COMMENT_NOT_PC_FILE_READBACK');
});

test('SENSITIVE_FIELD_REJECT=PASS direct', () => {
  expectCode(() => scanSensitiveFields({ credential_value: 'forbidden' }), 'SENSITIVE_FIELD_REJECT');
});

test('SENSITIVE_FIELD_REJECT=PASS nested', () => {
  const bad = copy(environment);
  bad.runtime.browser_profile = { path: 'forbidden' };
  expectCode(() => validateRuntimeEnvironment(bad), 'SENSITIVE_FIELD_REJECT');
});

test('MISSING_ACCEPTED_TERMINAL_REJECT=PASS', () => {
  const bad = copy(environment);
  bad.authority.target_pc_terminal = null;
  expectCode(() => validateRuntimeEnvironment(bad), 'MISSING_ACCEPTED_TERMINAL_REJECT');
});

test('STALE_CONTEXT_REJECT=PASS', () => {
  const bad = copy(environment);
  bad.context_freshness.published_at = '2026-08-01T00:00:00+09:00';
  bad.context_freshness.age_minutes = 2586;
  expectCode(() => validateRuntimeEnvironment(bad), 'STALE_CONTEXT_REJECT');
});

test('freshness timestamp mismatch rejected', () => {
  const bad = copy(environment);
  bad.context_freshness.age_minutes = 1;
  expectCode(() => validateRuntimeEnvironment(bad), 'FRESHNESS_AGE_MISMATCH');
});

test('context file content or absolute path is not stored', () => {
  const bad = copy(environment);
  bad.runtime.context_file_names[0] = 'D:\\YOLLA_PC_BRIDGE\\runtime\\gpt-context\\LATEST_GPT_DEVELOPMENT_CONTEXT.json';
  expectCode(() => validateRuntimeEnvironment(bad), 'CONTEXT_PATH_CONTENT_FORBIDDEN');
});

test('THREE_SERVICE_ENVIRONMENT_HANDOFF=PASS', () => {
  const contexts = services.services.map((service) => createServiceEnvironmentContext(environment, services, service.service_id));
  assert.equal(contexts.length, 3);
  assert.equal(new Set(contexts.map((item) => item.environment_id)).size, 1);
  assert.deepEqual(contexts.map((item) => item.domain_pack_id), [
    'REAL_ESTATE', 'GAS_STATION_PETROLEUM', 'HAZARDOUS_MATERIALS_FIRE_SAFETY'
  ]);
});

test('unknown service rejected', () => {
  expectCode(() => createServiceEnvironmentContext(environment, services, 'UNKNOWN_SERVICE'), 'UNKNOWN_SERVICE');
});

test('separate service runtime rejected', () => {
  const badServices = copy(services);
  badServices.services[0].separate_runtime = true;
  expectCode(() => createServiceEnvironmentContext(environment, badServices, badServices.services[0].service_id), 'SERVICE_RUNTIME_CLONE_FORBIDDEN');
});

test('actual PC command and file read counters remain zero', () => {
  const context = createServiceEnvironmentContext(environment, services, 'YOLLA_REAL_ESTATE_PRO_AI');
  assert.equal(context.actual_pc_command_count, 0);
  assert.equal(context.actual_pc_file_read_count, 0);
});
