'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {bindCausalBundles,validateBundleSet,sha256}=require('./action_network_state_causal_binding_v1.cjs');
function ref(kind,id){return {schema_version:`${kind}_REF_V1`,ref_id:id,sha256:`sha256:${sha256(id)}`,storage:'REFERENCE_ONLY'};}
function fixture(){
  const command_id='CMD-FIXTURE-PRODUCT-WRITE-001',lineage_id='LINEAGE-PRODUCT-WRITE-001';let n=0;
  const p=(action_id,page_id)=>({command_id,lineage_id,action_id,page_id,timestamp:`2026-08-08T00:00:${String(n++).padStart(2,'0')}.000+09:00`});
  const d=id=>ref('DOM_EVENT',id),net=id=>ref('NETWORK_OBSERVATION_EVENT',id),rb=id=>ref('RESPONSE_BODY',id);
  return {schema_version:'PRODUCT_WRITE_OBSERVATION_FIXTURE_SEQUENCE_V1',events:[
    {schema_version:'PAGE_STATE_OBSERVATION_EVENT_V1',event_id:'E1',provenance:p('A-PUBLIC-READ','P-PUBLIC'),observed:{page_kind:'PUBLIC_READ'}},
    {schema_version:'ACTION_DOM_NETWORK_RESPONSE_CORRELATION_V2',event_id:'E2',provenance:p('A-PUBLIC-READ','P-PUBLIC'),observed:{action_kind:'PUBLIC_READ',dom_event_ref:d('DOM-1'),network_observation_event_ref:net('NET-1'),response_body_ref:rb('RB-1')}},
    {schema_version:'PAGE_STATE_OBSERVATION_EVENT_V1',event_id:'E3',provenance:p('A-CREATE','P-CREATE'),observed:{page_kind:'CREATE'}},
    {schema_version:'FORM_INTERACTION_OBSERVATION_V1',event_id:'E4',provenance:p('A-CREATE','P-CREATE'),observed:{interaction:'INPUT'}},
    {schema_version:'FORM_INTERACTION_OBSERVATION_V1',event_id:'E5',provenance:p('A-CREATE','P-CREATE'),observed:{interaction:'SELECT'}},
    {schema_version:'FORM_INTERACTION_OBSERVATION_V1',event_id:'E6',provenance:p('A-CREATE','P-CREATE'),observed:{interaction:'UPLOAD'}},
    {schema_version:'ACTION_DOM_NETWORK_RESPONSE_CORRELATION_V2',event_id:'E7',provenance:p('A-CREATE','P-CREATE'),observed:{action_kind:'CREATE',dom_event_ref:d('DOM-6'),network_observation_event_ref:net('NET-2'),response_body_ref:rb('RB-2')}},
    {schema_version:'MY_LISTING_PAGE_OBSERVATION_V1',event_id:'E8',provenance:p('A-MY-LISTING','P-MY'),observed:{page_role:'MY_LISTING'}},
    {schema_version:'ACTION_DOM_NETWORK_RESPONSE_CORRELATION_V2',event_id:'E9',provenance:p('A-MY-LISTING','P-MY'),observed:{action_kind:'MY_LISTING',dom_event_ref:d('DOM-7'),network_observation_event_ref:net('NET-3'),response_body_ref:rb('RB-3')}},
    {schema_version:'EDIT_FLOW_OBSERVATION_V1',event_id:'E10',provenance:p('A-EDIT','P-EDIT'),observed:{flow:'EDIT',phase:'OPEN'}},
    {schema_version:'FORM_INTERACTION_OBSERVATION_V1',event_id:'E11',provenance:p('A-EDIT','P-EDIT'),observed:{interaction:'INPUT'}},
    {schema_version:'EDIT_FLOW_OBSERVATION_V1',event_id:'E12',provenance:p('A-EDIT','P-EDIT'),observed:{flow:'EDIT',phase:'SUBMIT'}},
    {schema_version:'ACTION_DOM_NETWORK_RESPONSE_CORRELATION_V2',event_id:'E13',provenance:p('A-EDIT','P-EDIT'),observed:{action_kind:'EDIT',dom_event_ref:d('DOM-10'),network_observation_event_ref:net('NET-4'),response_body_ref:rb('RB-4')}}
  ]};
}
function runSmoke(){
  const input=fixture(); const set=bindCausalBundles(input.events); const receipt=validateBundleSet(set);
  assert.equal(set.bundle_count,4); assert.deepEqual(set.bundles.map(b=>b.flow_class),['PUBLIC_READ','WRITE','MY_LISTING','EDIT']);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'a3-cycle5-')); const out=path.join(root,'causal-bundles.json');
  fs.writeFileSync(out,JSON.stringify(set,null,2)+'\n'); const readback=JSON.parse(fs.readFileSync(out,'utf8'));
  assert.equal(sha256(readback),sha256(set));
  const result={...receipt,fixture_source_event_count:13,readback_pass:true,readback_sha256:sha256(readback),source_manifest_blob:'50ff8f692360a6c8a2f82657db24d306edf97e83',source_engine_blob:'3c6cf3f8a52afa71a795eee21e90b4bc4cfbf790',target_pc_execution:false,live_site_call:false,terminal:'A3_ACTION_NETWORK_STATE_CAUSAL_BINDING_READY'};
  process.stdout.write(JSON.stringify(result,null,2)+'\n'); return result;
}
if(require.main===module){try{runSmoke();}catch(e){console.error(e);process.exitCode=1;}}
module.exports={fixture,runSmoke};
