/* eslint-env node */
"use strict";

const fs = require("fs");
const path = require("path");

const CHANNELS = Object.freeze({
  GET_REGISTRY: "yolla-panel:get-registry",
  GET_RUNTIME: "yolla-panel:get-runtime",
  OPEN_WORKER: "yolla-panel:open-worker",
  FOCUS_WORKER: "yolla-panel:focus-worker",
  OPEN_EXTERNAL: "yolla-panel:open-external"
});

function createError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function normalizeRoleId(value) {
  const roleId = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._:-]{0,63}$/.test(roleId)) throw createError("INVALID_ROLE_ID");
  return roleId;
}

function safeText(value, maxLength = 120) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);
}

function isAlive(win) {
  return Boolean(win && !(typeof win.isDestroyed === "function" && win.isDestroyed()));
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (_error) {
    return null;
  }
}

function createYollaPanelRuntime(deps) {
  const input = deps && typeof deps === "object" ? deps : {};
  const ipcMain = input.ipcMain;
  const shell = input.shell;
  const terminalWindows = input.terminalWindows;
  const createTerminal = input.createTerminal;
  const getTerminalKey = input.getTerminalKey;
  const sourceFactoryRoot = input.sourceFactoryRoot || path.join("E:", "SOURCE FACTORY");
  const registryPath = input.registryPath || path.join(__dirname, "yolla_panel_role_registry.json");

  if (!ipcMain || typeof ipcMain.handle !== "function") throw new TypeError("ipcMain.handle dependency is required");
  if (!shell || typeof shell.openExternal !== "function") throw new TypeError("shell.openExternal dependency is required");
  if (!(terminalWindows instanceof Map)) throw new TypeError("terminalWindows Map dependency is required");
  if (typeof createTerminal !== "function") throw new TypeError("createTerminal dependency is required");
  if (typeof getTerminalKey !== "function") throw new TypeError("getTerminalKey dependency is required");

  const roleBindings = new Map();
  const windowOwners = new Map();
  const sessionOwners = new Map();

  function listWorkerWindows() {
    const windows = [];
    for (const [key, win] of terminalWindows.entries()) {
      if (!isAlive(win) || win.__sfSafeRole !== "worker") continue;
      const expectedKey = getTerminalKey("worker", win.__sfSafeSlot);
      if (key !== expectedKey) throw createError("TERMINAL_KEY_MISMATCH", key);
      windows.push(win);
    }
    return windows.sort((a, b) => Number(a.__sfSafeSlot || 0) - Number(b.__sfSafeSlot || 0));
  }

  function describeWindow(win) {
    if (!isAlive(win)) throw createError("WINDOW_NOT_ALIVE");
    const windowId = `electron-window:${String(win.id)}`;
    const browserSessionId = safeText(win.__sfSafePartition, 160);
    if (!browserSessionId) throw createError("BROWSER_SESSION_ID_MISSING");
    return { window_id: windowId, browser_session_id: browserSessionId, slot: Number(win.__sfSafeSlot || 0), alive: true };
  }

  function cleanDeadBindings() {
    const aliveIds = new Set(listWorkerWindows().map((win) => describeWindow(win).window_id));
    for (const [roleId, binding] of Array.from(roleBindings.entries())) {
      if (!aliveIds.has(binding.window_id)) {
        roleBindings.delete(roleId);
        windowOwners.delete(binding.window_id);
        sessionOwners.delete(binding.browser_session_id);
      }
    }
  }

  function findWindowForBinding(binding) {
    if (!binding) return null;
    return listWorkerWindows().find((win) => describeWindow(win).window_id === binding.window_id) || null;
  }

  function nextAvailableSlot(preferredSlot) {
    const used = new Set(listWorkerWindows().map((win) => Number(win.__sfSafeSlot || 0)));
    const preferred = Number(preferredSlot);
    if (Number.isInteger(preferred) && preferred > 0 && !used.has(preferred)) return preferred;
    let slot = 1;
    while (used.has(slot)) slot += 1;
    return slot;
  }

  function findReusableWindow(preferredSlot) {
    cleanDeadBindings();
    const unbound = listWorkerWindows().filter((win) => {
      const descriptor = describeWindow(win);
      return !windowOwners.has(descriptor.window_id) && !sessionOwners.has(descriptor.browser_session_id);
    });
    const preferred = Number(preferredSlot);
    if (Number.isInteger(preferred) && preferred > 0) {
      const match = unbound.find((win) => Number(win.__sfSafeSlot || 0) === preferred);
      if (match) return match;
    }
    return unbound[0] || null;
  }

  function bindWindow(roleId, roleName, win, origin) {
    const descriptor = describeWindow(win);
    const windowOwner = windowOwners.get(descriptor.window_id);
    const sessionOwner = sessionOwners.get(descriptor.browser_session_id);
    if (windowOwner && windowOwner !== roleId) throw createError("WINDOW_ALREADY_BOUND", windowOwner);
    if (sessionOwner && sessionOwner !== roleId) throw createError("SESSION_ALREADY_BOUND", sessionOwner);

    const prior = roleBindings.get(roleId);
    if (prior) {
      windowOwners.delete(prior.window_id);
      sessionOwners.delete(prior.browser_session_id);
    }

    const binding = Object.freeze({
      schema_version: "YOLLA_WORKER_WINDOW_BINDING_V1",
      role_id: roleId,
      role_name: roleName,
      window_id: descriptor.window_id,
      browser_session_id: descriptor.browser_session_id,
      slot: descriptor.slot,
      origin,
      bound_at: new Date().toISOString()
    });

    roleBindings.set(roleId, binding);
    windowOwners.set(binding.window_id, roleId);
    sessionOwners.set(binding.browser_session_id, roleId);
    win.__yollaRoleId = roleId;
    win.__yollaRoleName = roleName;
    win.__yollaPanelBinding = binding;
    if (typeof win.setTitle === "function") win.setTitle(`${roleId} · ${roleName} | YOLLA Worker`);
    if (typeof win.focus === "function") win.focus();
    if (typeof win.moveTop === "function") win.moveTop();
    return binding;
  }

  function openWorker(payload) {
    const request = payload && typeof payload === "object" ? payload : {};
    const roleId = normalizeRoleId(request.role_id);
    const roleName = safeText(request.role_name || roleId, 80);
    cleanDeadBindings();

    const existing = roleBindings.get(roleId);
    if (existing) {
      const win = findWindowForBinding(existing);
      if (win) {
        if (typeof win.focus === "function") win.focus();
        if (typeof win.moveTop === "function") win.moveTop();
        return { ok: true, action: "REUSE_ROLE_BINDING", binding: existing };
      }
    }

    const reusable = findReusableWindow(request.preferred_slot);
    if (reusable) {
      return { ok: true, action: "REUSE_UNBOUND_EXISTING_WINDOW", binding: bindWindow(roleId, roleName, reusable, "EXISTING_SAFE_PANEL_WINDOW") };
    }

    const slot = nextAvailableSlot(request.preferred_slot);
    const win = createTerminal("worker", slot, request.url || undefined, request.project_home_url || undefined);
    return { ok: true, action: "CREATE_WITH_EXISTING_SAFE_PANEL_FACTORY", binding: bindWindow(roleId, roleName, win, "EXISTING_SAFE_PANEL_FACTORY") };
  }

  function focusWorker(payload) {
    const request = payload && typeof payload === "object" ? payload : {};
    const roleId = normalizeRoleId(request.role_id);
    cleanDeadBindings();
    const binding = roleBindings.get(roleId);
    if (!binding) throw createError("ROLE_NOT_BOUND");
    const win = findWindowForBinding(binding);
    if (!win) throw createError("BOUND_WINDOW_NOT_ALIVE");
    if (typeof win.focus === "function") win.focus();
    if (typeof win.moveTop === "function") win.moveTop();
    return { ok: true, binding };
  }

  function readPcAgentState() {
    const agentRoot = path.join(sourceFactoryRoot, ".yolla", "a1-pc-agent");
    const residentPath = path.join(agentRoot, "runtime", "resident", "LATEST_RESIDENT_STATUS.json");
    const resident = readJsonSafe(residentPath);
    return {
      root: agentRoot,
      connected: Boolean(resident && resident.status === "RESIDENT_CONTEXT_REFRESH_PASS"),
      status: resident ? resident.status : "NOT_OBSERVED",
      machine_id: resident ? resident.machine_id : null,
      completed_utc: resident ? resident.completed_utc : null,
      remote_action_count: resident ? resident.remote_action_count : null
    };
  }

  function getRegistry() {
    const registry = readJsonSafe(registryPath);
    if (!registry || registry.schema_version !== "YOLLA_PANEL_ROLE_REGISTRY_V1" || !Array.isArray(registry.roles)) throw createError("ROLE_REGISTRY_INVALID");
    return registry;
  }

  function runtimeSnapshot() {
    cleanDeadBindings();
    const windows = listWorkerWindows().map((win) => {
      const descriptor = describeWindow(win);
      return { ...descriptor, role_id: win.__yollaRoleId || null, role_name: win.__yollaRoleName || null, title: typeof win.getTitle === "function" ? win.getTitle() : null };
    });
    return {
      ok: true,
      schema_version: "YOLLA_PANEL_RUNTIME_SNAPSHOT_V1",
      panel: "YOLLA_CONNECTION_FRONTIER",
      source_factory_root: sourceFactoryRoot,
      existing_safe_panel_runtime_reused: true,
      new_electron_runtime_count: 0,
      new_ipc_transport_count: 0,
      existing_stage4_transport_expected: true,
      worker_windows: windows,
      bindings: Array.from(roleBindings.values()).sort((a, b) => a.role_id.localeCompare(b.role_id)),
      pc_agent: readPcAgentState(),
      observed_at: new Date().toISOString()
    };
  }

  async function openExternal(payload) {
    const url = safeText(payload && payload.url, 500);
    if (!/^https:\/\/github\.com\//i.test(url)) throw createError("UNSUPPORTED_EXTERNAL_URL");
    await shell.openExternal(url);
    return { ok: true, url };
  }

  function register() {
    if (global.__YOLLA_PANEL_CONNECTION_FRONTIER_IPC_REGISTERED__) return;
    ipcMain.handle(CHANNELS.GET_REGISTRY, () => getRegistry());
    ipcMain.handle(CHANNELS.GET_RUNTIME, () => runtimeSnapshot());
    ipcMain.handle(CHANNELS.OPEN_WORKER, (_event, payload) => openWorker(payload || {}));
    ipcMain.handle(CHANNELS.FOCUS_WORKER, (_event, payload) => focusWorker(payload || {}));
    ipcMain.handle(CHANNELS.OPEN_EXTERNAL, (_event, payload) => openExternal(payload || {}));
    global.__YOLLA_PANEL_CONNECTION_FRONTIER_IPC_REGISTERED__ = true;
  }

  return Object.freeze({ CHANNELS, register, openWorker, focusWorker, getRegistry, runtimeSnapshot, listBindings: () => Array.from(roleBindings.values()), normalizeRoleId });
}

function registerYollaPanelBridge(deps) {
  const runtime = createYollaPanelRuntime(deps);
  runtime.register();
  return runtime;
}

module.exports = { CHANNELS, normalizeRoleId, createYollaPanelRuntime, registerYollaPanelBridge };
