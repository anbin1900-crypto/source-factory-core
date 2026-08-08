/* eslint-env node */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const STATE_SCHEMA = "YOLLA_PANEL_V6_UI_SESSION_STATE_V1";
const RECEIPT_SCHEMA = "YOLLA_PANEL_V6_SESSION_RESTORE_RECEIPT_V1";
const DEFAULT_PANEL_BOUNDS = { x: 80, y: 60, width: 1500, height: 940 };
const DEFAULT_LOG_BOUNDS = { x: 140, y: 100, width: 1080, height: 780 };

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function nowIso() { return new Date().toISOString(); }
function ensureDir(directory) { fs.mkdirSync(directory, { recursive: true }); }
function readJson(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); }
  catch (_error) { return fallback; }
}
function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, filePath);
}
function cleanPath(value) { return String(value == null ? "" : value).replace(/\u0000/g, "").slice(0, 3000); }
function bool(value) { return value === true; }
function positive(value, fallback, minimum) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= minimum ? number : fallback;
}
function defaultSurface(bounds, open) {
  return { open, visible: open, maximized: false, full_screen: false, bounds: clone(bounds), last_active_at: null };
}
function defaultState(profileRoot, partitions) {
  return {
    schema_version: STATE_SCHEMA,
    launch_count: 0,
    run_id: null,
    last_shutdown_clean: false,
    profile_root: cleanPath(profileRoot),
    partitions: clone(partitions),
    workspace: {
      selected_mode: "CONTEXTS",
      selected_group_id: null,
      selected_role_id: null,
      selected_site_id: null,
      worker_url: "https://chatgpt.com/projects",
      analyzer_url: "https://www.google.com",
      active_browser_kind: "WORKER"
    },
    panel: defaultSurface(DEFAULT_PANEL_BOUNDS, true),
    log_window: defaultSurface(DEFAULT_LOG_BOUNDS, false),
    auth: {
      GPT_CHATGPT_LOGIN: { authenticated: false, observed: false, surface: null, observed_at: null },
      GOOGLE_LOGIN: { authenticated: false, observed: false, surface: null, observed_at: null }
    },
    updated_at: nowIso()
  };
}
function sanitizeSurface(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  const inputBounds = source.bounds && typeof source.bounds === "object" ? source.bounds : {};
  return {
    open: source.open == null ? fallback.open : bool(source.open),
    visible: source.visible == null ? fallback.visible : bool(source.visible),
    maximized: bool(source.maximized),
    full_screen: bool(source.full_screen),
    bounds: {
      x: Math.round(Number.isFinite(Number(inputBounds.x)) ? Number(inputBounds.x) : fallback.bounds.x),
      y: Math.round(Number.isFinite(Number(inputBounds.y)) ? Number(inputBounds.y) : fallback.bounds.y),
      width: positive(inputBounds.width, fallback.bounds.width, 400),
      height: positive(inputBounds.height, fallback.bounds.height, 300)
    },
    last_active_at: typeof source.last_active_at === "string" ? source.last_active_at.slice(0, 80) : null
  };
}
function safeSurface(value) {
  if (!value || typeof value !== "object") return null;
  return {
    host: String(value.host || "").slice(0, 253).toLowerCase(),
    path: String(value.path || "/").slice(0, 500),
    authenticated_marker: String(value.authenticated_marker || "NONE").slice(0, 80)
  };
}

class SessionRestoreManager {
  constructor(options = {}) {
    this.stateRoot = path.resolve(options.stateRoot);
    this.profileRoot = path.resolve(options.profileRoot);
    this.receiptRoot = path.resolve(options.receiptRoot);
    this.screen = options.screen || null;
    this.appendLog = typeof options.appendLog === "function" ? options.appendLog : () => {};
    this.partitions = {
      worker: String(options.workerPartition || "persist:yolla-v6-worker"),
      analyzer: String(options.analyzerPartition || "persist:yolla-v6-analyzer")
    };
    this.statePath = path.join(this.stateRoot, "session", "V6_UI_SESSION_STATE.json");
    this.receiptPath = path.join(this.receiptRoot, "LATEST_SESSION_RESTORE_RECEIPT.json");
    this.value = null;
    this.previousRuntimeSeen = false;
    this.restored = { panel: false, log_window: false };
    this.quitting = false;
    this.timers = new Map();
  }

