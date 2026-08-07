'use strict';
const assert = require('node:assert/strict');
const { CRuntimeStateMachine, STATES } = require('../c_mode_runtime.cjs');
const workers = ['W1','W2','W3','W4','W5','W6'];
const receipts = ['COMMANDER', ...workers];
const t0 = '2026-08-05T08:00:00.000Z';
const at = m => new Date(Date.parse(t0)+m*60000).toISOString();
let passed=0;
function test(name, fn){ fn(); passed++; console.log(`PASS ${name}`); }

test('IDLE to START requires exactly 7 unique receipts',()=>{const r=new CRuntimeStateMachine();assert.equal(r.state,STATES.IDLE);assert.throws(()=>r.start(receipts.slice(0,6)),/7_UNIQUE/);assert.equal(r.start(receipts),STATES.START)});
test('same wave registers exactly 6 workers',()=>{const r=new CRuntimeStateMachine();r.start(receipts);assert.throws(()=>r.registerWave('WAVE-1',workers.slice(0,5),t0),/6_UNIQUE/);assert.deepEqual(r.registerWave('WAVE-1',workers,t0).workers,workers)});
test('20m missing 0 advances',()=>{const r=new CRuntimeStateMachine();r.start(receipts);r.registerWave('W',workers,t0);workers.forEach((w,i)=>r.report(w,'REPORTED',i));assert.equal(r.evaluate20Minutes(at(20)).action,'ADVANCE_WAVE')});
test('20m missing 1-2 retries missing only',()=>{const r=new CRuntimeStateMachine();r.start(receipts);r.registerWave('W',workers,t0);workers.slice(0,4).forEach((w,i)=>r.report(w,'REPORTED',i));assert.deepEqual(r.evaluate20Minutes(at(20)),{action:'RETRY_MISSING_ONLY',missing:['W5','W6']})});
test('20m missing >=3 pauses and escalates',()=>{const r=new CRuntimeStateMachine();r.start(receipts);r.registerWave('W',workers,t0);workers.slice(0,3).forEach((w,i)=>r.report(w,'REPORTED',i));assert.equal(r.evaluate20Minutes(at(20)).action,'PAUSE_AND_ESCALATE')});
test('90m assigns exactly 2 external assistants',()=>{const r=new CRuntimeStateMachine();r.start(receipts);r.registerWave('W',workers,t0);const x=r.evaluate90Minutes(at(90),['W1','A1','A1','A2','A3']);assert.deepEqual(x.assistants,['A1','A2'])});
test('four explicit publication requests replace worker once',()=>{const r=new CRuntimeStateMachine();let x;for(let i=0;i<4;i++)x=r.requestPublication('W2');assert.equal(x.action,'REPLACE_WORKER');assert.equal(r.requestPublication('W2').action,'REQUEST_PUBLICATION');assert.equal(r.replacements.size,1)});
test('progress is monotonic',()=>{const r=new CRuntimeStateMachine();r.start(receipts);r.registerWave('W',workers,t0);r.report('W1','REPORTED',10);assert.throws(()=>r.report('W2','REPORTED',9),/MONOTONIC/);r.report('W2','REPORTED',10)});
test('pause and resume restores active state',()=>{const r=new CRuntimeStateMachine();r.start(receipts);r.registerWave('W',workers,t0);r.pause();assert.equal(r.state,STATES.PAUSED);r.resume();assert.equal(r.state,STATES.RUNNING)});
test('restart snapshot restores exact state',()=>{const r=new CRuntimeStateMachine();r.start(receipts);r.registerWave('W',workers,t0);r.report('W1','REPORTED',25);r.pause();const rr=new CRuntimeStateMachine(r.snapshot());assert.deepEqual(rr.snapshot(),r.snapshot());rr.resume();assert.equal(rr.state,STATES.RUNNING)});
test('END can reactivate through START',()=>{const r=new CRuntimeStateMachine();r.start(receipts);r.end();assert.equal(r.state,STATES.END);assert.equal(r.start(receipts),STATES.START)});
test('early timing evaluation is rejected',()=>{const r=new CRuntimeStateMachine();r.start(receipts);r.registerWave('W',workers,t0);assert.throws(()=>r.evaluate20Minutes(at(19)),/WAIT_20/);assert.throws(()=>r.evaluate90Minutes(at(89),['A1','A2']),/WAIT_90/)});
console.log(`RESULT PASS ${passed}/12`);
