#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function safe(root, rel){if(path.isAbsolute(rel)) throw new Error('ABSOLUTE_PATH_REJECTED'); const p=path.resolve(root,rel); if(p!==root&&!p.startsWith(root+path.sep)) throw new Error('PATH_TRAVERSAL_REJECTED'); return p;}
function parseArg(name, fallback=null){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:fallback;}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function latestCheckpoint(root, dirRel){const dir=safe(root,dirRel); const rows=[]; for(const name of fs.readdirSync(dir)){if(!name.endsWith('.json')) continue; try{const x=readJson(path.join(dir,name)); if(Number.isInteger(x.sequence_no)) rows.push({name,x});}catch{}} rows.sort((a,b)=>b.x.sequence_no-a.x.sequence_no); return rows[0]?.x||null;}
function isFresh(cmd, now, staleSec){const t=Date.parse(cmd.heartbeat_at||''); return Number.isFinite(t)&&(now-t)/1000<=staleSec;}
function partialState(root, checkpoint){const found=[]; for(const item of checkpoint?.artifact_manifest||[]){if(!item.path)continue; const f=safe(root,item.path); if(!fs.existsSync(f)){found.push({path:item.path,reason:'MISSING'});continue;} if(/\.(partial|tmp|incomplete)$/i.test(f)) found.push({path:item.path,reason:'PARTIAL_SUFFIX'}); if(item.sha256){const h=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); if(h!==item.sha256) found.push({path:item.path,reason:'SHA256_MISMATCH'});}} return found;}
function decide({cmd,result,checkpoint,blocker,now,staleSec,partial}){
 if(result?.status==='PASS'&&result.idempotency_key&&result.idempotency_key===cmd.idempotency_key) return {decision:'ALREADY_DONE',reason:'PASS_RESULT_ALREADY_BOUND',resume_from:null};
 if(blocker?.active&&blocker.repairable!==true) return {decision:'BLOCKED',reason:`ACTIVE_BLOCKER:${blocker.code||'UNKNOWN'}`,resume_from:null};
 if(cmd.status==='RUNNING'&&isFresh(cmd,now,staleSec)) return {decision:'BLOCKED',reason:'COMMAND_STILL_ACTIVE',resume_from:null};
 const interrupted=['RUNNING','INTERRUPTED'].includes(cmd.status)&&!isFresh(cmd,now,staleSec);
 if(interrupted&&partial.length) return {decision:'NEEDS_REPAIR',reason:'PARTIAL_STATE_REPAIR_REQUIRED',resume_from:checkpoint?.checkpoint_id||null};
 const cpMatch=checkpoint&&checkpoint.durable===true&&checkpoint.command_id===cmd.command_id&&checkpoint.idempotency_key===cmd.idempotency_key;
 if(interrupted&&cpMatch) return {decision:'SAFE_TO_RESUME',reason:'DURABLE_CHECKPOINT_AVAILABLE',resume_from:checkpoint.checkpoint_id};
 if(interrupted&&!cpMatch&&cmd.safe_rerun===true&&cmd.non_idempotent_side_effect_committed!==true) return {decision:'SAFE_TO_RESUME',reason:'SAFE_RERUN_FROM_START',resume_from:null};
 if(cmd.status==='PASS') return {decision:'ALREADY_DONE',reason:'ACTIVE_COMMAND_MARKED_PASS',resume_from:null};
 return {decision:'BLOCKED',reason:'NO_SAFE_RECOVERY_RULE',resume_from:null};
}
function recover(pointerFile, now=Date.now()){
 const pointer=readJson(pointerFile); const root=path.dirname(pointerFile);
 const state=readJson(safe(root,pointer.current_mission_state));
 const cmd=readJson(safe(root,pointer.active_command));
 const result=readJson(safe(root,pointer.latest_result));
 const checkpoint=latestCheckpoint(root,pointer.checkpoint_directory);
 if(!checkpoint) throw new Error('NO_VALID_CHECKPOINT');
 const blocker=state.blocker||result.blocker||null; const partial=partialState(root,checkpoint);
 const decision=decide({cmd,result,checkpoint,blocker,now,staleSec:pointer.stale_after_seconds||120,partial});
 const brief=readJson(safe(root,pointer.recovery_brief));
 return {schema_version:'AI001_DURABLE_RECOVERY_READBACK_V1',mission_id:pointer.mission_id,phase:state.phase,last_completed_command_id:state.last_completed_command_id,active_command_id:cmd.command_id,latest_result:{status:result.status,receipt_path:result.receipt_path},checkpoint:{checkpoint_id:checkpoint.checkpoint_id,sequence_no:checkpoint.sequence_no},blocker,partial_state:partial,recovery_decision:decision,next_action:decision.decision==='ALREADY_DONE'?brief.next_work:decision,late_binding:pointer.late_binding,recovery_brief:brief,recovery_digest:digest({pointer:pointer.mission_id,cmd:cmd.command_id,result:result.status,checkpoint:checkpoint.checkpoint_id,decision})};
}
if(require.main===module){const p=path.resolve(parseArg('--pointer',path.join(process.cwd(),'LATEST_AI001_MISSION_POINTER_V1.json'))); try{console.log(JSON.stringify(recover(p),null,2));}catch(e){console.error(e.stack||e.message);process.exitCode=2;}}
module.exports={recover,decide,latestCheckpoint,partialState};
