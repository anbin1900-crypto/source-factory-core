/* eslint-env node */
"use strict";

const crypto = require("crypto");

const PLATFORM_ID = "AI_YOLLA";
const COMPONENT_ID = "AI_YOLLA_WORKSPACE";
const RUNTIME_COMPONENT_ID = "AI_YOLLA_RUNTIME";
const REGISTERED_AT_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} KST$/;
const WAVE_PATTERN = /^WAVE_([1-9]\d*)$/;
const ID_PATTERN = /^[A-Z0-9][A-Z0-9._:-]{0,127}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const FORBIDDEN_REQUEST_KEYS = new Set([
  "input", "inputs", "result", "results", "prompt", "prompts", "message", "messages",
  "conversation", "cookies", "storage", "session_data", "token", "secret", "content"
]);

const DEFAULT_SERVICES = Object.freeze([
  Object.freeze({
    service_id: "YOLLA_REAL_ESTATE_SPECIALIST_AI",
    service_name: "욜라 부동산 전문 AI",
    domain_pack_id: "YOLLA_REAL_ESTATE"
  }),
  Object.freeze({
    service_id: "YOLLA_GAS_STATION_SPECIALIST_AI",
    service_name: "욜라 주유소 전문 AI",
    domain_pack_id: "YOLLA_GAS_STATION"
  }),
  Object.freeze({
    service_id: "YOLLA_HAZARDOUS_MATERIALS_SPECIALIST_AI",
    service_name: "욜라 위험물 전문 AI",
    domain_pack_id: "YOLLA_HAZARDOUS_MATERIALS"
  })
]);

function fail(code, details) {
  const error = new Error(code);
  error.code = code;
  if (details && typeof details === "object") Object.assign(error, details);
  throw error;
}

function normalizeId(value, fieldName) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!ID_PATTERN.test(normalized)) fail(`INVALID_${String(fieldName || "ID").toUpperCase()}`);
  return normalized;
}

function parseWaveId(value) {
  const waveId = String(value || "").trim().toUpperCase();
  const match = WAVE_PATTERN.exec(waveId);
  if (!match) fail("WAVE_ID_MISSING_OR_INVALID");
  return Object.freeze({ wave_id: waveId, wave_number: Number(match[1]) });
}

function normalizeRegisteredAtKst(value) {
  const registeredAt = String(value || "").trim();
  if (!REGISTERED_AT_PATTERN.test(registeredAt)) fail("DIRECTIVE_REGISTERED_AT_KST_MISSING_OR_INVALID");
  return registeredAt;
}

function canonicalDuplicateInput(roleId, directiveId, waveId, registeredAtKst) {
  return `${roleId}|${directiveId}|${waveId}|${registeredAtKst}`;
}

function calculateDuplicatePromptKey(roleId, directiveId, waveId, registeredAtKst) {
  return crypto.createHash("sha256")
    .update(canonicalDuplicateInput(roleId, directiveId, waveId, registeredAtKst), "utf8")
    .digest("hex");
}

function assertNoPayloadKeys(value, path) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = String(key).toLowerCase();
    if (FORBIDDEN_REQUEST_KEYS.has(normalized)) fail("WORKSPACE_PAYLOAD_LEAK_FORBIDDEN", { field_path: `${path || "$"}.${key}` });
    if (nested && typeof nested === "object") assertNoPayloadKeys(nested, `${path || "$"}.${key}`);
  }
}

function buildServiceRegistry(services) {
  const input = Array.isArray(services) ? services : DEFAULT_SERVICES;
  if (input.length !== 3) fail("EXACTLY_THREE_SERVICES_REQUIRED");
  const byId = new Map();
  const domainIds = new Set();
  for (const item of input) {
    const serviceId = normalizeId(item && item.service_id, "service_id");
    const domainPackId = normalizeId(item && item.domain_pack_id, "domain_pack_id");
    const serviceName = String(item && item.service_name || "").trim();
    if (!serviceName) fail("SERVICE_NAME_MISSING");
    if (byId.has(serviceId)) fail("DUPLICATE_SERVICE_ID");
    if (domainIds.has(domainPackId)) fail("DUPLICATE_DOMAIN_PACK_ID");
    const normalized = Object.freeze({ service_id: serviceId, service_name: serviceName, domain_pack_id: domainPackId });
    byId.set(serviceId, normalized);
    domainIds.add(domainPackId);
  }
  return Object.freeze({
    services: Object.freeze(Array.from(byId.values())),
    get(serviceId) { return byId.get(normalizeId(serviceId, "service_id")) || null; }
  });
}

