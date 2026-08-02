'use strict';

const SHA40 = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;

const C4_ACCEPTED_AUTHORITY = Object.freeze({
  repository: 'anbin1900-crypto/source-factory-core',
  pr_number: 9,
  head: 'af6e56ec11104f70e03891812e9237f5937a0fc9',
  contracts: Object.freeze({
    exact_directive: Object.freeze({
      path: 'command-panel-v1/c4-directive-result-state-cards/EXACT_DIRECTIVE_CARD_CONTRACT.json',
      blob: '1b5dd1337b737b03bdb18fd18914337a57a5303a'
    }),
    exact_result: Object.freeze({
      path: 'command-panel-v1/c4-directive-result-state-cards/EXACT_RESULT_CARD_CONTRACT.json',
      blob: '104d4817878db5eb932652e4cde872ad300231d1'
    }),
    renderer: Object.freeze({
      path: 'command-panel-v1/c4-directive-result-state-cards/directiveResultStateCards.js',
      blob: '82a14c89f0d4f0ce2db55ea6da35cb00d23f846a'
    }),
    final_report: Object.freeze({
      path: 'command-panel-v1/c4-directive-result-state-cards/C4_FINAL_REPORT.json',
      blob: '8dbf72687b236cf858a36dbc11e7ce734c590ba2'
    })
  })
});

class RoleSelectionContextError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RoleSelectionContextError';
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireCondition(condition, code, message, details = {}) {
  if (!condition) throw new RoleSelectionContextError(code, message, details);
}

function validatePointer(pointer, roleId) {
  requireCondition(pointer && typeof pointer === 'object' && !Array.isArray(pointer),
    'MISSING_DIRECTIVE_POINTER', `role ${roleId} has no directive pointer`, { role_id: roleId });
  const required = ['repository', 'pr_number', 'comment_id', 'directive_id', 'cycle_id', 'assignment_id', 'source_time', 'selection_reason'];
  for (const field of required) {
    requireCondition(pointer[field] !== null && pointer[field] !== undefined && pointer[field] !== '',
      'INVALID_DIRECTIVE_POINTER', `directive pointer field ${field} is missing`, { role_id: roleId, field });
  }
  requireCondition(REPOSITORY.test(pointer.repository), 'INVALID_DIRECTIVE_POINTER', 'repository must be owner/name');
  requireCondition(Number.isInteger(pointer.pr_number) && pointer.pr_number > 0, 'INVALID_DIRECTIVE_POINTER', 'pr_number must be positive');
  requireCondition(Number.isInteger(pointer.comment_id) && pointer.comment_id > 0, 'INVALID_DIRECTIVE_POINTER', 'comment_id must be positive');
  requireCondition(Number.isFinite(Date.parse(pointer.source_time)), 'INVALID_DIRECTIVE_POINTER', 'source_time must be ISO date-time');
}

function findRole(registry, roleId) {
  requireCondition(registry && Array.isArray(registry.roles), 'INVALID_REGISTRY', 'registry.roles is required');
  const role = registry.roles.find((candidate) => candidate.role_id === roleId);
  requireCondition(Boolean(role), 'UNKNOWN_ROLE', `unknown role_id: ${roleId}`, { role_id: roleId });
  return role;
}

function normalizeResultEvidence(role, pointer, resultEvidence) {
  if (resultEvidence === null || resultEvidence === undefined) {
    return { result_comment_id: null, remote_head: null, output_pointer: null, blocker: null, result_meta: null };
  }
  requireCondition(resultEvidence && typeof resultEvidence === 'object' && !Array.isArray(resultEvidence),
    'INVALID_RESULT_EVIDENCE', 'result evidence must be an object');
  requireCondition(resultEvidence.role_id === role.role_id,
    'CROSS_ROLE_RESULT_LEAK', 'result role_id differs from selected role_id', {
      selected_role_id: role.role_id,
      result_role_id: resultEvidence.role_id
    });
  requireCondition(resultEvidence.directive_id === pointer.directive_id,
    'CROSS_DIRECTIVE_RESULT_LEAK', 'result directive_id differs from selected directive_id', {
      selected_directive_id: pointer.directive_id,
      result_directive_id: resultEvidence.directive_id
    });
  requireCondition(resultEvidence.repository === pointer.repository && resultEvidence.pr_number === pointer.pr_number,
    'RESULT_AUTHORITY_MISMATCH', 'result authority differs from selected directive authority');
  requireCondition(Number.isInteger(resultEvidence.result_comment_id) && resultEvidence.result_comment_id > 0,
    'INVALID_RESULT_EVIDENCE', 'result_comment_id must be positive');
  requireCondition(SHA40.test(resultEvidence.remote_head || ''),
    'INVALID_RESULT_EVIDENCE', 'remote_head must be 40 lowercase hex');
  requireCondition(typeof resultEvidence.output_pointer === 'string' && resultEvidence.output_pointer.length > 0,
    'INVALID_RESULT_EVIDENCE', 'output_pointer is required');
  requireCondition(typeof resultEvidence.terminal === 'string' && resultEvidence.terminal.length > 0,
    'INVALID_RESULT_EVIDENCE', 'terminal is required');
  requireCondition(['PASS', 'BLOCKED', 'FAIL', 'NOT_RUN', 'UNKNOWN'].includes(resultEvidence.decision),
    'INVALID_RESULT_EVIDENCE', 'decision is unsupported');
  requireCondition(typeof resultEvidence.completed_at === 'string' && Number.isFinite(Date.parse(resultEvidence.completed_at)),
    'INVALID_RESULT_EVIDENCE', 'completed_at must be ISO date-time');
  if (resultEvidence.decision === 'PASS') {
    requireCondition(resultEvidence.blocker === null || resultEvidence.blocker === undefined || resultEvidence.blocker === '',
      'CONTRADICTORY_PASS', 'PASS result cannot carry a blocker');
  }
  return {
    result_comment_id: resultEvidence.result_comment_id,
    remote_head: resultEvidence.remote_head,
    output_pointer: resultEvidence.output_pointer,
    blocker: resultEvidence.blocker ?? null,
    result_meta: clone(resultEvidence)
  };
}

