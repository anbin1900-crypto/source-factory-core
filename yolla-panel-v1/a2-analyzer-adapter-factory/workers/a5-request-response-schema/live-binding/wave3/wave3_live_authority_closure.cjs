'use strict';
const crypto = require('node:crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function sha256(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function uniq(values) { return [...new Set(values)].sort(); }
function scalarType(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) return value.includes('.') ? 'number-string' : 'integer-string';
  return typeof value;
}
function generalizeUrl(raw) {
  const u = new URL(raw);
  const segs = u.pathname.split('/').filter(Boolean).map((s, i) => /^\d+$/.test(s) ? `{id_${i+1}}` : s.toLowerCase());
  return { origin: u.origin.toLowerCase(), path_pattern: '/' + segs.join('/'), query_names: uniq([...u.searchParams.keys()]) };
}
function responseKind(mime='') {
  const x = String(mime).toLowerCase();
  if (x.includes('json')) return 'JSON';
  if (x.includes('html')) return 'HTML';
  if (x.includes('csv')) return 'CSV';
  if (x.includes('css')) return 'CSS';
  if (x.includes('javascript')) return 'JAVASCRIPT';
  if (x.includes('image')) return 'IMAGE';
  return 'OTHER';
}
function groupTraffic(a3) {
  const bodyById = new Map((a3.response_body_stream || []).map(x => [x.request_id, x]));
  const groups = new Map();
  for (const req of a3.network_request_stream || []) {
    const g = generalizeUrl(req.url);
    const key = `${req.method}|${g.origin}|${g.path_pattern}`;
    if (!groups.has(key)) groups.set(key, { method:req.method, origin:g.origin, path_pattern:g.path_pattern, requests:[], query_presence:{}, resource_types:new Set(), response_kinds:new Set(), body_sha256:new Set() });
    const bucket = groups.get(key);
    bucket.requests.push(req);
    bucket.resource_types.add(req.resource_type);
    for (const name of g.query_names) bucket.query_presence[name] = (bucket.query_presence[name] || 0) + 1;
    const body = bodyById.get(req.request_id);
    if (body) { bucket.response_kinds.add(responseKind(body.mime_type)); bucket.body_sha256.add(body.sha256); }
  }
  return [...groups.values()].sort((a,b)=>a.path_pattern.localeCompare(b.path_pattern)).map(g => ({
    endpoint_group_id: 'LIVE-' + sha256([g.method,g.origin,g.path_pattern]).slice(0,12).toUpperCase(),
    method:g.method, origin:g.origin, path_pattern:g.path_pattern,
    sample_count:g.requests.length,
    resource_types:uniq([...g.resource_types]),
    response_kinds:uniq([...g.response_kinds]),
    body_sha256:uniq([...g.body_sha256]),
    request_parameters:Object.entries(g.query_presence).sort().map(([name,count]) => ({ name, location:'query', required:count===g.requests.length, presence_ratio:count/g.requests.length }))
  }));
}
function domSchema(a4) {
  const fields = a4.fieldCandidates || [];
  return {
    schema_kind:'DOM_RECORD', record_path:'main#records > article.item',
    fields:fields.map(f => ({ name:f.name, observed_type:scalarType(f.value), strategy:f.strategy, locator:f.css || null })),
    repeated_region_count:(a4.repeatedRegions || []).length,
    repeated_card_count:(a4.repeatedRegions || [])[0]?.itemCount || 0
  };
}
function identifierMap(a4) {
  const fields = a4.fieldCandidates || [];
  const id = fields.find(f => /(^record_id$|(^|_)id$)/i.test(f.name));
  const detail = fields.find(f => f.name === 'detail_url');
  return {
    primary_key:id ? { field:id.name, source:'A4_ACTUAL_LIVE_STRUCTURE', confidence:0.99 } : null,
    relations:detail && id ? [{ relation:'LIST_RECORD_TO_DETAIL_ROUTE', parent_key:id.name, child_route_field:detail.name, evidence:(a4.listDetailRelation || {}).navigationConfirmedByA3LiveStream || [] }] : []
  };
}
function closeWave3({a3,a4,a3_head,a4_head}) {
  if (a3?.schema_version !== 'A3_SITE_ANALYZER_WAVE2_LIVE_STREAM_HANDOFF_V1' || a3.status !== 'LIVE_STREAM_READY' || !String(a3.actual_browser || '').includes('REAL_CDP')) throw new Error('A3_ACTUAL_LIVE_STREAM_REQUIRED');
  if (a4?.schemaVersion !== 'A4_WAVE2_ACTUAL_LIVE_STRUCTURE_HANDOFF_V2' || a4.actualLive !== true) throw new Error('A4_ACTUAL_LIVE_STRUCTURE_REQUIRED');
  if (a4.inputAuthority?.a3Head !== a3_head || a4.inputAuthority?.a3StreamSha256 !== a3.stream_sha256) throw new Error('A3_A4_AUTHORITY_MISMATCH');
  const groups = groupTraffic(a3);
  const blockers = [];
  const advertisedRequests = a3.event_type_counts?.['network.request'] || 0;
  const listedRequests = (a3.network_request_stream || []).length;
  if (advertisedRequests !== listedRequests) blockers.push({ code:'A3_NETWORK_REQUEST_STREAM_COUNT_MISMATCH', advertised:advertisedRequests, listed:listedRequests });
  const bodyEntries = a3.response_body_stream || [];
  const bodyContentPublished = bodyEntries.some(x => typeof x.inline_body === 'string' || typeof x.body === 'string' || x.content_pointer || x.storage_pointer);
  if (!bodyContentPublished) blockers.push({ code:'A3_RESPONSE_BODY_BYTES_OR_CONTENT_POINTER_NOT_PUBLISHED', body_metadata_count:bodyEntries.length });
  const driftRequests = (a3.network_request_stream || []).filter(x => generalizeUrl(x.url).path_pattern === '/schema-drift');
  const driftModes = uniq(driftRequests.flatMap(x => { const u=new URL(x.url); return u.searchParams.getAll('mode'); }));
  if (!(driftModes.includes('v1') && driftModes.includes('v2'))) blockers.push({ code:'A3_LIVE_SCHEMA_DRIFT_BASELINE_MISSING', observed_modes:driftModes });
  const jsonGroups = groups.filter(g => g.response_kinds.includes('JSON'));
  const dom = domSchema(a4);
  const ids = identifierMap(a4);
  const mode = jsonGroups.length > 0 && dom.fields.length >= 5 ? 'HYBRID' : jsonGroups.length > 0 ? 'JSON_API' : 'DOM_HTML';
  const result = {
    schema_version:'A5_WAVE3_LIVE_AUTHORITY_CLOSURE_V1',
    authority:{ a3_head, a3_stream_sha256:a3.stream_sha256, a4_head, a4_result_sha256:a4.resultSha256 },
    live_endpoint_groups:groups,
    request_templates:groups.map(g => ({ endpoint_group_id:g.endpoint_group_id, method:g.method, url_template:g.origin+g.path_pattern, parameters:g.request_parameters, expected_response_kinds:g.response_kinds })),
    response_schema:{ dom, api:{ status:bodyContentPublished ? 'CONTENT_AVAILABLE' : 'BLOCKED_BODY_CONTENT_ABSENT', metadata_groups:jsonGroups.map(g => ({endpoint_group_id:g.endpoint_group_id, body_sha256:g.body_sha256})) } },
    identifier_map:ids,
    schema_drift:{ status:driftModes.includes('v1')&&driftModes.includes('v2')&&bodyContentPublished ? 'COMPARABLE' : 'BLOCKED', observed_modes:driftModes },
    extraction_mode:{ mode, evidence:{ json_endpoint_group_count:jsonGroups.length, dom_field_count:dom.fields.length, repeated_card_count:dom.repeated_card_count } },
    coverage:{ advertised_network_requests:advertisedRequests, listed_network_requests:listedRequests, endpoint_group_count:groups.length, response_body_metadata_count:bodyEntries.length, json_endpoint_group_count:jsonGroups.length },
    blockers,
    a6_generator_input:{ status:blockers.length ? 'BLOCKED_EXACT_UPSTREAM_EVIDENCE_GAP' : 'READY', mode, endpoint_groups:groups, dom_schema:dom, identifier_map:ids },
    raw_secret_value_count:0
  };
  result.output_sha256=sha256(result);
  return result;
}
module.exports={closeWave3,groupTraffic,generalizeUrl,domSchema,identifierMap,sha256};
