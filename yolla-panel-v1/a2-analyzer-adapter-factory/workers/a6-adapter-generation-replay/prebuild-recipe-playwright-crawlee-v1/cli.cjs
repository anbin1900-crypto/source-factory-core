'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {compileRecipe}=require('./ADAPTER_COMPILER_V1.cjs');
const {replayFixture,smokePartialRegeneration}=require('./fixture-replay-runtime.cjs');
async function main(){
  const [cmd='build-replay',recipePath='EXTRACTION_RECIPE_V1.json',outDir='generated']=process.argv.slice(2);
  if(cmd!=='build-replay')throw new Error('supported command: build-replay');
  const recipe=JSON.parse(fs.readFileSync(recipePath,'utf8')); const compiled=compileRecipe(recipe); fs.mkdirSync(outDir,{recursive:true}); const adapterPath=path.join(outDir,'compiled-adapter.cjs'); fs.writeFileSync(adapterPath,compiled.source);
  cp.execFileSync(process.execPath,['--check',adapterPath],{stdio:'pipe'});
  const first=await replayFixture(recipe,{stopAfter:4}); const resumed=await replayFixture(recipe,{seedCheckpoint:first.checkpoint}); const full1=await replayFixture(recipe); const full2=await replayFixture(recipe); const partial=await smokePartialRegeneration(recipe);
  const combinedReceipts=[...first.receipts,...resumed.receipts];
  const deterministic=full1.receipt_digest===full2.receipt_digest && full1.output_digest===full2.output_digest;
  const resumeEquivalent=JSON.stringify(combinedReceipts.map(x=>[x.step_id,x.status]))===JSON.stringify(full1.receipts.map(x=>[x.step_id,x.status])) && resumed.output_digest===full1.output_digest;
  if(!deterministic||!resumeEquivalent) throw new Error(`DETERMINISM_OR_RESUME_FAILED deterministic=${deterministic} resume=${resumeEquivalent}`);
  const receipt={schema_version:'A6_RECIPE_ADAPTER_PREBUILD_SMOKE_RECEIPT_V1',status:'PASS',source_parse:'PASS',fixture_replay_smoke_1:'PASS',checkpoint_created:first.checkpoint?.schema_version==='REPLAY_CHECKPOINT_RESUME_V1',resume_status:resumed.status,resume_equivalent_to_full:resumeEquivalent,full_replay_status:full1.status,deterministic_replay_2_of_2:deterministic,full_replay_receipt_digest:full1.receipt_digest,full_replay_output_digest:full1.output_digest,partial_regeneration_status:partial.result.status,partial_regeneration_scope:partial.receipt.scope,full_recipe_regeneration:partial.receipt.full_recipe_regeneration,generated_adapter_sha256:compiled.source_sha256,recipe_sha256:compiled.recipe_sha256,production:false,ready:false,merge:false};
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/PREBUILD_VALIDATION_RECEIPT_V1.json',JSON.stringify(receipt,null,2)+'\n'); console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error(e.stack);process.exit(1)});
