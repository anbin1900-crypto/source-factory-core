"use strict";

const {
  SENSITIVE_NAME_RE,
  collectRequestParameters,
  normalizeObservation,
  stableEndpointGroupId,
  stableUnique,
  isObject
} = require("./lib/observation_normalizer.cjs");
const {
  findRecordArrays,
  findRecordObjects,
  flattenSchema,
  htmlSignals,
  inferIdentifiers,
  mergeSchemas,
  normalizeDomCandidates
} = require("./lib/schema_identifier_inference.cjs");

function endpointGroups(observations) {
  const baseBuckets = new Map();
  for (const observation of observations) {
    const key = `${observation.method}|${observation.origin}|${observation.path_pattern}`;
    if (!baseBuckets.has(key)) baseBuckets.set(key, []);
    baseBuckets.get(key).push(observation);
  }
  const partitions = [];
  for (const [baseKey, baseSamples] of [...baseBuckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const successful = baseSamples.filter((sample) => sample.response.status === null || sample.response.status < 400);
    const errors = baseSamples.filter((sample) => sample.response.status !== null && sample.response.status >= 400);
    const byKind = new Map();
    for (const sample of successful.length ? successful : baseSamples) {
      const kind = sample.response.kind || "OTHER";
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(sample);
    }
    const ordered = [...byKind.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    if (successful.length && ordered.length) ordered[0][1].push(...errors);
    for (const [kind, samples] of ordered) partitions.push({ baseKey, kind, samples });
  }
  partitions.sort((a, b) => `${a.baseKey}|${a.kind}`.localeCompare(`${b.baseKey}|${b.kind}`));

  return partitions.map(({ baseKey, kind, samples }) => {
    const [method, origin, pathPattern] = baseKey.split("|");
    const parameterMap = new Map();
    for (const sample of samples) {
      const seen = new Set();
      for (const param of collectRequestParameters(sample)) {
        const key = `${param.location}:${param.name}`;
        if (!parameterMap.has(key)) parameterMap.set(key, { name: param.name, location: param.location, occurrences: 0, types: [], redacted: SENSITIVE_NAME_RE.test(param.name) });
        const aggregate = parameterMap.get(key);
        if (!seen.has(key)) { aggregate.occurrences += 1; seen.add(key); }
        aggregate.types.push(param.inferred_type);
        aggregate.redacted ||= SENSITIVE_NAME_RE.test(param.name);
      }
    }
    const requestParameters = [...parameterMap.values()].map((param) => ({
      name: param.name,
      location: param.location,
      types: stableUnique(param.types),
      required: param.occurrences === samples.length,
      presence_ratio: param.occurrences / samples.length,
      redacted: param.redacted
    })).sort((a, b) => `${a.location}:${a.name}`.localeCompare(`${b.location}:${b.name}`));

    const schemaSamples = samples.filter((sample) => (sample.response.status === null || sample.response.status < 400) && sample.response.kind === kind);
    const bodies = schemaSamples.map((sample) => sample.response.body).filter((body) => body !== undefined);
    const htmlSignal = htmlSignals(kind === "HTML" ? bodies.find((body) => typeof body === "string") : null);
    let responseSchema = null;
    if (kind === "JSON" && bodies.length) responseSchema = mergeSchemas(bodies);
    if (kind === "HTML" && bodies.length) responseSchema = {
      path: "$document",
      types: ["html-document"],
      nullable: false,
      observed_count: bodies.length,
      tags: htmlSignal.tags,
      repeated_regions: htmlSignal.repeated_classes.map((item) => ({ locator_hint: `.${item.name}`, observed_count: item.count })),
      data_attributes: htmlSignal.data_attributes
    };

    const recordSetMap = new Map();
    for (const body of bodies) {
      const sets = [...findRecordArrays(body), ...(isObject(body) ? findRecordObjects(body) : [])];
      for (const set of sets) {
        if (!recordSetMap.has(set.path)) recordSetMap.set(set.path, { records: [], repeated_observed: false });
        const aggregate = recordSetMap.get(set.path);
        aggregate.records.push(...set.records);
        aggregate.repeated_observed ||= Boolean(set.repeated_observed);
      }
    }
    const recordSets = [...recordSetMap.entries()].map(([path, value]) => ({ path, records: value.records, repeated_observed: value.repeated_observed }));
    const identifiers = inferIdentifiers(recordSets);
    return {
      endpoint_group_id: stableEndpointGroupId(method, origin, pathPattern, kind),
      method,
      origin,
      path_pattern: pathPattern,
      response_kind: kind,
      sample_count: samples.length,
      successful_schema_sample_count: schemaSamples.length,
      status_codes: stableUnique(samples.map((sample) => sample.response.status).filter((status) => status !== null)),
      content_types: stableUnique(samples.map((sample) => sample.response.content_type).filter(Boolean)),
      request_parameters: requestParameters,
      response_schema: responseSchema,
      response_fields: responseSchema ? flattenSchema(responseSchema) : [],
      repeated_record_paths: recordSets.filter((set) => set.repeated_observed).map((set) => ({ path: set.path, observed_records: set.records.length })),
      record_paths: recordSets.map((set) => ({ path: set.path, observed_records: set.records.length, repeated_observed: set.repeated_observed })),
      identifier_candidates: identifiers.candidates,
      identifier_relations: identifiers.relations,
      identifier_collisions: identifiers.collisions,
      html_signals: htmlSignal,
      evidence: samples.map((sample) => ({ observation_id: sample.observation_id, evidence_pointer: sample.evidence_pointer }))
    };
  });
}

function inferMode(groups, dom) {
  const jsonGroups = groups.filter((group) => group.response_kind === "JSON");
  const recordGroups = jsonGroups.filter((group) => group.repeated_record_paths.length > 0);
  const htmlGroups = groups.filter((group) => group.response_kind === "HTML");
  const apiScore = Math.min(1, jsonGroups.length * 0.25 + recordGroups.length * 0.35 + groups.filter((group) => group.request_parameters.length).length * 0.08);
  const domScore = Math.min(1, dom.repeated_regions.length * 0.25 + dom.fields.length * 0.08 + dom.locators.length * 0.05 + htmlGroups.length * 0.15);
  const mode = apiScore >= 0.45 && domScore >= 0.35 ? "HYBRID" : apiScore >= 0.45 || jsonGroups.length && domScore < 0.2 ? "JSON_API" : "DOM_HTML";
  return {
    mode,
    api_score: Number(apiScore.toFixed(4)),
    dom_score: Number(domScore.toFixed(4)),
    reasons: [
      `json_endpoint_groups=${jsonGroups.length}`,
      `json_record_groups=${recordGroups.length}`,
      `html_endpoint_groups=${htmlGroups.length}`,
      `repeated_dom_regions=${dom.repeated_regions.length}`,
      `dom_field_candidates=${dom.fields.length}`,
      `locator_candidates=${dom.locators.length}`
    ]
  };
}

function compareSchemas(previousSchemas = [], groups = []) {
  const previous = new Map();
  for (const schema of previousSchemas) {
    previous.set(schema.endpoint_group_id || `${schema.method}|${schema.path_pattern}|${schema.response_kind || "JSON"}`, schema.response_fields || flattenSchema(schema.response_schema || {}));
  }
  const drift = [];
  for (const group of groups) {
    const oldFields = [group.endpoint_group_id, `${group.method}|${group.path_pattern}|${group.response_kind}`].map((key) => previous.get(key)).find(Boolean);
    if (!oldFields) continue;
    const oldMap = new Map(oldFields.map((field) => [field.path, field]));
    const newMap = new Map(group.response_fields.map((field) => [field.path, field]));
    for (const path of stableUnique([...oldMap.keys(), ...newMap.keys()])) {
      if (!oldMap.has(path)) drift.push({ endpoint_group_id: group.endpoint_group_id, path, change: "FIELD_ADDED" });
      else if (!newMap.has(path)) drift.push({ endpoint_group_id: group.endpoint_group_id, path, change: "FIELD_REMOVED" });
      else if (JSON.stringify(oldMap.get(path).types) !== JSON.stringify(newMap.get(path).types)) drift.push({ endpoint_group_id: group.endpoint_group_id, path, change: "TYPE_CHANGED", before: oldMap.get(path).types, after: newMap.get(path).types });
    }
  }
  return drift;
}

function buildGeneratorInput(input, options = {}) {
  const observations = (input.network_observations || input.observations || input.events || []).map(normalizeObservation);
  const dom = normalizeDomCandidates(input);
  const groups = endpointGroups(observations);
  const mode = inferMode(groups, dom);
  const drift = compareSchemas(input.previous_schemas || [], groups);
  const wrongClusters = groups.filter((group) => group.response_kind === "OTHER" && group.sample_count > 1).map((group) => group.endpoint_group_id);
  return {
    schema_version: "A5_SITE_ANALYZER_GENERATOR_INPUT_V1",
    generated_at: options.generated_at || input.generated_at || new Date().toISOString(),
    source_bindings: input.source_bindings || {},
    endpoint_groups: groups,
    request_templates: groups.map((group) => ({
      endpoint_group_id: group.endpoint_group_id,
      method: group.method,
      url_template: `${group.origin}${group.path_pattern}`,
      parameters: group.request_parameters.map((parameter) => ({ name: parameter.name, location: parameter.location, types: parameter.types, required: parameter.required, default: null, evidence_presence_ratio: parameter.presence_ratio, redacted: parameter.redacted })),
      expected_response_kind: group.response_kind
    })),
    response_schemas: groups.filter((group) => group.response_schema).map((group) => ({ endpoint_group_id: group.endpoint_group_id, schema: group.response_schema, record_paths: group.repeated_record_paths })),
    identifier_map: groups.flatMap((group) => group.identifier_candidates.map((candidate) => ({ endpoint_group_id: group.endpoint_group_id, ...candidate }))),
    identifier_relations: groups.flatMap((group) => group.identifier_relations.map((relation) => ({ endpoint_group_id: group.endpoint_group_id, ...relation }))),
    dom_binding: dom,
    pagination: dom.pagination || input.pagination || null,
    extraction_mode: mode,
    schema_drift: drift,
    repairs: {
      identifier_collision_count: groups.reduce((sum, group) => sum + group.identifier_collisions.length, 0),
      identifier_collisions: groups.flatMap((group) => group.identifier_collisions.map((collision) => ({ endpoint_group_id: group.endpoint_group_id, ...collision }))),
      wrong_cluster_candidates: wrongClusters,
      schema_drift_actions: drift.map((item) => ({ ...item, action: item.change === "FIELD_ADDED" ? "ACCEPT_ADDITIVE_FIELD" : "VERSION_SCHEMA_AND_FAIL_CLOSED" })),
      fail_closed: drift.some((item) => item.change === "FIELD_REMOVED" || item.change === "TYPE_CHANGED") || wrongClusters.length > 0
    },
    a6_generator_contract: {
      adapter_mode: mode.mode,
      endpoint_group_ids: groups.map((group) => group.endpoint_group_id),
      request_template_ids: groups.map((group) => group.endpoint_group_id),
      record_paths: groups.flatMap((group) => group.repeated_record_paths.map((recordPath) => ({ endpoint_group_id: group.endpoint_group_id, path: recordPath.path }))),
      dom_locators: dom.locators,
      pagination: dom.pagination || input.pagination || null,
      preconditions: ["NO_RAW_SECRET_VALUES", "SOURCE_BINDINGS_RETAINED", "FAIL_CLOSED_ON_BREAKING_SCHEMA_DRIFT"]
    },
    counters: {
      observation_count: observations.length,
      endpoint_group_count: groups.length,
      request_template_count: groups.length,
      response_schema_count: groups.filter((group) => group.response_schema).length,
      repeated_record_path_count: groups.reduce((sum, group) => sum + group.repeated_record_paths.length, 0),
      identifier_candidate_count: groups.reduce((sum, group) => sum + group.identifier_candidates.length, 0),
      schema_drift_count: drift.length,
      raw_secret_value_count: 0
    }
  };
}

module.exports = {
  buildGeneratorInput,
  compareSchemas,
  endpointGroups,
  inferMode,
  ...require("./lib/observation_normalizer.cjs"),
  ...require("./lib/schema_identifier_inference.cjs")
};

if (require.main === module) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { raw += chunk; });
  process.stdin.on("end", () => {
    try { process.stdout.write(`${JSON.stringify(buildGeneratorInput(JSON.parse(raw || "{}")), null, 2)}\n`); }
    catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
  });
}
