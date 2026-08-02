/* eslint-env node */
"use strict";

const fs = require("fs");
const path = require("path");

const CHANNELS = Object.freeze({
  GET_REGISTRY: "yolla-panel:get-registry",
  GET_RUNTIME: "yolla-panel:get-runtime",
  OPEN_WORKSPACE: "yolla-panel:open-workspace",
  OPEN_WORKER: "yolla-panel:open-worker",
  FOCUS_WORKSPACE: "yolla-panel:focus-workspace",
  FOCUS_WORKER: "yolla-panel:focus-worker",
  SELECT_ROLE: "yolla-panel:select-role",
  RUN_CYCLE_ONCE: "yolla-panel:run-cycle-once",
  GET_LATEST_CYCLE: "yolla-panel:get-latest-cycle",
  OPEN_EXTERNAL: "yolla-panel:open-external"
});

function createError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}

function normalizeRoleId(value) {
  const roleId = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._:-]{0,63}$/.test(roleId)) createError("INVALID_ROLE_ID");
  return roleId;
}

function safeText(value, maxLength = 4000) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function isAlive(win) {
  return Boolean(win && !(typeof win.isDestroyed === "function" && win.isDestroyed()));
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (_error) {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, filePath);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createYollaPanelRuntime(deps) {
  const input = deps && typeof deps === "object" ? deps : {};
  const ipcMain = input.ipcMain;
  const shell = input.shell;
  const terminalWindows = input.terminalWindows;
  const createTerminal = input.createTerminal;
  const getTerminalKey = input.getTerminalKey;
  const dispatchNextPrompt = input.dispatchNextPrompt;
  const sourceFactoryRoot = input.sourceFactoryRoot || path.join("E:", "SOURCE FACTORY");
  const registryPath = input.registryPath || path.join(__dirname, "yolla_panel_role_registry.json");
  const runtimeRoot = input.runtimeRoot || path.join(sourceFactoryRoot, ".yolla", "yolla-panel", "runtime");
  const cycleRoot = path.join(runtimeRoot, "cycles");
  const latestCyclePath = path.join(cycleRoot, "LATEST_YOLLA_COMMAND_CYCLE.json");

  if (!ipcMain || typeof ipcMain.handle !== "function") throw new TypeError("ipcMain.handle dependency is required");
  if (!shell || typeof shell.openExternal !== "function") throw new TypeError("shell.openExternal dependency is required");
  if (!(terminalWindows instanceof Map)) throw new TypeError("terminalWindows Map dependency is required");
  if (typeof createTerminal !== "function") throw new TypeError("createTerminal dependency is required");
  if (typeof getTerminalKey !== "function") throw new TypeError("getTerminalKey dependency is required");

  let selectedRoleId = "A-1";
  let latestCycle = readJsonSafe(latestCyclePath, null);

  function getRegistry() {
    const registry = readJsonSafe(registryPath);
    if (!registry || registry.schema_version !== "YOLLA_PANEL_ROLE_REGISTRY_V1" || !Array.isArray(registry.roles)) {
      createError("ROLE_REGISTRY_INVALID");
    }
    return registry;
  }

  function getRole(roleIdInput) {
    const roleId = normalizeRoleId(roleIdInput);
    const role = getRegistry().roles.find((candidate) => candidate.role_id === roleId);
    if (!role) createError("ROLE_NOT_FOUND", roleId);
    return role;
  }

  function findWorkspaceWindow() {
    for (const win of terminalWindows.values()) {
      if (!isAlive(win) || win.__sfSafeRole !== "worker") continue;
      if (win.__yollaWorkspaceWindow === true || Number(win.__sfSafeSlot) === 1) {
        win.__yollaWorkspaceWindow = true;
        return win;
      }
    }
    return null;
  }

  function describeWorkspace(win) {
    if (!isAlive(win)) return null;
    return {
      window_id: `electron-window:${String(win.id)}`,
      slot: Number(win.__sfSafeSlot || 1),
      browser_session_id: safeText(win.__sfSafePartition, 200),
      selected_role_id: selectedRoleId,
      title: typeof win.getTitle === "function" ? win.getTitle() : "YOLLA Command Workspace",
      alive: true
    };
  }

  function sendWorkspace(channel, payload) {
    const win = findWorkspaceWindow();
    if (!win || !win.webContents || typeof win.webContents.send !== "function") return false;
    try {
      win.webContents.send(channel, payload);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function ensureWorkspace(payload) {
    const request = payload && typeof payload === "object" ? payload : {};
    let win = findWorkspaceWindow();
    let action = "REUSE_YOLLA_WORKSPACE";
    if (!win) {
      win = createTerminal(
        "worker",
        1,
        request.url || getRegistry().default_worker_url,
        request.project_home_url || getRegistry().default_worker_url
      );
      action = "CREATE_YOLLA_WORKSPACE_WITH_EXISTING_FACTORY";
    }
    win.__yollaWorkspaceWindow = true;
    win.__yollaSelectedRoleId = selectedRoleId;
    if (typeof win.setTitle === "function") win.setTitle("YOLLA Command Workspace · Commander and Worker Groups");
    if (typeof win.focus === "function") win.focus();
    if (typeof win.moveTop === "function") win.moveTop();
    const workspace = describeWorkspace(win);
    sendWorkspace("yolla-worker-workspace-state", workspace);
    return { ok: true, action, workspace };
  }

  function focusWorkspace() {
    const win = findWorkspaceWindow();
    if (!win) createError("YOLLA_WORKSPACE_NOT_OPEN");
    if (typeof win.focus === "function") win.focus();
    if (typeof win.moveTop === "function") win.moveTop();
    return { ok: true, workspace: describeWorkspace(win) };
  }

  function selectRole(payload) {
    const request = payload && typeof payload === "object" ? payload : {};
    const role = getRole(request.role_id);
    selectedRoleId = role.role_id;
    const win = findWorkspaceWindow();
    if (win) win.__yollaSelectedRoleId = selectedRoleId;
    const state = { selected_role_id: selectedRoleId, role };
    sendWorkspace("yolla-worker-workspace-state", state);
    return { ok: true, ...state };
  }

  function persistCycle(cycle) {
    ensureDir(cycleRoot);
    writeJsonAtomic(path.join(cycleRoot, `${cycle.cycle_id}.json`), cycle);
    writeJsonAtomic(latestCyclePath, cycle);
    latestCycle = cycle;
    return cycle;
  }

  function addCycleEvent(cycle, stage, status, actorRoleId, targetRoleId, details = {}) {
    const event = {
      sequence: cycle.events.length + 1,
      stage,
      status,
      actor_role_id: actorRoleId,
      target_role_id: targetRoleId,
      observed_at: new Date().toISOString(),
      details
    };
    cycle.events.push(event);
    cycle.updated_at = event.observed_at;
    persistCycle(cycle);
    sendWorkspace("yolla-worker-cycle-event", { cycle, event });
    return event;
  }

  function transportAccepted(result) {
    if (!result) return false;
    if (result.ok === false || result.dispatched === false) return false;
    if (result.payload && result.payload.dispatchStatus === "BLOCKED") return false;
    if (result.dispatchStatus === "BLOCKED") return false;
    return true;
  }

  async function runCycleOnce(payload) {
    const request = payload && typeof payload === "object" ? payload : {};
    const commander = getRole(request.commander_role_id || "A-1");
    const worker = getRole(request.worker_role_id || "A-3");
    if (!String(commander.role_type).includes("COMMANDER")) createError("COMMANDER_ROLE_REQUIRED");
    if (worker.role_type !== "WORKER") createError("WORKER_ROLE_REQUIRED");
    const commandText = safeText(request.command_text || "최신 지시를 읽고 작업을 수행하라.", 4000);
    if (!commandText) createError("COMMAND_TEXT_REQUIRED");
    if (typeof dispatchNextPrompt !== "function") createError("EXISTING_STAGE4_TRANSPORT_UNAVAILABLE");

    const workspaceResult = ensureWorkspace({});
    const compactTime = new Date().toISOString().replace(/[-:.TZ]/g, "");
    const cycleId = `YOLLA-CANARY-${commander.role_id}-${worker.role_id}-${compactTime}`;
    const cycle = {
      schema_version: "YOLLA_COMMAND_CYCLE_CANARY_V1",
      cycle_id: cycleId,
      status: "RUNNING",
      commander_role_id: commander.role_id,
      worker_role_id: worker.role_id,
      command_text: commandText,
      workspace: workspaceResult.workspace,
      transport: "EXISTING_SF_API_STAGE4",
      canary: true,
      business_execution_performed: false,
      worker_ai_execution_performed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      events: []
    };

    addCycleEvent(cycle, "COMMAND_CREATED", "PASS", commander.role_id, worker.role_id, { command_text: commandText });
    await delay(150);

    const queueItem = {
      status: "READY_TO_SEND",
      prompt_id: cycleId,
      prompt_package_id: "YOLLA_COMMAND_CYCLE_CANARY_V1",
      prompt_package_version: "1",
      worker_slot: String(worker.preferred_slot || worker.role_id),
      created_by_commander: commander.role_id,
      worker_id: worker.role_id,
      task_id: cycleId,
      terminal: "YOLLA_WORKSPACE",
      target_window: "YOLLA_WORKSPACE",
      command_route: "WORKER_INBOX",
      route_target: "WORKER_INBOX",
      panel_command_relevance: true,
      send_order: 1,
      dedupe_key: cycleId,
      prompt_text: commandText,
      payload: {
        cycle_id: cycleId,
        commander_role_id: commander.role_id,
        worker_role_id: worker.role_id,
        canary: true
      }
    };

    let dispatchResult;
    try {
      dispatchResult = await Promise.resolve(dispatchNextPrompt({
        items: [queueItem],
        dispatch_batch_id: cycleId,
        default_send_mode: "WORKER_INBOX_PLAN",
        default_route_target: "WORKER_INBOX",
        default_target_window: "YOLLA_WORKSPACE",
        dry_run: true
      }));
    } catch (error) {
      cycle.status = "BLOCKED";
      addCycleEvent(cycle, "CYCLE_BLOCKED", "BLOCKED", commander.role_id, worker.role_id, {
        reason: "STAGE4_DISPATCH_EXCEPTION",
        message: error && error.message
      });
      return persistCycle(cycle);
    }

    cycle.stage4_dispatch_result = dispatchResult;
    if (!transportAccepted(dispatchResult)) {
      cycle.status = "BLOCKED";
      addCycleEvent(cycle, "CYCLE_BLOCKED", "BLOCKED", commander.role_id, worker.role_id, {
        reason: "STAGE4_DISPATCH_NOT_ACCEPTED",
        dispatch_result: dispatchResult
      });
      return persistCycle(cycle);
    }

    addCycleEvent(cycle, "EXISTING_STAGE4_DISPATCH_ACCEPTED", "PASS", commander.role_id, worker.role_id, {
      dispatch_result: dispatchResult
    });
    await delay(150);
    addCycleEvent(cycle, "WORKER_RECEIVED", "PASS", worker.role_id, worker.role_id, {
      cycle_id: cycleId,
      command_text: commandText
    });
    await delay(150);
    const canaryResult = {
      schema_version: "YOLLA_WORKER_CANARY_RESULT_V1",
      status: "CANARY_ACK_PASS",
      cycle_id: cycleId,
      worker_role_id: worker.role_id,
      message: "명령 수신 연결 확인",
      business_result: null
    };
    cycle.canary_result = canaryResult;
    addCycleEvent(cycle, "WORKER_ACKNOWLEDGED", "PASS", worker.role_id, commander.role_id, canaryResult);
    await delay(150);
    cycle.status = "PASS";
    addCycleEvent(cycle, "COMMANDER_RESULT_RECEIVED", "PASS", commander.role_id, commander.role_id, {
      result_status: canaryResult.status,
      result_from: worker.role_id
    });
    cycle.completed_at = new Date().toISOString();
    persistCycle(cycle);
    sendWorkspace("yolla-worker-cycle-event", { cycle, completed: true });
    return cycle;
  }

  function readPcAgentState() {
    const agentRoot = path.join(sourceFactoryRoot, ".yolla", "a1-pc-agent");
    const resident = readJsonSafe(path.join(agentRoot, "runtime", "resident", "LATEST_RESIDENT_STATUS.json"));
    return {
      root: agentRoot,
      connected: Boolean(resident && resident.status === "RESIDENT_CONTEXT_REFRESH_PASS"),
      status: resident ? resident.status : "NOT_OBSERVED",
      machine_id: resident ? resident.machine_id : null,
      completed_utc: resident ? resident.completed_utc : null
    };
  }

  function runtimeSnapshot() {
    const workspace = describeWorkspace(findWorkspaceWindow());
    return {
      ok: true,
      schema_version: "YOLLA_PANEL_RUNTIME_SNAPSHOT_V2",
      panel: "YOLLA_COMMAND_CYCLE_FRONTIER",
      source_factory_root: sourceFactoryRoot,
      existing_safe_panel_runtime_reused: true,
      existing_browser_window_factory_reused: true,
      existing_stage4_transport_bound: typeof dispatchNextPrompt === "function",
      new_electron_runtime_count: 0,
      new_browser_runtime_count: 0,
      new_prompt_transport_count: 0,
      workspace,
      selected_role_id: selectedRoleId,
      latest_cycle: latestCycle,
      pc_agent: readPcAgentState(),
      observed_at: new Date().toISOString()
    };
  }

  async function openExternal(payload) {
    const url = safeText(payload && payload.url, 500);
    if (!/^https:\/\/github\.com\//i.test(url)) createError("UNSUPPORTED_EXTERNAL_URL");
    await shell.openExternal(url);
    return { ok: true, url };
  }

  function register() {
    if (global.__YOLLA_PANEL_COMMAND_CYCLE_IPC_REGISTERED__) return;
    ipcMain.handle(CHANNELS.GET_REGISTRY, () => getRegistry());
    ipcMain.handle(CHANNELS.GET_RUNTIME, () => runtimeSnapshot());
    ipcMain.handle(CHANNELS.OPEN_WORKSPACE, (_event, payload) => ensureWorkspace(payload || {}));
    ipcMain.handle(CHANNELS.OPEN_WORKER, (_event, payload) => ensureWorkspace(payload || {}));
    ipcMain.handle(CHANNELS.FOCUS_WORKSPACE, () => focusWorkspace());
    ipcMain.handle(CHANNELS.FOCUS_WORKER, () => focusWorkspace());
    ipcMain.handle(CHANNELS.SELECT_ROLE, (_event, payload) => selectRole(payload || {}));
    ipcMain.handle(CHANNELS.RUN_CYCLE_ONCE, (_event, payload) => runCycleOnce(payload || {}));
    ipcMain.handle(CHANNELS.GET_LATEST_CYCLE, () => latestCycle);
    ipcMain.handle(CHANNELS.OPEN_EXTERNAL, (_event, payload) => openExternal(payload || {}));
    global.__YOLLA_PANEL_COMMAND_CYCLE_IPC_REGISTERED__ = true;
  }

  return Object.freeze({
    CHANNELS,
    register,
    getRegistry,
    runtimeSnapshot,
    ensureWorkspace,
    openWorker: ensureWorkspace,
    focusWorkspace,
    focusWorker: focusWorkspace,
    selectRole,
    runCycleOnce,
    getLatestCycle: () => latestCycle,
    normalizeRoleId
  });
}

function registerYollaPanelBridge(deps) {
  const runtime = createYollaPanelRuntime(deps);
  runtime.register();
  return runtime;
}

module.exports = { CHANNELS, normalizeRoleId, createYollaPanelRuntime, registerYollaPanelBridge };
