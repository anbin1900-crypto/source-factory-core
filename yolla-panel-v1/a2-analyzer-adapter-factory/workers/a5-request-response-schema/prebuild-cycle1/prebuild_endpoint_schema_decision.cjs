'use strict';
const crypto = require('node:crypto');

const HEADER_REQUIREMENT_TYPES = {
  authorization: 'AUTHORIZATION_CREDENTIAL_REFERENCE',
  cookie: 'COOKIE_JAR_REFERENCE',
  'proxy-authorization': 'PROXY_AUTH_CREDENTIAL_REFERENCE',
  'x-csrf-token': 'CSRF_TOKEN_REFERENCE',
  'x-xsrf-token': 'CSRF_TOKEN_REFERENCE',
  'x-api-key': 'API_KEY_CREDENTIAL_REFERENCE',
  'api-key': 'API_KEY_CREDENTIAL_REFERENCE'
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function sha256(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function uniq(values) { return [...new Set(values)].sort(); }
function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(4)))); }
function normalizeName(value='') { return String(value).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function lastPathToken(path='') { return String(path).replace(/\[\]/g, '').split('.').pop().replace(/^\$|[^A-Za-z0-9_-]/g, ''); }

function collectHeaderNames(observation) {
  const headers = observation?.request?.headers || [];
  if (Array.isArray(headers)) return headers.map(h => String(h?.name || '')).filter(Boolean);
  if (headers && typeof headers === 'object') return Object.keys(headers);
  return [];
}
function inferSessionRequirements(observations=[]) {
  const names = uniq(observations.flatMap(collectHeaderNames).map(x => x.toLowerCase()));
  const requirements = [];
  for (const name of names) {
    if (HEADER_REQUIREMENT_TYPES[name]) requirements.push({ header_name:name, requirement_type:HEADER_REQUIREMENT_TYPES[name], storage:'NAME_AND_REQUIREMENT_TYPE_ONLY', raw_value_capture:false });
    else if (name.startsWith('x-') || ['accept','accept-language','content-type','user-agent','referer','origin'].includes(name)) requirements.push({ header_name:name, requirement_type:'NON_SECRET_REQUEST_CONTEXT', storage:'NAME_AND_SEMANTICS_ONLY', raw_value_capture:false });
  }
  const cookieRequired = names.includes('cookie');
  const authRequired = names.some(n => ['authorization','proxy-authorization','x-api-key','api-key'].includes(n));
  return { authentication_required:authRequired, cookie_required:cookieRequired, requirements, raw_secret_value_count:0 };
}

function flattenFields(schema, out=[]) {
  if (!schema || typeof schema !== 'object') return out;
  if (schema.path) out.push({ path:schema.path, types:schema.types || [] });
  if (schema.items) flattenFields(schema.items, out);
  for (const child of Object.values(schema.properties || {})) flattenFields(child, out);
  return out;
}
function correlateDomJson(domFields=[], responseSchemas=[]) {
  const jsonFields = responseSchemas.flatMap(s => flattenFields(s.schema || s.response_schema || {}));
  const correlations=[];
  for (const dom of domFields) {
    const domName = normalizeName(dom.name || dom.field || dom.label);
    if (!domName) continue;
    for (const jf of jsonFields) {
      const token = normalizeName(lastPathToken(jf.path));
      if (!token) continue;
      let score = 0;
      if (domName === token) score = 0.95;
      else if (domName.includes(token) || token.includes(domName)) score = 0.72;
      if (score > 0) correlations.push({ dom_field:dom.name || dom.field || dom.label, json_path:jf.path, confidence:score, basis:'NORMALIZED_FIELD_NAME' });
    }
  }
  correlations.sort((a,b)=>b.confidence-a.confidence || a.dom_field.localeCompare(b.dom_field) || a.json_path.localeCompare(b.json_path));
  const best=[]; const seen=new Set();
  for (const item of correlations) { if (!seen.has(item.dom_field)) { seen.add(item.dom_field); best.push(item); } }
  return { contract_version:'DOM_JSON_PATH_CORRELATION_V1', correlations:best, unmatched_dom_fields:domFields.map(f=>f.name||f.field||f.label).filter(Boolean).filter(n=>!seen.has(n)) };
}

function classifyResponseCandidates(generator) {
  const list_paths=[]; const detail_paths=[]; const schema_paths=[];
  for (const item of generator.response_schemas || []) {
    const repeated = item.record_paths || [];
    for (const path of repeated) list_paths.push({ endpoint_group_id:item.endpoint_group_id, path:path.path, kind:'LIST_RECORD_PATH' });
    const fields = flattenFields(item.schema || {});
    for (const field of fields) schema_paths.push({ endpoint_group_id:item.endpoint_group_id, path:field.path, types:field.types });
    if (!repeated.length && fields.some(f => /(^|\.)(id|.*_id|.*Id)$/.test(f.path))) detail_paths.push({ endpoint_group_id:item.endpoint_group_id, kind:'DETAIL_RECORD_CANDIDATE' });
  }
  return { list_paths, detail_paths, schema_paths };
}

function decisionScores(generator, dom, correlation, session) {
  const jsonGroups = (generator.endpoint_groups || []).filter(g => g.response_kind === 'JSON').length;
  const bodySchemas = (generator.response_schemas || []).length;
  const repeatedApi = (generator.response_schemas || []).reduce((n,s)=>n+(s.record_paths||[]).length,0);
  const domFieldCount = (dom.fields || dom.fieldCandidates || []).length;
  const locatorCount = (dom.locators || dom.locatorCandidates || []).length;
  const regionCount = (dom.repeated_regions || dom.repeatedRegions || []).length;
  const correlationCount = correlation.correlations.length;
  const api = clamp(jsonGroups*0.16 + bodySchemas*0.12 + repeatedApi*0.18 + correlationCount*0.05);
  const domScore = clamp(regionCount*0.24 + Math.min(domFieldCount,5)*0.09 + Math.min(locatorCount,5)*0.05);
  const sessionPenalty = session.authentication_required ? 0.05 : 0;
  const hybrid = clamp(Math.min(api,domScore)*0.7 + correlationCount*0.08 - sessionPenalty);
  let recommendation = 'DOM_HTML';
  if (api >= 0.55 && domScore >= 0.45) recommendation = 'HYBRID';
  else if (api >= 0.55) recommendation = 'JSON_API';
  return { recommendation, confidence:{ DOM_HTML:domScore, JSON_API:api, HYBRID:hybrid }, evidence:{json_endpoint_groups:jsonGroups,response_schemas:bodySchemas,api_record_paths:repeatedApi,dom_fields:domFieldCount,locators:locatorCount,repeated_regions:regionCount,dom_json_correlations:correlationCount} };
}

function lateBinding(generator, bundle) {
  const actions=[];
  const bodyMissing = (generator.endpoint_groups || []).some(g => ['JSON','HTML'].includes(g.response_kind) && !g.response_schema);
  if (bodyMissing) actions.push({ condition:'MISSING_RESPONSE_BODY', action:'SUPPLY_RESPONSE_BODY_CONTENT_OR_IMMUTABLE_POINTER', rerun:'FULL_PREBUILD' });
  if (!(bundle.previous_schemas || []).length) actions.push({ condition:'NO_PREVIOUS_SCHEMA_BASELINE', action:'SUPPLY_PREVIOUS_SCHEMA_SNAPSHOT_FOR_DRIFT_COMPARISON', rerun:'DRIFT_ONLY_OR_FULL_PREBUILD' });
  const breaking = (generator.schema_drift || []).some(x => ['FIELD_REMOVED','TYPE_CHANGED'].includes(x.change));
  if (breaking) actions.push({ condition:'BREAKING_SCHEMA_DRIFT', action:'VERSION_SCHEMA_AND_FAIL_CLOSED_UNTIL_SUCCESSOR_REVIEW', rerun:'AFTER_UPDATED_EVIDENCE' });
  if (!(bundle.dom_structure || bundle.dom_candidates || bundle.a4)) actions.push({ condition:'MISSING_DOM_STRUCTURE', action:'SUPPLY_A4_STRUCTURE_RESULT', rerun:'MODE_AND_CORRELATION' });
  return { strategy:'LATE_BINDING_FAIL_CLOSED', actions, ready_without_late_binding:actions.length===0 };
}

function sanitizeBundle(bundle) {
  const text = JSON.stringify(bundle);
  if (/Bearer\s+[A-Za-z0-9._~+/=-]{6,}/i.test(text)) throw Object.assign(new Error('RAW_SECRET_VALUE_REJECTED'),{code:'RAW_SECRET_VALUE_REJECTED'});
  return bundle;
}

function runPrebuild(bundle, deps={}) {
  sanitizeBundle(bundle);
  if (bundle?.schema_version !== 'A5_RESPONSE_EVIDENCE_BUNDLE_V1') throw Object.assign(new Error('INVALID_EVIDENCE_BUNDLE_SCHEMA'),{code:'INVALID_EVIDENCE_BUNDLE_SCHEMA'});
  const buildGeneratorInput = deps.buildGeneratorInput || require('../live-inference/endpoint_schema_mode_inference.cjs').buildGeneratorInput;
  const dom = bundle.dom_structure || bundle.dom_candidates || bundle.a4 || {};
  const network = bundle.network_observations || bundle.observations || bundle.events || [];
  const generator = buildGeneratorInput({ generated_at:bundle.generated_at, source_bindings:bundle.source_bindings || {}, network_observations:network, dom_candidates:{ repeated_regions:dom.repeated_regions||dom.repeatedRegions||[], fields:dom.fields||dom.fieldCandidates||[], locators:dom.locators||dom.locatorCandidates||[], pagination:dom.pagination||null, page_types:Array.isArray(dom.page_types) ? dom.page_types : (dom.pageType ? [dom.pageType] : []) }, pagination:dom.pagination||null, previous_schemas:bundle.previous_schemas||[] }, { generated_at:bundle.generated_at });
  const session = inferSessionRequirements(network);
  const correlation = correlateDomJson(dom.fields||dom.fieldCandidates||[], generator.response_schemas||[]);
  const candidates = classifyResponseCandidates(generator);
  const decision = decisionScores(generator,{fields:dom.fields||dom.fieldCandidates||[],locators:dom.locators||dom.locatorCandidates||[],repeated_regions:dom.repeated_regions||dom.repeatedRegions||[]},correlation,session);
  const late = lateBinding(generator,bundle);
  const endpointSchemaInference = { schema_version:'ENDPOINT_SCHEMA_INFERENCE_V1', endpoint_catalog:generator.endpoint_groups, request_templates:generator.request_templates, response_schemas:generator.response_schemas, response_candidates:candidates, identifier_map:generator.identifier_map, identifier_relations:generator.identifier_relations, dom_json_correlation:correlation, session_requirements:session, counters:generator.counters };
  const modeDecision = { schema_version:'DOM_API_HYBRID_DECISION_V1', ...decision, session_requirements:session, pagination:generator.pagination||null, late_binding_required:!late.ready_without_late_binding };
  const driftLateBinding = { schema_version:'SCHEMA_DRIFT_LATE_BINDING_V1', schema_drift:generator.schema_drift, repair_policy:generator.repairs, late_binding:late };
  const runPlan = { schema_version:'SUCCESSOR_RUN_PLAN_V1', command:'node prebuild_endpoint_schema_decision.cjs < response-evidence-bundle.json > a5-prebuild-result.json', required_input:['network_observations','dom_structure'], optional_input:['previous_schemas','source_bindings','generated_at'], next_actions:late.actions, terminal_when:'ENDPOINT_SCHEMA_AND_MODE_RESULT_EMITTED_WITH_RAW_SECRET_VALUE_COUNT_0' };
  const output={ schema_version:'A5_ENDPOINT_SCHEMA_DOM_API_HYBRID_PREBUILD_RESULT_V1', endpoint_schema_inference:endpointSchemaInference, dom_api_hybrid_decision:modeDecision, schema_drift_late_binding:driftLateBinding, successor_run_plan:runPlan, raw_secret_value_count:0 };
  output.result_sha256=sha256(output); return output;
}

module.exports={runPrebuild,inferSessionRequirements,correlateDomJson,decisionScores,lateBinding,sha256};
if(require.main===module){let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.stringify(runPrebuild(JSON.parse(raw||'{}')),null,2)+'\n')}catch(e){process.stderr.write(JSON.stringify({status:'ERROR',code:e.code||'PREBUILD_FAILED',message:e.message})+'\n');process.exitCode=2}})}
