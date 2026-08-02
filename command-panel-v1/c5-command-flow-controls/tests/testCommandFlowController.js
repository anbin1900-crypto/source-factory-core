'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const c = require('../commandFlowController');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/COMMAND_FLOW_FIXTURES.json'), 'utf8'));
const baseDirective = fixture.directives[0];
const context = { cycleId: fixture.cycle_id, apiBindings: fixture.api_bindings, executionLedger: [], maxParallel: 5 };
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log('PASS', name); }

test('admits exact directive package', () => assert.strictEqual(c.admitDirective(baseDirective, context).admitted, true));
test('displays exact identity', () => assert.deepStrictEqual(c.admitDirective(baseDirective, context).displayedIdentity, {repository:baseDirective.repository,pr:169,commentId:5155843439,directiveId:baseDirective.directiveId,roleId:'C-5',cycleId:fixture.cycle_id}));
test('rejects cancelled directive', () => assert(c.admitDirective({...baseDirective,status:'CANCELLED'}, context).findings.includes('DIRECTIVE_NOT_ACTIVE')));
test('rejects ambiguous directive', () => assert(c.admitDirective({...baseDirective,ambiguous:true}, context).findings.includes('DIRECTIVE_AMBIGUOUS')));
test('rejects cycle mismatch', () => assert(c.admitDirective({...baseDirective,cycleId:'OLD_CYCLE'}, context).findings.includes('CYCLE_MISMATCH')));
test('rejects missing package', () => assert(c.admitDirective({...baseDirective,directivePackage:{}}, context).findings.includes('DIRECTIVE_PACKAGE_ID_MISSING')));

for (const action of [c.ACTIONS.READ_AND_EXECUTE,c.ACTIONS.RUN_SELECTED_ROLE,c.ACTIONS.REQUEST_STOP,c.ACTIONS.OPEN_RESULT,c.ACTIONS.POST_PC_STATUS,c.ACTIONS.BACKUP_NOW]) {
  test('builds plan '+action, () => {
    const result=c.buildActionPlan(action,baseDirective,context); assert.strictEqual(result.ok,true); assert.strictEqual(result.plan.planOnly,true); assert.strictEqual(result.plan.actualDispatchPerformed,false); assert.strictEqual(result.plan.manualPromptCompositionCount,0);
  });
}

test('read and execute has exact read step', () => assert.strictEqual(c.buildActionPlan(c.ACTIONS.READ_AND_EXECUTE,baseDirective,context).plan.steps[0].step,'READ_EXACT_DIRECTIVE'));
test('rejects missing api binding', () => assert(c.buildActionPlan(c.ACTIONS.BACKUP_NOW,baseDirective,{...context,apiBindings:{}}).findings.some(x=>x.startsWith('API_BINDING_MISSING_'))));
test('suppresses duplicate click', () => {
  const first=c.buildActionPlan(c.ACTIONS.READ_AND_EXECUTE,baseDirective,context); const ledger=[{idempotencyKey:first.plan.idempotencyKey,status:'RUNNING'}]; const second=c.buildActionPlan(c.ACTIONS.READ_AND_EXECUTE,baseDirective,{...context,executionLedger:ledger}); assert(second.findings.includes('DUPLICATE_DIRECTIVE_CLICK_SUPPRESSED'));
});
test('group dispatch admits exact packages in parallel', () => { const result=c.buildGroupExecutionPlan(fixture.directives,context); assert.strictEqual(result.ok,true); assert.strictEqual(result.admitted.length,2); assert.strictEqual(result.plan.parallel,true); });
test('group dispatch partially rejects cycle mismatch', () => { const result=c.buildGroupExecutionPlan([baseDirective,{...fixture.directives[1],cycleId:'OLD'}],context); assert.strictEqual(result.ok,true); assert.strictEqual(result.admitted.length,1); assert.strictEqual(result.rejected.length,1); });
test('group dispatch rejects all invalid', () => { const result=c.buildGroupExecutionPlan([{...baseDirective,status:'CANCELLED'}],context); assert.strictEqual(result.ok,false); assert(result.findings.includes('NO_ADMITTED_DIRECTIVE_PACKAGES')); });
test('happy path state flow', () => { let s=c.STATES.IDLE; for (const e of [c.EVENTS.DIRECTIVE_ADMITTED,c.EVENTS.DISPATCH_PLANNED,c.EVENTS.DISPATCH_ACCEPTED,c.EVENTS.RESULT_PENDING,c.EVENTS.RESULT_PASS]) { const r=c.transition(s,e); assert.strictEqual(r.ok,true); s=r.nextState; } assert.strictEqual(s,c.STATES.COMPLETED); });
test('blocked flow can retry', () => { let r=c.transition(c.STATES.RUNNING,c.EVENTS.RESULT_BLOCKED); assert.strictEqual(r.nextState,c.STATES.BLOCKED); r=c.transition(r.nextState,c.EVENTS.RETRY_ADMITTED); assert.strictEqual(r.nextState,c.STATES.DIRECTIVE_READY); });
test('failed flow can retry', () => { let r=c.transition(c.STATES.RESULT_WAITING,c.EVENTS.RESULT_FAILED); assert.strictEqual(r.nextState,c.STATES.FAILED); r=c.transition(r.nextState,c.EVENTS.RETRY_ADMITTED); assert.strictEqual(r.nextState,c.STATES.DIRECTIVE_READY); });
test('invalid state transition fails closed', () => assert.strictEqual(c.transition(c.STATES.IDLE,c.EVENTS.RESULT_PASS).finding,'INVALID_STATE_TRANSITION'));
test('retry requires failed or blocked predecessor', () => { const result=c.buildActionPlan(c.ACTIONS.RETRY,baseDirective,context); assert(result.findings.includes('RETRY_PREDECESSOR_MISSING')); });
test('retry plan accepted after blocked predecessor', () => { const ledger=[{directiveKey:c.directiveKey(c.normalizeDirective(baseDirective)),status:'BLOCKED',idempotencyKey:'prior'}]; const result=c.buildActionPlan(c.ACTIONS.RETRY,baseDirective,{...context,executionLedger:ledger,attempt:2}); assert.strictEqual(result.ok,true); });
test('open result rejects missing result ref', () => { const result=c.buildActionPlan(c.ACTIONS.OPEN_RESULT,{...baseDirective,resultRef:null},context); assert(result.findings.includes('RESULT_REFERENCE_MISSING')); });
test('plans never contain prompt text body', () => { const text=JSON.stringify(c.buildActionPlan(c.ACTIONS.READ_AND_EXECUTE,baseDirective,context)); assert(!text.includes('promptText')); assert(!text.includes('prompt_body')); });

console.log(`PASS_${passed}_OF_${passed}`);
