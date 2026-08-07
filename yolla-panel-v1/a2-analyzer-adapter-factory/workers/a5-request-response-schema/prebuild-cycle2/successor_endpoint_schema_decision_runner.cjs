#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');

const EXIT = Object.freeze({
  PASS_FULL: 0,
  PASS_CONFIDENCE_DEGRADED: 10,
  FAIL_CLOSED_CORE_EVIDENCE: 20,
  INVALID_REQUEST: 30,
  RAW_SECRET_REJECTED: 40
});

const SECRET_RE = /(bearer\s+[a-z0-9._~+/=-]{6,}|basic\s+[a-z0-9+/=]{8,}|api[_-]?key\s*[:=]\s*[^<\s][^\s,;}]{5,}|password\s*[:=]\s*[^\s,;}]{6,})/i;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function sha256(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function clamp(v) { return Math.max(0, Math.min(1, Number(v.toFixed(4)))); }
function unknown(reason, evidence_pointer = null) { return { status: 'UNKNOWN', reason, evidence_pointer }; }
function pointerValue(pointer) { return pointer && typeof pointer === 'object' ? (pointer.receipt ?? pointer.payload ?? null) : null; }
function pointerRef(pointer) { return pointer && typeof pointer === 'object' ? (pointer.uri || pointer.pointer || pointer.path || null) : null; }
function coded(code, message, evidence = null) { const e = new Error(message); e.code = code; e.evidence = evidence; return e; }
function validatePointer(name, pointer, required = true) {
  if (!pointer && !required) return;
  if (!pointer || typeof pointer !== 'object') throw coded('INVALID_REQUEST', `${name} pointer object required`);
  if (!pointerRef(pointer)) throw coded('INVALID_REQUEST', `${name} pointer uri/pointer/path required`);
}
function rejectSecrets(request) {
  if (SECRET_RE.test(JSON.stringify(request))) throw coded('RAW_SECRET_REJECTED', 'raw secret-like value detected');
}
function normalizeUrl(raw='') {
  try {
    const u = new URL(raw);
    const segs = u.pathname.split('/').filter(Boolean).map((s,i) => /^\d+$/.test(s) ? `{id_${i+1}}` : /^[A-Za-z]+[0-9]+$/.test(s) ? `{key_${i+1}}` : s.toLowerCase());
    return { origin: u.origin.toLowerCase(), path_pattern:'/'+segs.join('/'), query_names:[...new Set([...u.searchParams.keys()])].sort() };
  } catch { return { origin:'UNKNOWN', path_pattern:String(raw||''), query_names:[] }; }
}
function extractObservationEntries(receipt) {
  if (!receipt) return [];
  if (Array.isArray(receipt.network_request_stream)) return receipt.network_request_stream;
  if (Array.isArray(receipt.network_observations)) return receipt.network_observations.map((o,i) => ({request_id:o.request_id || o.event_id || `obs-${i+1}`,url:o.request?.url || o.url || '',method:o.request?.method || o.method || 'GET',resource_type:o.request?.resource_type || o.resource_type || null,headers:o.request?.headers || {}}));
  if (Array.isArray(receipt.observations)) return extractObservationEntries({network_observations:receipt.observations});
  return [];
}
function inferEndpoints(observationReceipt, evidencePointer) {
  const rows = extractObservationEntries(observationReceipt);
  if (!rows.length) return [];
  const groups = new Map();
  for (const row of rows) {
    const u = normalizeUrl(row.url); const method = String(row.method || 'GET').toUpperCase(); const key = `${method}|${u.origin}|${u.path_pattern}`;
    if (!groups.has(key)) groups.set(key, {method, origin:u.origin, path_pattern:u.path_pattern, sample_count:0, query_counts:{}, resource_types:new Set()});
    const g=groups.get(key); g.sample_count++; for (const q of u.query_names) g.query_counts[q]=(g.query_counts[q]||0)+1; if (row.resource_type) g.resource_types.add(row.resource_type);
  }
  return [...groups.values()].sort((a,b)=>`${a.method}${a.path_pattern}`.localeCompare(`${b.method}${b.path_pattern}`)).map(g=>({endpoint_id:`EP-${sha256([g.method,g.origin,g.path_pattern]).slice(0,12).toUpperCase()}`,method:g.method,url_template:g.origin+g.path_pattern,sample_count:g.sample_count,parameters:Object.entries(g.query_counts).sort().map(([name,count])=>({name,location:'query',required:count===g.sample_count,presence_ratio:count/g.sample_count})),resource_types:[...g.resource_types].sort(),authority:'OBSERVED',evidence_pointer:evidencePointer}));
}
function bodyObjects(receipt) {
  if (!receipt) return [];
  const candidates = []; for (const key of ['bodies','response_bodies','responses','items']) if (Array.isArray(receipt[key])) candidates.push(...receipt[key]); if ('body' in receipt) candidates.push(receipt); return candidates;
}
function inferValueType(v) { if (v === null) return 'null'; if (Array.isArray(v)) return 'array'; if (Number.isInteger(v)) return 'integer'; return typeof v; }
function flatten(value, path='$', out=[]) { out.push({path,type:inferValueType(value)}); if (Array.isArray(value)) for (const item of value.slice(0,5)) flatten(item, `${path}[]`, out); else if (value && typeof value === 'object') for (const [k,v] of Object.entries(value)) flatten(v, `${path}.${k}`, out); return out; }
function parseBody(entry) { let body = entry?.body ?? entry?.inline_body ?? entry?.content; if (typeof body !== 'string') return body; try { return JSON.parse(body); } catch { return body; } }
function inferSchemaFields(bodyReceipt, evidencePointer) {
  const entries=bodyObjects(bodyReceipt); if (!entries.length) return unknown('RESPONSE_BODY_NOT_AVAILABLE', evidencePointer); const map=new Map(); let parsedCount=0;
  for (const e of entries) { const body=parseBody(e); if (body === undefined) continue; parsedCount++; for (const f of flatten(body)) { if (!map.has(f.path)) map.set(f.path,new Set()); map.get(f.path).add(f.type); } }
  if (!parsedCount) return unknown('RESPONSE_BODY_CONTENT_NOT_AVAILABLE', evidencePointer);
  return [...map.entries()].sort().map(([path,types])=>({path,types:[...types].sort(),authority:'OBSERVED_BODY',evidence_pointer:evidencePointer}));
}
function structureFields(receipt) { if (!receipt) return []; return receipt.fieldCandidates || receipt.fields || receipt.dom_fields || receipt.inference?.fieldCandidates || []; }
function inferIdentifiers(structureReceipt, evidencePointer) {
  const names=structureFields(structureReceipt).map(f=>f.name||f.field||f.label).filter(Boolean); const primary=names.find(n=>/^record[_-]?id$/i.test(n)) || names.find(n=>/(^|[_-])id$/i.test(n)) || null; const detail=names.find(n=>/detail.*url|url.*detail/i.test(n)) || null;
  return {primary_key: primary ? {field:primary,authority:'OBSERVED_STRUCTURE',evidence_pointer:evidencePointer} : unknown('IDENTIFIER_NOT_EVIDENCED',evidencePointer),relations: primary && detail ? [{relation:'LIST_TO_DETAIL',parent_key:primary,detail_field:detail,authority:'OBSERVED_STRUCTURE',evidence_pointer:evidencePointer}] : []};
}
function inferSessionReference(observationReceipt, evidencePointer) {
  if (!observationReceipt) return unknown('OBSERVATION_RECEIPT_NOT_AVAILABLE',evidencePointer);
  const names=new Set(); const rows=extractObservationEntries(observationReceipt);
  for (const r of rows) { const h=r.headers || {}; if (Array.isArray(h)) { for (const x of h) if (x?.name) names.add(String(x.name).toLowerCase()); } else { for (const k of Object.keys(h)) names.add(k.toLowerCase()); } }
  const req=[]; for (const name of [...names].sort()) { if (name==='cookie') req.push({type:'COOKIE_JAR_REFERENCE',header_name:name}); else if (['authorization','proxy-authorization','x-api-key','api-key'].includes(name)) req.push({type:'CREDENTIAL_REFERENCE',header_name:name}); else if (/csrf|xsrf/.test(name)) req.push({type:'CSRF_TOKEN_REFERENCE',header_name:name}); }
  return {reference_type:'SESSION_REQUIREMENTS_ONLY',requirements:req,raw_value_storage:false,authority:'OBSERVED_HEADER_NAMES',evidence_pointer:evidencePointer};
}
function scoreModes(endpointCandidates, schemaFields, structureReceipt, bodyPresent) {
  const fields=structureFields(structureReceipt); const regions=structureReceipt?.repeatedRegions || structureReceipt?.repeated_regions || structureReceipt?.inference?.repeatedRegions || []; const locators=structureReceipt?.locatorCandidates || structureReceipt?.locators || structureReceipt?.inference?.locatorCandidates || [];
  const apiEvidence=endpointCandidates.filter(e=>/\/api\/|json|graphql/i.test(e.url_template)).length; const dom=clamp(regions.length*0.25 + Math.min(fields.length,5)*0.1 + Math.min(locators.length,5)*0.05); const api=clamp(apiEvidence*0.18 + (Array.isArray(schemaFields)?0.45:0)); const hybrid=clamp(Math.min(dom,api)*0.85 + (bodyPresent?0.1:0));
  let recommended='DOM'; if (bodyPresent && api>=0.55 && dom>=0.45) recommended='HYBRID'; else if (bodyPresent && api>=0.55) recommended='API';
  return {mode_scores:{DOM:dom,API:api,HYBRID:hybrid},recommended_mode:recommended,confidence_state:bodyPresent?'FULL_EVIDENCE':'CONFIDENCE_DEGRADED_RESPONSE_BODY_MISSING'};
}
function makeReceipt(request) {
  if (!request || request.schema_version!=='ENDPOINT_SCHEMA_DECISION_RUN_REQUEST_V1') throw coded('INVALID_REQUEST','schema_version must be ENDPOINT_SCHEMA_DECISION_RUN_REQUEST_V1');
  rejectSecrets(request); validatePointer('observation',request.observation_pointer,true); validatePointer('structure',request.structure_pointer,true); validatePointer('response_body',request.response_body_pointer,false);
  const obs=pointerValue(request.observation_pointer), structure=pointerValue(request.structure_pointer), body=pointerValue(request.response_body_pointer); const obsRef=pointerRef(request.observation_pointer), structureRef=pointerRef(request.structure_pointer), bodyRef=pointerRef(request.response_body_pointer);
  const coreMissing=[]; if (!obs) coreMissing.push('OBSERVATION_RECEIPT_PAYLOAD'); if (!structure) coreMissing.push('STRUCTURE_RECEIPT_PAYLOAD');
  const endpointCandidates=obs ? inferEndpoints(obs,obsRef) : unknown('OBSERVATION_RECEIPT_PAYLOAD_NOT_RESOLVED',obsRef); const schemaFields=body ? inferSchemaFields(body,bodyRef) : unknown('OPTIONAL_RESPONSE_BODY_POINTER_ABSENT_OR_UNRESOLVED',bodyRef); const identifiers=structure ? inferIdentifiers(structure,structureRef) : {primary_key:unknown('STRUCTURE_RECEIPT_PAYLOAD_NOT_RESOLVED',structureRef),relations:[]}; const session=obs ? inferSessionReference(obs,obsRef) : unknown('OBSERVATION_RECEIPT_PAYLOAD_NOT_RESOLVED',obsRef); const bodyPresent=Array.isArray(schemaFields); const mode=scoreModes(Array.isArray(endpointCandidates)?endpointCandidates:[],schemaFields,structure||{},bodyPresent);
  let decision_status='PASS', exit_code=EXIT.PASS_FULL; if (coreMissing.length) { decision_status='FAIL_CLOSED'; exit_code=EXIT.FAIL_CLOSED_CORE_EVIDENCE; } else if (!bodyPresent) { decision_status='PASS_CONFIDENCE_DEGRADED'; exit_code=EXIT.PASS_CONFIDENCE_DEGRADED; }
  const receipt={schema_version:'ENDPOINT_SCHEMA_DECISION_RUN_RECEIPT_V1',run_id:request.run_id,decision_status,endpoint_candidates:endpointCandidates,schema_fields:schemaFields,identifier_map:identifiers,session_requirements_reference:session,mode_scores:mode.mode_scores,recommended_mode:mode.recommended_mode,confidence_state:mode.confidence_state,evidence_pointer:{observation:obsRef,structure:structureRef,response_body:bodyRef || 'UNKNOWN'},unknown_fields:[...(Array.isArray(endpointCandidates)?[]:['endpoint_candidates']),...(Array.isArray(schemaFields)?[]:['schema_fields']),...(coreMissing.includes('STRUCTURE_RECEIPT_PAYLOAD')?['identifier_map']:[])],authority_policy:'UNEVIDENCED_FIELDS_REMAIN_UNKNOWN',raw_secret_value_count:0,exit_code}; receipt.receipt_sha256=sha256(receipt); return receipt;
}

module.exports={EXIT,makeReceipt,inferEndpoints,inferSchemaFields,inferIdentifiers,inferSessionReference,scoreModes,sha256};

if (require.main===module) {
  let raw=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',c=>raw+=c); process.stdin.on('end',()=>{ try { const receipt=makeReceipt(JSON.parse(raw||'{}')); process.stdout.write(JSON.stringify(receipt,null,2)+'\n'); process.exitCode=receipt.exit_code; } catch(e) { const exit_code=e.code==='RAW_SECRET_REJECTED'?EXIT.RAW_SECRET_REJECTED:EXIT.INVALID_REQUEST; process.stderr.write(JSON.stringify({schema_version:'ENDPOINT_SCHEMA_DECISION_RUN_ERROR_V1',status:'ERROR',code:e.code||'INVALID_REQUEST',message:e.message,exit_code})+'\n'); process.exitCode=exit_code; } });
}
