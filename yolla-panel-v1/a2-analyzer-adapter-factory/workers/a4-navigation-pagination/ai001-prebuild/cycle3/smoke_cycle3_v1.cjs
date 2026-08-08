'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildBundle,observationToRunRequest,stableStringify}=require('./A3_OBSERVATION_TO_A4_STRUCTURE_ADAPTER_V1.cjs');

function load(name){return JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8'));}
function runSmoke(){
  const observation=load('fixture_a3_observation_receipt_v1.json');
  const lifecycle=load('fixture_browser_worker_completion_event_v1.json');
  const dom=JSON.parse(fs.readFileSync(path.join(__dirname,'../fixture_smoke_1.json'),'utf8'));
  const structure=JSON.parse(fs.readFileSync(path.join(__dirname,'../cycle2/STRUCTURE_INFERENCE_RUN_RECEIPT_V1.json'),'utf8'));
  const req=observationToRunRequest(observation,dom,observation.artifacts.dom_snapshot_pointer);
  assert.equal(req.schema_version,'STRUCTURE_INFERENCE_RUN_REQUEST_V1');
  assert.equal(req.page_identity.page_id,'fixture-smoke-1');
  const first=buildBundle({observationReceipt:observation,domEvidence:dom,structureReceipt:structure,lifecycleEvent:lifecycle});
  const second=buildBundle({observationReceipt:observation,domEvidence:dom,structureReceipt:structure,lifecycleEvent:lifecycle});
  assert.equal(stableStringify(first),stableStringify(second));
  assert.equal(first.schema_version,'STRUCTURE_EVIDENCE_BUNDLE_V1');
  assert.equal(first.provenance.page_id,'fixture-smoke-1');
  assert.equal(first.provenance.action_id,'fixture-action-001');
  assert.equal(first.provenance.command_id,'fixture-command-001');
  assert.equal(first.command_lifecycle_metadata.analysis_input_mixed,false);
  assert(first.repeated_regions.length>=1);
  assert(first.fields.length>=5);
  assert(first.locator_candidates.length>=5);
  assert(first.pagination_candidates.length>=1);
  assert(first.fallback.confidence>0);
  assert(first.fallback.fallback_reason.length>=1);
  const result={status:'PASS',deterministic:true,bundle_sha256:first.bundle_sha256,page_id:first.provenance.page_id,action_id:first.provenance.action_id,command_id:first.provenance.command_id,repeated_region_count:first.repeated_regions.length,field_count:first.fields.length,locator_count:first.locator_candidates.length,pagination:first.pagination_candidates[0]?.type||'NONE',fallback_reason:first.fallback.fallback_reason,completion_event_mixed_into_analysis:false,terminal:'A4_OBSERVATION_TO_STRUCTURE_COMPOSITE_BINDING_READY'};
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  return result;
}
if(require.main===module) runSmoke();
module.exports={runSmoke};