  load(workspace = {}) {
    const fallback = defaultState(this.profileRoot, this.partitions);
    const existing = readJson(this.statePath, null);
    const normalized = this.normalize(existing || fallback);
    this.previousRuntimeSeen = Boolean(existing && Number(normalized.launch_count || 0) > 0 &&
      normalized.profile_root === this.profileRoot &&
      normalized.partitions.worker === this.partitions.worker &&
      normalized.partitions.analyzer === this.partitions.analyzer);
    this.restored = { panel: false, log_window: Boolean(this.previousRuntimeSeen && !normalized.log_window.open) };
    normalized.launch_count = Number(normalized.launch_count || 0) + 1;
    normalized.run_id = `V6-RUN-${Date.now()}-${process.pid}`;
    normalized.last_shutdown_clean = false;
    normalized.profile_root = this.profileRoot;
    normalized.partitions = clone(this.partitions);
    normalized.auth.GPT_CHATGPT_LOGIN = { authenticated: false, observed: false, surface: null, observed_at: null };
    normalized.auth.GOOGLE_LOGIN = { authenticated: false, observed: false, surface: null, observed_at: null };
    this.value = normalized;
    this.recordWorkspace(workspace, workspace.selected_mode === "ANALYZER" ? "ANALYZER" : "WORKER", false);
    this.save();
    this.writeReceipt("PARTIAL", { terminal: "YOLLA_V6_SESSION_RESTORE_PENDING_LIVE_AUTH_PROBES" });
    return this.snapshot();
  }

  normalize(input) {
    const fallback = defaultState(this.profileRoot, this.partitions);
    const source = input && typeof input === "object" ? clone(input) : fallback;
    const workspace = source.workspace && typeof source.workspace === "object" ? source.workspace : {};
    return {
      schema_version: STATE_SCHEMA,
      launch_count: Math.max(0, Number(source.launch_count || 0)),
      run_id: typeof source.run_id === "string" ? source.run_id.slice(0, 160) : null,
      last_shutdown_clean: bool(source.last_shutdown_clean),
      profile_root: cleanPath(source.profile_root || this.profileRoot),
      partitions: {
        worker: String(source.partitions && source.partitions.worker || this.partitions.worker),
        analyzer: String(source.partitions && source.partitions.analyzer || this.partitions.analyzer)
      },
      workspace: {
        selected_mode: workspace.selected_mode === "ANALYZER" ? "ANALYZER" : "CONTEXTS",
        selected_group_id: workspace.selected_group_id == null ? null : String(workspace.selected_group_id).slice(0, 100),
        selected_role_id: workspace.selected_role_id == null ? null : String(workspace.selected_role_id).slice(0, 100),
        selected_site_id: workspace.selected_site_id == null ? null : String(workspace.selected_site_id).slice(0, 160),
        worker_url: String(workspace.worker_url || "https://chatgpt.com/projects").slice(0, 3000),
        analyzer_url: String(workspace.analyzer_url || "https://www.google.com").slice(0, 3000),
        active_browser_kind: workspace.active_browser_kind === "ANALYZER" ? "ANALYZER" : "WORKER"
      },
      panel: sanitizeSurface(source.panel, fallback.panel),
      log_window: sanitizeSurface(source.log_window, fallback.log_window),
      auth: {
        GPT_CHATGPT_LOGIN: this.normalizeAuth(source.auth && source.auth.GPT_CHATGPT_LOGIN),
        GOOGLE_LOGIN: this.normalizeAuth(source.auth && source.auth.GOOGLE_LOGIN)
      },
      updated_at: typeof source.updated_at === "string" ? source.updated_at.slice(0, 80) : nowIso()
    };
  }

