'use strict';
const crypto=require('node:crypto');
const {validateEvidenceSet}=require('./A4_EVIDENCE_POINTER_VALIDATOR_V1.cjs');
const {rank}=require('./A4_LOCATOR_DRIFT_GUARD_V1.cjs');
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');}
function status(observed,inferred){return observed?'OBSERVED':inferred?'INFERRED':'UNKNOWN';}
function inferArchetype(s={}){
  const sig=new Set(s.signals||[]), url=String(s.url||'');
  const rules=[
    ['LISTING_CREATE',()=>sig.has('create_action')&&sig.has('write_form')],['LISTING_EDIT',()=>sig.has('update_action')&&sig.has('write_form')],['LOGIN',()=>sig.has('credential_form')],['MAP_SEARCH',()=>sig.has('map_region')],['MY_LISTING',()=>sig.has('owner_collection_or_detail')||/\/my\//.test(url)],['FILTER_RESULTS',()=>sig.has('filter_control')&&sig.has('repeated_collection')],['PUBLIC_SEARCH',()=>sig.has('search_control')&&!sig.has('repeated_collection')],['PUBLIC_LIST',()=>sig.has('repeated_collection')],['PUBLIC_DETAIL',()=>sig.has('entity_detail')]
  ];
  const m=rules.find(([,f])=>f()); return m?{archetype:m[0],evidence_status:s.observed_page?'OBSERVED':'INFERRED',confidence:s.observed_page?0.97:0.82}:{archetype:'UNKNOWN',evidence_status:'UNKNOWN',confidence:0};
}
function interactionModes(s={}){const f=s.runtime||{},n=s.navigation||{};return {
  spa_route:{value:!!f.spa_route,status:status(f.spa_route_observed,!!f.spa_route)},
  pagination:{value:n.pagination_type||'UNKNOWN',status:status(n.pagination_observed,!!n.pagination_type)},
  infinite_scroll:{value:!!f.infinite_scroll,status:status(f.infinite_scroll_observed,!!f.infinite_scroll)},
  virtualized_list:{value:!!f.virtualized_list,status:status(f.virtualized_observed,!!f.virtualized_list)},
  lazy_load:{value:!!f.lazy_load,status:status(f.lazy_load_observed,!!f.lazy_load)},
  modal:{value:!!f.modal,status:status(f.modal_observed,!!f.modal)},drawer:{value:!!f.drawer,status:status(f.drawer_observed,!!f.drawer)},dynamic_form:{value:!!f.dynamic_form,status:status(f.dynamic_form_observed,!!f.dynamic_form)}
};}
function infer(input={}){
  const ev=validateEvidenceSet(input.evidence||{}), page=inferArchetype(input), modes=interactionModes(input), locators=rank(input.locator_candidates||[]);
  const components=(input.components||[]).map(c=>({component_role:c.role||'UNKNOWN',locator_candidates:rank(c.locator_candidates||[]),evidence_status:status(c.observed,!!c.role),confidence:c.observed?0.96:(c.role?0.78:0),fallback:c.fallback||'WAITING_INPUT',evidence_pointer:c.evidence_pointer||'WAITING_INPUT'}));
  const forms=(input.forms||[]).map(f=>({form_role:f.role||'UNKNOWN',dynamic:!!f.dynamic,fields:(f.fields||[]).map(x=>({field_role:x.role||'UNKNOWN',input_type:x.input_type||'UNKNOWN',required:x.required??'UNKNOWN',options:x.options??'WAITING_INPUT',unit:x.unit??'UNKNOWN',validation:x.validation??'UNKNOWN',locator_candidates:rank(x.locator_candidates||[]),evidence_status:status(x.observed,!!x.role)})),evidence_status:status(f.observed,!!f.role)}));
  const fallback_reasons=[];if(modes.virtualized_list.value)fallback_reasons.push('VIRTUALIZED_LIST_RENDER_WINDOW');if(modes.lazy_load.value)fallback_reasons.push('LAZY_LOAD_INCREMENTAL');if(modes.spa_route.value)fallback_reasons.push('SPA_ROUTE_NO_FULL_DOCUMENT_RELOAD');if(modes.dynamic_form.value)fallback_reasons.push('DYNAMIC_FORM_CONDITIONAL_FIELDS');
  const result={schema_version:'A4_COMPONENT_NAVIGATION_INFERENCE_V1',site_profile_id:input.site_profile_id||'UNKNOWN',page_identity:{url:input.url||'WAITING_INPUT',page_id:input.page_id||'UNKNOWN',archetype:page.archetype,evidence_status:page.evidence_status,confidence:page.confidence},interaction_modes:modes,components,forms,locator_candidates:locators,evidence_validation:ev,fallback:{active:fallback_reasons.length>0,confidence:fallback_reasons.length?0.78:0.95,fallback_reason:fallback_reasons.length?fallback_reasons:['NONE']},late_bind:{target_values:'WAITING_INPUT',unknown_fields:['real_site_command_id','real_site_action_id'].filter(k=>!input[k])}};
  result.structure_digest=digest(result);return result;
}
module.exports={canonical,digest,inferArchetype,interactionModes,infer};