function buildRoleSelectionContext({ registry, selectedRoleId, resultEvidence = null }) {
  const role = findRole(registry, selectedRoleId);
  const pointer = role.latest_directive_pointer;
  validatePointer(pointer, role.role_id);
  const result = normalizeResultEvidence(role, pointer, resultEvidence);
  return {
    schema_version: 'ROLE_SELECTION_CONTEXT_V2',
    role_id: role.role_id,
    group_id: role.group_id,
    role_type: role.role_type,
    status: role.current_status,
    repository: pointer.repository,
    pr_number: pointer.pr_number,
    comment_id: pointer.comment_id,
    directive_id: pointer.directive_id,
    cycle_id: pointer.cycle_id,
    assignment_id: pointer.assignment_id,
    source_time: pointer.source_time,
    selection_reason: pointer.selection_reason,
    result_comment_id: result.result_comment_id,
    remote_head: result.remote_head,
    output_pointer: result.output_pointer,
    blocker: result.blocker,
    _result_meta: result.result_meta
  };
}

function toC4DirectivePackage(context, options = {}) {
  return {
    role_id: context.role_id,
    repository: context.repository,
    pr_number: context.pr_number,
    comment_id: context.comment_id,
    directive_id: context.directive_id,
    cycle_id: context.cycle_id,
    assignment_id: context.assignment_id,
    status: context.status,
    reason: options.reason ?? null,
    source_time: context.source_time,
    selection_reason: context.selection_reason,
    fixture: options.fixture === true
  };
}

function toC4ResultPackage(context, options = {}) {
  if (!context._result_meta) return null;
  const result = context._result_meta;
  return {
    repository: context.repository,
    pr_number: context.pr_number,
    result_for_directive_id: context.directive_id,
    terminal: result.terminal,
    decision: result.decision,
    remote_head: context.remote_head,
    result_comment_id: context.result_comment_id,
    output_pointer: context.output_pointer,
    blocker: context.blocker,
    completed_at: result.completed_at,
    fixture: options.fixture === true
  };
}

function sanitizeContext(context) {
  const output = clone(context);
  delete output._result_meta;
  return output;
}

function buildC6Handoff({ contextContractPath, bindingMatrixPath, c4AcceptancePath, testResultPath, sourceHead }) {
  requireCondition(SHA40.test(sourceHead), 'INVALID_HANDOFF_HEAD', 'sourceHead must be 40 lowercase hex');
  return {
    schema_version: 'C2_TO_C6_ROLE_MENU_HANDOFF_V2',
    producer: 'C-2',
    consumer: 'C-6',
    source_head: sourceHead,
    c4_authority: clone(C4_ACCEPTED_AUTHORITY),
    artifacts: {
      role_selection_context_contract: contextContractPath,
      role_to_card_binding_matrix: bindingMatrixPath,
      c4_card_contract_acceptance: c4AcceptancePath,
      role_selection_handoff_test_result: testResultPath
    },
    integration_rules: [
      'SELECT_ROLE_FROM_C2_REGISTRY_ONLY',
      'REQUIRE_EXACT_DIRECTIVE_POINTER',
      'RESULT_EVIDENCE_MUST_MATCH_SELECTED_ROLE_AND_DIRECTIVE',
      'IMPORT_C4_BY_EXACT_HEAD_AND_BLOB_REFERENCE_ONLY',
      'FAIL_CLOSED_ON_UNKNOWN_ROLE_OR_MISSING_POINTER',
      'DO_NOT_COPY_C4_SOURCE'
    ]
  };
}

module.exports = {
  C4_ACCEPTED_AUTHORITY,
  RoleSelectionContextError,
  buildRoleSelectionContext,
  toC4DirectivePackage,
  toC4ResultPackage,
  sanitizeContext,
  buildC6Handoff
};
