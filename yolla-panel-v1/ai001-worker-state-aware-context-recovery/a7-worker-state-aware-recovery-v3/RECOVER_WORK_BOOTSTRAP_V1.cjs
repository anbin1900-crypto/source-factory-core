#!/usr/bin/env node
'use strict';
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const {consumeWorkerEvents}=require('./WORKER_BROWSER_STATE_EVENT_ADAPTER_V1.cjs');
function readJson(f){return JSON.parse(fs.readFileSync(f,'utf8'));}
function safe(root,rel){if(path.isAbsolute(rel))throw new Error('ABSOLUTE_PATH_REJECTED');const p=path.resolve(root,rel);if(p!==root&&!p.startsWith(root+path.sep))throw new Error('PATH_TRAVERSAL_REJECTED');return p;}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function latestCheckpoint(root,dirRel,cmd){const dir=safe(root,dirRel);const rows=[];for(const name of fs.readdirSync(dir)){if(!name.endsWith('.json'))continue;try{const x=readJson(path.join(dir,name));if(Number.isInteger(x.sequence_no)&&x.command_id===cmd.command_id&&x.idempotency_key===cmd.idempotency_key)rows.push(x);}catch{}}rows.sort((a,b)=>b.sequence_no-a.sequence_no);return rows[0]||null;}
function partialState(root,cp){const out=[];for(const a of cp?.artifact_manifest||[]){if(!a.path)continue;const f=safe(root,a.path);if(!fs.existsSync(f)){out.push({path:a.path,reason:'MISSING'});continue;}if(/\.(partial|tmp|incomplete)$/i.test(f))out.push({path:a.path,reason:'PARTIAL_SUFFIX'});}return out;}
function decide({cmd,result,worker,cp,partial}){
  if(result?.status==='PASS'&&result.idempotency_key===cmd.idempotency_key)return{decision:'ALREADY_DONE',reason:'PASS_RESULT_ALREADY_BOUND',command_reissue:false,next_action:'ADVANCE_AFTER_VERIFIED_TASK_PASS',resume_from:null};
  if(!worker)return{decision:'BLOCKED',reason:'WORKER_STATE_MISSING',command_reissue:false,next_action:'REFRESH_WORKER_STATE_BEFORE_ANY_REISSUE',resume_from:cp?.checkpoint_id||null};
  if(worker.state==='GENERATING')return{decision:'SAFE_TO_RESUME',reason:'WORKER_ALREADY_GENERATING_NO_DUPLICATE_COMMAND',command_reissue:false,next_action:'OBSERVE_EXISTING_WORKER_GENERATION',resume_from:cp?.checkpoint_id||null};
  if(worker.state==='COMPLETE'&&worker.task_pass===true)return{decision:'ALREADY_DONE',reason:'WORKER_COMPLETE_AND_TASK_PASS',command_reissue:false,next_action:'ADVANCE_AFTER_VERIFIED_TASK_PASS',resume_from:null};
  if(worker.state==='COMPLETE')return{decision:'SAFE_TO_RESUME',reason:'WORKER_COMPLETE_REQUIRES_REVIEW',command_reissue:false,next_action:'REVIEW_COMPLETED_WORKER_RESULT',resume_from:cp?.checkpoint_id||null};
  if(worker.state==='BLOCKED')return{decision:'BLOCKED',reason:`WORKER_BLOCKED:${worker.blocker?.code||'UNKNOWN'}`,command_reissue:false,next_action:'SURFACE_WORKER_BLOCKER',resume_from:cp?.checkpoint_id||null};
  if(worker.state==='UNKNOWN')return{decision:'BLOCKED',reason:'WORKER_STATE_UNKNOWN',command_reissue:false,next_action:'REFRESH_WORKER_STATE_BEFORE_ANY_REISSUE',resume_from:cp?.checkpoint_id||null};
  if(partial.length)return{decision:'NEEDS_REPAIR',reason:'PARTIAL_STATE_REPAIR_REQUIRED',command_reissue:false,next_action:'REPAIR_OWNED_ROOT_THEN_RESUME',resume_from:cp?.checkpoint_id||null};
  return{decision:'BLOCKED',reason:'NO_SAFE_RULE',command_reissue:false,next_action:'REFRESH_RECOVERY_INPUTS',resume_from:cp?.checkpoint_id||null};
}
function recover(pointerFile){
  const pointer=readJson(pointerFile), root=path.dirname(pointerFile);
  const state=readJson(safe(root,pointer.current_mission_state));
  const cmd=readJson(safe(root,pointer.active_command));
  const events=readJson(safe(root,pointer.worker_state_events));
  const result=readJson(safe(root,pointer.latest_result));
  const cp=latestCheckpoint(root,pointer.checkpoint_directory,cmd); if(!cp)throw new Error('NO_VALID_CHECKPOINT');
  const consumed=consumeWorkerEvents(events,{workerId:cmd.worker_id,commandId:cmd.command_id});
  const partial=partialState(root,cp); const decision=decide({cmd,result,worker:consumed.latest,cp,partial});
  const brief=readJson(safe(root,pointer.recovery_brief));
  return {schema_version:'AI001_WORKER_STATE_AWARE_RECOVERY_READBACK_V1',mission_id:pointer.mission_id,phase:state.phase,active_command_id:cmd.command_id,last_completed_command_id:state.last_completed_command_id,worker_state:consumed.latest,worker_event_suppressed_count:consumed.suppressed_count,complete_is_task_pass:consumed.latest?.state==='COMPLETE'?consumed.latest.task_pass===true:null,latest_result:{status:result.status,receipt_pointer:result.receipt_pointer||null},checkpoint:{checkpoint_id:cp.checkpoint_id,sequence_no:cp.sequence_no},partial_state:partial,recovery_decision:decision,next_action:decision.next_action,recovery_brief:brief,late_binding:pointer.late_binding,recovery_digest:digest({mission:pointer.mission_id,cmd:cmd.command_id,worker:consumed.latest,result:result.status,cp:cp.checkpoint_id,decision})};
}
if(require.main===module){const i=process.argv.indexOf('--pointer');const p=path.resolve(i>=0?process.argv[i+1]:path.join(process.cwd(),'LATEST_AI001_MISSION_POINTER_V1.json'));try{console.log(JSON.stringify(recover(p),null,2));}catch(e){console.error(e.stack||e.message);process.exitCode=2;}}
module.exports={recover,decide,latestCheckpoint,partialState};
