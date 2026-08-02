'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('./commandPanelIntegrationRuntime');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'integrationFixture.json'), 'utf8'));

function pkg(role) {
  const p = role.latest_directive_pointer;
  return { directive_id:p.directive_id, cycle_id:p.cycle_id, assignment_id:p.assignment_id, cancelled:false, ambiguous:false, payload:{safe:true} };
}
function storage() { const map = new Map(); return { setItem:(k,v)=>map.set(k,v), getItem:(k)=>map.get(k)||null }; }

for (const roleId of ['A-2','B-1','C-1']) {
  test(`${roleId} menu to window to directive to dispatch to result card`, async () => {
    const registry = core.createRegistry(fixture.roles);
    const role = core.selectRole(registry, roleId);
    const binding = fixture.bindings.find((item) => item.role_id === roleId);
    assert.equal(binding.worker_window_id, role.worker_window_id);
    const cards = core.renderCards(role);
    assert.equal(cards.directive.role_id, roleId);
    const plan = core.createDispatchPlan(role, 'READ_AND_EXECUTE', pkg(role));
    assert.equal(plan.transport, 'EXISTING_SF_API_STAGE4');
    assert.equal(plan.prompt_text_body, null);
    const calls = [];
    const result = await core.dispatchWithExistingTransport(plan, { stage4:{ dispatchNextPrompt: async (value) => { calls.push(value); return { accepted:true, receipt_id:`receipt-${roleId}` }; } } });
    assert.equal(calls.length, 1);
    assert.equal(result.accepted, true);
    if (role.latest_result_pointer) assert.ok(cards.result.display_decision);
  });
}

test('duplicate role and window identities fail closed', () => {
  const roles = [...fixture.roles, { ...fixture.roles[0], role_id:'D-1' }];
  assert.throws(() => core.createRegistry(roles), /DUPLICATE_WORKER_WINDOW_ID/);
});
test('directive, cycle and assignment mismatches fail closed', () => {
  const registry = core.createRegistry(fixture.roles); const role = core.selectRole(registry, 'A-2');
  assert.throws(() => core.createDispatchPlan(role, 'READ_AND_EXECUTE', { ...pkg(role), directive_id:'wrong' }), /DIRECTIVE_ID_MISMATCH/);
  assert.throws(() => core.createDispatchPlan(role, 'READ_AND_EXECUTE', { ...pkg(role), cycle_id:'wrong' }), /CYCLE_ID_MISMATCH/);
  assert.throws(() => core.createDispatchPlan(role, 'READ_AND_EXECUTE', { ...pkg(role), assignment_id:'wrong' }), /ASSIGNMENT_ID_MISMATCH/);
});
test('cancelled and ambiguous directives fail closed', () => {
  const registry = core.createRegistry(fixture.roles); const role = core.selectRole(registry, 'B-1');
  assert.throws(() => core.createDispatchPlan(role, 'READ_AND_EXECUTE', { ...pkg(role), cancelled:true }), /DIRECTIVE_CANCELLED/);
  assert.throws(() => core.createDispatchPlan(role, 'READ_AND_EXECUTE', { ...pkg(role), ambiguous:true }), /DIRECTIVE_AMBIGUOUS/);
});
test('unsupported PASS is suppressed', () => {
  const role = { ...fixture.roles[0], latest_result_pointer:{...fixture.roles[0].latest_result_pointer, decision:'PASS', remote_head:null, blocker:'still blocked'} };
  const registry = core.createRegistry([role]); const card = core.buildResultCard(registry[0]);
  assert.equal(card.display_decision, 'UNVERIFIED'); assert.equal(card.unsupported_pass_suppressed, true);
});
test('restart recovers role window and state pointer', () => {
  const registry = core.createRegistry(fixture.roles); const role = core.selectRole(registry, 'C-1');
  const binding = fixture.bindings.find((item)=>item.role_id==='C-1'); const store = storage();
  const pointer = core.buildStatePointer(role, 'RESULT_WAITING', binding, 1); core.persistState(store, pointer);
  const recovered = core.recoverState(store, registry, fixture.bindings);
  assert.equal(recovered.role.role_id, 'C-1'); assert.equal(recovered.pointer.state, 'RESULT_WAITING');
});
test('restart fails closed on window/session mismatch', () => {
  const registry = core.createRegistry(fixture.roles); const role = core.selectRole(registry, 'A-2'); const store = storage();
  core.persistState(store, core.buildStatePointer(role, 'RUNNING', fixture.bindings[0], 2));
  assert.throws(() => core.recoverState(store, registry, [{...fixture.bindings[0],browser_session_id:'changed'}]), /SESSION_POINTER_MISMATCH/);
});
test('state machine supports blocked retry and rejects invalid transitions', () => {
  assert.equal(core.transition('BLOCKED','RETRYING'), 'RETRYING');
  assert.equal(core.transition('RETRYING','DISPATCHING'), 'DISPATCHING');
  assert.throws(() => core.transition('IDLE','COMPLETED'), /INVALID_STATE_TRANSITION/);
});
test('role context sanitizer rejects cross-role sensitive payload', () => {
  const value = core.sanitizeContext({ role_id:'A-2', token:'bad', prompt:'bad', safe:'ok' });
  assert.deepEqual(value, { role_id:'A-2', safe:'ok' });
});
