"use strict";

const assert = require("node:assert/strict");
const {
  buildGeneratorInput,
  compareSchemas,
  generalizeUrl,
  htmlSignals,
  inferIdentifiers,
  inferMode,
  mergeSchemas
} = require("./endpoint_schema_mode_inference.cjs");

let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions += 1; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }

const generalized = generalizeUrl("https://Example.COM/api/v1/items/123?size=20&page=2");
equal(generalized.origin, "https://example.com");
equal(generalized.path_pattern, "/api/v1/items/{id_4}");
equal(generalized.query_names, ["page", "size"]);
equal(generalizeUrl("https://example.com/api/items/{listing_id}").path_pattern, "/api/items/{listing_id}");

const schema = mergeSchemas([
  { id: 1, title: "A", tags: ["x", "y"] },
  { id: 2, title: null, tags: ["z"], extra: true }
]);
check(schema.properties.id.required !== false);
equal(schema.properties.id.types, ["integer"]);
check(schema.properties.title.nullable);
equal(schema.properties.tags.cardinality, { min_items: 1, max_items: 2 });
check(schema.required.includes("id"));
check(!schema.required.includes("extra"));

const identifiers = inferIdentifiers([{ path: "$.items", records: [
  { listingId: "L1", parentRegionId: "R1", title: "A" },
  { listingId: "L2", parentRegionId: "R1", title: "B" }
] }]);
equal(identifiers.candidates[0].primary_key.field, "listingId");
check(identifiers.relations.some((relation) => relation.parent_identifier_field === "parentRegionId"));
equal(identifiers.collisions.length, 1);

const html = htmlSignals('<ul><li class="card item" data-id="1">A</li><li class="card item" data-id="2">B</li></ul>');
check(html.tags.includes("li"));
check(html.repeated_classes.some((item) => item.name === "card" && item.count === 2));
check(html.data_attributes.includes("data-id"));

const fixture = {
  generated_at: "2026-08-07T01:55:00+09:00",
  source_bindings: {
    a3_pr: 22,
    a3_contract: "NETWORK_OBSERVATION_EVENT_V1",
    a4_pr: 23,
    a4_contract: "A4_TO_A5_PAGINATION_HANDOFF_V1"
  },
  network_observations: [
    {
      event_id: "EVT-001",
      request: { method: "GET", url: "https://fixture.invalid/api/listings?page=1&size=2&token=TOPSECRET123", resource_type: "FETCH", headers: [{ name: "X-Region-Code", value: "R1" }, { name: "Authorization", value_state: "PRESENT_REDACTED" }] },
      response: { status: 200, content_type: "application/json", body_format: "JSON", body: {
        page: 1,
        size: 2,
        items: [
          { listingId: "L1", regionId: "R1", title: "Alpha", price: 100, sessionToken: "SECRET_RESPONSE_VALUE" },
          { listingId: "L2", regionId: "R1", title: "Beta", price: 200 }
        ]
      } },
      evidence_pointer: "a3://evt-001"
    },
    {
      event_id: "EVT-002",
      request: { method: "GET", url: "https://fixture.invalid/api/listings?page=2&size=2", resource_type: "FETCH" },
      response: { status: 200, content_type: "application/json", body_format: "JSON", body: {
        page: 2,
        size: 2,
        items: [
          { listingId: "L3", regionId: "R2", title: "Gamma", price: 300 },
          { listingId: "L4", regionId: "R2", title: "Delta", price: 400 }
        ]
      } },
      evidence_pointer: "a3://evt-002"
    },
    {
      event_id: "EVT-ERR",
      request: { method: "GET", url: "https://fixture.invalid/api/listings?page=3&size=2", resource_type: "FETCH" },
      response: { status: 500, content_type: "text/html", body_format: "HTML", body: "<html><body>temporary error</body></html>" },
      evidence_pointer: "a3://evt-error"
    },
    {
      event_id: "EVT-003",
      request: { method: "GET", url: "https://fixture.invalid/api/listings/L1", resource_type: "XHR" },
      response: { status: 200, content_type: "application/json", body_format: "JSON", body: {
        item: { listingId: "L1", regionId: "R1", title: "Alpha", description: "Detail" }
      } },
      evidence_pointer: "a3://evt-003"
    },
    {
      event_id: "EVT-004",
      request: { method: "GET", url: "https://fixture.invalid/listings", resource_type: "DOCUMENT" },
      response: { status: 200, content_type: "text/html", body_format: "HTML", body: '<div class="listing-card" data-id="L1"></div><div class="listing-card" data-id="L2"></div>' },
      evidence_pointer: "a3://evt-004"
    }
  ],
  dom_candidates: {
    repeated_regions: [{ candidate_id: "RR-001", locator: ".listing-card", count: 2 }],
    fields: [
      { name: "title", locator: ".listing-card .title" },
      { name: "price", locator: ".listing-card .price" },
      { name: "detail_url", locator: ".listing-card a" },
      { name: "listing_id", locator: ".listing-card", attribute: "data-id" },
      { name: "region", locator: ".listing-card .region" }
    ],
    locators: [{ candidate_id: "LOC-001", selector: ".listing-card" }],
    pagination: { mode: "PAGE_NUMBER", page_parameter: "page", size_parameter: "size", termination_rules: ["EMPTY_RESULT", "NO_NEW_RECORD_IDS"] }
  }
};

