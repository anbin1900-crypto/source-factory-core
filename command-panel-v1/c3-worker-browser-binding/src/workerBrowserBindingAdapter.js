/* eslint-env node */
"use strict";

const FORBIDDEN_CONTEXT_KEYS = new Set([
  "input",
  "inputs",
  "result",
  "results",
  "prompt",
  "prompts",
  "message",
  "messages",
  "conversation",
  "cookies",
  "storage",
  "session_data",
  "token",
  "secret"
]);

function normalizeRoleId(value) {
  const roleId = String(value || "").trim().toUpperCase();
  if (!roleId || !/^[A-Z0-9][A-Z0-9._:-]{0,63}$/.test(roleId)) {
    const error = new Error("INVALID_ROLE_ID");
    error.code = "INVALID_ROLE_ID";
    throw error;
  }
  return roleId;
}

function normalizePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`INVALID_${String(fieldName || "VALUE").toUpperCase()}`);
    error.code = `INVALID_${String(fieldName || "VALUE").toUpperCase()}`;
    throw error;
  }
  return parsed;
}

function sanitizeRoleContext(context) {
  const input = context && typeof context === "object" ? context : {};
  const output = {};
  Object.keys(input).forEach((key) => {
    const normalized = String(key).toLowerCase();
    if (!FORBIDDEN_CONTEXT_KEYS.has(normalized)) output[key] = input[key];
  });
  return Object.freeze(output);
}

function defaultAlive(windowLike) {
  return Boolean(windowLike && !(typeof windowLike.isDestroyed === "function" && windowLike.isDestroyed()));
}

