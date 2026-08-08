/* eslint-env node */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { fetchIssueComments } = require("./github_comment_client.cjs");

const STATE_SCHEMA = "YOLLA_C_MODE_RUNTIME_STATE_V1";
const REPEAT_SCHEMA = "YOLLA_REPEAT_COMMAND_RUNTIME_V1";
const DEFAULT_POLL_INTERVAL_MS = 15000;
const PARTIAL_REVIEW_MS = 20 * 60 * 1000;
const LONG_RUNNING_MS = 90 * 60 * 1000;
const MISSING_DEMAND_INTERVAL_MS = 20 * 60 * 1000;
const MAX_EXPLICIT_MISSING_DEMAND_FAILURES = 4;
const START_TEMPLATE = "C 모드 규칙에 따라 작업을 시작하고 GitHub에 START를 게시하라.";
const COMMANDER_FULL_TEMPLATE = "모든 워커의 보고를 검토해 다음 WAVE의 워커별 작업과 현재 공정률을 하나의 GitHub 게시물에 일괄 게시하라. 전체 작업이 끝났으면 END를 게시하라.";
const COMMANDER_PARTIAL_TEMPLATE = "완료된 워커의 보고를 검토해 미보고 워커를 제외한 다음 WAVE의 작업과 현재 공정률을 하나의 GitHub 게시물에 일괄 게시하라.";
const WORKER_TEMPLATE = "이전 배정의 결과 또는 미수행 사유가 게시되지 않았다면 먼저 게시하라. 이어 현재 WAVE에 배정된 미완료 작업을 수행해 반드시 게시하고, 남은 작업이 없으면 END를 게시하라.";
const REPORT_ONLY_TEMPLATE = "기존 작업을 계속하고 결과 또는 미수행 사유를 GitHub에 게시하라.";
const REPLACEMENT_TEMPLATE = "이전 워커의 미완료 작업을 인계받아 수행하고 결과 또는 미수행 사유를 GitHub에 게시하라.";
const RESCUE_TEMPLATE = "장기 미완료 작업을 독립적으로 수행하고 결과 또는 미수행 사유를 GitHub에 게시하라.";
const PROGRESS_CORRECTION_TEMPLATE = "완료 작업이 증가했지만 공정률이 상승하지 않았다. 계산 또는 작업계획 오류를 교정하고 공정률을 다시 게시하라.";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cleanText(value, maxLength = 50000) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); }
  catch (_error) { return fallback; }
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(temporary, filePath);
}

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function maxCommentId(comments) {
  return (Array.isArray(comments) ? comments : []).reduce((max, comment) => Math.max(max, Number(comment && comment.id || 0)), 0);
}

function parsePipeLine(line) {
  const parts = String(line || "").split("|").map(part => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const marker = parts.shift().toUpperCase();
  const fields = {};
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const key = part.slice(0, index).trim().toUpperCase();
    const value = part.slice(index + 1).trim();
    fields[key] = value;
  }
  return { marker, fields };
}

function parseTaskLines(body) {
  const rows = [];
  for (const line of String(body || "").split(/\r?\n/)) {
    const parsed = parsePipeLine(line);
    if (!parsed || parsed.marker !== "TASK") continue;
    const role = cleanText(parsed.fields.WORKER || parsed.fields.ROLE, 100).toUpperCase();
    const taskId = cleanText(parsed.fields.TASK_ID, 240);
    if (!role || !taskId) continue;
    const expected = String(parsed.fields.EXPECTED_MINUTES || "UNKNOWN").toUpperCase();
    rows.push({
      worker: role,
      task_id: taskId,
      type: cleanText(parsed.fields.TYPE || "OTHER", 40).toUpperCase(),
      expected_minutes: /^\d+$/.test(expected) ? Number(expected) : null
    });
  }
  return rows;
}

function inferRoleFromBody(body) {
  const text = String(body || "");
  const direct = text.match(/(?:ROLE|WORKER_ID|COMMANDER_ID)\s*=\s*([A-Za-z0-9._:-]+)/i);
  if (direct) return direct[1].toUpperCase();
  return null;
}

function parsePanelLines(body) {
  const rows = [];
  for (const line of String(body || "").split(/\r?\n/)) {
    const parsed = parsePipeLine(line);
    if (!parsed || parsed.marker !== "PANEL") continue;
    const fields = { ...parsed.fields };
    if (!fields.ROLE) fields.ROLE = inferRoleFromBody(body);
    if (fields.ROLE) fields.ROLE = String(fields.ROLE).toUpperCase();
    rows.push(fields);
  }
  return rows;
}

function parseStartReceipt(comment) {
  for (const panel of parsePanelLines(comment && comment.body)) {
    if (String(panel.STATUS || "").toUpperCase() === "START" && panel.ROLE) {
      return { role: panel.ROLE, post_id: Number(comment.id), published_at: comment.created_at || null };
    }
  }
  return null;
}

function parseWorkerReport(comment, wavePostId) {
  for (const panel of parsePanelLines(comment && comment.body)) {
    const wave = Number(panel.WAVE || 0);
    const status = String(panel.STATUS || "").toUpperCase();
    if (wave === Number(wavePostId) && panel.ROLE && ["REPORTED", "END"].includes(status)) {
      return {
        role: panel.ROLE,
        status,
        wave_post_id: wave,
        result_post_id: Number(comment.id),
        published_at: comment.created_at || null
      };
    }
  }
  return null;
}

function parseCommanderPanel(comment) {
  for (const panel of parsePanelLines(comment && comment.body)) {
    if (panel.NORMAL == null && panel.PROGRESS == null && panel.END == null) continue;
    const progress = Number(panel.PROGRESS);
    const completed = Number(panel.COMPLETED);
    return {
      role: panel.ROLE || null,
      normal_count: Number(panel.NORMAL || 0),
      missing_count: Number(panel.MISSING || 0),
      completed_count: Number.isFinite(completed) ? completed : null,
      progress_percent: Number.isFinite(progress) ? progress : null,
      end: ["1", "TRUE", "YES"].includes(String(panel.END || "0").toUpperCase()),
      post_id: Number(comment.id),
      published_at: comment.created_at || null
    };
  }
  return null;
}

function normalizeComment(comment) {
  return {
    id: Number(comment && comment.id || 0),
    body: String(comment && comment.body || ""),
    created_at: comment && comment.created_at || null,
    html_url: comment && comment.html_url || null
  };
}

function roleTypeIsCommander(role) {
  return /COMMANDER/i.test(String(role && role.role_type || ""));
}

function nowMs(now) {
  return now().getTime();
}

class CModeStore {
  constructor(stateRoot) {
    this.root = path.join(stateRoot, "automation-c-v1");
    this.statePath = path.join(this.root, "C_MODE_STATE.json");
    this.repeatPath = path.join(this.root, "REPEAT_COMMANDS.json");
    this.eventPath = path.join(this.root, "work_control_events.jsonl");
    this.dispatchRoot = path.join(this.root, "dispatch-receipts");
    ensureDir(this.dispatchRoot);
  }

