'use strict';
const assert = require('assert');
const {
  sha256, normalizeHandoff, normalizeCommand, buildLiveInput,
  validateLiveResult, CommandIdempotencyLedger, classifyNegativeResult,
} = require('./d3_cycle3_reusable_dispatch_return.cjs');
let n=0; const ok=(v,m)=>{assert.ok(v,m);n++;}; const eq=(a,b,m)=>{assert.strictEqual(a,b,m);n++;}; const throws=(f,rx)=>{assert.throws(f,rx);n++;};

const handoff={binding:{ROLE_ID:'D-2_CONTEXT_REGISTRY_AND_ACTIVE_WORKER_OWNER',CONTEXT_ID:'ctx-1',CONTEXT_NAME:'target',PAGE_ID:'page-1',LAST_SEEN_AT:'2026-08-07T18:16:52Z',binding_method:'UIA'}};
const cmd={command_id:'CMD-ALPHA-001',command_type:'C_MODE_REUSABLE_LIVE_TEST',message:'COMMAND_ID=CMD-ALPHA-001\nreply TOKEN_ALPHA',message_marker:'COMMAND_ID=CMD-ALPHA-001',expected_reply_contains:'TOKEN_ALPHA'};
const h=normalizeHandoff(handoff); eq(h.context_id,'ctx-1'); eq(h.page_id,'page-1'); eq(h.role_id,'D-2_CONTEXT_REGISTRY_AND_ACTIVE_WORKER_OWNER');
const c=normalizeCommand(cmd); eq(c.command_id,'CMD-ALPHA-001'); eq(c.expected_reply_contains,'TOKEN_ALPHA');
throws(()=>normalizeCommand({...cmd,message:'no command token TOKEN_ALPHA'}),/MESSAGE_COMMAND_ID_MISMATCH/);
throws(()=>normalizeCommand({...cmd,message:'COMMAND_ID=CMD-ALPHA-001'}),/MESSAGE_REPLY_TOKEN_MISSING/);
const input=buildLiveInput({cycleId:'cycle-3',handoff,command:cmd,contextUrl:'https://chatgpt.com/g/proj/c/ctx-1'});
eq(input.context_id,'ctx-1'); eq(input.page_id,'page-1'); eq(input.command_id,'CMD-ALPHA-001'); eq(input.stable_polls,3); eq(input.return_target,'D-1_OR_SUCCESSOR_AND_D-6'); ok(!Object.prototype.hasOwnProperty.call(input,'role_marker')); const strictInput=buildLiveInput({cycleId:'cycle-3',handoff,command:cmd,contextUrl:'https://chatgpt.com/g/proj/c/ctx-1',requireRoleMarker:true}); eq(strictInput.role_marker,'ROLE=D-2_CONTEXT_REGISTRY_AND_ACTIVE_WORKER_OWNER');
const reply='TOKEN_ALPHA';
const result={terminal:'MESSAGE_DISPATCH_AND_RESULT_RETURN_LIVE_PASS',command_id:input.command_id,context_id:input.context_id,page_id:input.page_id,d2_observed_page_id:input.page_id,message_sent:true,assistant_reply_completed:true,assistant_reply_raw:reply,assistant_reply_sha256:sha256(reply),events:[{event_type:'CONTEXT_BOUND'},{event_type:'DISPATCH_SUBMITTED'},{event_type:'MESSAGE_SENT'},{event_type:'REPLY_COLLECTED'},{event_type:'RESULT_RETURN_READY'}]};
const accepted=validateLiveResult({input,result}); ok(accepted.accepted); eq(accepted.reasons.length,0); eq(accepted.assistant_reply_raw,'TOKEN_ALPHA'); eq(accepted.assistant_reply_sha256,sha256(reply));
for (const [patch,reason] of [
  [{command_id:'wrong'},'COMMAND_ID_MISMATCH'],
  [{context_id:'wrong'},'CONTEXT_ID_MISMATCH'],
  [{message_sent:false},'MESSAGE_NOT_VISIBLE_SENT'],
  [{assistant_reply_completed:false},'ASSISTANT_REPLY_NOT_COMPLETED'],
  [{assistant_reply_raw:'other',assistant_reply_sha256:sha256('other')},'EXPECTED_REPLY_TOKEN_MISSING'],
  [{assistant_reply_raw:'COMMAND_ID=CMD-ALPHA-001 TOKEN_ALPHA',assistant_reply_sha256:sha256('COMMAND_ID=CMD-ALPHA-001 TOKEN_ALPHA')},'USER_MESSAGE_ECHO_AS_REPLY'],
  [{assistant_reply_sha256:'bad'},'ASSISTANT_REPLY_SHA256_MISMATCH'],
  [{events:[]},'EVENT_SEQUENCE_INCOMPLETE'],
  [{events:[{event_type:'MESSAGE_SENT'},{event_type:'DISPATCH_SUBMITTED'},{event_type:'REPLY_COLLECTED'},{event_type:'RESULT_RETURN_READY'}]},'EVENT_SEQUENCE_INVALID'],
]) { const v=validateLiveResult({input,result:{...result,...patch}}); ok(!v.accepted); ok(v.reasons.includes(reason)); }
const ledger=new CommandIdempotencyLedger(); let gate=ledger.beforeDispatch(cmd); ok(gate.allowed); ok(!gate.duplicate); ledger.recordAccepted(accepted); gate=ledger.beforeDispatch(cmd); ok(!gate.allowed); ok(gate.duplicate); eq(gate.duplicate_send_count,0); eq(gate.duplicate_result_return_count,0); eq(gate.terminal,'DUPLICATE_COMMAND_ID_SUPPRESSED');
throws(()=>ledger.recordAccepted(accepted),/DUPLICATE_ACCEPTED_RESULT_RECORD/);
throws(()=>ledger.recordAccepted({...accepted,accepted:false}),/ONLY_ACCEPTED_RESULT_CAN_BE_RECORDED/);
const neg=classifyNegativeResult({input,result:{terminal:'MESSAGE_DISPATCH_AND_RESULT_RETURN_LIVE_BLOCKED',blocker_code:'EXPECTED_REPLY_MARKER_PRESENT_BEFORE_DISPATCH',message_sent:false,command_id:input.command_id,context_id:input.context_id,page_id:input.page_id}});
ok(neg.duplicate_suppressed); eq(neg.duplicate_send_count,0); eq(neg.duplicate_result_return_count,0); ok(neg.command_id_match); ok(neg.context_id_match); ok(neg.page_id_match);
console.log(`PASS_${n}_ASSERTIONS`);
