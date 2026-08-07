'use strict'; const fs=require('node:fs'); const {compile,sha}=require('./real_site_recipe_replay_binder_v1.cjs');
const input=JSON.parse(fs.readFileSync('./INPUT_AUTHORITY.json','utf8')); const a=compile(input),b=compile(input);
function ok(c,m){if(!c)throw new Error(m)}
ok(sha(a)===sha(b),'NON_DETERMINISTIC_COMPILE');
ok(a.recipe.lanes.READ.status==='READY_ACTUAL_BROWSER_EVIDENCE','READ_NOT_READY');
ok(a.recipe.lanes.WRITE.status==='PARTIAL_WAITING_INPUT','WRITE_OVERCLAIM');
ok(a.replay.completed_steps_reexecuted===false,'REEXECUTED');
ok(a.executionSpec.execution_route.new_executor===false,'NEW_EXECUTOR');
ok(a.livePackage.safety.final_submit===false,'FINAL_SUBMIT');
ok(a.validation.external_target_site_coverage===false,'EXTERNAL_OVERCLAIM');
ok(a.validation.target_pc_execution_receipt===false,'TARGET_PC_OVERCLAIM');
const bad=JSON.parse(JSON.stringify(input));delete bad.a4.binding_blob;let failed=false;try{compile(bad)}catch(e){failed=e.message==='MISSING_EXACT_BINDING'}ok(failed,'MISSING_BINDING_NOT_FAIL_CLOSED');
console.log(JSON.stringify({status:'PASS',assertions:'PASS_9_OF_9',deterministic_compile:true,fail_closed_missing_binding:true,final_submit:false,new_executor:false}));