  loadState() {
    return readJson(this.statePath, null);
  }

  saveState(state) {
    writeJsonAtomic(this.statePath, state);
    return state;
  }

  loadRepeat() {
    return readJson(this.repeatPath, { schema_version: REPEAT_SCHEMA, commands: {}, updated_at: null });
  }

  saveRepeat(value) {
    value.updated_at = new Date().toISOString();
    writeJsonAtomic(this.repeatPath, value);
    return value;
  }

  appendEvent(row) {
    ensureDir(this.root);
    fs.appendFileSync(this.eventPath, JSON.stringify(row) + "\n", "utf8");
  }

  saveDispatchReceipt(receipt) {
    const safe = String(receipt.dispatch_id || Date.now()).replace(/[^A-Za-z0-9._-]/g, "_");
    const filePath = path.join(this.dispatchRoot, `${safe}.json`);
    writeJsonAtomic(filePath, receipt);
    return filePath;
  }
}

class CModeRuntime {
  constructor(deps) {
    if (!deps || typeof deps.getRegistry !== "function") throw new TypeError("getRegistry required");
    if (typeof deps.getWorkspaceState !== "function") throw new TypeError("getWorkspaceState required");
    if (typeof deps.dispatchToRole !== "function") throw new TypeError("dispatchToRole required");
    this.deps = deps;
    this.store = new CModeStore(deps.stateRoot);
    this.fetchComments = deps.fetchComments || fetchIssueComments;
    this.now = deps.now || (() => new Date());
    this.pollIntervalMs = Math.max(5000, Math.min(Number(deps.pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS, 300000));
    this.timer = null;
    this.tickInFlight = false;
  }

  log(event, details = {}) {
    const row = { at: this.now().toISOString(), event, details: clone(details) };
    try { this.store.appendEvent(row); } catch (_error) {}
    if (typeof this.deps.appendLog === "function") {
      try { this.deps.appendLog(`C_MODE_${event}`, details); } catch (_error) {}
    }
    if (typeof this.deps.emit === "function") {
      try { this.deps.emit({ type: event, summary: this.summary(), details, occurred_at: row.at }); } catch (_error) {}
    }
  }

  releaseRole(roleId, reason) {
    if (typeof this.deps.releaseRole !== "function") return;
    try {
      this.deps.releaseRole(cleanText(roleId, 100).toUpperCase(), cleanText(reason || "C_MODE_REPORT_OBSERVED", 200));
    } catch (error) {
      this.log("ROLE_BROWSER_RELEASE_FAILED", { role_id: roleId, reason, error: String(error && error.message || error) });
    }
  }

  incrementWorkerCount(state, roleId, resultPostId) {
    const role = cleanText(roleId, 100).toUpperCase();
    if (!role) return;
    state.worker_report_counts = state.worker_report_counts || {};
    state.latest_result_post_by_role = state.latest_result_post_by_role || {};
    state.worker_report_counts[role] = Number(state.worker_report_counts[role] || 0) + 1;
    if (resultPostId) state.latest_result_post_by_role[role] = Number(resultPostId);
  }

  initialize() {
    let state = this.store.loadState();
    if (!state) {
      state = this.defaultState();
      this.store.saveState(state);
    }
    const repeat = this.store.loadRepeat();
    this.store.saveRepeat(repeat);
    return this.summary();
  }

  defaultState() {
    return {
      schema_version: STATE_SCHEMA,
      enabled: false,
      status: "IDLE",
      repository: null,
      control_pr: null,
      group_id: null,
      commander_id: null,
      worker_ids: [],
      initial_worker_ids: [],
      start: null,
      current_wave: null,
      carryovers: {},
      ended_roles: {},
      replacement_required: {},
      rescue_assignments: {},
      used_rescue_roles: {},
      last_commander_comment_id: 0,
      last_seen_comment_id: 0,
      wave_count: 0,
      completed_rounds: 0,
      dispatch_count: 0,
      duplicate_dispatch_count: 0,
      latest_progress_percent: 0,
      latest_completed_task_count: 0,
      worker_report_counts: {},
      latest_result_post_by_role: {},
      progress_error: null,
      manual_required: [],
      created_at: this.now().toISOString(),
      updated_at: this.now().toISOString()
    };
  }

  state() {
    return this.store.loadState() || this.defaultState();
  }

  save(state) {
    state.updated_at = this.now().toISOString();
    this.store.saveState(state);
    return state;
  }

  registryAndWorkspace() {
    const registry = this.deps.getRegistry();
    const workspace = this.deps.getWorkspaceState();
    if (!registry || !Array.isArray(registry.roles) || !Array.isArray(registry.groups)) {
      throw new Error("C_MODE_REGISTRY_INVALID");
    }
    return { registry, workspace: workspace || {} };
  }

  resolveGroup(groupId) {
    const { registry, workspace } = this.registryAndWorkspace();
    const id = cleanText(groupId || workspace.selected_group_id, 100).toUpperCase();
    const group = registry.groups.find(item => String(item.group_id).toUpperCase() === id);
    if (!group) throw new Error(`C_MODE_GROUP_NOT_FOUND:${id}`);
    const roles = registry.roles
      .filter(role => String(role.group_id).toUpperCase() === id && role.enabled !== false)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const preference = workspace.group_preferences && workspace.group_preferences[id] || {};
    let commanderId = cleanText(preference.commander_id, 100).toUpperCase();
    if (!commanderId) {
      const commander = roles.find(roleTypeIsCommander);
      commanderId = commander && cleanText(commander.role_id, 100).toUpperCase();
    }
    if (!commanderId || !roles.some(role => String(role.role_id).toUpperCase() === commanderId)) {
      throw new Error(`C_MODE_COMMANDER_REQUIRED:${id}`);
    }
    const workers = roles
      .map(role => cleanText(role.role_id, 100).toUpperCase())
      .filter(roleId => roleId && roleId !== commanderId);
    if (!workers.length) throw new Error(`C_MODE_WORKERS_REQUIRED:${id}`);
    return { group_id: id, commander_id: commanderId, worker_ids: workers, roles, workspace };
  }

  contextUrl(roleId) {
    const workspace = this.deps.getWorkspaceState() || {};
    const profile = workspace.seat_profiles && workspace.seat_profiles[roleId];
    return profile && cleanText(profile.context_url || profile.last_browser_url || profile.project_url, 3000) || null;
  }

  ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(error => this.handleTickError(error)), this.pollIntervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stopTimerIfIdle() {
    const state = this.state();
    const repeat = this.store.loadRepeat();
    const repeatActive = Object.values(repeat.commands || {}).some(command => command.enabled === true);
    if ((!state.enabled || ["IDLE", "STOPPED", "COMPLETED"].includes(state.status)) && !repeatActive && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  restoreAfterRestart() {
    const state = this.state();
    const repeat = this.store.loadRepeat();
    const repeatActive = Object.values(repeat.commands || {}).some(command => command.enabled === true);
    if (state.enabled || repeatActive) {
      this.ensureTimer();
      setTimeout(() => this.tick().catch(error => this.handleTickError(error)), 1500);
    }
    return this.summary();
  }

  async start(payload) {
    const repository = cleanText(payload && payload.repository, 300);
    const controlPr = Number(payload && payload.control_pr);
    if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new Error("C_MODE_REPOSITORY_INVALID");
    if (!Number.isInteger(controlPr) || controlPr < 1) throw new Error("C_MODE_CONTROL_PR_INVALID");
    const group = this.resolveGroup(payload && payload.group_id);
    const comments = (await this.fetchComments(repository, controlPr)).map(normalizeComment);
    const baseline = maxCommentId(comments);
    const state = this.defaultState();
    state.enabled = true;
    state.status = "START_DISPATCH";
    state.repository = repository;
    state.control_pr = controlPr;
    state.group_id = group.group_id;
    state.commander_id = group.commander_id;
    state.worker_ids = group.worker_ids;
    state.initial_worker_ids = group.worker_ids.slice();
    state.last_seen_comment_id = baseline;
    state.last_commander_comment_id = baseline;
    state.start = {
      baseline_comment_id: baseline,
      dispatched_at: this.now().toISOString(),
      acknowledged_roles: [],
      missing_roles: [group.commander_id, ...group.worker_ids]
    };
    this.save(state);
    const roles = [group.commander_id, ...group.worker_ids];
    const requests = roles.map(roleId => ({
      role_id: roleId,
      kind: "C_START",
      prompt: `${START_TEMPLATE}\n마지막 줄: PANEL | ROLE=${roleId} | STATUS=START`,
      metadata: { repository, control_pr: controlPr, group_id: group.group_id }
    }));
    await this.dispatchBatch(state, requests, "C_START_BATCH");
    state.status = "START_WAIT";
    this.save(state);
    this.ensureTimer();
    this.log("START_BATCH_DISPATCHED", { group_id: state.group_id, role_count: roles.length, baseline_comment_id: baseline });
    return this.summary();
  }

  pause(reason = "USER_PAUSE") {
    const state = this.state();
    state.enabled = false;
    state.status = "PAUSED";
    state.paused_reason = reason;
    this.save(state);
    this.stopTimerIfIdle();
    this.log("PAUSED", { reason });
    return this.summary();
  }

  resume() {
    const state = this.state();
    if (!["PAUSED", "MANUAL_REQUIRED", "ERROR"].includes(state.status)) return this.summary();
    state.enabled = true;
    state.status = state.progress_error ? "PROGRESS_CORRECTION_WAIT" : state.current_wave ? "WORKER_REPORT_WAIT" : "COMMANDER_WAVE_WAIT";
    state.paused_reason = null;
    this.save(state);
    this.ensureTimer();
    setImmediate(() => this.tick().catch(error => this.handleTickError(error)));
    this.log("RESUMED", {});
    return this.summary();
  }

  stop(reason = "USER_STOP") {
    const state = this.state();
    const releaseRoles = new Set([state.commander_id, ...(state.worker_ids || [])]);
    for (const carryover of Object.values(state.carryovers || {})) {
      for (const roleId of [carryover.role_id, ...(carryover.rescue_roles || [])]) releaseRoles.add(roleId);
    }
    for (const roleId of releaseRoles) if (roleId) this.releaseRole(roleId, "C_MODE_STOPPED");
    state.enabled = false;
    state.status = "STOPPED";
    state.stopped_reason = reason;
    this.save(state);
    this.stopTimerIfIdle();
    this.log("STOPPED", { reason });
    return this.summary();
  }

  async dispatchOnce(state, request) {
    const sequence = Number(state.dispatch_count || 0) + 1;
    state.dispatch_count = sequence;
    const dispatchId = `c-${sha256([state.group_id, request.role_id, request.kind, request.prompt, sequence, this.now().toISOString()]).slice(0, 24)}`;
    const receipt = await Promise.resolve(this.deps.dispatchToRole({
      ...request,
      dispatch_id: dispatchId,
      correlation_key: dispatchId
    }));
    if (!receipt || receipt.accepted !== true) throw new Error(`${request.kind}_DISPATCH_NOT_ACCEPTED:${request.role_id}`);
    const normalized = {
      schema_version: "YOLLA_C_MODE_DISPATCH_RECEIPT_V1",
      dispatch_id: dispatchId,
      accepted: true,
      role_id: request.role_id,
      kind: request.kind,
      context_url: receipt.context_url || null,
      dispatch_proof: receipt.dispatch_proof === true,
      prompt_sent: receipt.prompt_sent === true,
      metadata: request.metadata || {},
      dispatched_at: this.now().toISOString()
    };
    normalized.receipt_pointer = this.store.saveDispatchReceipt(normalized);
    this.log("PROMPT_DISPATCHED", normalized);
    return normalized;
  }

  async dispatchBatch(state, requests, batchKind) {
    const unique = [];
    const seen = new Set();
    for (const request of requests) {
      const key = `${request.role_id}:${request.kind}:${sha256(request.prompt)}`;
      if (seen.has(key)) {
        state.duplicate_dispatch_count = Number(state.duplicate_dispatch_count || 0) + 1;
        continue;
      }
      seen.add(key);
      unique.push(request);
    }
    const promises = unique.map(request => this.dispatchOnce(state, request));
    const results = await Promise.allSettled(promises);
    const failures = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") failures.push({ role_id: unique[index].role_id, error: String(result.reason && result.reason.message || result.reason) });
    });
    this.save(state);
    this.log("BATCH_DISPATCH_COMPLETED", { batch_kind: batchKind, enqueued: unique.length, failures });
    if (failures.length) {
      state.manual_required = Array.from(new Set([...(state.manual_required || []), ...failures.map(item => item.role_id)]));
      this.save(state);
    }
    return { enqueued: unique.length, failures, results };
  }

  async dispatchCommander(state, partial) {
    const prompt = partial ? COMMANDER_PARTIAL_TEMPLATE : COMMANDER_FULL_TEMPLATE;
    const comments = (await this.fetchComments(state.repository, state.control_pr)).map(normalizeComment);
    state.last_commander_comment_id = Math.max(state.last_commander_comment_id || 0, maxCommentId(comments));
    await this.dispatchBatch(state, [{
      role_id: state.commander_id,
      kind: partial ? "C_COMMANDER_PARTIAL_WAVE" : "C_COMMANDER_FULL_WAVE",
      prompt: `${prompt}\n마지막 줄: PANEL | ROLE=${state.commander_id} | NORMAL={정상수행수} | MISSING={미보고수} | COMPLETED={누적완료작업수} | PROGRESS={공정률} | END={0|1}`,
      metadata: { partial, repository: state.repository, control_pr: state.control_pr }
    }], partial ? "COMMANDER_PARTIAL" : "COMMANDER_FULL");
    state.status = "COMMANDER_WAVE_WAIT";
    state.commander_dispatched_at = this.now().toISOString();
    this.save(state);
  }

  async processStart(state, comments) {
    const required = [state.commander_id, ...state.worker_ids];
    const acknowledgements = {};
    for (const comment of comments.filter(item => item.id > Number(state.start.baseline_comment_id || 0))) {
      const receipt = parseStartReceipt(comment);
      if (receipt && required.includes(receipt.role)) acknowledgements[receipt.role] = receipt;
    }
    const previouslyAcknowledged = new Set(state.start.acknowledged_roles || []);
    state.start.acknowledged_roles = Object.keys(acknowledgements);
    state.start.missing_roles = required.filter(role => !acknowledgements[role]);
    for (const roleId of state.start.acknowledged_roles) {
      if (!previouslyAcknowledged.has(roleId)) this.releaseRole(roleId, "START_RECEIPT_POSTED");
    }
    this.save(state);
    if (!state.start.missing_roles.length) {
      this.log("START_ALL_ACKNOWLEDGED", { roles: required });
      await this.dispatchCommander(state, false);
    }
  }

  findCommanderWave(state, comments) {
    const candidates = comments
      .filter(comment => comment.id > Number(state.last_commander_comment_id || 0))
      .map(comment => ({ comment, tasks: parseTaskLines(comment.body), panel: parseCommanderPanel(comment) }))
      .filter(item => item.panel && (item.tasks.length > 0 || item.panel.end))
      .sort((a, b) => b.comment.id - a.comment.id);
    return candidates[0] || null;
  }

  validateProgress(state, panel) {
    if (panel.completed_count == null || panel.progress_percent == null) return null;
    if (panel.completed_count > Number(state.latest_completed_task_count || 0) && panel.progress_percent <= Number(state.latest_progress_percent || 0)) {
      return {
        code: "PROGRESS_INTEGRITY_ERROR",
        previous_completed: Number(state.latest_completed_task_count || 0),
        current_completed: panel.completed_count,
        previous_progress: Number(state.latest_progress_percent || 0),
        current_progress: panel.progress_percent,
        source_post_id: panel.post_id
      };
    }
    return null;
  }

  async acceptCommanderWave(state, item) {
    this.releaseRole(state.commander_id, "COMMANDER_WAVE_POSTED");
    const progressError = this.validateProgress(state, item.panel);
    if (progressError) {
      state.progress_error = progressError;
      state.status = "PROGRESS_CORRECTION_WAIT";
      state.last_commander_comment_id = item.comment.id;
      this.save(state);
      await this.dispatchBatch(state, [{
        role_id: state.commander_id,
        kind: "C_PROGRESS_CORRECTION",
        prompt: PROGRESS_CORRECTION_TEMPLATE,
        metadata: progressError
      }], "PROGRESS_CORRECTION");
      this.log("PROGRESS_INTEGRITY_ERROR", progressError);
      return;
    }

    state.progress_error = null;
    if (item.panel.completed_count != null) state.latest_completed_task_count = item.panel.completed_count;
    if (item.panel.progress_percent != null) state.latest_progress_percent = item.panel.progress_percent;
    state.last_commander_comment_id = item.comment.id;
    state.last_seen_comment_id = Math.max(state.last_seen_comment_id || 0, item.comment.id);

    if (item.panel.end && Number(item.panel.progress_percent) === 100 && Object.keys(state.carryovers || {}).length === 0) {
      state.enabled = false;
      state.status = "COMPLETED";
      state.completed_at = this.now().toISOString();
      this.save(state);
      this.stopTimerIfIdle();
      this.log("C_MODE_COMPLETED", { progress_percent: 100, post_id: item.comment.id });
      return;
    }

    const tasksByWorker = {};
    for (const task of item.tasks) {
      if (!state.worker_ids.includes(task.worker)) continue;
      if (state.carryovers[task.worker] || state.replacement_required[task.worker]) continue;
      if (state.ended_roles[task.worker]) {
        delete state.ended_roles[task.worker];
        this.log("END_ROLE_REACTIVATED_BY_NEW_TASK", { role_id: task.worker, wave_post_id: item.comment.id });
      }
      if (!tasksByWorker[task.worker]) tasksByWorker[task.worker] = [];
      tasksByWorker[task.worker].push(task);
    }
    const targetRoles = Object.keys(tasksByWorker);
    if (!targetRoles.length) {
      state.status = "COMMANDER_WAVE_WAIT";
      this.save(state);
      this.log("COMMANDER_WAVE_NO_ELIGIBLE_TASKS", { post_id: item.comment.id, carryovers: Object.keys(state.carryovers) });
      return;
    }
    const startedAt = this.now().toISOString();
    state.wave_count = Number(state.wave_count || 0) + 1;
    state.current_wave = {
      wave_index: state.wave_count,
      post_id: item.comment.id,
      post_url: item.comment.html_url || null,
      started_at: startedAt,
      partial_review_issued: false,
      last_wait_log_at: null,
      targets: targetRoles,
      tasks_by_worker: tasksByWorker,
      reports: {}
    };
    state.status = "WORKER_DISPATCH";
    this.save(state);
    const requests = targetRoles.map(roleId => ({
      role_id: roleId,
      kind: "C_WORKER_WAVE",
      prompt: `${WORKER_TEMPLATE}\n현재 WAVE 게시물 번호=${item.comment.id}\n마지막 줄: PANEL | ROLE=${roleId} | WAVE=${item.comment.id} | STATUS={REPORTED|END}`,
      metadata: { wave_post_id: item.comment.id, tasks: tasksByWorker[roleId] }
    }));
    await this.dispatchBatch(state, requests, `WAVE_${item.comment.id}`);
    state.status = "WORKER_REPORT_WAIT";
    this.save(state);
    this.log("WAVE_DISPATCHED", { wave_post_id: item.comment.id, target_roles: targetRoles });
  }

  updateCurrentWaveReports(state, comments) {
    const wave = state.current_wave;
    if (!wave) return;
    for (const comment of comments) {
      const report = parseWorkerReport(comment, wave.post_id);
      if (!report || !wave.targets.includes(report.role)) continue;
      const existing = wave.reports[report.role];
      if (!existing) {
        wave.reports[report.role] = report;
        this.incrementWorkerCount(state, report.role, report.result_post_id);
        this.releaseRole(report.role, "WORKER_RESULT_POSTED");
      } else if (report.result_post_id > existing.result_post_id) {
        wave.reports[report.role] = report;
        state.latest_result_post_by_role = state.latest_result_post_by_role || {};
        state.latest_result_post_by_role[report.role] = report.result_post_id;
      }
      if (report.status === "END") state.ended_roles[report.role] = { wave_post_id: wave.post_id, result_post_id: report.result_post_id };
    }
  }

  updateCarryoverReports(state, comments) {
    for (const [roleId, carryover] of Object.entries(state.carryovers || {})) {
      const validRoles = [roleId, ...(carryover.rescue_roles || [])];
      let resolved = null;
      for (const comment of comments) {
        const report = parseWorkerReport(comment, carryover.wave_post_id);
        if (!report || !validRoles.includes(report.role)) continue;
        if (!resolved || report.result_post_id > resolved.result_post_id) resolved = report;
      }
      if (resolved) {
        carryover.resolved_by = resolved.role;
        carryover.result_post_id = resolved.result_post_id;
        carryover.resolved_at = this.now().toISOString();
        this.incrementWorkerCount(state, resolved.role, resolved.result_post_id);
        for (const activeRole of validRoles) this.releaseRole(activeRole, "CARRYOVER_RESULT_POSTED");
        if (resolved.status === "END" && resolved.role === roleId) state.ended_roles[roleId] = { wave_post_id: carryover.wave_post_id, result_post_id: resolved.result_post_id };
        delete state.carryovers[roleId];
        delete state.replacement_required[roleId];
        this.log("CARRYOVER_RESOLVED", { original_role: roleId, resolved_by: resolved.role, result_post_id: resolved.result_post_id });
      }
    }
  }

  newRoleCandidates(state) {
    const group = this.resolveGroup(state.group_id);
    return group.worker_ids.filter(roleId => !state.initial_worker_ids.includes(roleId) && !state.used_rescue_roles[roleId]);
  }

  async processCarryovers(state, comments) {
    this.updateCarryoverReports(state, comments);
    const now = nowMs(this.now);
    const candidates = this.newRoleCandidates(state);
    for (const [roleId, carryover] of Object.entries(state.carryovers || {})) {
      const started = Date.parse(carryover.started_at || 0);
      const elapsed = Number.isFinite(started) ? now - started : 0;
      if (elapsed >= LONG_RUNNING_MS && !(carryover.rescue_roles || []).length) {
        const available = candidates.filter(candidate => !state.used_rescue_roles[candidate]).slice(0, 2);
        if (available.length === 2) {
          carryover.rescue_roles = available;
          carryover.rescue_dispatched_at = this.now().toISOString();
          available.forEach(candidate => { state.used_rescue_roles[candidate] = { original_role: roleId, wave_post_id: carryover.wave_post_id }; });
          const requests = available.map(rescueRole => ({
            role_id: rescueRole,
            kind: "C_RESCUE_WORKER",
            prompt: `${RESCUE_TEMPLATE}\n원래 담당=${roleId}\nWAVE=${carryover.wave_post_id}\n마지막 줄: PANEL | ROLE=${rescueRole} | WAVE=${carryover.wave_post_id} | STATUS={REPORTED|END}`,
            metadata: { original_role: roleId, wave_post_id: carryover.wave_post_id }
          }));
          await this.dispatchBatch(state, requests, `RESCUE_${roleId}`);
          this.log("RESCUE_WORKERS_DISPATCHED", { original_role: roleId, rescue_roles: available });
        } else if (!carryover.rescue_binding_required_at) {
          carryover.rescue_binding_required_at = this.now().toISOString();
          state.manual_required = Array.from(new Set([...(state.manual_required || []), `RESCUE:${roleId}:2`]));
          this.log("RESCUE_WORKERS_REQUIRED", { original_role: roleId, required_count: 2 });
        }
      }

      const nextDemandAt = Date.parse(carryover.next_demand_at || 0);
      if (Number.isFinite(nextDemandAt) && now >= nextDemandAt && Number(carryover.demand_failures || 0) < MAX_EXPLICIT_MISSING_DEMAND_FAILURES) {
        carryover.demand_failures = Number(carryover.demand_failures || 0) + 1;
        carryover.last_failure_confirmed_at = this.now().toISOString();
        if (carryover.demand_failures >= MAX_EXPLICIT_MISSING_DEMAND_FAILURES) {
          const oldContext = this.contextUrl(roleId);
          state.replacement_required[roleId] = {
            wave_post_id: carryover.wave_post_id,
            old_context_url: oldContext,
            required_at: this.now().toISOString()
          };
          state.manual_required = Array.from(new Set([...(state.manual_required || []), `REPLACEMENT:${roleId}`]));
          this.log("WORKER_REPLACEMENT_REQUIRED", { role_id: roleId, wave_post_id: carryover.wave_post_id, failed_explicit_demands: carryover.demand_failures });
        } else {
          carryover.last_demand_at = this.now().toISOString();
          carryover.next_demand_at = new Date(now + MISSING_DEMAND_INTERVAL_MS).toISOString();
          await this.dispatchBatch(state, [{
            role_id: roleId,
            kind: "C_MISSING_REPORT_DEMAND",
            prompt: `${REPORT_ONLY_TEMPLATE}\nWAVE=${carryover.wave_post_id}\n마지막 줄: PANEL | ROLE=${roleId} | WAVE=${carryover.wave_post_id} | STATUS={REPORTED|END}`,
            metadata: { wave_post_id: carryover.wave_post_id, explicit_demand_number: carryover.demand_failures + 1 }
          }], `MISSING_DEMAND_${roleId}_${carryover.demand_failures + 1}`);
        }
      }
    }

    for (const [roleId, replacement] of Object.entries(state.replacement_required || {})) {
      const currentContext = this.contextUrl(roleId);
      if (currentContext && replacement.old_context_url && currentContext !== replacement.old_context_url && state.carryovers[roleId]) {
        await this.dispatchBatch(state, [{
          role_id: roleId,
          kind: "C_REPLACEMENT_WORKER",
          prompt: `${REPLACEMENT_TEMPLATE}\nWAVE=${replacement.wave_post_id}\n마지막 줄: PANEL | ROLE=${roleId} | WAVE=${replacement.wave_post_id} | STATUS={REPORTED|END}`,
          metadata: { wave_post_id: replacement.wave_post_id, replacement: true }
        }], `REPLACEMENT_${roleId}`);
        replacement.dispatched_at = this.now().toISOString();
        replacement.new_context_url = currentContext;
        state.carryovers[roleId].demand_failures = 0;
        state.carryovers[roleId].next_demand_at = new Date(now + MISSING_DEMAND_INTERVAL_MS).toISOString();
        state.manual_required = (state.manual_required || []).filter(item => item !== `REPLACEMENT:${roleId}`);
        this.log("REPLACEMENT_WORKER_DISPATCHED", { role_id: roleId, wave_post_id: replacement.wave_post_id });
      }
    }
    this.save(state);
  }

  async processWorkerWave(state, comments) {
    this.updateCurrentWaveReports(state, comments);
    const wave = state.current_wave;
    const reported = Object.keys(wave.reports || {});
    const missing = wave.targets.filter(roleId => !reported.includes(roleId));
    this.save(state);
    if (!missing.length) {
      state.completed_rounds = Number(state.completed_rounds || 0) + 1;
      state.current_wave = null;
      this.save(state);
      this.log("WAVE_ALL_REPORTED", { wave_post_id: wave.post_id, reported });
      await this.dispatchCommander(state, false);
      return;
    }
    const elapsed = nowMs(this.now) - Date.parse(wave.started_at);
    if (elapsed < PARTIAL_REVIEW_MS) return;
    if (missing.length <= 2 && !wave.partial_review_issued) {
      for (const roleId of missing) {
        state.carryovers[roleId] = {
          role_id: roleId,
          wave_post_id: wave.post_id,
          started_at: wave.started_at,
          task: wave.tasks_by_worker[roleId] || [],
          demand_failures: 0,
          last_demand_at: this.now().toISOString(),
          next_demand_at: new Date(nowMs(this.now) + MISSING_DEMAND_INTERVAL_MS).toISOString(),
          rescue_roles: []
        };
      }
      const requests = missing.map(roleId => ({
        role_id: roleId,
        kind: "C_MISSING_REPORT_DEMAND",
        prompt: `${REPORT_ONLY_TEMPLATE}\nWAVE=${wave.post_id}\n마지막 줄: PANEL | ROLE=${roleId} | WAVE=${wave.post_id} | STATUS={REPORTED|END}`,
        metadata: { wave_post_id: wave.post_id, explicit_demand_number: 1 }
      }));
      await this.dispatchBatch(state, requests, `PARTIAL_MISSING_${wave.post_id}`);
      wave.partial_review_issued = true;
      state.current_wave = null;
      this.save(state);
      this.log("WAVE_PARTIAL_CONTINUE", { wave_post_id: wave.post_id, reported, carryover: missing });
      await this.dispatchCommander(state, true);
      return;
    }
    if (missing.length >= 3) {
      const last = Date.parse(wave.last_wait_log_at || 0);
      if (!Number.isFinite(last) || nowMs(this.now) - last >= PARTIAL_REVIEW_MS) {
        wave.last_wait_log_at = this.now().toISOString();
        this.save(state);
        this.log("WAVE_WAIT_THREE_OR_MORE_MISSING", { wave_post_id: wave.post_id, missing });
      }
    }
  }

  async processProgressCorrection(state, comments) {
    const candidate = comments
      .filter(comment => comment.id > Number(state.last_commander_comment_id || 0))
      .map(comment => ({ comment, tasks: parseTaskLines(comment.body), panel: parseCommanderPanel(comment) }))
      .filter(item => item.panel)
      .sort((a, b) => b.comment.id - a.comment.id)[0];
    if (!candidate) return;
    this.releaseRole(state.commander_id, "PROGRESS_CORRECTION_POSTED");
    const error = this.validateProgress(state, candidate.panel);
    if (error) {
      state.last_commander_comment_id = candidate.comment.id;
      state.progress_error = error;
      this.save(state);
      return;
    }
    state.progress_error = null;
    if (candidate.tasks.length || candidate.panel.end) {
      await this.acceptCommanderWave(state, candidate);
      return;
    }
    state.last_commander_comment_id = candidate.comment.id;
    if (candidate.panel.completed_count != null) state.latest_completed_task_count = candidate.panel.completed_count;
    if (candidate.panel.progress_percent != null) state.latest_progress_percent = candidate.panel.progress_percent;
    state.status = "COMMANDER_WAVE_WAIT";
    this.save(state);
    await this.dispatchCommander(state, false);
  }

  async tickRepeat(comments, state) {
    const repeat = this.store.loadRepeat();
    const commands = Object.values(repeat.commands || {}).filter(command => command.enabled === true);
    if (!commands.length) return;
    const now = nowMs(this.now);
    for (const command of commands) {
      for (const roleId of command.targets) {
        const target = command.target_state[roleId] || (command.target_state[roleId] = {
          last_dispatch_at: null,
          baseline_comment_id: 0,
          last_result_post_id: 0,
          send_count: 0,
          last_error: null,
          awaiting_result: false,
          ended: false,
          last_completion_status: null
        });
        if (target.ended === true) continue;
        const roleBusy = Boolean(
          state && state.enabled && (
            state.current_wave && state.current_wave.targets.includes(roleId) && !state.current_wave.reports[roleId] ||
            state.carryovers && state.carryovers[roleId] ||
            state.status === "START_WAIT" && state.start && Array.isArray(state.start.missing_roles) && state.start.missing_roles.includes(roleId) ||
            roleId === state.commander_id && ["COMMANDER_WAVE_WAIT", "PROGRESS_CORRECTION_WAIT"].includes(state.status)
          )
        );
        if (roleBusy) continue;
        let due = false;
        if (command.trigger === "EVERY_X_MINUTES") {
          const last = Date.parse(target.last_dispatch_at || 0);
          due = !Number.isFinite(last) || now - last >= Number(command.interval_minutes) * 60 * 1000;
        } else if (command.trigger === "AFTER_COMPLETION") {
          if (!target.last_dispatch_at) due = true;
          else {
            const report = comments
              .filter(comment => comment.id > Number(target.baseline_comment_id || 0))
              .map(comment => ({ comment, panel: parsePanelLines(comment.body) }))
              .map(item => ({
                comment: item.comment,
                panel: item.panel.find(panel =>
                  panel.ROLE === roleId &&
                  String(panel.COMMAND_ID || "") === command.command_id &&
                  ["REPORTED", "END"].includes(String(panel.STATUS || "").toUpperCase())
                ) || null
              }))
              .find(item => item.panel);
            if (report && report.comment.id > Number(target.last_result_post_id || 0)) {
              const completionStatus = String(report.panel.STATUS || "").toUpperCase();
              target.last_result_post_id = report.comment.id;
              target.awaiting_result = false;
              target.last_completion_status = completionStatus;
              this.releaseRole(roleId, completionStatus === "END" ? "REPEAT_COMMAND_END_POSTED" : "REPEAT_COMMAND_RESULT_POSTED");
              if (completionStatus === "END") {
                target.ended = true;
                target.ended_at = this.now().toISOString();
                continue;
              }
              due = true;
            }
          }
        }
        if (!due) continue;
        const baseline = maxCommentId(comments);
        try {
          const reportLine = `PANEL | ROLE=${roleId} | COMMAND_ID=${command.command_id} | STATUS={REPORTED|END}`;
          const batch = await this.dispatchBatch(state, [{
            role_id: roleId,
            kind: "REPEAT_COMMAND",
            prompt: `${command.message}\n\n완료 또는 미수행 사유를 GitHub에 게시하고 마지막 줄에 다음 형식을 사용하라.\n${reportLine}`,
            metadata: { command_id: command.command_id, trigger: command.trigger, sequence: Number(target.send_count || 0) + 1 }
          }], `REPEAT_${command.command_id}_${roleId}`);
          if (batch.failures && batch.failures.length) throw new Error(`REPEAT_COMMAND_DISPATCH_NOT_ACCEPTED:${roleId}`);
          target.last_dispatch_at = this.now().toISOString();
          target.baseline_comment_id = baseline;
          target.send_count = Number(target.send_count || 0) + 1;
          target.last_error = null;
          target.awaiting_result = command.trigger === "AFTER_COMPLETION";
          target.last_completion_status = null;
        } catch (error) {
          target.last_error = String(error && error.message || error);
          target.last_attempt_at = this.now().toISOString();
          this.log("REPEAT_COMMAND_DISPATCH_FAILED", { command_id: command.command_id, role_id: roleId, error: target.last_error });
        }
      }
    }
    for (const command of Object.values(repeat.commands || {})) {
      const targets = Array.isArray(command.targets) ? command.targets : [];
      if (targets.length && targets.every(roleId => command.target_state && command.target_state[roleId] && command.target_state[roleId].ended === true)) {
        command.enabled = false;
        command.completed_at = this.now().toISOString();
        this.log("REPEAT_COMMAND_ALL_TARGETS_ENDED", { command_id: command.command_id, targets });
      }
    }
    this.store.saveRepeat(repeat);
  }

  async tick() {
    if (this.tickInFlight) return { skipped: true, reason: "C_MODE_TICK_ALREADY_RUNNING", summary: this.summary() };
    this.tickInFlight = true;
    try {
      const state = this.state();
      const repeatConfig = this.store.loadRepeat();
      const firstRepeatWithAuthority = Object.values(repeatConfig.commands || {}).find(command => command.enabled === true && command.repository && command.control_pr);
      const repository = state.repository || firstRepeatWithAuthority && firstRepeatWithAuthority.repository;
      const controlPr = state.control_pr || firstRepeatWithAuthority && Number(firstRepeatWithAuthority.control_pr);
      let comments = [];
      if (repository && controlPr) {
        comments = (await this.fetchComments(repository, controlPr)).map(normalizeComment);
        state.last_seen_comment_id = Math.max(state.last_seen_comment_id || 0, maxCommentId(comments));
      }
      await this.tickRepeat(comments, state);
      if (!state.enabled || ["IDLE", "STOPPED", "PAUSED", "COMPLETED"].includes(state.status)) {
        this.save(state);
        this.stopTimerIfIdle();
        return { skipped: true, reason: "C_MODE_NOT_ACTIVE", summary: this.summary() };
      }
      await this.processCarryovers(state, comments);
      if (state.status === "START_WAIT") await this.processStart(state, comments);
      else if (state.status === "COMMANDER_WAVE_WAIT") {
        const candidate = this.findCommanderWave(state, comments);
        if (candidate) await this.acceptCommanderWave(state, candidate);
      } else if (state.status === "WORKER_REPORT_WAIT") {
        await this.processWorkerWave(state, comments);
      } else if (state.status === "PROGRESS_CORRECTION_WAIT") {
        await this.processProgressCorrection(state, comments);
      }
      this.save(state);
      return { skipped: false, summary: this.summary() };
    } finally {
      this.tickInFlight = false;
    }
  }

  handleTickError(error) {
    const state = this.state();
    state.last_error = String(error && error.stack || error);
    if (!/GITHUB_(?:HTTP|REQUEST)|GH_API/i.test(state.last_error)) state.status = "ERROR";
    this.save(state);
    this.log("TICK_ERROR", { error: state.last_error });
  }

  configureRepeat(payload) {
    const repeat = this.store.loadRepeat();
    const message = String(payload && payload.message || "");
    if (!message.trim()) throw new Error("REPEAT_COMMAND_MESSAGE_REQUIRED");
    const trigger = String(payload && payload.trigger || "EVERY_X_MINUTES").toUpperCase();
    if (!["EVERY_X_MINUTES", "AFTER_COMPLETION"].includes(trigger)) throw new Error("REPEAT_COMMAND_TRIGGER_INVALID");
    const targets = Array.from(new Set((Array.isArray(payload && payload.targets) ? payload.targets : [])
      .map(value => cleanText(value, 100).toUpperCase()).filter(Boolean)));
    if (!targets.length) throw new Error("REPEAT_COMMAND_TARGETS_REQUIRED");
    const interval = Math.max(1, Math.min(Number(payload && payload.interval_minutes) || 20, 1440));
    const commandId = cleanText(payload && payload.command_id, 200) || `RC-${Date.now()}-${sha256(message).slice(0, 8)}`;
    const existing = repeat.commands[commandId];
    repeat.commands[commandId] = {
      schema_version: "YOLLA_REPEAT_COMMAND_V1",
      command_id: commandId,
      message,
      trigger,
      interval_minutes: interval,
      targets,
      enabled: payload && payload.enabled !== false,
      target_state: existing && existing.target_state || {},
      repository: cleanText(payload && payload.repository, 300) || existing && existing.repository || this.state().repository || null,
      control_pr: Number(payload && payload.control_pr || existing && existing.control_pr || this.state().control_pr || 0) || null,
      created_at: existing && existing.created_at || this.now().toISOString(),
      updated_at: this.now().toISOString()
    };
    this.store.saveRepeat(repeat);
    this.ensureTimer();
    this.log("REPEAT_COMMAND_CONFIGURED", { command_id: commandId, trigger, targets, interval_minutes: interval });
    return this.repeatSummary();
  }

  setRepeatEnabled(commandId, enabled) {
    const repeat = this.store.loadRepeat();
    const command = repeat.commands[commandId];
    if (!command) throw new Error(`REPEAT_COMMAND_NOT_FOUND:${commandId}`);
    command.enabled = Boolean(enabled);
    command.updated_at = this.now().toISOString();
    if (!command.enabled) {
      for (const roleId of command.targets || []) this.releaseRole(roleId, "REPEAT_COMMAND_PAUSED");
    }
    this.store.saveRepeat(repeat);
    if (command.enabled) this.ensureTimer();
    else this.stopTimerIfIdle();
    this.log(command.enabled ? "REPEAT_COMMAND_STARTED" : "REPEAT_COMMAND_PAUSED", { command_id: commandId });
    return this.repeatSummary();
  }

  deleteRepeat(commandId) {
    const repeat = this.store.loadRepeat();
    const command = repeat.commands[commandId];
    if (command) {
      for (const roleId of command.targets || []) this.releaseRole(roleId, "REPEAT_COMMAND_DELETED");
      delete repeat.commands[commandId];
    }
    this.store.saveRepeat(repeat);
    this.stopTimerIfIdle();
    this.log("REPEAT_COMMAND_DELETED", { command_id: commandId });
    return this.repeatSummary();
  }

  repeatSummary() {
    const repeat = this.store.loadRepeat();
    const commands = {};
    for (const [id, command] of Object.entries(repeat.commands || {})) {
      commands[id] = {
        command_id: id,
        message: command.message,
        trigger: command.trigger,
        interval_minutes: command.interval_minutes,
        targets: command.targets,
        enabled: command.enabled,
        repository: command.repository || null,
        control_pr: command.control_pr || null,
        send_count: Object.values(command.target_state || {}).reduce((sum, target) => sum + Number(target.send_count || 0), 0),
        target_state: clone(command.target_state || {}),
        completed_at: command.completed_at || null,
        updated_at: command.updated_at
      };
    }
    return { schema_version: REPEAT_SCHEMA, commands, updated_at: repeat.updated_at };
  }

  activitySummary() {
    const state = this.state();
    const repeat = this.store.loadRepeat();
    const backgroundRoles = typeof this.deps.getActiveRoles === "function"
      ? Array.from(new Set((this.deps.getActiveRoles() || []).map(roleId => cleanText(roleId, 100).toUpperCase()).filter(Boolean)))
      : [];
    const cCandidates = new Set();
    if (state.enabled === true) {
      if (["START_DISPATCH", "START_WAIT"].includes(state.status)) {
        for (const roleId of state.start && state.start.missing_roles || [state.commander_id, ...(state.worker_ids || [])]) cCandidates.add(roleId);
      } else if (["COMMANDER_WAVE_WAIT", "PROGRESS_CORRECTION_WAIT"].includes(state.status)) {
        if (state.commander_id) cCandidates.add(state.commander_id);
      } else if (["WORKER_DISPATCH", "WORKER_REPORT_WAIT"].includes(state.status)) {
        const wave = state.current_wave;
        if (wave) for (const roleId of wave.targets || []) if (!wave.reports || !wave.reports[roleId]) cCandidates.add(roleId);
      }
      for (const [roleId, carryover] of Object.entries(state.carryovers || {})) {
        cCandidates.add(roleId);
        for (const rescueRole of carryover.rescue_roles || []) cCandidates.add(rescueRole);
      }
    }
    const cActiveRoles = backgroundRoles.filter(roleId => cCandidates.has(roleId));
    const commandEnabledTargets = new Set();
    const commandAwaitingRoles = new Set();
    const commandErrorRoles = new Set();
    for (const command of Object.values(repeat.commands || {})) {
      if (command.enabled !== true) continue;
      for (const roleId of command.targets || []) {
        const target = command.target_state && command.target_state[roleId] || {};
        if (target.ended === true) continue;
        commandEnabledTargets.add(roleId);
        if (target.awaiting_result === true) commandAwaitingRoles.add(roleId);
        if (target.last_error) commandErrorRoles.add(roleId);
      }
    }
    const commandActiveRoles = backgroundRoles.filter(roleId => !cCandidates.has(roleId) && commandEnabledTargets.has(roleId));
    const errorRoles = new Set(commandErrorRoles);
    for (const item of state.manual_required || []) {
      const match = String(item || "").toUpperCase().match(/(?:^|:)([A-Z][A-Z0-9]*-\d+)(?:$|:)/);
      if (match) errorRoles.add(match[1]);
    }
    for (const roleId of Object.keys(state.replacement_required || {})) errorRoles.add(cleanText(roleId, 100).toUpperCase());
    return {
      schema_version: "YOLLA_C_COMMAND_ACTIVITY_V1",
      c_enabled: state.enabled === true,
      c_group_id: state.group_id || null,
      c_status: state.status,
      c_candidate_roles: Array.from(cCandidates),
      c_active_roles: cActiveRoles,
      command_enabled_target_roles: Array.from(commandEnabledTargets),
      command_awaiting_roles: Array.from(commandAwaitingRoles),
      command_active_roles: commandActiveRoles,
      background_active_roles: backgroundRoles,
      error_roles: Array.from(errorRoles),
      updated_at: this.now().toISOString()
    };
  }

  summary() {
    const state = this.state();
    const wave = state.current_wave;
    const reported = wave ? Object.keys(wave.reports || {}) : [];
    const targets = wave ? wave.targets || [] : [];
    const missing = targets.filter(role => !reported.includes(role));
    const carryovers = Object.values(state.carryovers || {});
    return {
      schema_version: "YOLLA_C_MODE_PANEL_STATE_V1",
      enabled: state.enabled,
      status: state.status,
      repository: state.repository,
      control_pr: state.control_pr,
      group_id: state.group_id,
      commander_id: state.commander_id,
      worker_ids: clone(state.worker_ids || []),
      worker_count: state.worker_ids.length,
      current_wave_post_id: wave && wave.post_id || null,
      current_wave_index: wave && wave.wave_index || state.wave_count,
      reported_count: reported.length,
      missing_count: missing.length,
      carryover_count: carryovers.length,
      long_running_count: carryovers.filter(item => nowMs(this.now) - Date.parse(item.started_at || 0) >= LONG_RUNNING_MS).length,
      completed_rounds: Number(state.completed_rounds || 0),
      dispatch_count: Number(state.dispatch_count || 0),
      duplicate_dispatch_count: Number(state.duplicate_dispatch_count || 0),
      progress_percent: Number(state.latest_progress_percent || 0),
      completed_task_count: Number(state.latest_completed_task_count || 0),
      worker_report_counts: clone(state.worker_report_counts || {}),
      latest_result_post_by_role: clone(state.latest_result_post_by_role || {}),
      progress_error: state.progress_error,
      manual_required: state.manual_required || [],
      replacement_required: Object.keys(state.replacement_required || {}),
      start: state.start,
      repeat: this.repeatSummary(),
      activity: this.activitySummary(),
      timer_active: Boolean(this.timer),
      state_path: this.store.statePath,
      work_control_log_path: this.store.eventPath,
      updated_at: state.updated_at
    };
  }

  openFolder() {
    ensureDir(this.store.root);
    if (this.deps.shell && typeof this.deps.shell.openPath === "function") this.deps.shell.openPath(this.store.root);
    return { ok: true, path: this.store.root };
  }

  isActive() {
    const state = this.state();
    const repeat = this.store.loadRepeat();
    return Boolean(state.enabled || Object.values(repeat.commands || {}).some(command => command.enabled === true));
  }
}

function createCModeRuntime(deps) {
  const runtime = new CModeRuntime(deps);
  runtime.initialize();
  return runtime;
}

module.exports = {
  STATE_SCHEMA,
  REPEAT_SCHEMA,
  DEFAULT_POLL_INTERVAL_MS,
  PARTIAL_REVIEW_MS,
  LONG_RUNNING_MS,
  MAX_EXPLICIT_MISSING_DEMAND_FAILURES,
  START_TEMPLATE,
  COMMANDER_FULL_TEMPLATE,
  COMMANDER_PARTIAL_TEMPLATE,
  WORKER_TEMPLATE,
  REPORT_ONLY_TEMPLATE,
  REPLACEMENT_TEMPLATE,
  RESCUE_TEMPLATE,
  PROGRESS_CORRECTION_TEMPLATE,
  parsePipeLine,
  parseTaskLines,
  parsePanelLines,
  parseStartReceipt,
  parseWorkerReport,
  parseCommanderPanel,
  CModeStore,
  CModeRuntime,
  createCModeRuntime
};
