(function commandPanelIntegrationFactory(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YollaCommandPanelIntegration = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildIntegration() {
  'use strict';

  const VALID_STATES = Object.freeze([
    'IDLE', 'DIRECTIVE_READY', 'DISPATCHING', 'RUNNING',
    'RESULT_WAITING', 'COMPLETED', 'BLOCKED', 'FAILED', 'RETRYING'
  ]);
  const ACTIONS = Object.freeze([
    'READ_AND_EXECUTE', 'RUN_SELECTED_ROLE', 'REQUEST_STOP', 'OPEN_RESULT',
    'POST_PC_STATUS', 'BACKUP_NOW', 'RUN_GROUP', 'RETRY'
  ]);
  const STORAGE_KEY = 'yolla.command-panel.integration.v1';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
  function assert(condition, code) {
    if (!condition) {
      const error = new Error(code);
      error.code = code;
      throw error;
    }
  }
  function normalizeRoleId(value) {
    const roleId = String(value || '').trim().toUpperCase();
    assert(/^[A-Z0-9][A-Z0-9._:-]{0,63}$/.test(roleId), 'INVALID_ROLE_ID');
    return roleId;
  }
  function sanitizeContext(input) {
    const forbidden = new Set(['input','inputs','result','results','prompt','prompts','message','messages','conversation','cookies','storage','session_data','token','secret']);
    const source = input && typeof input === 'object' ? input : {};
    return Object.freeze(Object.fromEntries(Object.entries(source).filter(([key]) => !forbidden.has(String(key).toLowerCase()))));
  }
  function validatePointer(pointer, label) {
    assert(pointer && typeof pointer === 'object', `${label}_MISSING`);
    assert(nonEmpty(pointer.repository) && Number.isInteger(pointer.pr_number), `${label}_AUTHORITY_INVALID`);
    assert(Number.isInteger(pointer.comment_id) && pointer.comment_id > 0, `${label}_COMMENT_INVALID`);
    assert(nonEmpty(pointer.directive_id), `${label}_DIRECTIVE_INVALID`);
    return pointer;
  }
  function validateRole(role) {
    assert(role && typeof role === 'object', 'ROLE_REQUIRED');
    const roleId = normalizeRoleId(role.role_id);
    assert(nonEmpty(role.worker_window_id), 'WORKER_WINDOW_ID_REQUIRED');
    assert(VALID_STATES.includes(role.current_status), 'INVALID_ROLE_STATUS');
    if (!['IDLE'].includes(role.current_status)) assert(role.latest_directive_pointer || role.latest_result_pointer, 'ROLE_EVIDENCE_REQUIRED');
    if (role.latest_directive_pointer) validatePointer(role.latest_directive_pointer, 'DIRECTIVE_POINTER');
    return { ...clone(role), role_id: roleId };
  }
  function createRegistry(roles) {
    const items = (roles || []).map(validateRole);
    const ids = new Set(); const windows = new Set();
    for (const role of items) {
      assert(!ids.has(role.role_id), 'DUPLICATE_ROLE_ID');
      assert(!windows.has(role.worker_window_id), 'DUPLICATE_WORKER_WINDOW_ID');
      ids.add(role.role_id); windows.add(role.worker_window_id);
    }
    return Object.freeze(items);
  }
  function selectRole(registry, roleIdInput) {
    const roleId = normalizeRoleId(roleIdInput);
    const role = registry.find((item) => item.role_id === roleId);
    assert(role, 'ROLE_NOT_FOUND');
    return clone(role);
  }
  function buildDirectiveCard(role) {
    const pointer = validatePointer(role.latest_directive_pointer, 'DIRECTIVE_POINTER');
    return {
      card_type: 'DIRECTIVE', badge: 'LIVE', role_id: role.role_id,
      repository: pointer.repository, pr_number: pointer.pr_number,
      comment_id: pointer.comment_id, directive_id: pointer.directive_id,
      cycle_id: pointer.cycle_id, assignment_id: pointer.assignment_id,
      status: role.current_status, selection_reason: pointer.selection_reason,
      open_post_url: `https://github.com/${pointer.repository}/pull/${pointer.pr_number}#issuecomment-${pointer.comment_id}`
    };
  }
  function buildResultCard(role) {
    const result = role.latest_result_pointer;
    if (!result) return null;
    const decision = String(result.decision || 'UNKNOWN').toUpperCase();
    const evidenceOk = nonEmpty(result.remote_head) && Number.isInteger(result.comment_id);
    const contradictory = Boolean(decision === 'PASS' && (result.blocker || !evidenceOk));
    return {
      card_type: 'RESULT', badge: 'LIVE', role_id: role.role_id,
      decision, display_decision: contradictory ? 'UNVERIFIED' : decision,
      terminal: result.terminal || 'UNKNOWN', remote_head: result.remote_head || null,
      blocker: result.blocker || null, output_pointer: result.output_pointer || null,
      unsupported_pass_suppressed: contradictory,
      open_result_post_url: result.comment_id
        ? `https://github.com/${result.repository}/pull/${result.pr_number}#issuecomment-${result.comment_id}`
        : null
    };
  }
  function admitDirectivePackage(role, packageInput) {
    const pointer = validatePointer(role.latest_directive_pointer, 'DIRECTIVE_POINTER');
    const pkg = packageInput && typeof packageInput === 'object' ? packageInput : {};
    assert(pkg.directive_id === pointer.directive_id, 'DIRECTIVE_ID_MISMATCH');
    assert(pkg.cycle_id === pointer.cycle_id, 'CYCLE_ID_MISMATCH');
    assert(pkg.assignment_id === pointer.assignment_id, 'ASSIGNMENT_ID_MISMATCH');
    assert(pkg.cancelled !== true, 'DIRECTIVE_CANCELLED');
    assert(pkg.ambiguous !== true, 'DIRECTIVE_AMBIGUOUS');
    return Object.freeze(clone(pkg));
  }
  function createDispatchPlan(role, actionInput, packageInput) {
    const action = String(actionInput || '').toUpperCase();
    assert(ACTIONS.includes(action), 'UNSUPPORTED_ACTION');
    const pkg = admitDirectivePackage(role, packageInput);
    return Object.freeze({
      schema_version: 'COMMAND_PANEL_DISPATCH_PLAN_V1', action,
      role_id: role.role_id, worker_window_id: role.worker_window_id,
      browser_session_id: role.browser_session_id || null,
      directive_id: pkg.directive_id, cycle_id: pkg.cycle_id,
      assignment_id: pkg.assignment_id, exact_package: pkg,
      prompt_text_body: null, transport: 'EXISTING_SF_API_STAGE4'
    });
  }
  async function dispatchWithExistingTransport(plan, sfApi) {
    assert(sfApi && sfApi.stage4 && typeof sfApi.stage4.dispatchNextPrompt === 'function', 'EXISTING_TRANSPORT_UNAVAILABLE');
    return sfApi.stage4.dispatchNextPrompt(plan);
  }
  function transition(state, next) {
    assert(VALID_STATES.includes(state) && VALID_STATES.includes(next), 'INVALID_STATE');
    const allowed = {
      IDLE: ['DIRECTIVE_READY'], DIRECTIVE_READY: ['DISPATCHING'],
      DISPATCHING: ['RUNNING','BLOCKED','FAILED'], RUNNING: ['RESULT_WAITING','BLOCKED','FAILED'],
      RESULT_WAITING: ['COMPLETED','BLOCKED','FAILED'], BLOCKED: ['RETRYING'],
      FAILED: ['RETRYING'], RETRYING: ['DISPATCHING'], COMPLETED: ['DIRECTIVE_READY']
    };
    assert((allowed[state] || []).includes(next), 'INVALID_STATE_TRANSITION');
    return next;
  }
  function buildStatePointer(role, state, binding, sequence) {
    assert(VALID_STATES.includes(state), 'INVALID_STATE');
    assert(binding && binding.role_id === role.role_id, 'BINDING_ROLE_MISMATCH');
    return Object.freeze({
      schema_version: 'COMMAND_PANEL_STATE_POINTER_V1', sequence,
      role_id: role.role_id, state, worker_window_id: binding.worker_window_id,
      browser_session_id: binding.browser_session_id,
      directive_id: role.latest_directive_pointer && role.latest_directive_pointer.directive_id,
      saved_at: new Date(0).toISOString()
    });
  }
  function persistState(storage, pointer) {
    assert(storage && typeof storage.setItem === 'function', 'STORAGE_UNAVAILABLE');
    storage.setItem(STORAGE_KEY, JSON.stringify(pointer)); return pointer;
  }
  function recoverState(storage, registry, bindings) {
    assert(storage && typeof storage.getItem === 'function', 'STORAGE_UNAVAILABLE');
    const raw = storage.getItem(STORAGE_KEY); assert(raw, 'STATE_POINTER_MISSING');
    const pointer = JSON.parse(raw);
    const role = selectRole(registry, pointer.role_id);
    const binding = (bindings || []).find((item) => item.role_id === role.role_id);
    assert(binding, 'BINDING_NOT_RECOVERABLE');
    assert(binding.worker_window_id === pointer.worker_window_id, 'WINDOW_POINTER_MISMATCH');
    assert(binding.browser_session_id === pointer.browser_session_id, 'SESSION_POINTER_MISMATCH');
    return Object.freeze({ role, binding: clone(binding), pointer });
  }
  function renderCards(role) { return { directive: buildDirectiveCard(role), result: buildResultCard(role) }; }
  return Object.freeze({
    VALID_STATES, ACTIONS, STORAGE_KEY, sanitizeContext, createRegistry, selectRole,
    buildDirectiveCard, buildResultCard, admitDirectivePackage, createDispatchPlan,
    dispatchWithExistingTransport, transition, buildStatePointer, persistState,
    recoverState, renderCards
  });
}));
