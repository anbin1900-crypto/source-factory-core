'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const gate = require('../automationDuplicatePromptGate');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/THREE_SPECIALIST_SERVICE_PAYLOADS.json'), 'utf8'));
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log('PASS', name); }

const wave1 = {
  role_id: 'C-5',
  directive_id: 'C1-TO-C5-WAVE1-CLOSURE-RECEIPT-V1-20260802-001',
  wave_id: 'WAVE_1',
  directive_registered_at_kst: '2026-08-02 18:03 KST',
  platform_id: 'AI_YOLLA',
  service_id: 'AUTOMATION',
  domain_pack_id: 'COMMAND_PANEL_CORE',
  result_comment: 5156846454,
  result_accepted: false,
  decision: 'ACCEPT'
};
wave1.duplicate_key = gate.duplicateKey(wave1);

const wave2 = {
  role_id: 'C-5',
  directive_id: 'C1-TO-C5-AI-YOLLA-AUTOMATION-DUPLICATE-GATE-WAVE2-V1-20260802-001',
  wave_id: 'WAVE_2',
  directive_registered_at_kst: '2026-08-02 18:03 KST',
  platform_id: 'AI_YOLLA',
  service_id: 'AUTOMATION',
  domain_pack_id: 'COMMAND_PANEL_CORE'
};

function decision(prompt, ledger) { return gate.evaluatePrompt(prompt, { ledger }).decision; }

test('wave parser accepts WAVE_2', () => assert.strictEqual(gate.parseWaveNumber('WAVE_2'), 2));
test('KST minute parser accepts canonical time', () => assert.strictEqual(gate.normalizeKstMinute('2026-08-02 18:03 KST').canonical, '2026-08-02 18:03 KST'));
test('duplicate key is deterministic', () => assert.strictEqual(gate.duplicateKey(wave2), gate.duplicateKey({...wave2})));
test('wave1 duplicate key matches authority', () => assert.strictEqual(gate.duplicateKey(wave1), 'aea4ff861c94b6c948fe57bcc5ec1d735c80003044dd20692c9dcfe3cf8da88e'));
test('wave2 duplicate key matches authority', () => assert.strictEqual(gate.duplicateKey(wave2), 'a3d37b27a6f6af60032d45104ab68481504949e0cd90703562e89a211e6cbb70'));
test('wave2 accepted with wave1 result comment', () => assert.strictEqual(decision(wave2, [wave1]), 'ACCEPT'));
test('duplicate prompt rejected', () => assert.strictEqual(decision(wave2, [wave1, {...wave2, duplicate_key:gate.duplicateKey(wave2)}]), 'REJECT_DUPLICATE'));
test('already accepted directive replay rejected', () => assert.strictEqual(decision({...wave2,wave_id:'WAVE_3',directive_registered_at_kst:'2026-08-02 18:10 KST'}, [wave1, {...wave2,result_accepted:true,result_comment:5157000000}]), 'REJECT_ALREADY_ACCEPTED'));
test('stale wave rejected', () => assert.strictEqual(decision({...wave2,wave_id:'WAVE_1'}, [{...wave1,wave_id:'WAVE_3',directive_id:'OTHER'}]), 'REJECT_STALE_WAVE'));
test('same wave different time requires supersession', () => assert.strictEqual(decision({...wave2,directive_registered_at_kst:'2026-08-02 18:04 KST'}, [wave1, wave2]), 'REQUIRE_SUPERSESSION_POINTER'));
test('same wave different time accepts exact supersession pointer', () => {
  const prior={...wave2,duplicate_key:gate.duplicateKey(wave2)};
  const next={...wave2,directive_registered_at_kst:'2026-08-02 18:04 KST',supersession_pointer:prior.duplicate_key};
  assert.strictEqual(decision(next, [wave1, prior]), 'ACCEPT');
});
test('wrong supersession pointer rejected', () => assert.strictEqual(decision({...wave2,directive_registered_at_kst:'2026-08-02 18:04 KST',supersession_pointer:'bad'}, [wave1, wave2]), 'REQUIRE_SUPERSESSION_POINTER'));
test('missing time fails closed', () => assert.strictEqual(decision({...wave2,directive_registered_at_kst:''}, [wave1]), 'FAIL_CLOSED'));
test('invalid time fails closed', () => assert.strictEqual(decision({...wave2,directive_registered_at_kst:'2026-08-02T18:03'}, [wave1]), 'FAIL_CLOSED'));
test('missing wave fails closed', () => assert.strictEqual(decision({...wave2,wave_id:''}, [wave1]), 'FAIL_CLOSED'));
test('next wave without previous result rejected', () => assert.strictEqual(decision({...wave2,wave_id:'WAVE_3',directive_id:'NEXT'}, [{...wave2,directive_id:'PRIOR',result_comment:null}]), 'REJECT_PREVIOUS_WAVE_RESULT_REQUIRED'));
test('next wave with explicit rework authority accepted', () => assert.strictEqual(decision({...wave2,wave_id:'WAVE_3',directive_id:'NEXT',rework_authority:'C1-REWORK-001'}, [{...wave2,directive_id:'PRIOR',result_comment:null}]), 'ACCEPT'));
test('three specialist payload identities preserved', () => {
  const output=gate.preserveSpecialistPayloads(fixtures.services);
  assert.strictEqual(output.length,3);
  output.forEach((item,index)=>{
    assert.strictEqual(item.platform_id,fixtures.services[index].platform_id);
    assert.strictEqual(item.service_id,fixtures.services[index].service_id);
    assert.strictEqual(item.domain_pack_id,fixtures.services[index].domain_pack_id);
  });
});
test('accepted plan never auto creates next wave', () => assert.strictEqual(gate.evaluatePrompt(wave2,{ledger:[wave1]}).auto_next_wave_created,false));
test('accepted plan composes no prompt manually', () => assert.strictEqual(gate.evaluatePrompt(wave2,{ledger:[wave1]}).manual_prompt_composition_count,0));
test('gate performs no actual dispatch', () => assert.strictEqual(gate.evaluatePrompt(wave2,{ledger:[wave1]}).actual_dispatch_performed,false));
test('payload identity is returned exactly', () => assert.deepStrictEqual(gate.evaluatePrompt(wave2,{ledger:[wave1]}).payload_identity,{platform_id:'AI_YOLLA',service_id:'AUTOMATION',domain_pack_id:'COMMAND_PANEL_CORE'}));

console.log(`PASS_${passed}_OF_${passed}`);
