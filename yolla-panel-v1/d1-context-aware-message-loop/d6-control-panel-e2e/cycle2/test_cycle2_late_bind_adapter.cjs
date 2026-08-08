'use strict';
const assert = require('node:assert/strict');
const {buildCycle2Projection} = require('./cycle2_late_bind_adapter.cjs');
const target='D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE2-20260808-001';
const base={
 cycle_id:target,
 current_command:'C2-W6-D2-D4-D5-PARTIAL-LIVE-INTEGRATION-V1-20260808-001',
 d2:{role:'D-2',comment_id:5218844105,cycle_id:'D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE1-20260807-001',terminal:'ACTIVE_CONTEXT_IDENTIFICATION_LIVE_BLOCKED',blocker:'PC_EXECUTOR_V2_COMMAND_CLAIM_LOOP_STALLED',observed_at:'2026-08-07T15:18:29Z',retry_count:0,context_id:null,context_name:null,page_id:null},
 d4:{role:'D-4',comment_id:5218697598,cycle_id:'D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE1-20260807-001',terminal:'CHROME_REPLY_COMPLETION_LIVE_BLOCKED_BROWSER_AGENT_AND_CDP_UNREACHABLE_CURRENT_ENVIRONMENT',blocker:'TARGET_PC_BROWSER_AGENT_ROUTE_UNAVAILABLE',observed_at:'2026-08-07T15:05:11Z',retry_count:0,live_pass:false,observer_state:null},
 d5:{role:'D-5',comment_id:5218604257,cycle_id:'D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE1-20260807-001',terminal:'EVENT_LOG_RESTART_AND_IMPROVEMENT_METRICS_PASS',observed_at:'2026-08-07T14:56:09Z',retry_count:0,live_ingestion_pass:false}
};
let r=buildCycle2Projection(base);
assert.equal(r.acceptance,'BLOCKED_EXTERNAL_CONFIRMED');
assert.equal(r.panel.status,'BLOCKED_EXTERNAL');
assert.equal(r.panel.context_id,null);
assert.equal(r.synthetic_completed_count,0);
assert.equal(r.panel_field_count,11);
assert.deepEqual(r.remaining_e2e_gaps,['TARGET_PC_EXECUTION_BOUNDARY','D3_DISPATCH']);
assert.equal(r.d5_cycle2_late_bind_pending,true);

r=buildCycle2Projection({...base,
 dispatch_receipt:{accepted:true},
 d2:{...base.d2,cycle_id:target,context_id:'ctx-1',context_name:'D-2',page_id:'page-1'},
 d4:{...base.d4,cycle_id:target,live_pass:true,observer_state:'WORKING'},
 d5:{...base.d5,cycle_id:target,live_ingestion_pass:true}
});
assert.equal(r.acceptance,'PASS');
assert.equal(r.panel.status,'WORKING');
assert.equal(r.remaining_e2e_gaps.length,0);
assert.equal(r.cycle2_receipt_count,3);
console.log('PASS_12_ASSERTIONS');
