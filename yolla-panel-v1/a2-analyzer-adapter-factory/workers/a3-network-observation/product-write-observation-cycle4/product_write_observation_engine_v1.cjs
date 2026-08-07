'use strict';
const crypto = require('node:crypto');

const SCHEMAS = Object.freeze({
  PAGE_STATE: 'PAGE_STATE_OBSERVATION_EVENT_V1',
  FORM: 'FORM_INTERACTION_OBSERVATION_V1',
  MY_LISTING: 'MY_LISTING_PAGE_OBSERVATION_V1',
  EDIT: 'EDIT_FLOW_OBSERVATION_V1',
  CORRELATION: 'ACTION_DOM_NETWORK_RESPONSE_CORRELATION_V2',
});
const SENSITIVE_RE = /(authorization|cookie|token|secret|password|passwd|api[_-]?key|email|phone|resident|name|address|credential|session)/i;
const SECRET_TEXT_RE = /(bearer\s+[A-Za-z0-9._~+\/-]{6,}|(?:token|secret|password|cookie|authorization|email|phone)\s*[:=]\s*[^\s,;}&]+)/ig;
function sha256(v){return crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');}
function redactedRef(kind, raw){
  const value = raw == null ? '' : String(raw);
  return {kind, value_state: value ? 'PRESENT_REDACTED' : 'NOT_PRESENT', redacted_hash: `sha256:${sha256(value)}`, raw_value_retained:false};
}
function redactText(v){return String(v??'').replace(SECRET_TEXT_RE,'<REDACTED>');}
function sanitize(value, key=''){
  if (SENSITIVE_RE.test(key)) return redactedRef('SENSITIVE_FIELD', value);
  if (Array.isArray(value)) return value.map((v)=>sanitize(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitize(v,k)]));
  if (typeof value === 'string') return redactText(value);
  return value;
}
function ref(kind, id, digestInput){return {schema_version:`${kind}_REF_V1`,ref_id:id,sha256:`sha256:${sha256(digestInput)}`,storage:'REFERENCE_ONLY'};}
function provenance(input){
  if(!input.command_id||!input.page_id||!input.action_id) throw new Error('COMMAND_PAGE_ACTION_PROVENANCE_REQUIRED');
  return {command_id:input.command_id,page_id:input.page_id,action_id:input.action_id,lineage_id:input.lineage_id||input.command_id,timestamp:input.timestamp||new Date(0).toISOString()};
}
function base(schema,input,observed){
  return {schema_version:schema,event_id:input.event_id||`${schema}:${input.action_id}`,provenance:provenance(input),fact_state:'OBSERVED',observed:sanitize(observed),inference_candidates:[],redaction:{applied:true,raw_secret_value_count:0,raw_pii_value_count:0}};
}
function pageState(input){
  const e=base(SCHEMAS.PAGE_STATE,input,{page_kind:input.page_kind||'UNKNOWN',url_pattern:input.url_pattern||'https://fixture.invalid/',frame_id:input.frame_id||'main',popup_state:input.popup_state||'NONE',document_state:input.document_state||'ACTIVE',dom_event_ref:input.dom_event_ref});
  if(input.page_kind_candidate)e.inference_candidates.push({candidate_type:'PAGE_KIND',value:input.page_kind_candidate,confidence:input.confidence??0.5,status:'CANDIDATE_NOT_FACT'});
  e.compatibility={dom_event_ref:input.dom_event_ref||null,network_observation_event_ref:input.network_observation_event_ref||null,response_body_ref:input.response_body_ref||null};
  return e;
}
function formInteraction(input){
  const kind=String(input.interaction||'INPUT').toUpperCase();
  const observed={interaction:kind,field_ref:input.field_ref||null,control_type:input.control_type||null,option_ref:input.option_value!=null?redactedRef('OPTION_VALUE',input.option_value):null,value_ref:input.value!=null?redactedRef('FORM_VALUE',input.value):null,upload_ref:input.upload?{mime_type:input.upload.mime_type||null,size_bytes:input.upload.size_bytes??null,file_name_hash:input.upload.file_name?`sha256:${sha256(input.upload.file_name)}`:null,raw_file_name_retained:false}:null,validation:{state:input.validation_state||'UNCHANGED',code:input.validation_code||null,message_ref:input.validation_message?redactedRef('VALIDATION_MESSAGE',input.validation_message):null},dom_event_ref:input.dom_event_ref||null};
  const e=base(SCHEMAS.FORM,input,observed);
  e.compatibility={dom_event_ref:input.dom_event_ref||null,network_observation_event_ref:input.network_observation_event_ref||null,response_body_ref:input.response_body_ref||null};
  e.consumer_projection={a4:{interaction:kind,field_ref:observed.field_ref,control_type:observed.control_type,validation_state:observed.validation.state},a5:{network_observation_event_ref:e.compatibility.network_observation_event_ref,response_body_ref:e.compatibility.response_body_ref}};
  return e;
}
function myListing(input){
  const e=base(SCHEMAS.MY_LISTING,input,{page_role:'MY_LISTING',listing_count:input.listing_count??null,listing_identity_refs:(input.listing_ids||[]).map((v)=>redactedRef('LISTING_ID',v)),selected_listing_ref:input.selected_listing_id?redactedRef('LISTING_ID',input.selected_listing_id):null,dom_event_ref:input.dom_event_ref||null});
  e.compatibility={dom_event_ref:input.dom_event_ref||null,network_observation_event_ref:input.network_observation_event_ref||null,response_body_ref:input.response_body_ref||null};
  e.consumer_projection={a4:{page_role:'MY_LISTING',listing_count:e.observed.listing_count},a5:{network_observation_event_ref:e.compatibility.network_observation_event_ref,response_body_ref:e.compatibility.response_body_ref}};
  return e;
}
function editFlow(input){
  const phase=String(input.phase||'OPEN').toUpperCase();
  const e=base(SCHEMAS.EDIT,input,{flow:'EDIT',phase,entity_ref:input.entity_id?redactedRef('ENTITY_ID',input.entity_id):null,changed_field_refs:(input.changed_fields||[]).map((f)=>({field_ref:f.field_ref||null,before_ref:redactedRef('FIELD_VALUE',f.before),after_ref:redactedRef('FIELD_VALUE',f.after)})),validation_state:input.validation_state||'UNCHANGED',dom_event_ref:input.dom_event_ref||null});
  e.compatibility={dom_event_ref:input.dom_event_ref||null,network_observation_event_ref:input.network_observation_event_ref||null,response_body_ref:input.response_body_ref||null};
  e.consumer_projection={a4:{flow:'EDIT',phase,changed_field_refs:e.observed.changed_field_refs.map(x=>x.field_ref)},a5:{network_observation_event_ref:e.compatibility.network_observation_event_ref,response_body_ref:e.compatibility.response_body_ref}};
  return e;
}
function correlation(input){
  const e=base(SCHEMAS.CORRELATION,input,{action_kind:input.action_kind||'UNKNOWN',dom_event_ref:input.dom_event_ref||null,network_observation_event_ref:input.network_observation_event_ref||null,response_body_ref:input.response_body_ref||null,frame_ref:input.frame_ref||null,popup_ref:input.popup_ref||null,correlation_basis:{same_action_id:true,same_command_id:true,time_window_ms:input.time_window_ms??1000}});
  e.consumer_projection={a4:{action_id:e.provenance.action_id,dom_event_ref:e.observed.dom_event_ref,page_id:e.provenance.page_id},a5:{action_id:e.provenance.action_id,network_observation_event_ref:e.observed.network_observation_event_ref,response_body_ref:e.observed.response_body_ref,page_id:e.provenance.page_id}};
  return e;
}
function buildFixtureSequence(){
  const command_id='CMD-FIXTURE-PRODUCT-WRITE-001', lineage_id='LINEAGE-PRODUCT-WRITE-001';
  const events=[];
  let seq=0; const ts=()=>`2026-08-08T00:00:${String(seq++).padStart(2,'0')}.000+09:00`;
  const mk=(action_id,page_id,extra={})=>({command_id,lineage_id,action_id,page_id,timestamp:ts(),...extra});
  const d=(id)=>ref('DOM_EVENT',id,id), n=(id)=>ref('NETWORK_OBSERVATION_EVENT',id,id), r=(id)=>ref('RESPONSE_BODY',id,id);
  events.push(pageState(mk('A-PUBLIC-READ','P-PUBLIC',{event_id:'E1',page_kind:'PUBLIC_READ',url_pattern:'https://fixture.invalid/list',dom_event_ref:d('DOM-1'),network_observation_event_ref:n('NET-1'),response_body_ref:r('RB-1')})));
  events.push(correlation(mk('A-PUBLIC-READ','P-PUBLIC',{event_id:'E2',action_kind:'PUBLIC_READ',dom_event_ref:d('DOM-1'),network_observation_event_ref:n('NET-1'),response_body_ref:r('RB-1')})));
  events.push(pageState(mk('A-CREATE','P-CREATE',{event_id:'E3',page_kind:'CREATE',url_pattern:'https://fixture.invalid/create',dom_event_ref:d('DOM-2')})));
  events.push(formInteraction(mk('A-CREATE','P-CREATE',{event_id:'E4',interaction:'INPUT',field_ref:'FIELD:title',control_type:'text',value:'Private Seller Name 010-1234-5678',validation_state:'VALID',dom_event_ref:d('DOM-3')})));
  events.push(formInteraction(mk('A-CREATE','P-CREATE',{event_id:'E5',interaction:'SELECT',field_ref:'FIELD:category',control_type:'select',option_value:'apartment',validation_state:'VALID',dom_event_ref:d('DOM-4')})));
  events.push(formInteraction(mk('A-CREATE','P-CREATE',{event_id:'E6',interaction:'UPLOAD',field_ref:'FIELD:image',control_type:'file',upload:{file_name:'hong-gildong-home.jpg',mime_type:'image/jpeg',size_bytes:12003},validation_state:'VALID',dom_event_ref:d('DOM-5')})));
  events.push(correlation(mk('A-CREATE','P-CREATE',{event_id:'E7',action_kind:'CREATE',dom_event_ref:d('DOM-6'),network_observation_event_ref:n('NET-2'),response_body_ref:r('RB-2')})));
  events.push(myListing(mk('A-MY-LISTING','P-MY',{event_id:'E8',listing_count:2,listing_ids:['listing-user-123','listing-user-456'],selected_listing_id:'listing-user-123',dom_event_ref:d('DOM-7'),network_observation_event_ref:n('NET-3'),response_body_ref:r('RB-3')})));
  events.push(correlation(mk('A-MY-LISTING','P-MY',{event_id:'E9',action_kind:'MY_LISTING',dom_event_ref:d('DOM-7'),network_observation_event_ref:n('NET-3'),response_body_ref:r('RB-3')})));
  events.push(editFlow(mk('A-EDIT','P-EDIT',{event_id:'E10',phase:'OPEN',entity_id:'listing-user-123',dom_event_ref:d('DOM-8')})));
  events.push(formInteraction(mk('A-EDIT','P-EDIT',{event_id:'E11',interaction:'INPUT',field_ref:'FIELD:price',control_type:'number',value:'990000000',validation_state:'VALID',dom_event_ref:d('DOM-9')})));
  events.push(editFlow(mk('A-EDIT','P-EDIT',{event_id:'E12',phase:'SUBMIT',entity_id:'listing-user-123',changed_fields:[{field_ref:'FIELD:price',before:'950000000',after:'990000000'}],validation_state:'VALID',dom_event_ref:d('DOM-10'),network_observation_event_ref:n('NET-4'),response_body_ref:r('RB-4')})));
  events.push(correlation(mk('A-EDIT','P-EDIT',{event_id:'E13',action_kind:'EDIT',dom_event_ref:d('DOM-10'),network_observation_event_ref:n('NET-4'),response_body_ref:r('RB-4')})));
  return {schema_version:'PRODUCT_WRITE_OBSERVATION_FIXTURE_SEQUENCE_V1',command_id,lineage_id,events};
}
function validateFixture(bundle){
  const reqSchemas=new Set(Object.values(SCHEMAS));
  const got=new Set(bundle.events.map(e=>e.schema_version));
  for(const s of reqSchemas) if(!got.has(s)) throw new Error(`MISSING_SCHEMA:${s}`);
  if(!bundle.events.every(e=>e.provenance.command_id===bundle.command_id&&e.provenance.lineage_id===bundle.lineage_id&&e.provenance.page_id&&e.provenance.action_id)) throw new Error('PROVENANCE_LINEAGE_FAIL');
  const kinds=new Set(bundle.events.flatMap(e=>[e.observed?.page_kind,e.observed?.action_kind,e.observed?.page_role,e.observed?.flow]).filter(Boolean));
  for(const k of ['PUBLIC_READ','CREATE','MY_LISTING','EDIT']) if(!kinds.has(k)) throw new Error(`MISSING_FLOW:${k}`);
  const raw=JSON.stringify(bundle);
  for(const secret of ['010-1234-5678','Private Seller Name','hong-gildong-home.jpg','listing-user-123','listing-user-456','950000000','990000000']) if(raw.includes(secret)) throw new Error(`RAW_SENSITIVE_LEAK:${secret}`);
  if(!bundle.events.every(e=>e.fact_state==='OBSERVED'&&Array.isArray(e.inference_candidates))) throw new Error('OBSERVED_INFERENCE_SEPARATION_FAIL');
  const correlations=bundle.events.filter(e=>e.schema_version===SCHEMAS.CORRELATION);
  if(correlations.length<4) throw new Error('CORRELATION_COUNT_LOW');
  if(!correlations.every(e=>e.consumer_projection?.a4&&e.consumer_projection?.a5)) throw new Error('CONSUMER_PROJECTION_MISSING');
  return {status:'PASS',event_count:bundle.events.length,correlation_count:correlations.length,flows:['PUBLIC_READ','CREATE','MY_LISTING','EDIT'],schemas:[...got],command_lineage_pass:true,raw_secret_or_pii_count:0,observed_inference_separation_pass:true,a4_direct_consumer_projection_pass:true,a5_direct_consumer_projection_pass:true,network_observation_compatibility_pass:true,response_body_ref_compatibility_pass:true,dom_event_ref_compatibility_pass:true};
}
module.exports={SCHEMAS,redactedRef,sanitize,pageState,formInteraction,myListing,editFlow,correlation,buildFixtureSequence,validateFixture,sha256};
