'use strict';
const crypto=require('node:crypto');
const PAGE_ROLES=['PUBLIC_SEARCH','PUBLIC_LIST','PUBLIC_DETAIL','LISTING_CREATE','MY_LISTING_LIST','MY_LISTING_DETAIL','LISTING_EDIT','LISTING_EXPIRE'];
const COMPONENT_RULES=[
  ['SEARCH_FORM',/(search|검색)/i,['form']],['RESULT_LIST',/(result|list|목록)/i,['main','section','div']],['RESULT_CARD',/(card|item|listing)/i,['article','li','tr']],
  ['DETAIL_PANEL',/(detail|상세)/i,['section','main','article']],['CREATE_FORM',/(create|등록)/i,['form']],['EDIT_FORM',/(edit|수정)/i,['form']],
  ['ACTION_BAR',/(action|toolbar|actions)/i,['div','nav']],['STATUS_BANNER',/(status|state|상태)/i,['div','section']],['PAGINATION',/(pagination|pager|next)/i,['nav','div','a']],
  ['EXPIRE_CONTROL',/(expire|만료)/i,['button','form','div']]
];
function canon(v){if(Array.isArray(v))return v.map(canon);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])]));return v;}
function stable(v){return JSON.stringify(canon(v));}
function sha(v){return crypto.createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');}
function clamp(v){return Math.max(0,Math.min(1,v));}
function ev(status,confidence,source){return{evidence_status:status,confidence:+clamp(confidence).toFixed(4),evidence_pointer:source||null};}
function classifyRole(page){
  const explicit=String(page.page_role||'').toUpperCase(); if(PAGE_ROLES.includes(explicit)) return {role:explicit,...ev('OBSERVED',.99,page.page_role_evidence||page.page_id)};
  const s=[page.url,page.title,...(page.markers||[])].join(' ').toLowerCase();
  const rules=[
    ['LISTING_EXPIRE',/(expire|expired|만료)/],['LISTING_EDIT',/(edit|수정)/],['LISTING_CREATE',/(create|new-listing|등록)/],['MY_LISTING_DETAIL',/(my[-_/ ]listing.*detail|내.*매물.*상세)/],
    ['MY_LISTING_LIST',/(my[-_/ ]listings|내.*매물.*목록)/],['PUBLIC_DETAIL',/(detail|상세)/],['PUBLIC_SEARCH',/(search|검색)/],['PUBLIC_LIST',/(list|results|목록)/]
  ];
  for(const[r,x]of rules)if(x.test(s))return{role:r,...ev('INFERRED',.88,page.page_id)};
  return{role:'UNKNOWN',...ev('UNKNOWN',.25,page.page_id)};
}
function fallback(page){const h=page.runtime_state||{},reasons=[];if(h.virtualized)reasons.push('VIRTUALIZED_LIST_RENDER_WINDOW');if(h.dynamic_dom)reasons.push('DYNAMIC_DOM_MUTATION');if(h.lazy_load)reasons.push('LAZY_LOAD_PENDING_OR_INCREMENTAL');if(h.spa)reasons.push('SPA_ROUTE_WITHOUT_FULL_DOCUMENT_RELOAD');return{active:reasons.length>0,confidence:+(reasons.length?Math.max(.55,.9-reasons.length*.05):.98).toFixed(4),fallback_reason:reasons.length?reasons:['NONE']};}
function componentRole(c){const explicit=String(c.role||'').toUpperCase();if(explicit)return{role:explicit,...ev('OBSERVED',.99,c.evidence_pointer||c.component_id)};const s=[c.name,c.label,c.locator,c.tag].join(' ');for(const[r,re,tags]of COMPONENT_RULES)if(re.test(s)&&(tags.includes(String(c.tag||'').toLowerCase())||!c.tag))return{role:r,...ev('INFERRED',.8,c.evidence_pointer||c.component_id)};return{role:'UNKNOWN_COMPONENT',...ev('UNKNOWN',.3,c.evidence_pointer||c.component_id)};}
function normalizeLocator(l){if(typeof l==='string')return{strategy:'css',locator:l,confidence:.6,evidence_status:'OBSERVED'};return{strategy:l.strategy||'css',locator:l.locator||'',confidence:+Number(l.confidence??l.stability_score??.6).toFixed(4),evidence_status:l.evidence_status||'OBSERVED'};}
function formFields(page){const out=[];for(const form of page.forms||[]){for(const f of form.fields||[]){const options=Array.isArray(f.options)?[...f.options]:[];out.push({form_id:form.form_id,field_id:f.field_id,label:f.label??null,input_type:f.input_type||'text',options,required:!!f.required,unit:f.unit??null,validation:f.validation||{kind:'UNKNOWN'},locator_candidates:(f.locator_candidates||[]).map(normalizeLocator),value_semantics:f.value_semantics||null,...ev(f.evidence_status||'OBSERVED',Number(f.confidence??.95),f.evidence_pointer||`${page.page_id}:${form.form_id}:${f.field_id}`)});}}return out;}
function uiStates(page){return (page.ui_state_regions||[]).map((s,i)=>({region_id:s.region_id||`state-${page.page_id}-${i+1}`,state_role:String(s.state_role||'UNKNOWN').toUpperCase(),locator:s.locator||null,visible_when:s.visible_when||null,...ev(s.evidence_status||'OBSERVED',Number(s.confidence??.9),s.evidence_pointer||page.page_id)}));}
function build(input){
  if(!input||!Array.isArray(input.pages))throw new Error('PAGES_REQUIRED');
  const pageNodes=[],pageEdges=[],componentNodes=[],componentEdges=[],forms=[],states=[];
  for(const p of input.pages){const role=classifyRole(p),fb=fallback(p);const struct=p.structure_evidence||{};pageNodes.push({page_id:p.page_id,url:p.url||null,title:p.title||null,page_role:role.role,evidence_status:role.evidence_status,confidence:role.confidence,evidence_pointer:role.evidence_pointer,fallback:fb,structure_summary:{repeated_region_count:(struct.repeated_regions||[]).length,field_count:(struct.fields||[]).length,locator_count:(struct.locator_candidates||[]).length,pagination_candidate_count:(struct.pagination_candidates||[]).length}});
    for(const tr of p.transitions||[])pageEdges.push({from_page_id:p.page_id,to_page_id:tr.to_page_id||null,relation:tr.relation||'NAVIGATES_TO',trigger_locator:tr.trigger_locator||null,evidence_status:tr.evidence_status||'OBSERVED',confidence:+Number(tr.confidence??.9).toFixed(4)});
    for(const c of p.components||[]){const cr=componentRole(c);componentNodes.push({component_id:c.component_id,page_id:p.page_id,component_role:cr.role,locator:c.locator||null,parent_component_id:c.parent_component_id||null,evidence_status:cr.evidence_status,confidence:cr.confidence,evidence_pointer:cr.evidence_pointer});componentEdges.push({from:p.page_id,to:c.component_id,relation:'PAGE_CONTAINS_COMPONENT'});if(c.parent_component_id)componentEdges.push({from:c.parent_component_id,to:c.component_id,relation:'COMPONENT_CONTAINS_COMPONENT'});}
    const ff=formFields(p);for(const form of p.forms||[]){const own=ff.filter(x=>x.form_id===form.form_id);forms.push({page_id:p.page_id,form_id:form.form_id,form_role:String(form.form_role||'UNKNOWN').toUpperCase(),submit_locator:form.submit_locator||null,write_action:form.write_action||null,fields:own,...ev(form.evidence_status||'OBSERVED',Number(form.confidence??.95),form.evidence_pointer||`${p.page_id}:${form.form_id}`)});componentEdges.push({from:p.page_id,to:form.form_id,relation:'PAGE_CONTAINS_FORM'});}
    states.push(...uiStates(p).map(s=>({page_id:p.page_id,...s})));
  }
  const roleCoverage=Object.fromEntries(PAGE_ROLES.map(r=>[r,pageNodes.filter(p=>p.page_role===r).length]));
  const core={schema_version:'A4_PAGE_COMPONENT_FORM_ROLE_GRAPH_V1',page_role_catalog_version:'PAGE_ROLE_CATALOG_V1',page_graph:{schema_version:'PAGE_GRAPH_V1',nodes:pageNodes,edges:pageEdges},component_role_graph:{schema_version:'COMPONENT_ROLE_GRAPH_V1',nodes:componentNodes,edges:componentEdges},form_field_structure:{schema_version:'FORM_FIELD_STRUCTURE_V1',forms},ui_state_region:{schema_version:'UI_STATE_REGION_V1',regions:states},role_coverage:roleCoverage,consumer_contract:{A5_PRODUCT_BINDING:['page_graph','component_role_graph','role_coverage'],A6_WRITE_ADAPTER:['form_field_structure','component_role_graph','page_graph.edges','ui_state_region']},source_provenance:input.provenance||null};
  return {...core,graph_sha256:sha(core)};
}
module.exports={build,canon,stable,sha,classifyRole,fallback};
