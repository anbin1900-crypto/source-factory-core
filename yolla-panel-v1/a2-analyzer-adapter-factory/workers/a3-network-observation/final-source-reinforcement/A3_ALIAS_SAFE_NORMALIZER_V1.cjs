'use strict';
const crypto = require('node:crypto');

const SCHEMA = 'A3_CAUSAL_OBSERVATION_ENVELOPE_V1';
const SOURCE_KINDS = new Set(['CDP','UIA','DOM','RESPONSE','UNKNOWN']);
const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|passwd|api[_-]?key|credential|session|email|phone|mobile|name|address|resident|ssn|rrn|birth)/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/ig;
const PHONE_RE = /(?<!\d)(?:\+?82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}(?!\d)/g;
const SECRET_TEXT_RE = /(bearer\s+)[A-Za-z0-9._~+\/-]{6,}|((?:token|secret|password|cookie|authorization|api[_-]?key)\s*[:=]\s*)[^\s,;}&]+/ig;

function sha256(v){
  const s = Buffer.isBuffer(v) ? v : Buffer.from(typeof v === 'string' ? v : stableStringify(v));
  return crypto.createHash('sha256').update(s).digest('hex');
}
function stable(v){
  if(Array.isArray(v)) return v.map(stable);
  if(v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
}
function stableStringify(v){ return JSON.stringify(stable(v)); }
function firstDefined(obj, keys){ for(const k of keys){ if(obj && obj[k] !== undefined && obj[k] !== null) return obj[k]; } return undefined; }
function refValue(kind, raw){
  if(raw === undefined || raw === null || raw === '') return {kind, value_state:'NOT_PRESENT', raw_retained:false};
  return {kind, value_state:'PRESENT_REDACTED', redacted_hash:`sha256:${sha256(String(raw))}`, raw_retained:false};
}
function redactText(v){
  return String(v ?? '')
    .replace(EMAIL_RE, '<REDACTED:EMAIL>')
    .replace(PHONE_RE, '<REDACTED:PHONE>')
    .replace(SECRET_TEXT_RE, (m,p1,p2)=>`${p1||p2||''}<REDACTED>`);
}
function sanitize(v, key=''){
  if(SENSITIVE_KEY.test(key)) return refValue(`SENSITIVE:${key}`, v);
  if(Array.isArray(v)) return v.map(x=>sanitize(x));
  if(v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,sanitize(x,k)]));
  if(typeof v === 'string') return redactText(v);
  return v;
}

const ALIASES = Object.freeze({
  command_id:['command_id','commandId','cmd_id','cmdId'],
  page_id:['page_id','pageId','target_id','targetId','web_contents_id','webContentsId'],
  frame_id:['frame_id','frameId'],
  action_id:['action_id','actionId','interaction_id','interactionId'],
  request_id:['request_id','requestId','network_request_id','networkRequestId'],
  response_id:['response_id','responseId','network_response_id','networkResponseId'],
  page_state_id:['page_state_id','pageStateId','dom_state_id','domStateId'],
  event_kind:['event_kind','eventKind','event_type','eventType','type','method','name'],
  timestamp:['timestamp','observed_at','observedAt','ts','time'],
  evidence_pointer:['evidence_pointer','evidencePointer','pointer','artifact_ref','artifactRef'],
  sequence:['sequence','seq','event_sequence','eventSequence'],
});

function canonicalField(input, field){ return firstDefined(input, ALIASES[field]); }
function aliasesApplied(input){
  const out=[];
  for(const [canonical, aliases] of Object.entries(ALIASES)){
    const used=aliases.find(a=>input && input[a] !== undefined && input[a] !== null);
    if(used && used !== canonical) out.push({canonical, alias:used});
  }
  return out;
}
function normalizeSourceKind(v){ const s=String(v||'UNKNOWN').toUpperCase(); return SOURCE_KINDS.has(s)?s:'UNKNOWN'; }
function inferSourceKind(input){
  const s=firstDefined(input,['source_kind','sourceKind','source','transport']);
  if(s) return normalizeSourceKind(s);
  const t=String(canonicalField(input,'event_kind')||'').toLowerCase();
  if(t.includes('network')||t.includes('cdp')||t.includes('runtime')||t.includes('page.')) return 'CDP';
  if(t.includes('uia')||t.includes('automation')) return 'UIA';
  if(t.includes('dom')||t.includes('mutation')) return 'DOM';
  if(t.includes('response')) return 'RESPONSE';
  return 'UNKNOWN';
}
function observationStatus(prov, input){
  if(input.waiting_input === true || input.waitingInput === true) return 'WAITING_INPUT';
  if(input.observed === false || input.fact_state === 'UNKNOWN') return 'UNKNOWN';
  if(prov.command_id && (prov.action_id || prov.request_id || prov.page_state_id)) return 'OBSERVED';
  return 'UNKNOWN';
}
function normalizeObservation(input, options={}){
  const src = input && typeof input === 'object' ? input : {};
  const provenance = {
    site_id: firstDefined(src,['site_id','siteId']) || options.site_id || 'UNKNOWN',
    command_id: canonicalField(src,'command_id') || options.command_id || 'UNKNOWN',
    page_id: canonicalField(src,'page_id') || 'UNKNOWN',
    frame_id: canonicalField(src,'frame_id') || null,
    action_id: canonicalField(src,'action_id') || null,
    request_id: canonicalField(src,'request_id') || null,
    response_id: canonicalField(src,'response_id') || null,
    page_state_id: canonicalField(src,'page_state_id') || null,
  };
  const eventKind = String(canonicalField(src,'event_kind') || 'UNKNOWN');
  const timestamp = canonicalField(src,'timestamp') || null;
  const data = firstDefined(src,['data','payload','observed','details','value']);
  const aliases = aliasesApplied(src);
  const missing=[];
  for(const key of ['command_id','page_id']) if(!canonicalField(src,key) && !options[key]) missing.push(key);
  if(!canonicalField(src,'event_kind')) missing.push('event_kind');
  const normalized = {
    schema_version: SCHEMA,
    observation_id: 'OBS-'+sha256({source_kind:inferSourceKind(src),eventKind,provenance,timestamp,data:sanitize(data)}).slice(0,24),
    source_kind: inferSourceKind(src),
    event_kind: eventKind,
    fact_state: observationStatus(provenance, src),
    timestamp,
    sequence: Number.isFinite(Number(canonicalField(src,'sequence'))) ? Number(canonicalField(src,'sequence')) : null,
    provenance,
    observed: sanitize(data === undefined ? {} : data),
    aliases_applied: aliases,
    missing_fields: missing,
    evidence_pointer: sanitize(canonicalField(src,'evidence_pointer') || options.evidence_pointer || null),
    redaction:{applied:true,raw_secret_or_pii_retained:false},
    normalization:{target_value_guessing:false,missing_policy:'WAITING_INPUT_OR_UNKNOWN',alias_safe:true}
  };
  normalized.integrity_sha256='sha256:'+sha256(normalized);
  return normalized;
}

