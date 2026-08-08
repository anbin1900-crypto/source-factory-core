#!/usr/bin/env node
'use strict';
const crypto = require('node:crypto');

const ENTITY_TYPES = ['listing','agency','agent','complex','location','price','area','media','contact','status'];
const LANES = ['PUBLIC_READ','WRITE','MY_LISTING','EDIT'];
const CAPABILITIES = ['PUBLIC_READ','WRITE','MY_LISTING','EDIT','DELETE','END_POSTING'];
const SUPPORT_STATES = ['OBSERVED_SUPPORTED','OBSERVED_UNSUPPORTED','WAITING_INPUT','UNKNOWN'];
const SECRET_RE = /(bearer\s+[a-z0-9._~+/=-]{6,}|basic\s+[a-z0-9+/=]{8,}|(?:api[_-]?key|password|secret|token|cookie|authorization)\s*[:=]\s*(?!<redacted>)[^\s,;}]{6,})/i;
const EMAIL_RE=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE=/(?:\+?82[- .]?)?0(?:10|11|16|17|18|19)[- .]?\d{3,4}[- .]?\d{4}/;
const RRN_RE=/\b\d{6}[- ]?[1-4]\d{6}\b/;
const PII_KEY_RE=/^(?:email|email_address|phone|phone_number|mobile|mobile_number|rrn|ssn|resident_registration_number|owner_name|customer_name|agent_name|contact_name)$/i;
const D_CANONICAL_KEY_RE=/^(?:d_canonical|d_canonical_id|canonical_db_id|canonical_schema_id)$/i;
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function sha256(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function arr(v){return Array.isArray(v)?v:[];}
function fail(code,message,path='$'){const e=new Error(`${message} at ${path}`);e.code=code;throw e;}
function validateRestricted(v,path='$'){
  if(typeof v==='string'){
    if(v==='<REDACTED>'||v==='UNKNOWN'||v==='WAITING_INPUT')return;
    if(SECRET_RE.test(v))fail('RAW_SECRET_VALUE_REJECTED','raw secret-like value',path);
    if(EMAIL_RE.test(v)||PHONE_RE.test(v)||RRN_RE.test(v))fail('RAW_PII_VALUE_REJECTED','raw PII-like value',path);
    return;
  }
  if(Array.isArray(v)){v.forEach((x,i)=>validateRestricted(x,`${path}[${i}]`));return;}
  if(v&&typeof v==='object') for(const [k,x] of Object.entries(v)){
    if(D_CANONICAL_KEY_RE.test(k)) fail('D_CANONICAL_AUTHORITY_FORBIDDEN','D Canonical field forbidden',`${path}.${k}`);
    if(PII_KEY_RE.test(k)&&typeof x==='string'&&x!=='<REDACTED>'&&x!=='UNKNOWN'&&x!=='WAITING_INPUT'&&x.length) fail('RAW_PII_VALUE_REJECTED','raw PII value',`${path}.${k}`);
    validateRestricted(x,`${path}.${k}`);
  }
}
function requireState(v,path){if(!['OBSERVED','INFERRED','UNKNOWN','WAITING_INPUT'].includes(v))fail('INVALID_EVIDENCE_STATE','invalid evidence state',path);}
function evidence(v){return typeof v==='string'&&v.length?v:'UNKNOWN';}
function buildEntityModel(input){
  const sourceBindings=arr(input.source_field_bindings);
  const entities=ENTITY_TYPES.map(type=>{
    const binds=sourceBindings.filter(x=>x.entity_type===type).map(x=>({source_field:x.source_field||'UNKNOWN',source_path:x.source_path||'UNKNOWN',semantic_role:x.semantic_role||'UNKNOWN',state:x.state||'UNKNOWN',confidence:Number(x.confidence??0),evidence_pointer:evidence(x.evidence_pointer),lossless_extension:x.lossless_extension??true}));
    return {entity_type:type,source_identifier:{field:input.identifiers?.[type]?.field||'UNKNOWN',path:input.identifiers?.[type]?.path||'UNKNOWN',state:input.identifiers?.[type]?.state||'UNKNOWN',evidence_pointer:evidence(input.identifiers?.[type]?.evidence_pointer)},source_field_bindings:binds,lossless_extensions:{enabled:true,unknown_source_fields_preserved:true,storage:'source_extensions'},d_canonical_authority:false};
  });
  const relationships=arr(input.relationships).map((r,i)=>({relationship_id:r.relationship_id||`REL-${String(i+1).padStart(3,'0')}`,from_entity:r.from_entity||'UNKNOWN',to_entity:r.to_entity||'UNKNOWN',relation_type:r.relation_type||'UNKNOWN',source_join_fields:r.source_join_fields||[],state:r.state||'UNKNOWN',confidence:Number(r.confidence??0),evidence_pointer:evidence(r.evidence_pointer)}));
  return {schema_version:'A5_REAL_ESTATE_SOURCE_ENTITY_MODEL_V1',entity_types:ENTITY_TYPES,entities,relationships,source_ontology_policy:{preserve_original_semantics:true,unknown_fields_lossless_extension:true,d_canonical_schema_defined:false},raw_secret_or_pii:false};
}
function buildFormBinding(input){
  const actions=arr(input.form_actions).map((x,i)=>({binding_id:x.binding_id||`FAB-${String(i+1).padStart(3,'0')}`,site_id:x.site_id||'UNKNOWN',lane:LANES.includes(x.lane)?x.lane:'UNKNOWN',capability:x.capability||'UNKNOWN',form_id:x.form_id||'UNKNOWN',form_field:x.form_field||'UNKNOWN',validation_rule:x.validation_rule||{state:'UNKNOWN',rule:'UNKNOWN'},request_binding:x.request_binding||{state:'WAITING_INPUT',request_field:'UNKNOWN'},response_binding:x.response_binding||{state:'WAITING_INPUT',result_path:'UNKNOWN'},ui_state_binding:x.ui_state_binding||{state:'WAITING_INPUT',component:'UNKNOWN'},state:x.state||'UNKNOWN',confidence:Number(x.confidence??0),evidence_pointer:evidence(x.evidence_pointer),final_submit_performed:false}));
  return {schema_version:'A5_FORM_ACTION_BINDING_CONTRACT_V1',chain:['form_field','validation_rule','request_field','response_result','ui_state'],bindings:actions,session_policy:{credential_reference_only:true,raw_secret_or_pii_storage:false},unknown_policy:'WAITING_INPUT_OR_UNKNOWN_FAIL_CLOSED',final_write_or_edit_submit:false};
}
function buildCapabilityMatrix(input){
  const sites=arr(input.sites).map(site=>({site_id:site.site_id||'UNKNOWN',site_origin:site.site_origin||'UNKNOWN',capabilities:Object.fromEntries(CAPABILITIES.map(cap=>{const v=site.capabilities?.[cap]||{support:'UNKNOWN'};const support=SUPPORT_STATES.includes(v.support)?v.support:'UNKNOWN';return [cap,{support,state:v.state||(support.startsWith('OBSERVED_')?'OBSERVED':support),confidence:Number(v.confidence??0),evidence_pointer:evidence(v.evidence_pointer)}];})),source_semantics_preserved:true}));
  return {schema_version:'A5_CAPABILITY_AND_VALIDATION_MATRIX_V1',lanes:LANES,capabilities:CAPABILITIES,support_states:SUPPORT_STATES,sites,validation_policy:{unobserved_support:'UNKNOWN',missing_site_receipt:'WAITING_INPUT',guess_target_values:false}};
}
function validateArtifacts(entityModel,formBinding,capabilityMatrix){
  validateRestricted({entityModel,formBinding,capabilityMatrix});
  const errors=[];
  for(const e of entityModel.entities){if(!ENTITY_TYPES.includes(e.entity_type))errors.push(`UNKNOWN_ENTITY:${e.entity_type}`);requireState(e.source_identifier.state,`entity.${e.entity_type}.source_identifier.state`);for(const b of e.source_field_bindings)requireState(b.state,`entity.${e.entity_type}.${b.source_field}.state`);}
  for(const r of entityModel.relationships){if(!ENTITY_TYPES.includes(r.from_entity)||!ENTITY_TYPES.includes(r.to_entity))errors.push(`INVALID_RELATION:${r.relationship_id}`);requireState(r.state,`relationship.${r.relationship_id}.state`);}
  for(const b of formBinding.bindings){if(![...LANES,'UNKNOWN'].includes(b.lane))errors.push(`INVALID_LANE:${b.binding_id}`);if(b.final_submit_performed!==false)errors.push(`FINAL_SUBMIT_FORBIDDEN:${b.binding_id}`);}
  for(const site of capabilityMatrix.sites){for(const cap of CAPABILITIES){const support=site.capabilities?.[cap]?.support;if(!SUPPORT_STATES.includes(support))errors.push(`INVALID_CAPABILITY_SUPPORT:${site.site_id}:${cap}`);}}
  if(errors.length)fail('VALIDATION_FAILED',errors.join('|'));
  return {status:'PASS',entity_type_count:entityModel.entities.length,relationship_count:entityModel.relationships.length,form_binding_count:formBinding.bindings.length,site_count:capabilityMatrix.sites.length,raw_secret_value_count:0,raw_pii_value_count:0,d_canonical_definition_count:0,final_write_or_edit_submit_count:0};
}
function build(input){
  if(input?.schema_version!=='A5_REAL_ESTATE_SOURCE_REINFORCEMENT_INPUT_V1')fail('INVALID_INPUT_SCHEMA','input schema required');
  validateRestricted(input);
  const entityModel=buildEntityModel(input);const formBinding=buildFormBinding(input);const capabilityMatrix=buildCapabilityMatrix(input);const validation=validateArtifacts(entityModel,formBinding,capabilityMatrix);
  const out={schema_version:'A5_REAL_ESTATE_ENTITY_FORM_ACTION_BINDING_SOURCE_RESULT_V1',entity_model:entityModel,form_action_binding:formBinding,capability_validation_matrix:capabilityMatrix,validation,decision_status:'PASS',raw_secret_value_count:0,raw_pii_value_count:0,target_value_guessing:false,final_write_or_edit_submit:false,production:false,ready:false,merge:false};out.result_digest=sha256(out);return out;
}
module.exports={build,buildEntityModel,buildFormBinding,buildCapabilityMatrix,validateArtifacts,sha256,ENTITY_TYPES,LANES,CAPABILITIES};
if(require.main===module){let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.stringify(build(JSON.parse(raw||'{}')),null,2)+'\n');}catch(e){process.stderr.write(JSON.stringify({status:'ERROR',code:e.code||'BUILD_FAILED',message:e.message})+'\n');process.exitCode=['RAW_SECRET_VALUE_REJECTED','RAW_PII_VALUE_REJECTED','D_CANONICAL_AUTHORITY_FORBIDDEN'].includes(e.code)?40:30;}});}
