const crypto=require('crypto');
const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const MODES=['API','DOM','HYBRID'];
function compile(input){
 if(!input||!Array.isArray(input.site_slots)||input.site_slots.length!==10) throw new Error('EXACT_10_SITE_SLOTS_REQUIRED');
 const ids=new Set();
 const adapters=input.site_slots.map((s,i)=>{
  if(!s.site_slot_id||ids.has(s.site_slot_id)) throw new Error('DUPLICATE_OR_MISSING_SITE_SLOT'); ids.add(s.site_slot_id);
  const mode=s.fixture_mode||MODES[i%3]; if(!MODES.includes(mode)) throw new Error('INVALID_FIXTURE_MODE');
  return {schema_version:'A6_SITE_ADAPTER_V1',site_slot_id:s.site_slot_id,target:{status:s.target_status||'WAITING_INPUT',site_name:null,url:null},mode,
   provenance:{target:'WAITING_INPUT',fixture:'FIXTURE_ONLY',a3_contract:'REFERENCE_ONLY',a4_contract:'OBSERVED_CONTRACT_INPUT',a5_contract:'CONTRACT_INPUT'},
   lanes:{READ:{enabled:true,deterministic_replay:true,resume:true,steps:['navigate','wait','extract','paginate']},WRITE:{enabled:true,scope:'PRE_SUBMIT_ONLY',final_submit:false,steps:['open_create','bind_fields','validate']},MY_LISTING:{enabled:true,scope:'PRE_SUBMIT_ONLY',final_submit:false,steps:['open_owner_list','extract_owner_items']},EDIT:{enabled:true,scope:'PRE_SUBMIT_ONLY',final_submit:false,steps:['open_edit','bind_fields','validate']}},
   execution:{checkpoint_each_step:true,idempotency_key:`${s.site_slot_id}:fixture:v1`,retry_budget:2,same_failure_signature_limit:2,rollback:'LAST_COMPLETED_CHECKPOINT',completed_step_reuse:true},
   drift_patch:{schema:'A6_ADAPTER_DRIFT_REPAIR_PATCH_V1',allowed:['locator.replace','schema.path.replace','pagination.replace','retry.policy.replace'],full_regeneration_required:false}};
 });
 return {schema_version:'A6_TEN_SITE_ADAPTER_COMPILER_RESULT_V1',compiler:'A6_TEN_SITE_ADAPTER_COMPILER_V1',count:adapters.length,adapters,digest:sha(adapters)};
}
function applyPatch(adapter,patch){
 if(patch.schema_version!=='A6_ADAPTER_DRIFT_REPAIR_PATCH_V1') throw new Error('BAD_PATCH_SCHEMA');
 if(patch.site_slot_id!==adapter.site_slot_id) throw new Error('PATCH_SITE_MISMATCH');
 if(!Array.isArray(patch.operations)||patch.operations.length===0) throw new Error('EMPTY_PATCH');
 const copy=JSON.parse(JSON.stringify(adapter));
 for(const op of patch.operations){ if(!copy.drift_patch.allowed.includes(op.kind)) throw new Error('PATCH_KIND_NOT_ALLOWED'); }
 copy.repair={patch_id:patch.patch_id,evidence_status:patch.evidence_status,operations:patch.operations,scope:'PARTIAL_ONLY',full_regeneration:false};
 return copy;
}
function replay(adapter,{start=0,failAt=-1}={}){
 const steps=adapter.lanes.READ.steps,completed=[];
 for(let i=start;i<steps.length;i++){ if(i===failAt) return {status:'FAILED',failed_index:i,completed,next_checkpoint:i,digest:null}; completed.push(steps[i]); }
 return {status:'PASS',failed_index:null,completed,next_checkpoint:steps.length,digest:sha({site:adapter.site_slot_id,mode:adapter.mode,steps})};
}
function recover(adapter,{failAt=2,failureSignature='INJECTED_DRIFT'}={}){
 const first=replay(adapter,{failAt}); if(first.status!=='FAILED') return {status:'PASS_NO_FAILURE',first};
 const checkpoint={last_completed_index:failAt-1,resume_from_index:first.next_checkpoint,completed_steps:[...first.completed],idempotency_key:adapter.execution.idempotency_key};
 const second=replay(adapter,{start:checkpoint.resume_from_index});
 return {status:second.status==='PASS'?'PASS_RECOVERED':'FAILED',failure_signature:failureSignature,retry_count:1,retry_budget:adapter.execution.retry_budget,rollback_to:'LAST_COMPLETED_CHECKPOINT',checkpoint,resume:second,completed_steps_reexecuted:false,method_changed:false};
}
module.exports={compile,applyPatch,replay,recover,sha};