function createAiYollaWorkspaceServiceSessionAdapter(deps, options) {
  const runtime = deps && typeof deps === "object" ? deps : {};
  const settings = options && typeof options === "object" ? options : {};
  const base = runtime.workerBrowserBindingAdapter;
  if (!base || typeof base.bindRole !== "function" || typeof base.activateRole !== "function" || typeof base.getBinding !== "function") {
    throw new TypeError("workerBrowserBindingAdapter dependency is required");
  }

  const attachWorkspaceContext = typeof runtime.attachWorkspaceContext === "function" ? runtime.attachWorkspaceContext : () => {};
  const clearWorkspaceContext = typeof runtime.clearWorkspaceContext === "function" ? runtime.clearWorkspaceContext : () => {};
  const registry = buildServiceRegistry(settings.services);
  const consumedKeys = new Set();
  const latestWaveByRole = new Map();
  const workspaceByRole = new Map();
  const activeServiceByRole = new Map();
  const resultReceipts = new Map();

  function validateDirectiveEnvelope(request) {
    const input = request && typeof request === "object" ? request : {};
    assertNoPayloadKeys(input, "$request");
    const roleId = normalizeId(input.role_id, "role_id");
    const directiveId = normalizeId(input.directive_id, "directive_id");
    const wave = parseWaveId(input.wave_id);
    const registeredAtKst = normalizeRegisteredAtKst(input.directive_registered_at_kst);
    const duplicatePromptKey = String(input.duplicate_prompt_key || "").trim().toLowerCase();
    if (!HASH_PATTERN.test(duplicatePromptKey)) fail("DUPLICATE_PROMPT_KEY_MISSING_OR_INVALID");
    const expectedKey = calculateDuplicatePromptKey(roleId, directiveId, wave.wave_id, registeredAtKst);
    if (duplicatePromptKey !== expectedKey) fail("DUPLICATE_PROMPT_KEY_MISMATCH", { expected_duplicate_prompt_key: expectedKey });
    if (consumedKeys.has(duplicatePromptKey)) fail("REJECT_DUPLICATE");
    const latestWave = latestWaveByRole.get(roleId) || 0;
    if (wave.wave_number < latestWave) fail("REJECT_STALE_WAVE", { latest_wave_number: latestWave });
    return Object.freeze({ role_id: roleId, directive_id: directiveId, ...wave, directive_registered_at_kst: registeredAtKst, duplicate_prompt_key: duplicatePromptKey });
  }

  function buildLogicalServiceSessionId(binding, service) {
    return crypto.createHash("sha256")
      .update(`${binding.browser_session_id}|${service.service_id}|${service.domain_pack_id}`, "utf8")
      .digest("hex");
  }

  function configureWorkspaceServices(request) {
    const envelope = validateDirectiveEnvelope(request);
    const input = request && typeof request === "object" ? request : {};
    const platformId = normalizeId(input.platform_id || PLATFORM_ID, "platform_id");
    const componentId = normalizeId(input.component_id || COMPONENT_ID, "component_id");
    if (platformId !== PLATFORM_ID) fail("PLATFORM_ID_MISMATCH");
    if (componentId !== COMPONENT_ID) fail("COMPONENT_ID_MISMATCH");

    const bindingResult = base.bindRole({
      role_id: envelope.role_id,
      preferred_slot: input.preferred_slot,
      url: input.url,
      project_home_url: input.project_home_url,
      role_context: {
        platform_id: PLATFORM_ID,
        component_id: COMPONENT_ID,
        wave_id: envelope.wave_id,
        directive_id: envelope.directive_id,
        directive_registered_at_kst: envelope.directive_registered_at_kst,
        duplicate_prompt_key: envelope.duplicate_prompt_key
      }
    });
    const binding = bindingResult && bindingResult.binding ? bindingResult.binding : base.getBinding(envelope.role_id);
    if (!binding) fail("BASE_WORKSPACE_BINDING_MISSING");

    const serviceContexts = registry.services.map((service) => Object.freeze({
      platform_id: PLATFORM_ID,
      component_id: COMPONENT_ID,
      role_id: envelope.role_id,
      workspace_window_id: binding.worker_window_id,
      browser_session_id: binding.browser_session_id,
      workspace_service_session_id: buildLogicalServiceSessionId(binding, service),
      service_id: service.service_id,
      service_name: service.service_name,
      domain_pack_id: service.domain_pack_id,
      wave_id: envelope.wave_id,
      directive_id: envelope.directive_id,
      directive_registered_at_kst: envelope.directive_registered_at_kst,
      duplicate_prompt_key: envelope.duplicate_prompt_key
    }));

    const logicalSessions = new Set(serviceContexts.map((item) => item.workspace_service_session_id));
    if (logicalSessions.size !== serviceContexts.length) fail("CROSS_SERVICE_SESSION_ISOLATION_VIOLATION");

    const workspace = Object.freeze({
      role_id: envelope.role_id,
      binding,
      service_contexts: Object.freeze(serviceContexts),
      wave_number: envelope.wave_number
    });
    workspaceByRole.set(envelope.role_id, workspace);
    latestWaveByRole.set(envelope.role_id, Math.max(latestWaveByRole.get(envelope.role_id) || 0, envelope.wave_number));
    consumedKeys.add(envelope.duplicate_prompt_key);

    const selectedServiceId = normalizeId(input.selected_service_id || serviceContexts[0].service_id, "selected_service_id");
    const activated = activateService(envelope.role_id, selectedServiceId);
    return Object.freeze({
      action: "CONFIGURE_THREE_SERVICES_ON_EXISTING_WORKSPACE",
      base_binding_action: bindingResult.action,
      binding,
      service_count: serviceContexts.length,
      active_context: activated
    });
  }

  function getWorkspace(roleIdInput) {
    const roleId = normalizeId(roleIdInput, "role_id");
    return workspaceByRole.get(roleId) || null;
  }

  function activateService(roleIdInput, serviceIdInput) {
    const roleId = normalizeId(roleIdInput, "role_id");
    const serviceId = normalizeId(serviceIdInput, "service_id");
    const workspace = workspaceByRole.get(roleId);
    if (!workspace) fail("WORKSPACE_ROLE_NOT_CONFIGURED");
    const context = workspace.service_contexts.find((item) => item.service_id === serviceId);
    if (!context) fail("SERVICE_NOT_CONFIGURED_FOR_ROLE");
    base.activateRole(roleId);
    const prior = activeServiceByRole.get(roleId) || null;
    if (prior && prior.service_id !== context.service_id) clearWorkspaceContext(workspace.binding, prior);
    attachWorkspaceContext(workspace.binding, context);
    activeServiceByRole.set(roleId, context);
    return context;
  }

  function switchService(roleIdInput, fromServiceIdInput, toServiceIdInput) {
    const roleId = normalizeId(roleIdInput, "role_id");
    const fromServiceId = normalizeId(fromServiceIdInput, "from_service_id");
    const toServiceId = normalizeId(toServiceIdInput, "to_service_id");
    const current = activeServiceByRole.get(roleId);
    if (!current || current.service_id !== fromServiceId) fail("ACTIVE_SERVICE_CONTEXT_MISMATCH");
    const next = activateService(roleId, toServiceId);
    if (current.workspace_service_session_id === next.workspace_service_session_id) fail("CROSS_SERVICE_SESSION_ISOLATION_VIOLATION");
    if (current.domain_pack_id === next.domain_pack_id) fail("CROSS_DOMAIN_ISOLATION_VIOLATION");
    return Object.freeze({
      role_id: roleId,
      from_service_id: fromServiceId,
      to_service_id: toServiceId,
      workspace_window_reused: current.workspace_window_id === next.workspace_window_id,
      electron_browser_session_reused: current.browser_session_id === next.browser_session_id,
      logical_service_session_isolated: true,
      domain_context_isolated: true,
      active_context: next
    });
  }

  function recordResultReceipt(receipt) {
    const input = receipt && typeof receipt === "object" ? receipt : {};
    assertNoPayloadKeys(input, "$receipt");
    const roleId = normalizeId(input.role_id, "role_id");
    const serviceId = normalizeId(input.service_id, "service_id");
    const domainPackId = normalizeId(input.domain_pack_id, "domain_pack_id");
    const resultHash = String(input.result_hash || "").trim().toLowerCase();
    if (!HASH_PATTERN.test(resultHash)) fail("RESULT_HASH_MISSING_OR_INVALID");
    const workspace = workspaceByRole.get(roleId);
    if (!workspace) fail("WORKSPACE_ROLE_NOT_CONFIGURED");
    const context = workspace.service_contexts.find((item) => item.service_id === serviceId);
    if (!context || context.domain_pack_id !== domainPackId) fail("RESULT_RECEIPT_CONTEXT_MISMATCH");
    const key = `${roleId}|${serviceId}|${domainPackId}`;
    const stored = Object.freeze({
      role_id: roleId,
      service_id: serviceId,
      domain_pack_id: domainPackId,
      workspace_service_session_id: context.workspace_service_session_id,
      result_hash: resultHash
    });
    resultReceipts.set(key, stored);
    return stored;
  }

  function getResultReceipt(roleIdInput, serviceIdInput, domainPackIdInput) {
    const key = `${normalizeId(roleIdInput, "role_id")}|${normalizeId(serviceIdInput, "service_id")}|${normalizeId(domainPackIdInput, "domain_pack_id")}`;
    return resultReceipts.get(key) || null;
  }

  function buildRuntimeRequest(roleIdInput, serviceIdInput, operationInput) {
    const roleId = normalizeId(roleIdInput, "role_id");
    const context = activateService(roleId, serviceIdInput);
    const operation = normalizeId(operationInput, "operation");
    return Object.freeze({
      target_component_id: RUNTIME_COMPONENT_ID,
      source_component_id: COMPONENT_ID,
      platform_id: PLATFORM_ID,
      operation,
      role_id: roleId,
      workspace_window_id: context.workspace_window_id,
      browser_session_id: context.browser_session_id,
      workspace_service_session_id: context.workspace_service_session_id,
      service_id: context.service_id,
      domain_pack_id: context.domain_pack_id,
      wave_id: context.wave_id,
      directive_id: context.directive_id,
      directive_registered_at_kst: context.directive_registered_at_kst,
      duplicate_prompt_key: context.duplicate_prompt_key,
      execution_authorized: false
    });
  }

  function listServiceContexts(roleIdInput) {
    const workspace = getWorkspace(roleIdInput);
    return workspace ? workspace.service_contexts.slice() : [];
  }

  return Object.freeze({
    configureWorkspaceServices,
    activateService,
    switchService,
    getWorkspace,
    listServiceContexts,
    recordResultReceipt,
    getResultReceipt,
    buildRuntimeRequest,
    calculateDuplicatePromptKey,
    getActiveContext: (roleId) => activeServiceByRole.get(normalizeId(roleId, "role_id")) || null,
    getServiceRegistry: () => registry.services.slice()
  });
}

module.exports = {
  PLATFORM_ID,
  COMPONENT_ID,
  RUNTIME_COMPONENT_ID,
  DEFAULT_SERVICES,
  calculateDuplicatePromptKey,
  createAiYollaWorkspaceServiceSessionAdapter
};
