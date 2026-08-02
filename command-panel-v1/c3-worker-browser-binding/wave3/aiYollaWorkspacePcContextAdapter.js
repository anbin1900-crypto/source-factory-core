/* eslint-env node */
"use strict";

const crypto = require("crypto");

const PLATFORM_ID = "AI_YOLLA";
const COMPONENT_ID = "AI_YOLLA_WORKSPACE";
const RUNTIME_COMPONENT_ID = "AI_YOLLA_RUNTIME";
const RUNTIME_ENVIRONMENT_AUTHORITY = "A1_PC_DEVELOPMENT_ENVIRONMENT_AUTHORITY";
const RUNTIME_ACCEPTANCE_TERMINAL = "A1_PC_AGENT_WINDOWS_RUNTIME_V1_TARGET_PC_ACCEPTED";
const PUBLISHED_STATUS = "A1_PC_DEVELOPMENT_ENVIRONMENT_PUBLISHED";
const ID_PATTERN = /^[A-Z0-9][A-Z0-9._:-]{0,159}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const WAVE_PATTERN = /^WAVE_([1-9]\d*)$/;
const KST_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} KST$/;
const SAFE_FUTURE_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_CONTEXT_AGE_MS = 30 * 60 * 1000;
const SENSITIVE_KEY_PATTERN = /(password|passwd|credential|secret|token|private[_-]?key|ssh[_-]?key|browser[_-]?data|cookie|environment[_-]?variable[_-]?values|source[_-]?file[_-]?contents|file[_-]?contents|personal[_-]?file)/i;

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

function parseTime(value, fieldName) {
  const raw = String(value || "").trim();
  if (!raw) fail(`${String(fieldName || "TIME").toUpperCase()}_MISSING`);
  let normalized = raw;
  if (KST_PATTERN.test(raw)) normalized = `${raw.slice(0, 10)}T${raw.slice(11, 16)}:00+09:00`;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) fail(`${String(fieldName || "TIME").toUpperCase()}_INVALID`);
  return Object.freeze({ raw, timestamp });
}

function canonicalDuplicateInput(roleId, directiveId, waveId, registeredAtKst) {
  return `${roleId}|${directiveId}|${waveId}|${registeredAtKst}`;
}

function calculateDuplicatePromptKey(roleId, directiveId, waveId, registeredAtKst) {
  return crypto.createHash("sha256")
    .update(canonicalDuplicateInput(roleId, directiveId, waveId, registeredAtKst), "utf8")
    .digest("hex");
}

function isTruthySensitiveValue(value) {
  if (value == null || value === false || value === 0 || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function assertSensitiveValuesExcluded(value, path) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = `${path || "$"}.${key}`;
    if (SENSITIVE_KEY_PATTERN.test(String(key)) && isTruthySensitiveValue(nested)) {
      fail("SENSITIVE_VALUE_REJECT", { field_path: nextPath });
    }
    if (nested && typeof nested === "object") assertSensitiveValuesExcluded(nested, nextPath);
  }
}

function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, nested] of Object.entries(value)) output[key] = immutableCopy(nested);
    return Object.freeze(output);
  }
  return value;
}

