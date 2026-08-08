'use strict';
const crypto=require('node:crypto');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.keys(v).sort().reduce((a,k)=>(a[k]=stable(v[k]),a),{}):v;
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
function idempotencyKey({recipe_id,step_id,cursor,normalized_input}){return sha({recipe_id,step_id,cursor,normalized_input});}
class MemoryCheckpointStore{
  constructor(){this.map=new Map()}
  async load(recipeId){return this.map.get(recipeId)||null}
  async save(recipeId,value){this.map.set(recipeId,JSON.parse(JSON.stringify(value)));return value}
}
function nextCheckpoint({recipe,step_index,cursor,completed_keys,last_receipt_sha256}){
  return {schema_version:'REPLAY_CHECKPOINT_RESUME_V1',recipe_id:recipe.recipe_id,next_step_index:step_index+1,cursor:{...cursor},completed_idempotency_keys:[...completed_keys].sort(),last_receipt_sha256,checkpoint_sha256:sha({recipe_id:recipe.recipe_id,next_step_index:step_index+1,cursor,completed_idempotency_keys:[...completed_keys].sort(),last_receipt_sha256})};
}
module.exports={idempotencyKey,MemoryCheckpointStore,nextCheckpoint,sha};
