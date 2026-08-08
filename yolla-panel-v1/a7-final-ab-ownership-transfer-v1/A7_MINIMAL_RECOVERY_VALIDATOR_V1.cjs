#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const fixturePath=path.join(__dirname,'fixtures','A7_FINAL_BATCH_MINIMAL_RECOVERY_FIXTURE_V1.json');
const x=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const ids=[5224504704,5224504749,5224505696,5224505743,5224505792,5224505876,5224505836,5224505964,5224505915,5224506003,5224506049,5224506097];
const vals=Object.values(x.workers);
const checks=[
 ['worker_count',vals.length===12],
 ['directive_ids',ids.every(id=>vals.some(v=>v.directive===id))],
 ['peer_waiting_count',vals.filter(v=>v.state==='WAITING_INPUT').length===11],
 ['a7_transfer_active',x.workers['A-7'].state==='IN_PROGRESS_OWNERSHIP_TRANSFER'],
 ['a2_no_rerun',x.a2_completed_rerun===false],
 ['b6_no_rerun',x.b6_completed_rerun===false],
 ['first_incomplete',x.first_incomplete_step==='PUBLISH_EXACT_TARGET_RUNTIME_BINDING'],
 ['resume_rs003',x.resume_entry==='A2_RS003_RESOLVE_TARGET_PC_RUNTIME_INPUTS'],
 ['v2_owner',x.owner_after_terminal==='V-2'],
 ['runtime_fields_6',x.required_runtime_field_count===6],
 ['no_false_complete',!vals.some(v=>v.state==='COMPLETE')],
 ['state_domain',vals.every(v=>['WAITING_INPUT','IN_PROGRESS_OWNERSHIP_TRANSFER','UNKNOWN','COMPLETE','INCOMPLETE'].includes(v.state))],
 ['full_history_preload_false',x.full_history_preload===false],
 ['target_value_guessing_false',x.target_value_guessing===false]
];
const failed=checks.filter(x=>!x[1]).map(x=>x[0]);
const result={status:failed.length?'FAIL':'PASS',assertions_passed:checks.length-failed.length,assertions_total:checks.length,failed,waiting_input_count:vals.filter(v=>v.state==='WAITING_INPUT').length,first_incomplete_step:x.first_incomplete_step,owner_after_terminal:x.owner_after_terminal};
console.log(JSON.stringify(result,null,2));
if(failed.length) process.exitCode=2;
