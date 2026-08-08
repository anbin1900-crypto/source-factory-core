'use strict';
const assert = require('node:assert/strict');
const { projectCycle5, PANEL_FIELDS } = require('./d6_cycle5_panel_late_bind.cjs');

const attempt = {
  command_id:'D4C2-RUN-UIA-LIVE-OBSERVER-V3-20260808-042130-001',
  started_at:'2026-08-08T04:19:53.9165713+09:00',
  completed_at:'2026-08-08T04:57:43.8793145+09:00',
  executor_receipt_status:'SUCCEEDED',
  powershell_restart_effect:'QUEUE_UNLOCKED_AND_RECEIPT_PUBLISHED',
  queue_unlocked:true,
  working_observed:true,
  live_pass_claimed:false,
  status:'BLOCKED',
  terminal:'CHROME_REPLY_COMPLETION_LIVE_BLOCKED',
  internal_failure:'D3_CHILD_RESULT_SCHEMA_MISSING_ASSISTANT_REPLY_COMPLETED',
  events:[
    {state:'DISPATCHED',reason:'D4_LIVE_FIXTURE_CHILD_STARTED'},
    {state:'WORKING',reason:'USER_MESSAGE_VISIBLE_AWAITING_REPLY'},
    {state:'ERROR',reason:'D3_CHILD_RESULT_SCHEMA_MISSING_ASSISTANT_REPLY_COMPLETED'}
  ]
};
const out=projectCycle5({d4_attempt:attempt,d5_metrics:{terminal:'D2_FRESHNESS_AND_D3_DISPATCH_EVENT_INGESTION_PASS'},context:{context_id:'ctx',context_name:'name'}});
let n=0; function ok(v){assert.ok(v);n++;}
ok(Object.keys(out.panel).length===11); ok(PANEL_FIELDS.every(k=>k in out.panel));
ok(out.panel.status==='ERROR_CORRECTION_PENDING'); ok(out.panel.recent_event.startsWith('ERROR:'));
ok(out.panel.result_return_status==='D4_COMPLETION_PENDING'); ok(out.execution_truth.working_observed===true);
ok(out.execution_truth.error_observed===true); ok(out.execution_truth.completed_observed===false);
ok(out.execution_truth.full_message_loop_live_pass===false); ok(out.execution_truth.d5_cycle5_late_bind_ready===true);
ok(out.activation_contract.rebuild_required===false); ok(out.activation_contract.require_actual_d4_pass_receipt===true);
ok(out.activation_contract.synthetic_completion_allowed===false); ok(out.forbidden_counters.synthetic_completed===0);
ok(out.forbidden_counters.d4_pass_inference===0); ok(out.forbidden_counters.new_panel===0);
ok(out.forbidden_counters.new_executor===0); ok(out.forbidden_counters.new_tunnel===0);
ok(out.forbidden_counters.new_transport===0); ok(out.forbidden_counters.d3_wait===0);
console.log(JSON.stringify({status:'PASS',assertions:n,panel:out.panel,activation_contract:out.activation_contract}));
