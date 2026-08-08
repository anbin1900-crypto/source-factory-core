/* eslint-env node */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SCHEMA = "YOLLA_V6_COMMAND_SCHEDULER_V2";
const TRIGGERS = new Set(["INTERVAL", "AFTER_COMPLETION"]);

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function cleanText(value, maxLength = 50000) { return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, maxLength); }
function ensureDir(directory) { fs.mkdirSync(directory, { recursive: true }); }
function readJson(filePath, fallback) { try { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); } catch (_error) { return fallback; } }
function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, filePath);
}
function hash(value) { return crypto.createHash("sha256").update(String(value), "utf8").digest("hex"); }

class CommandScheduler {
  constructor(deps) {
    if (!deps || !deps.stateRoot) throw new TypeError("stateRoot required");
    if (typeof deps.dispatchToRole !== "function") throw new TypeError("dispatchToRole required");
    this.deps = deps;
    this.filePath = path.join(deps.stateRoot, "commands", "SCHEDULED_COMMANDS.json");
    this.receiptRoot = path.join(deps.stateRoot, "commands", "receipts");
    this.intervalMs = Math.max(5000, Math.min(Number(deps.pollIntervalMs || 15000), 300000));
    this.timer = null;
    this.tickRunning = false;
    this.ensureState();
    this.restore();
  }

  now() { return this.deps.now ? this.deps.now() : new Date(); }
  log(event, details = {}) {
    if (typeof this.deps.appendLog === "function") this.deps.appendLog(`COMMAND_${event}`, details);
    if (typeof this.deps.emit === "function") this.deps.emit({ type: event, details: clone(details), summary: this.summary(), occurred_at: this.now().toISOString() });
  }

  defaultState() { return { schema_version: SCHEMA, commands: {}, updated_at: this.now().toISOString() }; }
  ensureState() { if (!readJson(this.filePath, null)) writeJsonAtomic(this.filePath, this.defaultState()); }
  state() {
    const state = readJson(this.filePath, this.defaultState());
    state.commands = state.commands && typeof state.commands === "object" ? state.commands : {};
    let migrated = false;
    for (const command of Object.values(state.commands)) {
      if (String(command.trigger || "").toUpperCase() === "ON_USE_END") {
        command.trigger = "AFTER_COMPLETION";
        migrated = true;
      }
      command.target_state = command.target_state && typeof command.target_state === "object" ? command.target_state : {};
    }
    if (migrated) this.save(state);
    return state;
  }
  save(value) { value.schema_version = SCHEMA; value.updated_at = this.now().toISOString(); writeJsonAtomic(this.filePath, value); return value; }

  completionSnapshot() {
    try {
      const value = typeof this.deps.getCompletionSnapshot === "function" ? this.deps.getCompletionSnapshot() : null;
      return value && typeof value === "object" ? value : {};
    } catch (_error) { return {}; }
  }
  completionToken(roleId, snapshot = this.completionSnapshot()) {
    const id = cleanText(roleId, 100).toUpperCase();
    const latest = snapshot && snapshot.latest_result_post_by_role || {};
    const counts = snapshot && snapshot.worker_report_counts || {};
    if (latest[id] != null && latest[id] !== "") return `post:${latest[id]}`;
    const count = Number(counts[id] || 0);
    return count > 0 ? `count:${count}` : null;
  }

  configure(payload) {
    const message = cleanText(payload && payload.message, 50000);
    if (!message) throw new Error("COMMAND_MESSAGE_REQUIRED");
    const trigger = cleanText(payload && payload.trigger || "INTERVAL", 30).toUpperCase();
    if (!TRIGGERS.has(trigger)) throw new Error(`COMMAND_TRIGGER_INVALID:${trigger}`);
    const targets = Array.from(new Set((Array.isArray(payload && payload.targets) ? payload.targets : [])
      .map(value => cleanText(value, 100).toUpperCase()).filter(Boolean)));
    if (!targets.length) throw new Error("COMMAND_TARGETS_REQUIRED");
    const intervalMinutes = Math.max(1, Math.min(Number(payload && payload.interval_minutes || 20), 10080));
    const state = this.state();
    const commandId = cleanText(payload && payload.command_id, 160) || `CMD-${Date.now()}-${hash(message).slice(0, 8)}`;
    const existing = state.commands[commandId] || null;
    const nowIso = this.now().toISOString();
    const targetState = existing && existing.target_state || {};
    const completion = this.completionSnapshot();
    if (trigger === "AFTER_COMPLETION") {
      for (const roleId of targets) {
        targetState[roleId] = targetState[roleId] || {};
        if (!Object.prototype.hasOwnProperty.call(targetState[roleId], "last_completion_token")) {
          targetState[roleId].last_completion_token = this.completionToken(roleId, completion);
        }
      }
    }
    state.commands[commandId] = {
      command_id: commandId,
      message,
      trigger,
      interval_minutes: intervalMinutes,
      targets,
      enabled: payload && payload.enabled !== false,
      target_state: targetState,
      created_at: existing && existing.created_at || nowIso,
      updated_at: nowIso
    };
    this.save(state);
    this.refreshTimer();
    this.log("CONFIGURED", { command_id: commandId, trigger, interval_minutes: intervalMinutes, targets });
    return this.summary();
  }

  setEnabled(commandId, enabled) {
    const state = this.state();
    const command = state.commands[commandId];
    if (!command) throw new Error(`COMMAND_NOT_FOUND:${commandId}`);
    command.enabled = Boolean(enabled);
    command.updated_at = this.now().toISOString();
    if (command.enabled && command.trigger === "AFTER_COMPLETION") {
      const completion = this.completionSnapshot();
      for (const roleId of command.targets || []) {
        const target = this.targetState(command, roleId);
        target.last_completion_token = this.completionToken(roleId, completion);
      }
    }
    this.save(state);
    this.refreshTimer();
    this.log(command.enabled ? "ENABLED" : "DISABLED", { command_id: commandId });
    return this.summary();
  }

