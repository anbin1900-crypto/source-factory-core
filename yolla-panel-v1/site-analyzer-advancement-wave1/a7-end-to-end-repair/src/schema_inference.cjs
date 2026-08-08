'use strict';

function templateUrl(raw) {
  try {
    const url = new URL(raw);
    const path = url.pathname.split('/').map(part => /^\d+$/.test(part) || /^[0-9a-f-]{16,}$/i.test(part) ? '{id}' : part).join('/');
    const keys = [...url.searchParams.keys()].sort();
    return `${url.origin}${path}${keys.length ? '?' + keys.map(k => `${k}={${k}}`).join('&') : ''}`;
  } catch { return raw || 'unknown'; }
}

function mergeType(a, b) {
  if (!a) return b;
  if (!b || JSON.stringify(a) === JSON.stringify(b)) return a;
  const types = new Set([...(a.anyOf || [a]).map(v => JSON.stringify(v)), ...(b.anyOf || [b]).map(v => JSON.stringify(v))]);
  return { anyOf: [...types].map(v => JSON.parse(v)) };
}

function inferValue(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', items: value.reduce((schema, item) => mergeType(schema, inferValue(item)), null) || {} };
  if (typeof value === 'object') {
    const properties = {}, required = [];
    for (const [key, child] of Object.entries(value)) { properties[key] = inferValue(child); if (child !== null) required.push(key); }
    return { type: 'object', properties, required };
  }
  return { type: typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'number') : typeof value };
}

function findRecordArrays(value, path = '$', out = []) {
  if (Array.isArray(value)) {
    if (value.some(v => v && typeof v === 'object' && !Array.isArray(v))) out.push({ path, records: value.filter(v => v && typeof v === 'object' && !Array.isArray(v)) });
    value.forEach((v, i) => findRecordArrays(v, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) findRecordArrays(child, `${path}.${key}`, out);
  }
  return out;
}

function inferEndpoints(events, structure) {
  const bodies = events.filter(e => e.type === 'network.response_body' && e.payload?.body);
  const groups = new Map();
  for (const event of bodies) {
    const key = `${event.payload.method || 'GET'} ${templateUrl(event.payload.url)}`;
    const group = groups.get(key) || { endpoint_id: `endpoint-${groups.size + 1}`, method: event.payload.method || 'GET', url_template: templateUrl(event.payload.url), samples: [], schemas: [], record_paths: [] };
    try {
      const value = JSON.parse(event.payload.body);
      group.samples.push(value);
      group.schemas.push(inferValue(value));
      group.record_paths.push(...findRecordArrays(value).map(v => ({ path: v.path, count: v.records.length })));
    } catch {
      group.samples.push(event.payload.body);
      group.schemas.push({ type: 'string' });
    }
    groups.set(key, group);
  }
  const endpointGroups = [...groups.values()].map(group => ({
    ...group,
    response_schema: group.schemas.reduce(mergeType, null) || {},
    request_template: { method: group.method, url_template: group.url_template },
    record_paths: group.record_paths.sort((a,b) => b.count - a.count)
  }));
  const domFields = structure?.field_candidates?.length || 0;
  const apiRecords = endpointGroups.reduce((n,g) => n + (g.record_paths[0]?.count || 0), 0);
  const mode = apiRecords > 0 && domFields > 0 ? 'HYBRID' : apiRecords > 0 ? 'API' : 'DOM';
  const identifierRelations = [];
  for (const group of endpointGroups) {
    const sample = group.samples.find(v => v && typeof v === 'object');
    const arrays = sample ? findRecordArrays(sample) : [];
    for (const array of arrays) {
      const keys = new Set(array.records.flatMap(r => Object.keys(r)));
      for (const key of keys) if (/id$/i.test(key)) identifierRelations.push({ endpoint_id: group.endpoint_id, field: key, relation: /parent|owner|category/i.test(key) ? 'PARENT_REFERENCE' : 'IDENTIFIER' });
    }
  }
  return { schema_version: 'ENDPOINT_SCHEMA_MODE_INFERENCE_V1', endpoint_groups: endpointGroups, identifier_relations: identifierRelations, extraction_mode: mode };
}

module.exports = { inferEndpoints, inferValue, findRecordArrays, templateUrl };
