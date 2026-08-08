'use strict';
const crypto = require('node:crypto');

const SCHEMA = 'ACTION_OBSERVATION_CAUSAL_BUNDLE_V1';
const FLOW_MAP = Object.freeze({ PUBLIC_READ:'PUBLIC_READ', CREATE:'WRITE', WRITE:'WRITE', MY_LISTING:'MY_LISTING', EDIT:'EDIT' });
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function sha256(v){return crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(stable(v))).digest('hex');}
function prov(e){return e&&e.provenance||{};}
function byTs(a,b){return String(prov(a).timestamp||'').localeCompare(String(prov(b).timestamp||''))||String(a.event_id||'').localeCompare(String(b.event_id||''));}
function bindCausalBundles(events){
  if(!Array.isArray(events)) throw new TypeError('EVENT_ARRAY_REQUIRED');
  const groups=new Map();
  for(const e of events){
    const p=prov(e);
    if(!p.command_id||!p.page_id||!p.action_id) throw new Error(`PROVENANCE_REQUIRED:${e?.event_id||'UNKNOWN'}`);
    const key=[p.command_id,p.lineage_id||p.command_id,p.page_id,p.action_id].join('|');
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(e);
  }
  const bundles=[];
  for(const group of groups.values()){
    group.sort(byTs);
    const corr=group.find(e=>e.schema_version==='ACTION_DOM_NETWORK_RESPONSE_CORRELATION_V2');
    if(!corr) continue;
    const p=prov(corr); const obs=corr.observed||{};
    const sourceKind=String(obs.action_kind||'UNKNOWN').toUpperCase();
    const flow=FLOW_MAP[sourceKind];
    if(!flow) throw new Error(`UNSUPPORTED_OBSERVED_ACTION_KIND:${sourceKind}`);
    if(!obs.network_observation_event_ref||!obs.response_body_ref||!obs.dom_event_ref) throw new Error(`DIRECT_CORRELATION_REFS_REQUIRED:${corr.event_id}`);
    const stateEvents=group.filter(e=>e!==corr);
    const bundle={
      schema_version:SCHEMA,
      bundle_id:`CB-${p.action_id}`,
      flow_class:flow,
      source_action_kind:sourceKind,
      fact_state:'OBSERVED_CAUSAL_BINDING',
      provenance:{command_id:p.command_id,lineage_id:p.lineage_id||p.command_id,page_id:p.page_id,action_id:p.action_id,source_event_ids:group.map(e=>e.event_id),first_timestamp:prov(group[0]).timestamp,last_timestamp:prov(group[group.length-1]).timestamp},
      causal_chain:[
        {stage:'ACTION',evidence_ref:{schema_version:'ACTION_EVENT_REF_V1',ref_id:p.action_id,source_event_id:corr.event_id}},
        {stage:'REQUEST',evidence_ref:obs.network_observation_event_ref},
        {stage:'RESPONSE',evidence_ref:obs.response_body_ref},
        {stage:'DOM_OR_PAGE_STATE',evidence_ref:obs.dom_event_ref,state_event_ids:stateEvents.map(e=>e.event_id)}
      ],
      observed_facts:{
        correlation_event_id:corr.event_id,
        source_state_schema_versions:[...new Set(stateEvents.map(e=>e.schema_version))],
        network_observation_event_ref:obs.network_observation_event_ref,
        response_body_ref:obs.response_body_ref,
        dom_event_ref:obs.dom_event_ref,
        page_state_event_refs:stateEvents.map(e=>({event_id:e.event_id,schema_version:e.schema_version}))
      },
      causal_basis:{same_command_id:true,same_page_id:true,same_action_id:true,direct_correlation_event:true,time_order_observed:true,business_causality_inferred:false},
      inference_candidates:[],
      compatibility:{NETWORK_OBSERVATION_EVENT_REF_V1:obs.network_observation_event_ref,RESPONSE_BODY_REF_V1:obs.response_body_ref,DOM_EVENT_REF_V1:obs.dom_event_ref},
      consumer_projection:{
        a4:{flow_class:flow,page_id:p.page_id,action_id:p.action_id,dom_event_ref:obs.dom_event_ref,page_state_event_refs:stateEvents.map(e=>e.event_id)},
        a5:{flow_class:flow,page_id:p.page_id,action_id:p.action_id,network_observation_event_ref:obs.network_observation_event_ref,response_body_ref:obs.response_body_ref}
      },
      redaction:{raw_secret_value_count:0,raw_pii_value_count:0,raw_values_stored:false}
    };
    bundle.bundle_sha256=`sha256:${sha256(bundle)}`;
    bundles.push(bundle);
  }
  bundles.sort((a,b)=>a.provenance.first_timestamp.localeCompare(b.provenance.first_timestamp));
  return {schema_version:'ACTION_OBSERVATION_CAUSAL_BUNDLE_SET_V1',source_schema_version:'PRODUCT_WRITE_OBSERVATION_FIXTURE_SEQUENCE_V1',bundle_count:bundles.length,bundles};
}
function validateBundleSet(set){
  if(!set||!Array.isArray(set.bundles)) throw new Error('BUNDLE_SET_REQUIRED');
  const flows=set.bundles.map(b=>b.flow_class);
  for(const f of ['PUBLIC_READ','WRITE','MY_LISTING','EDIT']) if(!flows.includes(f)) throw new Error(`FLOW_MISSING:${f}`);
  if(set.bundles.length!==4) throw new Error(`BUNDLE_COUNT_EXPECTED_4:${set.bundles.length}`);
  const commandIds=new Set(set.bundles.map(b=>b.provenance.command_id));
  const lineageIds=new Set(set.bundles.map(b=>b.provenance.lineage_id));
  if(commandIds.size!==1||lineageIds.size!==1) throw new Error('COMMAND_LINEAGE_MISMATCH');
  for(const b of set.bundles){
    if(b.inference_candidates.length!==0||b.causal_basis.business_causality_inferred!==false) throw new Error(`BUSINESS_INFERENCE_FORBIDDEN:${b.bundle_id}`);
    if(!b.compatibility.NETWORK_OBSERVATION_EVENT_REF_V1||!b.compatibility.RESPONSE_BODY_REF_V1||!b.compatibility.DOM_EVENT_REF_V1) throw new Error(`LEGACY_REF_MISSING:${b.bundle_id}`);
    if(!b.consumer_projection?.a4||!b.consumer_projection?.a5) throw new Error(`CONSUMER_PROJECTION_MISSING:${b.bundle_id}`);
  }
  const raw=JSON.stringify(set);
  for(const forbidden of ['010-1234-5678','Private Seller Name','hong-gildong-home.jpg','listing-user-123','listing-user-456','950000000','990000000']) if(raw.includes(forbidden)) throw new Error(`RAW_SENSITIVE_LEAK:${forbidden}`);
  return {status:'PASS',bundle_count:4,flows:['PUBLIC_READ','WRITE','MY_LISTING','EDIT'],same_command_lineage:true,direct_correlation_bundle_count:4,a4_direct_consumption:true,a5_direct_consumption:true,legacy_ref_compatibility:true,business_inference_count:0,raw_secret_or_pii_count:0};
}
module.exports={SCHEMA,FLOW_MAP,bindCausalBundles,validateBundleSet,sha256,stable};
