'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const gate = require('../runtimeEnvironmentAdmissionGate');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/RUNTIME_ADMISSION_FIXTURES.json'), 'utf8'));
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log('PASS', name); }

function evaluate(overrides = {}) {
  return gate.evaluateRuntimeAdmission({
    now_kst: fixtures.now_kst,
    runtime_authority: fixtures.runtime_authority,
    context_snapshot: fixtures.fresh_context,
    prompt: fixtures.prompt,
    ledger: fixtures.ledger,
    ...overrides
  });
}

test('A1 runtime authority exact binding passes', () => {
  assert.deepStrictEqual(gate.exactAuthorityFindings(gate.normalizeAuthority(fixtures.runtime_authority)), []);
});
test('wave3 duplicate key matches directive authority', () => {
  assert.strictEqual(gate.duplicatePromptKey(fixtures.prompt), fixtures.prompt.duplicate_prompt_key);
});
test('fresh context admits runtime dispatch plan', () => {
  const result = evaluate();
  assert.strictEqual(result.admitted, true);
  assert.strictEqual(result.decision, 'ADMIT_RUNTIME_DISPATCH');
  assert.strictEqual(result.dispatch_contract.actual_dispatch_performed, false);
});
test('missing A1 authority rejects runtime unverified', () => {
  assert.strictEqual(evaluate({runtime_authority:{}}).decision, 'REJECT_RUNTIME_UNVERIFIED');
});
test('A1 target PC false rejects runtime unverified', () => {
  assert.strictEqual(evaluate({runtime_authority:{...fixtures.runtime_authority,target_pc_accepted:false}}).decision, 'REJECT_RUNTIME_UNVERIFIED');
});
test('stale context rejects', () => {
  assert.strictEqual(evaluate({context_snapshot:fixtures.stale_context}).decision, 'REJECT_STALE_PC_CONTEXT');
});
test('missing context rejects', () => {
  assert.strictEqual(evaluate({context_snapshot:{}}).decision, 'REJECT_STALE_PC_CONTEXT');
});
test('future captured context rejects', () => {
  const context={...fixtures.fresh_context,captured_at_kst:'2026-08-02 19:21 KST'};
  assert.strictEqual(evaluate({context_snapshot:context}).decision, 'REJECT_STALE_PC_CONTEXT');
});
test('runtime version mismatch rejects', () => {
  const context={...fixtures.fresh_context,runtime_version:'1.0.0-OLD'};
  assert.strictEqual(evaluate({context_snapshot:context}).decision, 'REJECT_RUNTIME_VERSION_MISMATCH');
});
test('role mismatch rejects', () => {
  const context={...fixtures.fresh_context,role_id:'C-4'};
  assert.strictEqual(evaluate({context_snapshot:context}).decision, 'REJECT_ROLE_SERVICE_WAVE_MISMATCH');
});
test('service mismatch rejects', () => {
  const context={...fixtures.fresh_context,service_id:'REAL_ESTATE_SPECIALIST_AI'};
  assert.strictEqual(evaluate({context_snapshot:context}).decision, 'REJECT_ROLE_SERVICE_WAVE_MISMATCH');
});
test('wave mismatch rejects', () => {
  const context={...fixtures.fresh_context,wave_id:'WAVE_2'};
  assert.strictEqual(evaluate({context_snapshot:context}).decision, 'REJECT_ROLE_SERVICE_WAVE_MISMATCH');
});
test('invalid duplicate prompt key rejects', () => {
  const prompt={...fixtures.prompt,duplicate_prompt_key:'0'.repeat(64)};
  assert.strictEqual(evaluate({prompt}).decision, 'REJECT_DUPLICATE');
});
test('duplicate prompt in ledger rejects', () => {
  const ledger=fixtures.ledger.concat([{...fixtures.prompt,result_accepted:false}]);
  assert.strictEqual(evaluate({ledger}).decision, 'REJECT_DUPLICATE');
});
test('accepted result replay rejects', () => {
  const ledger=fixtures.ledger.concat([{...fixtures.prompt,duplicate_prompt_key:'different',result_accepted:true,result_comment:5157999999}]);
  assert.strictEqual(evaluate({ledger}).decision, 'REJECT_ALREADY_ACCEPTED');
});
test('older wave rejects', () => {
  const prompt={...fixtures.prompt,wave_id:'WAVE_1',duplicate_prompt_key:gate.duplicatePromptKey({...fixtures.prompt,wave_id:'WAVE_1'})};
  const context_snapshot={...fixtures.fresh_context,wave_id:'WAVE_1'};
  assert.strictEqual(evaluate({prompt,context_snapshot}).decision, 'REJECT_STALE_WAVE');
});
test('authority runtime health blocked rejects', () => {
  const runtime_authority={...fixtures.runtime_authority,runtime_health_status:'BLOCKED'};
  assert.strictEqual(evaluate({runtime_authority}).decision, 'REJECT_RUNTIME_HEALTH_BLOCKED');
});
test('context runtime health offline rejects', () => {
  const context_snapshot={...fixtures.fresh_context,runtime_health_status:'OFFLINE'};
  assert.strictEqual(evaluate({context_snapshot}).decision, 'REJECT_RUNTIME_HEALTH_BLOCKED');
});
test('sensitive token key rejects', () => {
  const prompt={...fixtures.prompt,payload:{api_token:'secret-value'}};
  assert.strictEqual(evaluate({prompt}).decision, 'REJECT_SENSITIVE_PAYLOAD');
});
test('bearer credential value rejects', () => {
  const prompt={...fixtures.prompt,payload:{header:'Bearer abcdefghijklmnopqrstuvwxyz'}};
  assert.strictEqual(evaluate({prompt}).decision, 'REJECT_SENSITIVE_PAYLOAD');
});
test('private key material rejects', () => {
  const prompt={...fixtures.prompt,payload:{document:'-----BEGIN PRIVATE KEY-----'}};
  assert.strictEqual(evaluate({prompt}).decision, 'REJECT_SENSITIVE_PAYLOAD');
});
test('missing wave fails closed', () => {
  const prompt={...fixtures.prompt,wave_id:''};
  assert.strictEqual(evaluate({prompt}).decision, 'FAIL_CLOSED');
});
test('missing registered time fails closed', () => {
  const prompt={...fixtures.prompt,directive_registered_at_kst:''};
  assert.strictEqual(evaluate({prompt}).decision, 'FAIL_CLOSED');
});
test('missing service identity fails closed', () => {
  const prompt={...fixtures.prompt,domain_pack_id:''};
  assert.strictEqual(evaluate({prompt}).decision, 'FAIL_CLOSED');
});
test('admitted result binds existing transport only', () => {
  const result=evaluate();
  assert.strictEqual(result.dispatch_contract.authority,'sfApi.stage4.dispatchNextPrompt');
  assert.strictEqual(result.dispatch_contract.new_transport_created,false);
});
test('admitted result manual prompt composition is zero', () => {
  assert.strictEqual(evaluate().dispatch_contract.manual_prompt_composition_count,0);
});
test('admitted result preserves exact service identity', () => {
  assert.deepStrictEqual(evaluate().prompt_identity.platform_id,'AI_YOLLA');
  assert.deepStrictEqual(evaluate().prompt_identity.service_id,'AUTOMATION');
  assert.deepStrictEqual(evaluate().prompt_identity.domain_pack_id,'COMMAND_PANEL_CORE');
});
test('authority pointer mismatch is recorded in fixture', () => {
  assert.strictEqual(fixtures.authority_pointer_finding.c1_declared_accepted_result_comment,5156846454);
  assert.strictEqual(fixtures.authority_pointer_finding.observed_wave2_terminal_comment,5156914530);
});

console.log(`PASS_${passed}_OF_${passed}`);
