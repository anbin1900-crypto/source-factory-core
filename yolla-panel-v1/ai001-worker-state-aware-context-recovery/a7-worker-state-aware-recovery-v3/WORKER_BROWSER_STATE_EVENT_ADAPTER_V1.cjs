'use strict';
const crypto = require('node:crypto');
const VALID_STATES = new Set(['GENERATING','COMPLETE','BLOCKED','UNKNOWN']);
function fingerprint(e){return crypto.createHash('sha256').update(JSON.stringify([e.worker_id,e.command_id,e.event_id,e.sequence_no,e.state,e.task_pass,e.captured_at])).digest('hex');}
function normalize(e){
  if(!e || e.schema_version !== 'WORKER_BROWSER_STATE_EVENT_V1') throw new Error('WORKER_EVENT_SCHEMA_INVALID');
  if(!e.worker_id || !e.command_id || !VALID_STATES.has(e.state)) throw new Error('WORKER_EVENT_REQUIRED_FIELD_INVALID');
  if(!Number.isInteger(e.sequence_no) || e.sequence_no < 1) throw new Error('WORKER_EVENT_SEQUENCE_INVALID');
  return {schema_version:'WORKER_BROWSER_STATE_EVENT_V1',worker_id:String(e.worker_id),command_id:String(e.command_id),event_id:String(e.event_id || `${e.worker_id}:${e.command_id}:${e.sequence_no}`),sequence_no:e.sequence_no,state:e.state,task_pass:e.task_pass===true?true:e.task_pass===false?false:null,captured_at:e.captured_at||null,blocker:e.blocker||null,receipt_pointer:e.receipt_pointer||null};
}
function consumeWorkerEvents(events,{workerId=null,commandId=null}={}){
  const accepted=[];const suppressed=[];const seenId=new Set();const bestSeq=new Map();
  for(const raw of events||[]){
    const e=normalize(raw);if(workerId&&e.worker_id!==workerId)continue;if(commandId&&e.command_id!==commandId)continue;
    const key=`${e.worker_id}|${e.command_id}`;
    if(seenId.has(e.event_id)){suppressed.push({...e,suppression_reason:'DUPLICATE_EVENT_ID'});continue;}seenId.add(e.event_id);
    const prior=bestSeq.get(key);if(prior&&e.sequence_no<=prior.sequence_no){suppressed.push({...e,suppression_reason:'STALE_OR_DUPLICATE_SEQUENCE'});continue;}
    if(prior){const idx=accepted.findIndex(x=>x.worker_id===prior.worker_id&&x.command_id===prior.command_id);if(idx>=0){suppressed.push({...accepted[idx],suppression_reason:'SUPERSEDED_BY_NEWER_SEQUENCE'});accepted.splice(idx,1);}}
    accepted.push(e);bestSeq.set(key,e);
  }
  accepted.sort((a,b)=>a.worker_id.localeCompare(b.worker_id)||a.command_id.localeCompare(b.command_id)||a.sequence_no-b.sequence_no);
  return {accepted,suppressed,latest:accepted.at(-1)||null,accepted_count:accepted.length,suppressed_count:suppressed.length,fingerprint:accepted.length?fingerprint(accepted.at(-1)):null};
}
module.exports={consumeWorkerEvents,normalize,VALID_STATES};
