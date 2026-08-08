"use strict";

const { URL } = require("node:url");
const crypto = require("node:crypto");

const ID_NAME_RE = /(^id$|[_-]id$|Id$|ID$|uuid|guid|key$|code$|No$|number$)/;
const PARENT_NAME_RE = /^(?:parent.*|owner.*|group.*|category.*|region.*|site.*|account.*)(id|key|code|no)$/i;
const NUMERIC_RE = /^-?\d+(?:\.\d+)?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]{16,}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]+)?$/;
const SENSITIVE_NAME_RE = /(authorization|cookie|token|secret|password|passwd|api[_-]?key|session|credential|jwt)/i;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  if (typeof value === "number") return "number";
  if (typeof value === "string" && DATE_RE.test(value)) return "date-time-string";
  return typeof value;
}

function inferScalarFromString(value) {
  if (typeof value !== "string") return valueType(value);
  const text = value.trim();
  if (/^(true|false)$/i.test(text)) return "boolean";
  if (NUMERIC_RE.test(text)) return text.includes(".") ? "number" : "integer";
  if (DATE_RE.test(text)) return "date-time-string";
  return "string";
}

function stableUnique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function stableEndpointGroupId(method, origin, pathPattern, kind) {
  const digest = crypto.createHash("sha256").update(`${method}|${origin}|${pathPattern}|${kind}`).digest("hex").slice(0, 12).toUpperCase();
  return `EG-${digest}`;
}

function parseUrlLoose(raw) {
  if (!raw || typeof raw !== "string") return null;
  const placeholderMap = new Map();
  let placeholderIndex = 0;
  const templated = raw.replace(/\{([^/{}]+)\}/g, (_match, name) => {
    const token = `YOLLA_PLACEHOLDER_${placeholderIndex++}`;
    placeholderMap.set(token, name);
    return token;
  });
  try {
    const parsed = new URL(templated, "https://fixture.invalid");
    return { parsed, placeholderMap, wasRelative: !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) };
  } catch {
    return null;
  }
}

function generalizeSegment(segment, index, placeholderMap = new Map()) {
  if (!segment) return segment;
  if (/^v\d+$/i.test(segment)) return segment.toLowerCase();
  if (placeholderMap.has(segment)) return `{${placeholderMap.get(segment)}}`;
  let decoded = segment;
  try { decoded = decodeURIComponent(segment); } catch {}
  if (UUID_RE.test(decoded)) return `{uuid_${index}}`;
  if (/^\d+$/.test(decoded)) return `{id_${index}}`;
  if (HEX_RE.test(decoded)) return `{token_${index}}`;
  if (/^[A-Za-z]+[0-9]+$/.test(decoded) || /^[0-9]+[A-Za-z]+$/.test(decoded)) return `{key_${index}}`;
  if (/^[A-Za-z0-9_-]{24,}$/.test(decoded) && /\d/.test(decoded)) return `{token_${index}}`;
  return decoded.toLowerCase();
}

function generalizeUrl(rawUrl) {
  const parsedResult = parseUrlLoose(rawUrl);
  if (!parsedResult) return { origin: "unknown://unknown", path_pattern: String(rawUrl || ""), query_names: [] };
  const { parsed, placeholderMap, wasRelative } = parsedResult;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const generalized = segments.map((segment, index) => generalizeSegment(segment, index + 1, placeholderMap));
  return {
    origin: wasRelative ? "relative://local" : parsed.origin.toLowerCase(),
    path_pattern: `/${generalized.join("/")}` || "/",
    query_names: stableUnique([...parsed.searchParams.keys()])
  };
}

function contentKind(response = {}) {
  const format = String(response.body_format || response.format || "").toUpperCase();
  const contentType = String(response.content_type || response.mime_type || "").toLowerCase();
  if (format.includes("JSON") || contentType.includes("json") || isObject(response.body) || Array.isArray(response.body)) return "JSON";
  if (format.includes("HTML") || contentType.includes("html") || typeof response.body === "string" && /<html|<body|<div|<li/i.test(response.body)) return "HTML";
  if (format.includes("GRAPHQL")) return "JSON";
  return "OTHER";
}

function bodyValue(response = {}) {
  if (response.body_json !== undefined) return response.body_json;
  if (response.body !== undefined) return response.body;
  if (response.response_body !== undefined) return response.response_body;
  if (response.body_text !== undefined && typeof response.body_text === "string") {
    try { return JSON.parse(response.body_text); } catch { return response.body_text; }
  }
  return undefined;
}

function normalizeObservation(observation, index) {
  const request = observation.request || {};
  const response = observation.response || {};
  const url = request.url || request.url_pattern || observation.url || observation.document_url || "";
  const method = String(request.method || observation.method || "GET").toUpperCase();
  const generalized = generalizeUrl(url);
  return {
    observation_id: observation.event_id || observation.observation_id || `OBS-${String(index + 1).padStart(3, "0")}`,
    method,
    url,
    origin: generalized.origin,
    path_pattern: generalized.path_pattern,
    query_names: generalized.query_names,
    request,
    response: {
      status: response.status ?? observation.status ?? null,
      content_type: response.content_type || response.mime_type || "",
      body_format: response.body_format || response.format || "",
      kind: contentKind(response),
      body: bodyValue(response)
    },
    classification: observation.classification || null,
    evidence_pointer: observation.evidence_pointer || observation.source_pointer || null
  };
}

function collectRequestParameters(observation) {
  const params = [];
  const parsedResult = parseUrlLoose(observation.url);
  if (parsedResult) {
    for (const [name, value] of parsedResult.parsed.searchParams.entries()) {
      params.push({ name, location: "query", value, inferred_type: inferScalarFromString(value) });
    }
  }
  for (const match of observation.path_pattern.matchAll(/\{([^}]+)\}/g)) {
    params.push({ name: match[1], location: "path", value: "<dynamic>", inferred_type: match[1].startsWith("id_") ? "integer|string" : "string" });
  }
  const request = observation.request || {};
  const query = request.query || request.query_parameters;
  if (isObject(query)) for (const [name, value] of Object.entries(query)) params.push({ name, location: "query", value, inferred_type: valueType(value) });
  const body = request.body_json ?? request.body;
  if (isObject(body)) for (const [name, value] of Object.entries(body)) params.push({ name, location: "body", value, inferred_type: valueType(value) });

  const sensitiveHeaders = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization", "x-api-key", "api-key"]);
  const headerNames = Array.isArray(request.headers)
    ? request.headers.map((header) => header?.name)
    : isObject(request.headers) ? Object.keys(request.headers) : [];
  for (const rawName of headerNames) {
    const name = String(rawName || "").toLowerCase();
    if (!name || sensitiveHeaders.has(name)) continue;
    if (name.startsWith("x-") || ["accept-language", "content-type"].includes(name)) {
      params.push({ name, location: "header", value: undefined, inferred_type: "string" });
    }
  }

  for (const param of request.parameters || []) {
    if (!param?.name) continue;
    params.push({ name: param.name, location: param.location || "unknown", value: param.value, inferred_type: param.type || inferScalarFromString(param.value) });
  }
  for (const name of request.parameter_names || []) {
    if (!params.some((param) => param.name === name)) params.push({ name, location: "unknown", value: undefined, inferred_type: "unknown" });
  }
  return params;
}

module.exports = {
  ID_NAME_RE,
  PARENT_NAME_RE,
  SENSITIVE_NAME_RE,
  collectRequestParameters,
  generalizeUrl,
  isObject,
  normalizeObservation,
  stableEndpointGroupId,
  stableUnique,
  valueType
};