function requestFingerprint(obs){
  return sha256({command_id:obs.provenance.command_id,page_id:obs.provenance.page_id,action_id:obs.provenance.action_id,event_kind:obs.event_kind,request_id:obs.provenance.request_id,observed:obs.observed});
}

function buildCausalGraph(observations){
  const list=(observations||[]).map(x=>x.schema_version===SCHEMA?x:normalizeObservation(x));
  const nodes=list.map(o=>({id:o.observation_id,kind:o.event_kind,source_kind:o.source_kind,fact_state:o.fact_state,confidence:o.fact_state==='OBSERVED'?1:0,provenance:o.provenance,evidence_pointer:o.evidence_pointer,integrity_sha256:o.integrity_sha256}));
  const edges=[]; const requestById=new Map(); const responseById=new Map(); const pageStateById=new Map(); const actionNodes=new Map(); const fpSeen=new Map();
  for(const o of list){
    const p=o.provenance;
    if(p.action_id && !actionNodes.has(p.action_id)) actionNodes.set(p.action_id,o.observation_id);
    if(p.request_id && /request/i.test(o.event_kind)) requestById.set(p.request_id,o.observation_id);
    if(p.response_id && /response/i.test(o.event_kind)) responseById.set(p.response_id,o.observation_id);
    if(p.page_state_id) pageStateById.set(p.page_state_id,o.observation_id);
    if(p.action_id && p.request_id && /request/i.test(o.event_kind)) edges.push(edge(actionNodes.get(p.action_id)||o.observation_id,o.observation_id,'ACTION_TO_REQUEST',o));
    if(p.request_id && /response/i.test(o.event_kind)){
      const req=requestById.get(p.request_id);
      if(req) edges.push(edge(req,o.observation_id,'REQUEST_TO_RESPONSE',o));
      if(p.response_id) responseById.set(p.response_id,o.observation_id);
    }
    if(p.page_state_id){
      const from=(p.response_id&&responseById.get(p.response_id))||(p.request_id&&requestById.get(p.request_id))||(p.action_id&&actionNodes.get(p.action_id));
      if(from && from!==o.observation_id) edges.push(edge(from,o.observation_id,'TO_PAGE_STATE',o));
    }
    const redirectFrom=firstDefined(o.observed,['redirect_from_request_id','redirectFromRequestId']);
    if(redirectFrom && p.request_id && requestById.get(redirectFrom)) edges.push(edge(requestById.get(redirectFrom),o.observation_id,'REDIRECT',o));
    const retryOf=firstDefined(o.observed,['retry_of_request_id','retryOfRequestId']);
    if(retryOf && p.request_id && requestById.get(retryOf)) edges.push(edge(requestById.get(retryOf),o.observation_id,'RETRY',o));
    const fp=requestFingerprint(o); if(fpSeen.has(fp)) edges.push(edge(fpSeen.get(fp),o.observation_id,'DUPLICATE',o)); else fpSeen.set(fp,o.observation_id);
  }
  return {schema_version:'A3_CAUSAL_OBSERVATION_GRAPH_V1',nodes,edges,rules:{redirect:'EXPLICIT_REDIRECT_FROM_REQUEST_ID_ONLY',retry:'EXPLICIT_RETRY_OF_REQUEST_ID_ONLY',duplicate:'CANONICAL_FINGERPRINT_PRESERVE_BOTH_MARK_DUPLICATE',missing:'NO_GUESS_WAITING_INPUT_OR_UNKNOWN'}};
}
function edge(from,to,relation,o){ return {from,to,relation,fact_state:'OBSERVED',confidence:1,evidence_pointer:o.evidence_pointer||null}; }

module.exports={SCHEMA,ALIASES,normalizeObservation,buildCausalGraph,sanitize,sha256,stableStringify};
