'use strict';
const crypto=require('node:crypto');
const KINDS=new Set(['SCREENSHOT','DOM','COMPUTED_STYLE','COMPONENT_TREE']);
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
function sha(v){return crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');}
function validatePointer(p){
  const errors=[];
  if(!p||typeof p!=='object') return {pass:false,errors:['POINTER_NOT_OBJECT']};
  if(!KINDS.has(p.kind)) errors.push('UNSUPPORTED_EVIDENCE_KIND');
  if(!/^[0-9a-f]{64}$/.test(String(p.sha256||''))) errors.push('INVALID_SHA256');
  if(!p.path&&!p.blob&&!p.ref&&!p.inline_payload) errors.push('MISSING_EXACT_LOCATION');
  if(p.inline_payload){const actual=sha(p.inline_payload);if(p.sha256&&p.sha256!==actual)errors.push('INLINE_SHA256_MISMATCH');}
  return {pass:errors.length===0,errors,normalized:{kind:p.kind,sha256:p.sha256,path:p.path||null,blob:p.blob||null,ref:p.ref||null}};
}
function validateEvidenceSet(set={}){
  const keys=['screenshot','dom','computed_style','component_tree'];
  const results=Object.fromEntries(keys.map(k=>[k,set[k]?validatePointer(set[k]):{pass:false,errors:['WAITING_INPUT'],normalized:null}]));
  const present=keys.filter(k=>set[k]);
  return {pass:present.every(k=>results[k].pass),present,missing:keys.filter(k=>!set[k]),results,status:present.length===4?'OBSERVED_COMPLETE':present.length?'OBSERVED_PARTIAL':'UNKNOWN'};
}
module.exports={canonical,sha,validatePointer,validateEvidenceSet};
