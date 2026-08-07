'use strict';
const crypto=require('node:crypto');
const stable=v=>JSON.stringify(sort(v));
function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}
const sha=v=>crypto.createHash('sha256').update(stable(v)).digest('hex');
const ROLE_META={
 PUBLIC_SEARCH:['DISCOVERY_QUERY',['SEARCH_LISTINGS'],'READ'],
 PUBLIC_LIST:['RESULT_BROWSE',['BROWSE_LISTINGS','PAGINATE_LISTINGS'],'READ'],
 PUBLIC_DETAIL:['PUBLIC_ENTITY_READ',['VIEW_LISTING_DETAIL'],'READ'],
 LISTING_CREATE:['OWNER_ENTITY_CREATE',['CREATE_LISTING'],'WRITE'],
 MY_LISTING_LIST:['OWNER_COLLECTION_READ',['VIEW_OWN_LISTINGS'],'READ'],
 MY_LISTING_DETAIL:['OWNER_ENTITY_READ',['VIEW_OWN_LISTING','OPEN_LISTING_EDIT','OPEN_LISTING_EXPIRE'],'READ'],
 LISTING_EDIT:['OWNER_ENTITY_UPDATE',['UPDATE_LISTING'],'WRITE'],
 LISTING_EXPIRE:['OWNER_ENTITY_LIFECYCLE',['EXPIRE_LISTING'],'WRITE']
};
const FEATURE_META={
 SEARCH_LISTINGS:['READ_QUERY',['PUBLIC_SEARCH','PUBLIC_LIST'],['SEARCH_FORM','RESULT_LIST'],null],
 BROWSE_LISTINGS:['READ_COLLECTION',['PUBLIC_LIST'],['RESULT_LIST','RESULT_CARD'],null],
 PAGINATE_LISTINGS:['READ_PAGINATION',['PUBLIC_LIST'],['PAGINATION'],null],
 VIEW_LISTING_DETAIL:['READ_ENTITY',['PUBLIC_DETAIL'],['DETAIL_PANEL'],null],
 VIEW_OWN_LISTINGS:['READ_OWNER_COLLECTION',['MY_LISTING_LIST'],['RESULT_LIST'],null],
 VIEW_OWN_LISTING:['READ_OWNER_ENTITY',['MY_LISTING_DETAIL'],['DETAIL_PANEL','ACTION_BAR'],null],
 CREATE_LISTING:['WRITE_CREATE',['LISTING_CREATE','MY_LISTING_DETAIL'],['CREATE_FORM'],'CREATE_LISTING'],
 UPDATE_LISTING:['WRITE_UPDATE',['LISTING_EDIT','MY_LISTING_DETAIL'],['EDIT_FORM'],'UPDATE_LISTING'],
 EXPIRE_LISTING:['WRITE_LIFECYCLE',['LISTING_EXPIRE','MY_LISTING_DETAIL'],['EXPIRE_CONTROL'],'EXPIRE_LISTING']
};
function build(input){
 const pages=input.page_graph?.nodes||[], comps=input.component_role_graph?.nodes||[], forms=input.form_field_structure?.forms||[], prov=input.source_provenance||{};
 const pageByRole=new Map(pages.map(p=>[p.page_role,p])); const compRoles=new Set(comps.map(c=>c.component_role));
 const roleCatalog={schema_version:'PAGE_ROLE_CATALOG_V2',directive_id:input.directive_id,source_provenance:prov,roles:Object.entries(ROLE_META).map(([role,[purpose,features,access]])=>{const p=pageByRole.get(role);return{page_role:role,semantic_purpose:purpose,feature_roles:features,access_mode:access,source_page_id:p?.page_id||null,evidence_status:p?'OBSERVED':'UNKNOWN',confidence:p?Number(p.confidence||0):0};}),unknown_policy:{unobserved_page_or_feature:'UNKNOWN',no_auth_or_permission_inference_without_evidence:true,visual_pixel_clone:false}};
 const featureNodes=Object.entries(FEATURE_META).map(([id,[fr,roles,crs,wa]])=>{const observed=roles.some(r=>pageByRole.has(r))&&crs.every(r=>compRoles.has(r));return{feature_id:id,feature_role:fr,status:observed?'OBSERVED':'UNKNOWN',confidence:observed?0.95:0.4,page_roles:roles,component_roles:crs,write_action:wa};});
 const edgeDefs=[['PUBLIC_SEARCH','SEARCH_LISTINGS','PAGE_SUPPORTS_FEATURE'],['SEARCH_LISTINGS','PUBLIC_LIST','FEATURE_TRANSITIONS_TO_PAGE'],['PUBLIC_LIST','BROWSE_LISTINGS','PAGE_SUPPORTS_FEATURE'],['PUBLIC_LIST','PAGINATE_LISTINGS','PAGE_SUPPORTS_FEATURE'],['BROWSE_LISTINGS','VIEW_LISTING_DETAIL','FEATURE_ENABLES_FEATURE'],['VIEW_LISTING_DETAIL','PUBLIC_DETAIL','FEATURE_READS_PAGE'],['LISTING_CREATE','CREATE_LISTING','PAGE_SUPPORTS_FEATURE'],['CREATE_LISTING','MY_LISTING_DETAIL','FEATURE_TRANSITIONS_TO_PAGE'],['MY_LISTING_LIST','VIEW_OWN_LISTINGS','PAGE_SUPPORTS_FEATURE'],['VIEW_OWN_LISTINGS','MY_LISTING_DETAIL','FEATURE_TRANSITIONS_TO_PAGE'],['MY_LISTING_DETAIL','VIEW_OWN_LISTING','PAGE_SUPPORTS_FEATURE'],['MY_LISTING_DETAIL','UPDATE_LISTING','PAGE_ENABLES_WRITE_FEATURE'],['MY_LISTING_DETAIL','EXPIRE_LISTING','PAGE_ENABLES_WRITE_FEATURE'],['LISTING_EDIT','UPDATE_LISTING','PAGE_SUPPORTS_FEATURE'],['UPDATE_LISTING','MY_LISTING_DETAIL','FEATURE_TRANSITIONS_TO_PAGE'],['LISTING_EXPIRE','EXPIRE_LISTING','PAGE_SUPPORTS_FEATURE'],['EXPIRE_LISTING','MY_LISTING_DETAIL','FEATURE_TRANSITIONS_TO_PAGE']];
 const graph={schema_version:'PAGE_COMPONENT_FEATURE_GRAPH_V1',directive_id:input.directive_id,source_provenance:prov,feature_nodes:featureNodes,semantic_edges:edgeDefs.map(([from,to,relation])=>({from,to,relation,evidence_status:'OBSERVED',confidence:0.9})),preserved_provenance:{repeated_region:input.repeated_region_provenance||null,locator:input.locator_provenance||null,pagination:input.pagination_provenance||null},unobserved_policy:'UNKNOWN'};
 const deps={schema_version:'FEATURE_DEPENDENCY_CANDIDATES_V1',directive_id:input.directive_id,source_provenance:prov,candidates:[
  {feature_id:'SEARCH_LISTINGS',requires:[{kind:'PAGE_ROLE',id:'PUBLIC_SEARCH',status:pageByRole.has('PUBLIC_SEARCH')?'OBSERVED':'UNKNOWN'},{kind:'COMPONENT_ROLE',id:'SEARCH_FORM',status:compRoles.has('SEARCH_FORM')?'OBSERVED':'UNKNOWN'}],produces:['PUBLIC_LIST']},
  {feature_id:'BROWSE_LISTINGS',requires:[{kind:'PAGE_ROLE',id:'PUBLIC_LIST',status:pageByRole.has('PUBLIC_LIST')?'OBSERVED':'UNKNOWN'},{kind:'COMPONENT_ROLE',id:'RESULT_LIST',status:compRoles.has('RESULT_LIST')?'OBSERVED':'UNKNOWN'},{kind:'COMPONENT_ROLE',id:'RESULT_CARD',status:compRoles.has('RESULT_CARD')?'OBSERVED':'UNKNOWN'}]},
  {feature_id:'PAGINATE_LISTINGS',requires:[{kind:'PAGE_ROLE',id:'PUBLIC_LIST',status:pageByRole.has('PUBLIC_LIST')?'OBSERVED':'UNKNOWN'},{kind:'COMPONENT_ROLE',id:'PAGINATION',status:compRoles.has('PAGINATION')?'OBSERVED':'UNKNOWN'}],stop_condition_source:'PAGE_GRAPH_V1'},
  {feature_id:'VIEW_LISTING_DETAIL',requires:[{kind:'PAGE_ROLE',id:'PUBLIC_DETAIL',status:pageByRole.has('PUBLIC_DETAIL')?'OBSERVED':'UNKNOWN'},{kind:'COMPONENT_ROLE',id:'DETAIL_PANEL',status:compRoles.has('DETAIL_PANEL')?'OBSERVED':'UNKNOWN'}]},
  {feature_id:'CREATE_LISTING',requires:[{kind:'PAGE_ROLE',id:'LISTING_CREATE',status:pageByRole.has('LISTING_CREATE')?'OBSERVED':'UNKNOWN'},{kind:'FORM',id:'listing-create-form',status:forms.some(f=>f.form_id==='listing-create-form')?'OBSERVED':'UNKNOWN'},{kind:'AUTHENTICATION',id:'OWNER_SESSION',status:'UNKNOWN'}],produces:['MY_LISTING_DETAIL']},
  {feature_id:'VIEW_OWN_LISTINGS',requires:[{kind:'PAGE_ROLE',id:'MY_LISTING_LIST',status:pageByRole.has('MY_LISTING_LIST')?'OBSERVED':'UNKNOWN'},{kind:'AUTHENTICATION',id:'OWNER_SESSION',status:'UNKNOWN'}]},
  {feature_id:'VIEW_OWN_LISTING',requires:[{kind:'PAGE_ROLE',id:'MY_LISTING_DETAIL',status:pageByRole.has('MY_LISTING_DETAIL')?'OBSERVED':'UNKNOWN'},{kind:'AUTHENTICATION',id:'OWNER_SESSION',status:'UNKNOWN'}]},
  {feature_id:'UPDATE_LISTING',requires:[{kind:'PAGE_ROLE',id:'LISTING_EDIT',status:pageByRole.has('LISTING_EDIT')?'OBSERVED':'UNKNOWN'},{kind:'FORM',id:'listing-edit-form',status:forms.some(f=>f.form_id==='listing-edit-form')?'OBSERVED':'UNKNOWN'},{kind:'AUTHORIZATION',id:'LISTING_OWNERSHIP',status:'UNKNOWN'}],produces:['MY_LISTING_DETAIL']},
  {feature_id:'EXPIRE_LISTING',requires:[{kind:'PAGE_ROLE',id:'LISTING_EXPIRE',status:pageByRole.has('LISTING_EXPIRE')?'OBSERVED':'UNKNOWN'},{kind:'FORM',id:'expire-form',status:forms.some(f=>f.form_id==='expire-form')?'OBSERVED':'UNKNOWN'},{kind:'AUTHORIZATION',id:'LISTING_OWNERSHIP',status:'UNKNOWN'}],produces:['MY_LISTING_DETAIL']}
 ],status_rule:'OBSERVED only when Cycle4 evidence exists; otherwise UNKNOWN'};
 const result={PAGE_COMPONENT_FEATURE_GRAPH_V1:graph,PAGE_ROLE_CATALOG_V2:roleCatalog,FEATURE_DEPENDENCY_CANDIDATES_V1:deps}; result.digest=sha(result);return result;
}
module.exports={build,stable,sha};