const output = buildGeneratorInput(fixture, { generated_at: fixture.generated_at });
equal(output.schema_version, "A5_SITE_ANALYZER_GENERATOR_INPUT_V1");
equal(output.extraction_mode.mode, "HYBRID");
check(output.counters.endpoint_group_count >= 3);
check(output.counters.response_schema_count >= 3);
check(output.counters.repeated_record_path_count >= 1);
check(output.request_templates.some((template) => template.parameters.some((param) => param.name === "page" && param.location === "query")));
check(output.request_templates.some((template) => template.parameters.some((param) => param.name === "x-region-code" && param.location === "header")));
check(!output.request_templates.some((template) => template.parameters.some((param) => param.name === "authorization")));
check(output.endpoint_groups.every((group) => /^EG-[0-9A-F]{12}$/.test(group.endpoint_group_id)));
check(output.request_templates.some((template) => template.url_template.includes("{key_3}")));
const listGroup = output.endpoint_groups.find((group) => group.path_pattern === "/api/listings" && group.response_kind === "JSON");
check(Boolean(listGroup));
equal(listGroup.sample_count, 3);
equal(listGroup.successful_schema_sample_count, 2);
check(listGroup.repeated_record_paths.some((recordPath) => recordPath.path === "$.items"));
check(listGroup.identifier_candidates.some((candidate) => candidate.primary_key.field === "listingId"));
check(listGroup.identifier_collisions.some((collision) => collision.field === "regionId"));
check(output.identifier_relations.some((relation) => relation.parent_identifier_field === "regionId"));
check(output.identifier_map.some((item) => item.record_path === "$.item" && item.primary_key.field === "listingId"));
const htmlGroup = output.endpoint_groups.find((group) => group.response_kind === "HTML");
check(Boolean(htmlGroup && htmlGroup.response_schema));
check(htmlGroup.response_schema.repeated_regions.some((region) => region.locator_hint === ".listing-card"));
equal(output.pagination.mode, "PAGE_NUMBER");
equal(output.a6_generator_contract.adapter_mode, "HYBRID");
equal(output.counters.raw_secret_value_count, 0);
check(!JSON.stringify(output).includes("TOPSECRET123"));
check(!JSON.stringify(output).includes("SECRET_RESPONSE_VALUE"));
check(output.request_templates.some((template) => template.parameters.some((param) => param.name === "token" && param.redacted === true)));
check(output.a6_generator_contract.preconditions.includes("FAIL_CLOSED_ON_BREAKING_SCHEMA_DRIFT"));

const apiOnly = inferMode(output.endpoint_groups, { repeated_regions: [], fields: [], locators: [] });
equal(apiOnly.mode, "JSON_API");
const domOnly = inferMode([{ response_kind: "HTML", repeated_record_paths: [], request_parameters: [] }], { repeated_regions: [{}], fields: [{}, {}], locators: [{}] });
equal(domOnly.mode, "DOM_HTML");

const previous = [{
  method: "GET",
  path_pattern: "/api/listings",
  response_kind: "JSON",
  response_fields: listGroup.response_fields.map((field) => field.path === "$.items[].price" ? { ...field, types: ["string"] } : field).filter((field) => field.path !== "$.items[].title")
}];
const drift = compareSchemas(previous, output.endpoint_groups);
check(drift.some((item) => item.change === "TYPE_CHANGED" && item.path === "$.items[].price"));
check(drift.some((item) => item.change === "FIELD_ADDED" && item.path === "$.items[].title"));
const driftOutput = buildGeneratorInput({ ...fixture, previous_schemas: previous }, { generated_at: fixture.generated_at });
check(driftOutput.repairs.fail_closed);
check(driftOutput.repairs.schema_drift_actions.some((item) => item.action === "VERSION_SCHEMA_AND_FAIL_CLOSED"));

const rerun = buildGeneratorInput(fixture, { generated_at: fixture.generated_at });
equal(JSON.stringify(rerun), JSON.stringify(output));

process.stdout.write(JSON.stringify({ status: "PASS", assertions, endpoint_groups: output.counters.endpoint_group_count, mode: output.extraction_mode.mode }) + "\n");
