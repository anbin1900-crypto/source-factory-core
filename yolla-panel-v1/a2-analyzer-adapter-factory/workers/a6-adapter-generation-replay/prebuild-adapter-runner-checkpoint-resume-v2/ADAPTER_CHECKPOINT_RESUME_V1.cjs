'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.keys(v).sort().reduce((a,k)=>(a[k]=stable(v[k]),a),{}):v;
const sha256=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(stable(v))).digest('hex');
function stepIdempotencyKey({recipe_id,recipe_version,adapter_version,step_id,normalized_input,cursor}){return sha256({recipe_id,recipe_version,adapter_version,step_id,normalized_input,cursor});}
function newCheckpoint({checkpoint_id,command_id,recipe_id,recipe_version,adapter_version}){return {schema_version:'ADAPTER_CHECKPOINT_RESUME_V1',checkpoint_id,command_id,recipe_id,recipe_version,adapter_version,last_completed_step:null,resume_from_step:0,cursor:{page:1,record_offset:0},completed_idempotency_keys:[],step_receipts:[],status:'CREATED'};}
function loadCheckpoint(file,seed){if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));const cp=newCheckpoint(seed);saveCheckpoint(file,cp);return cp;}
function saveCheckpoint(file,cp){fs.mkdirSync(path.dirname(file),{recursive:true});const out={...cp,checkpoint_sha256:null};out.checkpoint_sha256=sha256(out);fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n');return out;}
function markStepComplete(cp,{step_index,step_id,idempotency_key,receipt,cursor}){const keys=new Set(cp.completed_idempotency_keys||[]);keys.add(idempotency_key);cp.completed_idempotency_keys=[...keys].sort();cp.last_completed_step=step_id;cp.resume_from_step=step_index+1;cp.cursor={...(cursor||cp.cursor)};cp.step_receipts=[...(cp.step_receipts||[]),receipt];cp.status='IN_PROGRESS';return cp;}
module.exports={sha256,stepIdempotencyKey,newCheckpoint,loadCheckpoint,saveCheckpoint,markStepComplete};
