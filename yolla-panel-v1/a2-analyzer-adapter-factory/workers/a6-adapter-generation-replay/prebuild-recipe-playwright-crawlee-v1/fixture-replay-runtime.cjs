'use strict';
const {idempotencyKey,MemoryCheckpointStore,nextCheckpoint,sha}=require('./REPLAY_CHECKPOINT_RESUME_V1.cjs');
const {regenerateStep}=require('./ADAPTER_COMPILER_V1.cjs');
const interpolate=(s,v)=>String(s).replace(/\$\{([^}]+)\}/g,(_,k)=>v[k]??(k==='start_url'?v.start_url:''));
async function replayFixture(recipe,{checkpointStore=new MemoryCheckpointStore(),stopAfter=null,seedCheckpoint=null}={}){
  if(seedCheckpoint) await checkpointStore.save(recipe.recipe_id,seedCheckpoint);
  const previous=await checkpointStore.load(recipe.recipe_id); const start=previous?.next_step_index||0; const completed=new Set(previous?.completed_idempotency_keys||[]); const receipts=[]; const output=[]; let page=previous?.cursor?.page||1;
  const vars={...recipe.variables,start_url:recipe.start_url};
  for(let i=start;i<recipe.steps.length;i++){
    const step=recipe.steps[i]; const key=idempotencyKey({recipe_id:recipe.recipe_id,step_id:step.step_id,cursor:{page,step_index:i},normalized_input:step});
    if(completed.has(key)){receipts.push({step_id:step.step_id,status:'SKIP_IDEMPOTENT',idempotency_key:key});continue;}
    let status='PASS',detail={};
    if(step.type==='Navigate') detail.url=interpolate(step.url,vars);
    else if(step.type==='Input') detail.value=interpolate(step.value,vars);
    else if(step.type==='Click') detail.locator=step.locator;
    else if(step.type==='Wait') detail.state=step.state||'visible';
    else if(step.type==='Loop') detail.iterations=step.times||1;
    else if(step.type==='Extract'){output.push({record_id:`R${page}`,name:`Fixture ${page}`});detail.output_count=1;}
    else if(step.type==='Pagination'){page=Math.min(page+1,step.max_pages||page+1);detail.cursor={page};}
    else {status='FAIL';throw new Error(`UNSUPPORTED:${step.type}`)}
    const receipt={step_id:step.step_id,type:step.type,status,idempotency_key:key,detail}; receipts.push(receipt); completed.add(key);
    const cp=nextCheckpoint({recipe,step_index:i,cursor:{page},completed_keys:completed,last_receipt_sha256:sha(receipt)}); await checkpointStore.save(recipe.recipe_id,cp);
    if(stopAfter!==null && receipts.length>=stopAfter) return {status:'STOPPED',receipts,output,checkpoint:cp,receipt_digest:sha(receipts),output_digest:sha(output)};
  }
  return {status:'PASS',receipts,output,checkpoint:await checkpointStore.load(recipe.recipe_id),receipt_digest:sha(receipts),output_digest:sha(output)};
}
async function smokePartialRegeneration(recipe){
  const broken=JSON.parse(JSON.stringify(recipe)); broken.steps[3]={...broken.steps[3],locator:{strategy:'css',value:'article.missing'}};
  const replacement={...recipe.steps[3]};
  const {recipe:repaired,receipt}=regenerateStep(broken,'s04',replacement);
  const result=await replayFixture(repaired);
  return {receipt,result};
}
module.exports={replayFixture,smokePartialRegeneration};