  remove(commandId) {
    const state = this.state();
    if (state.commands[commandId]) delete state.commands[commandId];
    this.save(state);
    this.refreshTimer();
    this.log("DELETED", { command_id: commandId });
    return this.summary();
  }

  restore() { this.refreshTimer(); }
  refreshTimer() {
    const state = this.state();
    const needsTimer = Object.values(state.commands).some(command => command.enabled === true && TRIGGERS.has(String(command.trigger || "").toUpperCase()));
    if (needsTimer && !this.timer) {
      this.timer = setInterval(() => this.tick().catch(error => this.log("TICK_ERROR", { error: String(error && error.stack || error) })), this.intervalMs);
      if (this.timer.unref) this.timer.unref();
      setTimeout(() => this.tick().catch(error => this.log("TICK_ERROR", { error: String(error && error.stack || error) })), 1200);
    }
    if (!needsTimer && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  targetState(command, roleId) {
    command.target_state = command.target_state || {};
    return command.target_state[roleId] || (command.target_state[roleId] = {
      last_sent_at: null,
      send_count: 0,
      last_error: null,
      last_receipt: null,
      last_completion_token: null,
      last_completion_sent_at: null
    });
  }

  dueInterval(command, roleId, nowMs) {
    if (command.trigger !== "INTERVAL") return false;
    const target = this.targetState(command, roleId);
    const last = Date.parse(target.last_sent_at || "");
    return !Number.isFinite(last) || nowMs - last >= Number(command.interval_minutes) * 60 * 1000;
  }

  async dispatch(command, roleId, reason) {
    const target = this.targetState(command, roleId);
    const dispatchId = `v6-${hash(`${command.command_id}|${roleId}|${reason}|${Date.now()}`).slice(0, 24)}`;
    try {
      const receipt = await this.deps.dispatchToRole({
        role_id: roleId,
        kind: "USER_SCHEDULED_COMMAND",
        prompt: command.message,
        dispatch_id: dispatchId,
        correlation_key: dispatchId,
        metadata: { command_id: command.command_id, trigger: command.trigger, reason }
      });
      if (!receipt || receipt.accepted !== true) throw new Error(`COMMAND_DISPATCH_NOT_ACCEPTED:${roleId}`);
      const normalized = {
        schema_version: "YOLLA_V6_COMMAND_DISPATCH_RECEIPT_V2",
        command_id: command.command_id,
        role_id: roleId,
        trigger: command.trigger,
        reason,
        dispatch_id: dispatchId,
        accepted: true,
        context_url: receipt.context_url || null,
        prompt_sent: receipt.prompt_sent === true,
        dispatch_proof: receipt.dispatch_proof === true,
        sent_at: this.now().toISOString()
      };
      ensureDir(this.receiptRoot);
      const receiptPath = path.join(this.receiptRoot, `${dispatchId}.json`);
      writeJsonAtomic(receiptPath, normalized);
      target.last_sent_at = normalized.sent_at;
      target.send_count = Number(target.send_count || 0) + 1;
      target.last_error = null;
      target.last_receipt = receiptPath;
      if (reason === "AFTER_COMPLETION") target.last_completion_sent_at = normalized.sent_at;
      this.log("DISPATCHED", normalized);
      return normalized;
    } catch (error) {
      target.last_error = String(error && error.message || error);
      target.last_attempt_at = this.now().toISOString();
      this.log("DISPATCH_FAILED", { command_id: command.command_id, role_id: roleId, reason, error: target.last_error });
      throw error;
    }
  }

  async tick() {
    if (this.tickRunning) return this.summary();
    this.tickRunning = true;
    try {
      const state = this.state();
      const nowMs = this.now().getTime();
      const completion = this.completionSnapshot();
      for (const command of Object.values(state.commands)) {
        if (command.enabled !== true) continue;
        for (const roleId of command.targets || []) {
          if (command.trigger === "INTERVAL") {
            if (!this.dueInterval(command, roleId, nowMs)) continue;
            try { await this.dispatch(command, roleId, "INTERVAL"); } catch (_error) {}
            continue;
          }
          if (command.trigger === "AFTER_COMPLETION") {
            const target = this.targetState(command, roleId);
            const currentToken = this.completionToken(roleId, completion);
            if (!currentToken) continue;
            if (!target.last_completion_token) {
              target.last_completion_token = currentToken;
              continue;
            }
            if (target.last_completion_token === currentToken) continue;
            try {
              await this.dispatch(command, roleId, "AFTER_COMPLETION");
              target.last_completion_token = currentToken;
            } catch (_error) {}
          }
        }
      }
      this.save(state);
      return this.summary();
    } finally {
      this.tickRunning = false;
    }
  }

  summary() {
    const state = this.state();
    const commands = {};
    for (const [id, command] of Object.entries(state.commands)) {
      commands[id] = {
        command_id: id,
        message: command.message,
        trigger: command.trigger,
        trigger_label: command.trigger === "AFTER_COMPLETION" ? "작업완료후" : "일정한 시간마다",
        interval_minutes: command.interval_minutes,
        targets: clone(command.targets || []),
        enabled: command.enabled === true,
        target_state: clone(command.target_state || {}),
        created_at: command.created_at,
        updated_at: command.updated_at
      };
    }
    return { schema_version: SCHEMA, commands, timer_active: Boolean(this.timer), state_path: this.filePath, updated_at: state.updated_at };
  }
}

module.exports = { SCHEMA, TRIGGERS, CommandScheduler };
