'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  C4_ACCEPTED_AUTHORITY,
  RoleSelectionContextError,
  buildRoleSelectionContext,
  toC4DirectivePackage,
  toC4ResultPackage,
  sanitizeContext,
  buildC6Handoff
} = require('./roleSelectionCardHandoffV2');

const directivePointer = {
  repository: 'anbin1900-crypto/yolla-real-estate-data-engine',
  pr_number: 168,
  comment_id: 5155839489,
  directive_id: 'C1-TO-C2-ROLE-SELECTION-CARD-HANDOFF-V2-20260802-001',
  cycle_id: 'COMMAND-PANEL-CYCLE2-20260802',
  assignment_id: 'C2-ROLE-SELECTION-CARD-HANDOFF',
  source_time: '2026-08-02T06:20:00Z',
  selection_reason: 'latest valid C-2 Cycle 2 directive'
};

const registry = {
  roles: [
    {
      role_id: 'C-2',
      group_id: 'C_GROUP',
      role_type: 'WORKER',
      current_status: 'DIRECTIVE_READY',
      latest_directive_pointer: directivePointer
    },
    {
      role_id: 'C-3',
      group_id: 'C_GROUP',
      role_type: 'WORKER',
      current_status: 'IDLE',
      latest_directive_pointer: null
    }
  ]
};

const currentResult = {
  role_id: 'C-2',
  repository: directivePointer.repository,
  pr_number: directivePointer.pr_number,
  directive_id: directivePointer.directive_id,
  result_comment_id: 5156000001,
  remote_head: 'a'.repeat(40),
  output_pointer: 'command-panel-v1/c2-role-registry-menu/integration-handoff-v2/C2_CYCLE2_FINAL_REPORT.json',
  blocker: null,
  terminal: 'C2_ROLE_SELECTION_CARD_HANDOFF_PASS',
  decision: 'PASS',
  completed_at: '2026-08-02T06:40:00Z'
};

test('ROLE_SELECTION_CONTEXT preserves all exact fields', () => {
  const context = buildRoleSelectionContext({ registry, selectedRoleId: 'C-2', resultEvidence: currentResult });
  assert.deepEqual(sanitizeContext(context), {
    schema_version: 'ROLE_SELECTION_CONTEXT_V2',
    role_id: 'C-2', group_id: 'C_GROUP', role_type: 'WORKER', status: 'DIRECTIVE_READY',
    repository: directivePointer.repository, pr_number: 168, comment_id: 5155839489,
    directive_id: directivePointer.directive_id, cycle_id: directivePointer.cycle_id,
    assignment_id: directivePointer.assignment_id, source_time: directivePointer.source_time,
    selection_reason: directivePointer.selection_reason, result_comment_id: 5156000001,
    remote_head: 'a'.repeat(40), output_pointer: currentResult.output_pointer, blocker: null
  });
});

test('C4 directive package preserves exact C4 input fields', () => {
  const context = buildRoleSelectionContext({ registry, selectedRoleId: 'C-2' });
  const input = toC4DirectivePackage(context, { fixture: true });
  assert.equal(input.role_id, 'C-2');
  assert.equal(input.comment_id, 5155839489);
  assert.equal(input.assignment_id, directivePointer.assignment_id);
  assert.equal(input.fixture, true);
});

test('C4 result package is generated only for matching current result', () => {
  const context = buildRoleSelectionContext({ registry, selectedRoleId: 'C-2', resultEvidence: currentResult });
  const result = toC4ResultPackage(context, { fixture: true });
  assert.equal(result.result_for_directive_id, directivePointer.directive_id);
  assert.equal(result.result_comment_id, 5156000001);
  assert.equal(result.decision, 'PASS');
});

test('missing current result returns null result package', () => {
  const context = buildRoleSelectionContext({ registry, selectedRoleId: 'C-2' });
  assert.equal(toC4ResultPackage(context), null);
});

test('UNKNOWN_ROLE_REJECT', () => {
  assert.throws(
    () => buildRoleSelectionContext({ registry, selectedRoleId: 'C-9' }),
    (error) => error instanceof RoleSelectionContextError && error.code === 'UNKNOWN_ROLE'
  );
});

test('MISSING_DIRECTIVE_POINTER_REJECT', () => {
  assert.throws(
    () => buildRoleSelectionContext({ registry, selectedRoleId: 'C-3' }),
    (error) => error instanceof RoleSelectionContextError && error.code === 'MISSING_DIRECTIVE_POINTER'
  );
});

test('CROSS_ROLE_RESULT_LEAK=0', () => {
  assert.throws(
    () => buildRoleSelectionContext({ registry, selectedRoleId: 'C-2', resultEvidence: { ...currentResult, role_id: 'C-3' } }),
    (error) => error instanceof RoleSelectionContextError && error.code === 'CROSS_ROLE_RESULT_LEAK'
  );
});

test('cross-directive result is rejected', () => {
  assert.throws(
    () => buildRoleSelectionContext({ registry, selectedRoleId: 'C-2', resultEvidence: { ...currentResult, directive_id: 'OTHER' } }),
    (error) => error instanceof RoleSelectionContextError && error.code === 'CROSS_DIRECTIVE_RESULT_LEAK'
  );
});

test('PASS with blocker is rejected', () => {
  assert.throws(
    () => buildRoleSelectionContext({ registry, selectedRoleId: 'C-2', resultEvidence: { ...currentResult, blocker: 'unexpected' } }),
    (error) => error instanceof RoleSelectionContextError && error.code === 'CONTRADICTORY_PASS'
  );
});

test('C4 exact authority binding is unchanged', () => {
  assert.equal(C4_ACCEPTED_AUTHORITY.head, 'af6e56ec11104f70e03891812e9237f5937a0fc9');
  assert.equal(C4_ACCEPTED_AUTHORITY.contracts.exact_directive.blob, '1b5dd1337b737b03bdb18fd18914337a57a5303a');
  assert.equal(C4_ACCEPTED_AUTHORITY.contracts.exact_result.blob, '104d4817878db5eb932652e4cde872ad300231d1');
});

test('C6 handoff binds exact C4 authority and artifact paths', () => {
  const handoff = buildC6Handoff({
    contextContractPath: 'integration-handoff-v2/ROLE_SELECTION_CONTEXT_CONTRACT_V2.json',
    bindingMatrixPath: 'integration-handoff-v2/ROLE_TO_CARD_BINDING_MATRIX_V2.json',
    c4AcceptancePath: 'integration-handoff-v2/C4_CARD_CONTRACT_ACCEPTANCE_V2.json',
    testResultPath: 'integration-handoff-v2/ROLE_SELECTION_HANDOFF_TEST_RESULT_V2.json',
    sourceHead: 'b'.repeat(40)
  });
  assert.equal(handoff.consumer, 'C-6');
  assert.equal(handoff.c4_authority.head, C4_ACCEPTED_AUTHORITY.head);
  assert.ok(handoff.integration_rules.includes('DO_NOT_COPY_C4_SOURCE'));
});
