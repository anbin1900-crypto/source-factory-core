/* eslint-env node */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); }
function safeError(error) { return String(error && error.message || error).slice(0, 800); }
function validatedJson(value, label) {
  const text = JSON.stringify(value == null ? null : value);
  if (Buffer.byteLength(text, "utf8") > 1024 * 1024) throw new Error(`${label}_TOO_LARGE`);
  return JSON.parse(text);
}

function resolveModuleRoot(releaseRoot, requestedRoot) {
  if (requestedRoot) return path.resolve(requestedRoot);
  const candidates = [
    path.join(releaseRoot, "..", "modules"),
    path.join(releaseRoot, "..", "..", "modules"),
    path.join(releaseRoot, "modules")
  ].map(candidate => path.resolve(candidate));
  return candidates.find(candidate => fs.existsSync(path.join(candidate, "V6_MODULE_REGISTRY_V1.json"))) || candidates[0];
}

class V6ModuleHost {
  constructor(options = {}) {
    this.releaseRoot = path.resolve(options.releaseRoot);
    this.moduleRoot = resolveModuleRoot(this.releaseRoot, options.moduleRoot);
    this.registryPath = path.resolve(options.registryPath || path.join(this.moduleRoot, "V6_MODULE_REGISTRY_V1.json"));
    this.adapters = options.adapters || {};
    this.appendLog = typeof options.appendLog === "function" ? options.appendLog : () => {};
    this.registry = null;
    this.modules = new Map();
  }

  load() {
    this.registry = readJson(this.registryPath);
    this.modules.clear();
    for (const definition of this.registry.modules || []) {
      const moduleId = String(definition.module_id || "");
      const entry = { definition: clone(definition), status: "UNBOUND", provider: null, manifest: null, error: null };
      try {
        if (!moduleId) throw new Error("MODULE_ID_REQUIRED");
        if (moduleId === "session-restore") {
          entry.status = "HOST_BOUND";
          entry.manifest = { module_id: moduleId, owner: definition.owner, host_managed: true, mount_slots: [] };
        } else {
          const providerPath = path.join(this.moduleRoot, moduleId, definition.provider_entrypoint || "provider.cjs");
          const provider = require(providerPath);
          for (const name of ["getManifest", "getViewModel", "handleAction", "getStatus"]) {
            if (typeof provider[name] !== "function") throw new Error(`PROVIDER_EXPORT_MISSING:${name}`);
          }
          const manifest = validatedJson(provider.getManifest(), "MODULE_MANIFEST");
          if (manifest.module_id !== moduleId) throw new Error(`MODULE_ID_MISMATCH:${manifest.module_id}`);
          const declared = new Set(definition.mount_slots || []);
          for (const slot of manifest.mount_slots || []) if (!declared.has(slot)) throw new Error(`UNDECLARED_MOUNT_SLOT:${slot}`);
          entry.provider = provider;
          entry.manifest = manifest;
          entry.status = "BOUND";
        }
      } catch (error) {
        entry.status = "ERROR";
        entry.error = safeError(error);
        this.appendLog("V6_MODULE_BIND_FAILED", { module_id: moduleId, error: entry.error });
      }
      this.modules.set(moduleId, entry);
    }
    return this.status();
  }

  contextFor(moduleId, context) {
    const source = context && typeof context === "object" ? context : {};
    if (moduleId === "site-analyzer") {
      return validatedJson({
        browser: source.browser && source.browser.ANALYZER || {},
        sites: source.workspace && source.workspace.sites || {},
        selected_site_id: source.workspace && source.workspace.selected_site_id || null,
        upstream_receipts: source.upstream_receipts || {}
      }, "SITE_ANALYZER_CONTEXT");
    }
    if (moduleId === "commander-worker-menu") {
      return validatedJson({
        groups: source.workspace && source.workspace.groups || {},
        roles: source.workspace && source.workspace.roles || {},
        selected_group_id: source.workspace && source.workspace.selected_group_id || null,
        selected_role_id: source.workspace && source.workspace.selected_role_id || null,
        c_mode: source.c_mode || {},
        commands: source.commands || {}
      }, "COMMANDER_WORKER_CONTEXT");
    }
    return {};
  }

  snapshot(context) {
    const output = {};
    for (const [moduleId, entry] of this.modules) {
      const item = { module_id: moduleId, owner: entry.definition.owner, binding_status: entry.status, manifest: clone(entry.manifest), error: entry.error, view_model: null, provider_status: null };
      if (entry.provider && entry.status === "BOUND") {
        try {
          const moduleContext = this.contextFor(moduleId, context);
          item.view_model = validatedJson(entry.provider.getViewModel(moduleContext), "MODULE_VIEW_MODEL");
          item.provider_status = validatedJson(entry.provider.getStatus(moduleContext), "MODULE_STATUS");
        } catch (error) {
          item.binding_status = "DEGRADED";
          item.error = safeError(error);
          this.appendLog("V6_MODULE_VIEW_FAILED", { module_id: moduleId, error: item.error });
        }
      }
      output[moduleId] = item;
    }
    return output;
  }

  status() {
    return Object.fromEntries(Array.from(this.modules.entries()).map(([id, entry]) => [id, { status: entry.status, error: entry.error, owner: entry.definition.owner }]));
  }

  async handleAction(moduleIdValue, actionValue, payload, context) {
    const moduleId = String(moduleIdValue || "");
    const action = String(actionValue || "").toUpperCase();
    const entry = this.modules.get(moduleId);
    if (!entry || !entry.provider || entry.status !== "BOUND") throw new Error(`MODULE_NOT_BOUND:${moduleId}`);
    const adapter = this.adapters[moduleId];
    if (!adapter || typeof adapter.perform !== "function") throw new Error(`MODULE_ADAPTER_MISSING:${moduleId}`);
    const request = validatedJson({ action, payload: payload || {}, context: this.contextFor(moduleId, context) }, "MODULE_ACTION");
    const result = await entry.provider.handleAction(request, Object.freeze({ perform: (name, value) => adapter.perform(name, value) }));
    this.appendLog("V6_MODULE_ACTION", { module_id: moduleId, action, ok: true });
    return validatedJson(result, "MODULE_ACTION_RESULT");
  }
}

module.exports = { V6ModuleHost };