function createWorkerBrowserBindingAdapter(deps, options) {
  const runtime = deps && typeof deps === "object" ? deps : {};
  const settings = options && typeof options === "object" ? options : {};

  if (typeof runtime.listWorkerWindows !== "function") throw new TypeError("listWorkerWindows dependency is required");
  if (typeof runtime.createWorkerWindow !== "function") throw new TypeError("createWorkerWindow dependency is required");
  if (typeof runtime.getWindowId !== "function") throw new TypeError("getWindowId dependency is required");
  if (typeof runtime.getBrowserSessionId !== "function") throw new TypeError("getBrowserSessionId dependency is required");

  const isWindowAlive = typeof runtime.isWindowAlive === "function" ? runtime.isWindowAlive : defaultAlive;
  const focusWindow = typeof runtime.focusWindow === "function" ? runtime.focusWindow : () => {};
  const attachRoleContext = typeof runtime.attachRoleContext === "function" ? runtime.attachRoleContext : () => {};
  const bindings = new Map();
  const reservedWindowIds = new Map();
  const reservedSessionIds = new Map();
  let nextSlot = normalizePositiveInteger(settings.firstDynamicSlot || 1, "first_dynamic_slot");

  function describeWindow(windowLike) {
    if (!isWindowAlive(windowLike)) {
      const error = new Error("WINDOW_NOT_ALIVE");
      error.code = "WINDOW_NOT_ALIVE";
      throw error;
    }
    const windowId = String(runtime.getWindowId(windowLike) || "").trim();
    const browserSessionId = String(runtime.getBrowserSessionId(windowLike) || "").trim();
    if (!windowId) {
      const error = new Error("WINDOW_ID_MISSING");
      error.code = "WINDOW_ID_MISSING";
      throw error;
    }
    if (!browserSessionId) {
      const error = new Error("BROWSER_SESSION_ID_MISSING");
      error.code = "BROWSER_SESSION_ID_MISSING";
      throw error;
    }
    return { windowId, browserSessionId };
  }

  function releaseReservations(roleId) {
    const existing = bindings.get(roleId);
    if (!existing) return;
    reservedWindowIds.delete(existing.worker_window_id);
    reservedSessionIds.delete(existing.browser_session_id);
    bindings.delete(roleId);
  }

  function reserve(roleId, windowLike, origin, roleContext) {
    const { windowId, browserSessionId } = describeWindow(windowLike);
    const existingWindowOwner = reservedWindowIds.get(windowId);
    const existingSessionOwner = reservedSessionIds.get(browserSessionId);
    if (existingWindowOwner && existingWindowOwner !== roleId) {
      const error = new Error("WORKER_WINDOW_ALREADY_BOUND");
      error.code = "WORKER_WINDOW_ALREADY_BOUND";
      error.owner_role_id = existingWindowOwner;
      throw error;
    }
    if (existingSessionOwner && existingSessionOwner !== roleId) {
      const error = new Error("BROWSER_SESSION_ALREADY_BOUND");
      error.code = "BROWSER_SESSION_ALREADY_BOUND";
      error.owner_role_id = existingSessionOwner;
      throw error;
    }
    releaseReservations(roleId);
    const binding = Object.freeze({
      role_id: roleId,
      worker_window_id: windowId,
      browser_session_id: browserSessionId,
      origin,
      context: sanitizeRoleContext(roleContext)
    });
    bindings.set(roleId, binding);
    reservedWindowIds.set(windowId, roleId);
    reservedSessionIds.set(browserSessionId, roleId);
    attachRoleContext(windowLike, binding);
    focusWindow(windowLike);
    return binding;
  }

  function findWindowByBinding(binding) {
    if (!binding) return null;
    return runtime.listWorkerWindows().filter(isWindowAlive)
      .find((candidate) => String(runtime.getWindowId(candidate)) === binding.worker_window_id) || null;
  }

  function assertRuntimeWindowSurfaceIsolation(windows) {
    const observedWindowIds = new Map();
    const observedSessionIds = new Map();
    for (const candidate of windows) {
      const descriptor = describeWindow(candidate);
      const priorWindow = observedWindowIds.get(descriptor.windowId);
      if (priorWindow && priorWindow !== candidate) {
        const error = new Error("RUNTIME_DUPLICATE_WINDOW_ID");
        error.code = "RUNTIME_DUPLICATE_WINDOW_ID";
        throw error;
      }
      const priorSessionWindowId = observedSessionIds.get(descriptor.browserSessionId);
      if (priorSessionWindowId && priorSessionWindowId !== descriptor.windowId) {
        const error = new Error("RUNTIME_DUPLICATE_BROWSER_SESSION_ID");
        error.code = "RUNTIME_DUPLICATE_BROWSER_SESSION_ID";
        throw error;
      }
      observedWindowIds.set(descriptor.windowId, candidate);
      observedSessionIds.set(descriptor.browserSessionId, descriptor.windowId);
    }
  }

  function findReusableUnboundWindow(preferredSlot) {
    const windows = runtime.listWorkerWindows().filter(isWindowAlive);
    assertRuntimeWindowSurfaceIsolation(windows);
    const candidates = windows.filter((candidate) => {
      const descriptor = describeWindow(candidate);
      return !reservedWindowIds.has(descriptor.windowId) && !reservedSessionIds.has(descriptor.browserSessionId);
    });
    if (!candidates.length) return null;
    if (preferredSlot && typeof runtime.getWorkerSlot === "function") {
      const preferred = candidates.find((candidate) => Number(runtime.getWorkerSlot(candidate)) === preferredSlot);
      if (preferred) return preferred;
    }
    return candidates[0];
  }

  function allocateSlot(preferredSlot) {
    if (preferredSlot) return normalizePositiveInteger(preferredSlot, "preferred_slot");
    const used = new Set(runtime.listWorkerWindows().filter(isWindowAlive).map((item) => {
      if (typeof runtime.getWorkerSlot !== "function") return null;
      return Number(runtime.getWorkerSlot(item));
    }).filter(Number.isInteger));
    while (used.has(nextSlot)) nextSlot += 1;
    const selected = nextSlot;
    nextSlot += 1;
    return selected;
  }

  function bindRole(request) {
    const input = request && typeof request === "object" ? request : {};
    const roleId = normalizeRoleId(input.role_id);
    const existing = bindings.get(roleId);
    if (existing) {
      const existingWindow = findWindowByBinding(existing);
      if (existingWindow) {
        focusWindow(existingWindow);
        return Object.freeze({ action: "REUSE_EXISTING_ROLE_BINDING", binding: existing });
      }
      releaseReservations(roleId);
    }
    const preferredSlot = input.preferred_slot == null ? null : normalizePositiveInteger(input.preferred_slot, "preferred_slot");
    const reusable = findReusableUnboundWindow(preferredSlot);
    if (reusable) {
      return Object.freeze({ action: "REUSE_UNBOUND_EXISTING_WINDOW", binding: reserve(roleId, reusable, "EXISTING_WINDOW", input.role_context) });
    }
    const slot = allocateSlot(preferredSlot);
    const created = runtime.createWorkerWindow({ role: "worker", slot, url: input.url || null, project_home_url: input.project_home_url || null });
    return Object.freeze({ action: "CREATE_WITH_EXISTING_RUNTIME_FACTORY", binding: reserve(roleId, created, "CREATED_BY_EXISTING_FACTORY", input.role_context) });
  }

  function activateRole(roleIdInput) {
    const roleId = normalizeRoleId(roleIdInput);
    const binding = bindings.get(roleId);
    if (!binding) {
      const error = new Error("ROLE_NOT_BOUND");
      error.code = "ROLE_NOT_BOUND";
      throw error;
    }
    const windowLike = findWindowByBinding(binding);
    if (!windowLike) {
      releaseReservations(roleId);
      const error = new Error("BOUND_WINDOW_NOT_ALIVE");
      error.code = "BOUND_WINDOW_NOT_ALIVE";
      throw error;
    }
    focusWindow(windowLike);
    return binding;
  }

  function switchRole(fromRoleInput, toRoleInput) {
    const fromRoleId = normalizeRoleId(fromRoleInput);
    const toRoleId = normalizeRoleId(toRoleInput);
    if (fromRoleId === toRoleId) return activateRole(toRoleId);
    const fromBinding = bindings.get(fromRoleId);
    const toBinding = activateRole(toRoleId);
    if (fromBinding && (fromBinding.worker_window_id === toBinding.worker_window_id || fromBinding.browser_session_id === toBinding.browser_session_id)) {
      const error = new Error("ROLE_SWITCH_ISOLATION_VIOLATION");
      error.code = "ROLE_SWITCH_ISOLATION_VIOLATION";
      throw error;
    }
    return Object.freeze({ from_role_id: fromRoleId, to_role_id: toRoleId, activated: toBinding, isolation: "PASS_DISTINCT_WINDOW_AND_SESSION" });
  }

  function unbindRole(roleIdInput) {
    const roleId = normalizeRoleId(roleIdInput);
    const existing = bindings.get(roleId) || null;
    releaseReservations(roleId);
    return existing;
  }

  function listBindings() {
    return Array.from(bindings.values()).sort((a, b) => a.role_id.localeCompare(b.role_id));
  }

  function validateIsolation() {
    const items = listBindings();
    const windows = new Set();
    const sessions = new Set();
    for (const item of items) {
      if (windows.has(item.worker_window_id)) return { ok: false, error: "DUPLICATE_WORKER_WINDOW_ID", binding: item };
      if (sessions.has(item.browser_session_id)) return { ok: false, error: "DUPLICATE_BROWSER_SESSION_ID", binding: item };
      windows.add(item.worker_window_id);
      sessions.add(item.browser_session_id);
    }
    return { ok: true, binding_count: items.length };
  }

  return Object.freeze({
    bindRole,
    activateRole,
    switchRole,
    unbindRole,
    getBinding: (roleId) => bindings.get(normalizeRoleId(roleId)) || null,
    listBindings,
    validateIsolation,
    sanitizeRoleContext
  });
}

module.exports = { createWorkerBrowserBindingAdapter, normalizeRoleId, sanitizeRoleContext };