function requireSummary(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${String(fieldName).toUpperCase()}_MISSING_OR_INVALID`);
  assertSensitiveValuesExcluded(value, `$${fieldName}`);
  return immutableCopy(value);
}

function validateRuntimeAcceptance(value) {
  const input = value && typeof value === "object" ? value : {};
  if (String(input.terminal || "") !== RUNTIME_ACCEPTANCE_TERMINAL) fail("MISSING_RUNTIME_ACCEPTANCE_REJECT");
  const acceptanceRun = String(input.acceptance_run || "").trim();
  const runtimeVersion = String(input.runtime_version || "").trim();
  const machineId = normalizeId(input.machine_id, "machine_id");
  if (!acceptanceRun) fail("RUNTIME_ACCEPTANCE_RUN_MISSING");
  if (!runtimeVersion) fail("RUNTIME_VERSION_MISSING");
  return Object.freeze({
    terminal: RUNTIME_ACCEPTANCE_TERMINAL,
    acceptance_run: acceptanceRun,
    runtime_version: runtimeVersion,
    manager_hotfix_version: String(input.manager_hotfix_version || "").trim() || null,
    machine_id: machineId
  });
}

function validatePcContext(value, directiveTime, options) {
  const input = value && typeof value === "object" ? value : {};
  assertSensitiveValuesExcluded(input, "$pc_context");
  if (String(input.runtime_environment_authority || "") !== RUNTIME_ENVIRONMENT_AUTHORITY) fail("RUNTIME_ENVIRONMENT_AUTHORITY_MISMATCH");
  if (String(input.environment_status || "") !== PUBLISHED_STATUS) fail("PC_CONTEXT_NOT_PUBLISHED");
  if (input.secret_values_published !== false) fail("SENSITIVE_VALUE_REJECT", { field_path: "$pc_context.secret_values_published" });
  const machineId = normalizeId(input.machine_id, "machine_id");
  const snapshotId = String(input.context_snapshot_id || "").trim();
  const environmentSha256 = String(input.environment_sha256 || "").trim().toLowerCase();
  const pointerBlob = String(input.environment_pointer_blob || "").trim().toLowerCase();
  if (!snapshotId) fail("CONTEXT_SNAPSHOT_ID_MISSING");
  if (!HASH_PATTERN.test(environmentSha256)) fail("ENVIRONMENT_SHA256_INVALID");
  if (!/^[a-f0-9]{40}$/.test(pointerBlob)) fail("ENVIRONMENT_POINTER_BLOB_INVALID");
  const generated = parseTime(input.context_published_at_kst, "context_published_at_kst");
  const maxAgeMs = Number.isFinite(options.max_context_age_ms) ? options.max_context_age_ms : DEFAULT_MAX_CONTEXT_AGE_MS;
  const ageMs = directiveTime.timestamp - generated.timestamp;
  if (ageMs < -SAFE_FUTURE_SKEW_MS) fail("FUTURE_CONTEXT_REJECT", { context_age_ms: ageMs });
  if (ageMs > maxAgeMs) fail("STALE_CONTEXT_REJECT", { context_age_ms: ageMs, max_context_age_ms: maxAgeMs });

  return Object.freeze({
    runtime_environment_authority: RUNTIME_ENVIRONMENT_AUTHORITY,
    environment_status: PUBLISHED_STATUS,
    machine_id: machineId,
    context_snapshot_id: snapshotId,
    context_published_at_kst: generated.raw,
    context_freshness: "FRESH",
    context_age_seconds_at_directive: Math.max(0, Math.round(ageMs / 1000)),
    environment_sha256: environmentSha256,
    environment_pointer_blob: pointerBlob,
    source_branch: String(input.source_branch || "").trim() || null,
    canonical_runtime_root: String(input.canonical_runtime_root || "").trim() || null,
    project_root_summary: requireSummary(input.project_root_summary, "project_root_summary"),
    repository_state_summary: requireSummary(input.repository_state_summary, "repository_state_summary"),
    entrypoint_summary: requireSummary(input.entrypoint_summary, "entrypoint_summary"),
    tool_availability_summary: requireSummary(input.tool_availability_summary, "tool_availability_summary")
  });
}

function snapshotAuthorityId(runtimeAcceptance, pcContext) {
  return crypto.createHash("sha256").update([
    runtimeAcceptance.machine_id,
    runtimeAcceptance.acceptance_run,
    runtimeAcceptance.runtime_version,
    pcContext.context_snapshot_id,
    pcContext.environment_sha256,
    pcContext.environment_pointer_blob
  ].join("|"), "utf8").digest("hex");
}

function createAiYollaWorkspacePcContextAdapter(deps, options) {
  const runtime = deps && typeof deps === "object" ? deps : {};
  const settings = options && typeof options === "object" ? options : {};
  const workspace = runtime.workspaceServiceSessionAdapter;
  if (!workspace || typeof workspace.listServiceContexts !== "function" || typeof workspace.activateService !== "function") {
    throw new TypeError("workspaceServiceSessionAdapter dependency is required");
  }

  const consumedPromptKeys = new Set();
  const roleAuthority = new Map();
  const bindings = new Map();
  const resultReceipts = new Map();

  function validateEnvelope(request) {
    const input = request && typeof request === "object" ? request : {};
    const roleId = normalizeId(input.role_id, "role_id");
    const directiveId = normalizeId(input.directive_id, "directive_id");
    const wave = parseWaveId(input.wave_id);
    const registered = parseTime(input.directive_registered_at_kst, "directive_registered_at_kst");
    const registeredRaw = String(input.directive_registered_at_kst || "").trim();
    const duplicatePromptKey = String(input.duplicate_prompt_key || "").trim().toLowerCase();
    if (!HASH_PATTERN.test(duplicatePromptKey)) fail("DUPLICATE_PROMPT_KEY_MISSING_OR_INVALID");
    const expected = calculateDuplicatePromptKey(roleId, directiveId, wave.wave_id, registeredRaw);
    if (duplicatePromptKey !== expected) fail("DUPLICATE_PROMPT_KEY_MISMATCH", { expected_duplicate_prompt_key: expected });
    if (consumedPromptKeys.has(duplicatePromptKey)) fail("REJECT_DUPLICATE");
    return Object.freeze({ role_id: roleId, directive_id: directiveId, ...wave, directive_registered_at_kst: registeredRaw, directive_time: registered, duplicate_prompt_key: duplicatePromptKey });
  }

  function bindPcContext(request) {
    const input = request && typeof request === "object" ? request : {};
    const envelope = validateEnvelope(input);
    const runtimeAcceptance = validateRuntimeAcceptance(input.runtime_acceptance);
    const pcContext = validatePcContext(input.pc_context, envelope.directive_time, settings);
    if (runtimeAcceptance.machine_id !== pcContext.machine_id) fail("RUNTIME_AND_CONTEXT_MACHINE_MISMATCH");
    const serviceContexts = workspace.listServiceContexts(envelope.role_id);
    if (!Array.isArray(serviceContexts) || serviceContexts.length !== 3) fail("THREE_SERVICE_WORKSPACE_CONTEXT_REQUIRED");
    const authorityId = snapshotAuthorityId(runtimeAcceptance, pcContext);
    const prior = roleAuthority.get(envelope.role_id);
    if (prior) {
      if (envelope.wave_number < prior.wave_number) fail("REJECT_STALE_WAVE");
      if (envelope.wave_number === prior.wave_number && prior.snapshot_authority_id !== authorityId) fail("CROSS_CONTEXT_SNAPSHOT_MISMATCH");
    }

    const roleBindings = [];
    const logicalSessions = new Set();
    for (const serviceContext of serviceContexts) {
      if (!serviceContext || serviceContext.role_id !== envelope.role_id) fail("ROLE_SERVICE_CONTEXT_ISOLATION_VIOLATION");
      const serviceId = normalizeId(serviceContext.service_id, "service_id");
      const domainPackId = normalizeId(serviceContext.domain_pack_id, "domain_pack_id");
      const logicalSessionId = String(serviceContext.workspace_service_session_id || "").trim();
      if (!logicalSessionId) fail("WORKSPACE_SERVICE_SESSION_ID_MISSING");
      if (logicalSessions.has(logicalSessionId)) fail("ROLE_SERVICE_CONTEXT_ISOLATION_VIOLATION");
      logicalSessions.add(logicalSessionId);
      workspace.activateService(envelope.role_id, serviceId);
      const binding = Object.freeze({
        platform_id: PLATFORM_ID,
        component_id: COMPONENT_ID,
        role_id: envelope.role_id,
        workspace_window_id: String(serviceContext.workspace_window_id || ""),
        browser_session_id: String(serviceContext.browser_session_id || ""),
        workspace_service_session_id: logicalSessionId,
        service_id: serviceId,
        domain_pack_id: domainPackId,
        wave_id: envelope.wave_id,
        directive_id: envelope.directive_id,
        directive_registered_at_kst: envelope.directive_registered_at_kst,
        duplicate_prompt_key: envelope.duplicate_prompt_key,
        runtime_acceptance_run: runtimeAcceptance.acceptance_run,
        runtime_version: runtimeAcceptance.runtime_version,
        runtime_environment_authority: pcContext.runtime_environment_authority,
        context_snapshot_id: pcContext.context_snapshot_id,
        context_published_at_kst: pcContext.context_published_at_kst,
        context_freshness: pcContext.context_freshness,
        context_age_seconds_at_directive: pcContext.context_age_seconds_at_directive,
        snapshot_authority_id: authorityId,
        project_root_summary: pcContext.project_root_summary,
        repository_state_summary: pcContext.repository_state_summary,
        entrypoint_summary: pcContext.entrypoint_summary,
        tool_availability_summary: pcContext.tool_availability_summary,
        execution_authorized: false,
        context_read_only: true
      });
      bindings.set(`${envelope.role_id}|${serviceId}`, binding);
      roleBindings.push(binding);
    }

    roleAuthority.set(envelope.role_id, Object.freeze({
      wave_number: envelope.wave_number,
      context_snapshot_id: pcContext.context_snapshot_id,
      snapshot_authority_id: authorityId
    }));
    consumedPromptKeys.add(envelope.duplicate_prompt_key);
    return Object.freeze({
      action: "BIND_A1_PC_CONTEXT_TO_AI_YOLLA_WORKSPACE_SERVICES",
      role_id: envelope.role_id,
      service_count: roleBindings.length,
      context_snapshot_id: pcContext.context_snapshot_id,
      snapshot_authority_id: authorityId,
      context_freshness: pcContext.context_freshness,
      bindings: Object.freeze(roleBindings)
    });
  }

  function getBinding(roleIdInput, serviceIdInput) {
    const key = `${normalizeId(roleIdInput, "role_id")}|${normalizeId(serviceIdInput, "service_id")}`;
    return bindings.get(key) || null;
  }

  function buildRuntimeBoundaryRequest(roleIdInput, serviceIdInput, operationInput) {
    const binding = getBinding(roleIdInput, serviceIdInput);
    if (!binding) fail("PC_CONTEXT_BINDING_NOT_FOUND");
    const operation = normalizeId(operationInput, "operation");
    return Object.freeze({
      target_component_id: RUNTIME_COMPONENT_ID,
      source_component_id: COMPONENT_ID,
      platform_id: PLATFORM_ID,
      operation,
      role_id: binding.role_id,
      workspace_window_id: binding.workspace_window_id,
      browser_session_id: binding.browser_session_id,
      workspace_service_session_id: binding.workspace_service_session_id,
      service_id: binding.service_id,
      domain_pack_id: binding.domain_pack_id,
      context_snapshot_id: binding.context_snapshot_id,
      snapshot_authority_id: binding.snapshot_authority_id,
      runtime_acceptance_run: binding.runtime_acceptance_run,
      runtime_version: binding.runtime_version,
      context_freshness: binding.context_freshness,
      execution_authorized: false,
      context_read_only: true
    });
  }

  function recordResultReceipt(receipt) {
    const input = receipt && typeof receipt === "object" ? receipt : {};
    assertSensitiveValuesExcluded(input, "$receipt");
    const binding = getBinding(input.role_id, input.service_id);
    if (!binding) fail("PC_CONTEXT_BINDING_NOT_FOUND");
    const snapshotId = String(input.context_snapshot_id || "").trim();
    const resultHash = String(input.result_hash || "").trim().toLowerCase();
    if (snapshotId !== binding.context_snapshot_id) fail("CROSS_CONTEXT_RESULT_REJECT");
    if (!HASH_PATTERN.test(resultHash)) fail("RESULT_HASH_MISSING_OR_INVALID");
    const stored = Object.freeze({
      role_id: binding.role_id,
      service_id: binding.service_id,
      domain_pack_id: binding.domain_pack_id,
      context_snapshot_id: binding.context_snapshot_id,
      snapshot_authority_id: binding.snapshot_authority_id,
      result_hash: resultHash
    });
    resultReceipts.set(`${binding.role_id}|${binding.service_id}|${binding.context_snapshot_id}`, stored);
    return stored;
  }

  function getResultReceipt(roleIdInput, serviceIdInput, snapshotIdInput) {
    const key = `${normalizeId(roleIdInput, "role_id")}|${normalizeId(serviceIdInput, "service_id")}|${String(snapshotIdInput || "").trim()}`;
    return resultReceipts.get(key) || null;
  }

  function validateIsolation() {
    const rows = Array.from(bindings.values());
    const byRole = new Map();
    for (const row of rows) {
      if (!byRole.has(row.role_id)) byRole.set(row.role_id, []);
      byRole.get(row.role_id).push(row);
    }
    for (const roleRows of byRole.values()) {
      if (new Set(roleRows.map((item) => item.context_snapshot_id)).size !== 1) return { ok: false, error: "CROSS_CONTEXT_LEAK" };
      if (new Set(roleRows.map((item) => item.snapshot_authority_id)).size !== 1) return { ok: false, error: "CROSS_CONTEXT_AUTHORITY_LEAK" };
      if (new Set(roleRows.map((item) => item.workspace_service_session_id)).size !== roleRows.length) return { ok: false, error: "ROLE_SERVICE_CONTEXT_ISOLATION_VIOLATION" };
    }
    return { ok: true, binding_count: rows.length, role_count: byRole.size };
  }

  return Object.freeze({
    bindPcContext,
    getBinding,
    buildRuntimeBoundaryRequest,
    recordResultReceipt,
    getResultReceipt,
    validateIsolation,
    calculateDuplicatePromptKey,
    snapshotAuthorityId
  });
}

module.exports = {
  PLATFORM_ID,
  COMPONENT_ID,
  RUNTIME_COMPONENT_ID,
  RUNTIME_ENVIRONMENT_AUTHORITY,
  RUNTIME_ACCEPTANCE_TERMINAL,
  PUBLISHED_STATUS,
  calculateDuplicatePromptKey,
  createAiYollaWorkspacePcContextAdapter
};
