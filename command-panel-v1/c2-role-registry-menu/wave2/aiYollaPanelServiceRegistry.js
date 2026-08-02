'use strict';
const crypto = require('node:crypto');
const CANONICAL_COMPONENT_IDS = Object.freeze(['AI_YOLLA_RUNTIME','AI_YOLLA_PANEL','AI_YOLLA_WORKSPACE','AI_YOLLA_DATABASE','AI_YOLLA_AUTOMATION']);
const CANONICAL_SERVICES = Object.freeze({
 YOLLA_REAL_ESTATE_PRO_AI: Object.freeze({official_name_ko:'욜라 부동산 전문 AI',domain_pack_id:'REAL_ESTATE'}),
 YOLLA_GAS_STATION_PRO_AI: Object.freeze({official_name_ko:'욜라 주유소 전문 AI',domain_pack_id:'GAS_STATION_PETROLEUM'}),
 YOLLA_HAZARDOUS_MATERIALS_PRO_AI: Object.freeze({official_name_ko:'욜라 위험물 전문 AI',domain_pack_id:'HAZARDOUS_MATERIALS_FIRE_SAFETY'})
});
const WAVE='WAVE_2';
const DIRECTIVE='C1-TO-C2-AI-YOLLA-PANEL-SERVICE-REGISTRY-WAVE2-V1-20260802-001';
const REGISTERED='2026-08-02 18:03 KST';
const DUPLICATE_KEY='970a9e2b3903e55d15ba5dbd8f06fa33758b4d294e72e835c86f0fe74c5b68de';
class RegistryError extends Error { constructor(code,message,details={}){super(message);this.name='RegistryError';this.code=code;this.details=details;} }
function clone(v){return JSON.parse(JSON.stringify(v));}
function assert(c,code,message,details={}){if(!c)throw new RegistryError(code,message,details);}
function duplicatePromptKey(roleId,directiveId,waveId,registeredAt){return crypto.createHash('sha256').update(`${roleId}|${directiveId}|${waveId}|${registeredAt}`).digest('hex');}
function validateService(service,{canonical=false}={}){
 for(const f of ['platform_id','component_id','service_id','domain_pack_id','role_id','official_name_ko','menu_route','wave_id','directive_id','directive_registered_at_kst','duplicate_prompt_key','shared_core_id','separate_runtime','source_clone','status']) assert(Object.hasOwn(service,f),'MISSING_SERVICE_FIELD',`missing ${f}`,{service_id:service.service_id||null});
 assert(service.platform_id==='AI_YOLLA','WRONG_PLATFORM','platform_id must be AI_YOLLA');
 assert(service.component_id==='AI_YOLLA_PANEL','WRONG_COMPONENT','component_id must be AI_YOLLA_PANEL');
 assert(service.wave_id===WAVE,'WRONG_WAVE','wave_id mismatch');
 assert(service.directive_id===DIRECTIVE,'WRONG_DIRECTIVE','directive_id mismatch');
 assert(service.directive_registered_at_kst===REGISTERED,'WRONG_REGISTERED_TIME','directive_registered_at_kst mismatch');
 assert(service.duplicate_prompt_key===DUPLICATE_KEY,'DUPLICATE_PROMPT_KEY_MISMATCH','duplicate_prompt_key mismatch');
 assert(service.shared_core_id==='AI_YOLLA_COMMON_CORE','WRONG_COMMON_CORE','shared core mismatch');
 assert(service.separate_runtime===false,'SEPARATE_RUNTIME_FORBIDDEN','separate service runtime is forbidden');
 assert(service.source_clone===false,'SOURCE_CLONE_FORBIDDEN','service source clone is forbidden');
 assert(/^욜라 .+ 전문 AI$/.test(service.official_name_ko),'INVALID_OFFICIAL_NAME','official name must match 욜라 <전문분야> 전문 AI');
 if(canonical){const expected=CANONICAL_SERVICES[service.service_id];assert(expected,'UNKNOWN_CANONICAL_SERVICE','unexpected canonical service');assert(expected.official_name_ko===service.official_name_ko,'CANONICAL_NAME_MISMATCH','canonical service name mismatch');assert(expected.domain_pack_id===service.domain_pack_id,'CANONICAL_DOMAIN_PACK_MISMATCH','canonical domain pack mismatch');}
}
function validateRegistry(registry){
 assert(registry?.platform?.platform_id==='AI_YOLLA','WRONG_PLATFORM','registry platform invalid');
 assert(registry.platform.common_core_id==='AI_YOLLA_COMMON_CORE','WRONG_COMMON_CORE','common core invalid');
 assert(registry.platform.source_clone_per_service===false,'SOURCE_CLONE_FORBIDDEN','platform source clone per service forbidden');
 const wm=registry.wave_metadata||{}; assert(wm.wave_id===WAVE && wm.directive_id===DIRECTIVE && wm.directive_registered_at_kst===REGISTERED && wm.duplicate_prompt_key===DUPLICATE_KEY,'WAVE_METADATA_MISMATCH','wave metadata mismatch');
 assert(Array.isArray(registry.components)&&registry.components.length===5,'COMPONENT_REGISTRY_MISMATCH','exactly five components required');
 const componentIds=registry.components.map(x=>x.component_id); assert(new Set(componentIds).size===5,'DUPLICATE_COMPONENT','duplicate component');
 for(const id of CANONICAL_COMPONENT_IDS) assert(componentIds.includes(id),'MISSING_COMPONENT',`missing component ${id}`);
 for(const c of registry.components) assert(c.source_clone===false,'COMPONENT_SOURCE_CLONE_FORBIDDEN','component source clone forbidden');
 assert(Array.isArray(registry.services)&&registry.services.length>=3,'SERVICE_REGISTRY_EMPTY','at least three services required');
 const ids=new Set(), names=new Set(), roles=new Set(), routes=new Set();
 for(const s of registry.services){validateService(s,{canonical:Boolean(CANONICAL_SERVICES[s.service_id])});assert(!ids.has(s.service_id),'DUPLICATE_SERVICE_ID','duplicate service id');assert(!names.has(s.official_name_ko),'DUPLICATE_SERVICE_NAME','duplicate service name');assert(!roles.has(s.role_id),'DUPLICATE_ROLE_ID','duplicate role id');assert(!routes.has(s.menu_route),'DUPLICATE_ROUTE','duplicate menu route');ids.add(s.service_id);names.add(s.official_name_ko);roles.add(s.role_id);routes.add(s.menu_route);}
 for(const id of Object.keys(CANONICAL_SERVICES)) assert(ids.has(id),'MISSING_CANONICAL_SERVICE',`missing ${id}`);
 return {status:'PASS',component_count:registry.components.length,service_count:registry.services.length,canonical_service_count:Object.keys(CANONICAL_SERVICES).length,wave_id:WAVE};
}
function getService(registry,serviceId){validateRegistry(registry);const s=registry.services.find(x=>x.service_id===serviceId);assert(s,'UNKNOWN_SERVICE',`unknown service_id: ${serviceId}`);return clone(s);}
function appendService(registry,service){const next=clone(registry);assert(!next.services.some(x=>x.service_id===service.service_id),'DUPLICATE_SERVICE_ID','duplicate service id');next.services.push(clone(service));validateRegistry(next);return next;}
function createServiceSelectionContext(registry,serviceId){const s=getService(registry,serviceId);return {platform_id:s.platform_id,component_id:s.component_id,service_id:s.service_id,domain_pack_id:s.domain_pack_id,role_id:s.role_id,official_name_ko:s.official_name_ko,menu_route:s.menu_route,wave_id:s.wave_id,directive_id:s.directive_id,directive_registered_at_kst:s.directive_registered_at_kst,duplicate_prompt_key:s.duplicate_prompt_key,shared_core_id:s.shared_core_id};}
function buildMenuModel(registry){validateRegistry(registry);return {platform_id:'AI_YOLLA',component_id:'AI_YOLLA_PANEL',items:registry.services.map(s=>({role_id:s.role_id,service_id:s.service_id,domain_pack_id:s.domain_pack_id,label:s.official_name_ko,route:s.menu_route,status:s.status}))};}
module.exports={CANONICAL_COMPONENT_IDS,CANONICAL_SERVICES,WAVE,DIRECTIVE,REGISTERED,DUPLICATE_KEY,RegistryError,duplicatePromptKey,validateService,validateRegistry,getService,appendService,createServiceSelectionContext,buildMenuModel};