  normalizeAuth(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      authenticated: bool(source.authenticated),
      observed: bool(source.observed),
      surface: safeSurface(source.surface),
      observed_at: typeof source.observed_at === "string" ? source.observed_at.slice(0, 80) : null
    };
  }

  snapshot() { return clone(this.value || defaultState(this.profileRoot, this.partitions)); }
  save() {
    if (!this.value) return;
    this.value.updated_at = nowIso();
    writeJsonAtomic(this.statePath, this.value);
  }

  displayBounds(input, fallback) {
    const candidate = sanitizeSurface({ bounds: input }, { ...defaultSurface(fallback, true), bounds: fallback }).bounds;
    if (!this.screen) return candidate;
    let display = null;
    try { display = this.screen.getDisplayMatching(candidate); } catch (_error) {}
    try { if (!display) display = this.screen.getPrimaryDisplay(); } catch (_error) {}
    const area = display && display.workArea;
    if (!area) return candidate;
    const width = Math.min(Math.max(400, candidate.width), area.width);
    const height = Math.min(Math.max(300, candidate.height), area.height);
    const intersects = candidate.x < area.x + area.width && candidate.x + width > area.x && candidate.y < area.y + area.height && candidate.y + height > area.y;
    return {
      x: intersects ? Math.min(Math.max(candidate.x, area.x), area.x + area.width - width) : area.x,
      y: intersects ? Math.min(Math.max(candidate.y, area.y), area.y + area.height - height) : area.y,
      width,
      height
    };
  }

  windowOptions(surface, defaults) {
    if (!this.value) throw new Error("SESSION_STATE_NOT_LOADED");
    const key = surface === "log_window" ? "log_window" : "panel";
    const fallback = key === "panel" ? DEFAULT_PANEL_BOUNDS : DEFAULT_LOG_BOUNDS;
    const bounds = this.displayBounds(this.value[key].bounds, fallback);
    return { ...(defaults || {}), ...bounds, show: defaults && defaults.show === false ? false : this.value[key].visible !== false };
  }

  shouldOpenLogWindow() { return Boolean(this.value && this.value.log_window.open); }

  applyWindowState(surface, window) {
    if (!this.value || !window || window.isDestroyed()) return;
    const key = surface === "log_window" ? "log_window" : "panel";
    const value = this.value[key];
    try { if (value.maximized) window.maximize(); } catch (_error) {}
    try { if (key === "panel" && value.full_screen) window.setFullScreen(true); } catch (_error) {}
    this.restored[key] = Boolean(this.previousRuntimeSeen);
    this.writeReceipt("PARTIAL", { terminal: "YOLLA_V6_SESSION_RESTORE_PENDING_LIVE_AUTH_PROBES" });
  }

  trackWindow(surface, window) {
    if (!this.value || !window) return;
    const key = surface === "log_window" ? "log_window" : "panel";
    this.value[key].open = true;
    this.captureWindow(key, window, true);
    const schedule = () => this.scheduleCapture(key, window);
    for (const event of ["move", "resize", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "show", "hide", "focus"]) window.on(event, schedule);
    window.on("close", () => {
      this.captureWindow(key, window, true);
      if (!this.quitting) this.value[key].open = false;
      this.save();
    });
    window.on("closed", () => {
      const timer = this.timers.get(key);
      if (timer) clearTimeout(timer);
      this.timers.delete(key);
    });
  }

  scheduleCapture(key, window) {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(key, setTimeout(() => { this.timers.delete(key); this.captureWindow(key, window, true); }, 250));
  }

  captureWindow(key, window, persist) {
    if (!this.value || !window || window.isDestroyed()) return;
    const target = this.value[key];
    try { target.bounds = clone(window.getNormalBounds()); } catch (_error) { try { target.bounds = clone(window.getBounds()); } catch (_ignored) {} }
    try { target.maximized = window.isMaximized(); } catch (_error) {}
    try { target.full_screen = window.isFullScreen(); } catch (_error) {}
    try { target.visible = window.isVisible(); } catch (_error) {}
    target.last_active_at = nowIso();
    if (persist) this.save();
  }

  recordWorkspace(workspace, activeKind, persist = true) {
    if (!this.value) return;
    const source = workspace && typeof workspace === "object" ? workspace : {};
    const browser = source.browser && typeof source.browser === "object" ? source.browser : {};
    this.value.workspace = {
      selected_mode: source.selected_mode === "ANALYZER" ? "ANALYZER" : "CONTEXTS",
      selected_group_id: source.selected_group_id || null,
      selected_role_id: source.selected_role_id || null,
      selected_site_id: source.selected_site_id || null,
      worker_url: String(browser.WORKER && browser.WORKER.url || "https://chatgpt.com/projects").slice(0, 3000),
      analyzer_url: String(browser.ANALYZER && browser.ANALYZER.url || "https://www.google.com").slice(0, 3000),
      active_browser_kind: activeKind === "ANALYZER" ? "ANALYZER" : "WORKER"
    };
    if (persist) this.save();
  }

  recordAuthProbe(kind, probe) {
    if (!this.value) return this.writeReceipt("PARTIAL");
    const key = kind === "ANALYZER" ? "GOOGLE_LOGIN" : "GPT_CHATGPT_LOGIN";
    this.value.auth[key] = {
      authenticated: Boolean(probe && probe.authenticated),
      observed: Boolean(probe && probe.observed),
      surface: safeSurface(probe),
      observed_at: nowIso()
    };
    this.save();
    const allPass = this.previousRuntimeSeen && this.restored.panel && this.restored.log_window &&
      this.value.auth.GPT_CHATGPT_LOGIN.authenticated && this.value.auth.GOOGLE_LOGIN.authenticated;
    return this.writeReceipt(allPass ? "PASS" : "PARTIAL", {
      terminal: allPass
        ? "YOLLA_V6_GOOGLE_GPT_LOGIN_WORKSPACE_PANEL_LOG_SESSION_RESTORE_PASS"
        : "YOLLA_V6_SESSION_RESTORE_PARTIAL_AUTH"
    });
  }

  writeReceipt(status, details = {}) {
    const value = this.snapshot();
    const receipt = {
      schema_version: RECEIPT_SCHEMA,
      status,
      run_id: value.run_id,
      launch_count: value.launch_count,
      previous_runtime_seen: this.previousRuntimeSeen,
      workspace_session_restored: Boolean(this.previousRuntimeSeen),
      panel_window_restored: Boolean(this.restored.panel),
      log_window_restored: Boolean(this.restored.log_window),
      selected_mode_restored: value.workspace.selected_mode,
      active_browser_kind_restored: value.workspace.active_browser_kind,
      profile_root: this.profileRoot,
      gpt_partition: this.partitions.worker,
      google_partition: this.partitions.analyzer,
      gpt_partition_reused: Boolean(this.previousRuntimeSeen),
      google_partition_reused: Boolean(this.previousRuntimeSeen),
      gpt_login_restored: Boolean(value.auth.GPT_CHATGPT_LOGIN.authenticated),
      google_login_restored: Boolean(value.auth.GOOGLE_LOGIN.authenticated),
      auth_probe_observed: {
        gpt: Boolean(value.auth.GPT_CHATGPT_LOGIN.observed),
        google: Boolean(value.auth.GOOGLE_LOGIN.observed)
      },
      secret_export_count: 0,
      credential_value_logged_count: 0,
      legacy_write_count: 0,
      observed_at: nowIso(),
      ...details
    };
    writeJsonAtomic(this.receiptPath, receipt);
    try { this.appendLog("SESSION_RESTORE_RECEIPT", { status: receipt.status, terminal: receipt.terminal, launch_count: receipt.launch_count, gpt_login_restored: receipt.gpt_login_restored, google_login_restored: receipt.google_login_restored, secret_export_count: 0 }); } catch (_error) {}
    return receipt;
  }

  markQuitting() {
    this.quitting = true;
    if (!this.value) return;
    this.value.last_shutdown_clean = true;
    this.save();
    this.writeReceipt("STOPPED", { terminal: "YOLLA_V6_SESSION_STATE_SAVED" });
  }
}

module.exports = { SessionRestoreManager, STATE_SCHEMA, RECEIPT_SCHEMA, defaultState };
