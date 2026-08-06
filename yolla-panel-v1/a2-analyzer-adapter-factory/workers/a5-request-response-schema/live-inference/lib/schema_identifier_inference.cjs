"use strict";

const {
  ID_NAME_RE,
  PARENT_NAME_RE,
  isObject,
  stableUnique,
  valueType
} = require("./observation_normalizer.cjs");

function mergeSchemas(values, path = "$") {
  const nonNull = values.filter((value) => value !== null && value !== undefined);
  const schema = {
    path,
    types: stableUnique(values.map(valueType)),
    nullable: values.some((value) => value === null),
    observed_count: values.length
  };
  if (!nonNull.length) return schema;
  if (nonNull.some(Array.isArray)) {
    const arrays = nonNull.filter(Array.isArray);
    const items = arrays.flat();
    schema.cardinality = { min_items: Math.min(...arrays.map((value) => value.length)), max_items: Math.max(...arrays.map((value) => value.length)) };
    schema.items = items.length ? mergeSchemas(items, `${path}[]`) : { path: `${path}[]`, types: [], nullable: false, observed_count: 0 };
  }
  const objects = nonNull.filter(isObject);
  if (objects.length) {
    schema.properties = {};
    schema.required = [];
    for (const key of stableUnique(objects.flatMap((object) => Object.keys(object)))) {
      const present = objects.filter((object) => Object.prototype.hasOwnProperty.call(object, key)).map((object) => object[key]);
      schema.properties[key] = mergeSchemas(present, `${path}.${key}`);
      schema.properties[key].presence_ratio = present.length / objects.length;
      if (present.length === objects.length) schema.required.push(key);
    }
  }
  return schema;
}

function flattenSchema(schema, output = []) {
  if (!schema?.path) return output;
  output.push({ path: schema.path, types: schema.types || [], nullable: Boolean(schema.nullable), presence_ratio: schema.presence_ratio ?? 1, cardinality: schema.cardinality || null });
  if (schema.items) flattenSchema(schema.items, output);
  for (const child of Object.values(schema.properties || {})) flattenSchema(child, output);
  return output;
}

function findRecordArrays(value, path = "$", output = []) {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isObject)) output.push({ path, records: value, repeated_observed: value.length > 1 });
    value.forEach((item) => findRecordArrays(item, `${path}[]`, output));
  } else if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) findRecordArrays(child, `${path}.${key}`, output);
  }
  return output;
}

function findRecordObjects(value, path = "$", output = []) {
  if (!isObject(value)) return output;
  if (Object.keys(value).some((key) => ID_NAME_RE.test(key))) output.push({ path, records: [value], repeated_observed: false });
  for (const [key, child] of Object.entries(value)) if (isObject(child)) findRecordObjects(child, `${path}.${key}`, output);
  return output;
}

function uniqueRatio(records, field) {
  const values = records.map((record) => record[field]).filter((value) => value !== null && value !== undefined && value !== "");
  return values.length ? new Set(values.map((value) => JSON.stringify(value))).size / values.length : 0;
}

function inferIdentifiers(recordSets) {
  const candidates = [];
  const relations = [];
  const collisions = [];
  for (const set of recordSets) {
    const scored = [];
    for (const field of stableUnique(set.records.flatMap((record) => Object.keys(record)))) {
      const ratio = uniqueRatio(set.records, field);
      const score = Number(((ID_NAME_RE.test(field) ? 0.55 : 0) + ratio * 0.45).toFixed(4));
      if (score >= 0.65) scored.push({ field, path: `${set.path}[].${field}`, uniqueness_ratio: ratio, confidence: score });
      if (ID_NAME_RE.test(field) && ratio < 1) collisions.push({ record_path: set.path, field, uniqueness_ratio: ratio, action: "DEMOTE_FROM_PRIMARY_KEY" });
      if (PARENT_NAME_RE.test(field)) relations.push({ child_record_path: set.path, parent_identifier_field: field, relation: "MANY_TO_ONE_CANDIDATE" });
    }
    scored.sort((a, b) => b.confidence - a.confidence || a.field.localeCompare(b.field));
    if (scored.length) candidates.push({ record_path: set.path, primary_key: scored[0], alternatives: scored.slice(1) });
  }
  return { candidates, relations, collisions };
}

function htmlSignals(html) {
  if (typeof html !== "string") return { tags: [], repeated_classes: [], data_attributes: [] };
  const tags = stableUnique([...html.matchAll(/<([a-z][a-z0-9-]*)\b/gi)].map((match) => match[1].toLowerCase()));
  const classCounts = new Map();
  for (const match of html.matchAll(/class=["']([^"']+)["']/gi)) {
    for (const name of match[1].split(/\s+/).filter(Boolean)) classCounts.set(name, (classCounts.get(name) || 0) + 1);
  }
  return {
    tags,
    repeated_classes: [...classCounts.entries()].filter(([, count]) => count > 1).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    data_attributes: stableUnique([...html.matchAll(/\s(data-[a-z0-9_-]+)=/gi)].map((match) => match[1].toLowerCase()))
  };
}

function normalizeDomCandidates(input = {}) {
  const source = input.dom_candidates || input.structure_candidates || input.a4 || {};
  return {
    repeated_regions: source.repeated_regions || source.repeated_region_candidates || source.regions || [],
    fields: source.fields || source.field_candidates || [],
    locators: source.locators || source.locator_candidates || [],
    pagination: source.pagination || source.pagination_candidate || input.pagination || null,
    page_types: source.page_types || []
  };
}

module.exports = {
  findRecordArrays,
  findRecordObjects,
  flattenSchema,
  htmlSignals,
  inferIdentifiers,
  mergeSchemas,
  normalizeDomCandidates
};
