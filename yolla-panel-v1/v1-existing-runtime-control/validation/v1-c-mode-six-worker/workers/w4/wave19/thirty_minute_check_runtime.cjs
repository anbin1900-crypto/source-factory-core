'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CHECK_THRESHOLD_MS = 30 * 60 * 1000;
const POST_REFRESH_WAIT_MS = 30 * 1000;
const REFRESH_LIMIT = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class ThirtyMinuteCheckRuntime {
  constructor({ statePath = null, refresh = () => {}, now = () => Date.now() } = {}) {
    if (typeof refresh !== 'function') throw new Error('INVALID_REFRESH');
    if (typeof now !== 'function') throw new Error('INVALID_NOW');
    this.statePath = statePath;
    this.refresh = refresh;
    this.now = now;
    this.state = {
      schema_version: 'C_MODE_THIRTY_MINUTE_CHECK_STATE_V1',
      tasks: {},
      receipts: [],
      counters: {
        generating_refresh_count: 0,
        duplicate_directive_count: 0,
        duplicate_refresh_count: 0
      }
    };
    this._load();
  }

  _load() {
    if (!this.statePath || !fs.existsSync(this.statePath)) return;
    const loaded = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
    if (loaded.schema_version !== this.state.schema_version) throw new Error('STATE_SCHEMA_MISMATCH');
    this.state = loaded;
  }

  _persist() {
    if (!this.statePath) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temp = `${this.statePath}.tmp-${process.pid}`;
    fs.writeFileSync(temp, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, this.statePath);
  }

  register({ task_id, directive_id, started_at_ms }) {
    if (!task_id || !directive_id || !Number.isFinite(started_at_ms)) throw new Error('INVALID_TASK');
    const existing = this.state.tasks[task_id];
    if (existing) {
      if (existing.directive_id === directive_id) {
        this.state.counters.duplicate_directive_count += 1;
        this._persist();
        return { accepted: false, reason: 'DUPLICATE_DIRECTIVE' };
      }
      throw new Error('TASK_ID_REUSED_WITH_DIFFERENT_DIRECTIVE');
    }
    this.state.tasks[task_id] = {
      task_id,
      directive_id,
      started_at_ms,
      generating: true,
      terminal_seen: false,
      refresh_count: 0,
      refreshed_at_ms: null,
      post_refresh_due_ms: null,
      last_decision: 'REGISTERED'
    };
    this._persist();
    return { accepted: true };
  }

  update({ task_id, generating, terminal_seen }) {
    const task = this.state.tasks[task_id];
    if (!task) throw new Error('TASK_NOT_FOUND');
    if (typeof generating === 'boolean') task.generating = generating;
    if (typeof terminal_seen === 'boolean') task.terminal_seen = terminal_seen;
    this._persist();
    return clone(task);
  }

  evaluate(taskId, atMs = this.now()) {
    const task = this.state.tasks[taskId];
    if (!task) throw new Error('TASK_NOT_FOUND');
    const elapsed = atMs - task.started_at_ms;

    if (task.terminal_seen) return this._decision(task, 'TERMINAL_PRESENT', false, atMs);
    if (elapsed < CHECK_THRESHOLD_MS) return this._decision(task, 'BEFORE_THRESHOLD', false, atMs);
    if (task.generating) return this._decision(task, 'GENERATING', false, atMs);

    if (task.refresh_count === 0) {
      this.refresh({ task_id: task.task_id, directive_id: task.directive_id });
      task.refresh_count = 1;
      task.refreshed_at_ms = atMs;
      task.post_refresh_due_ms = atMs + POST_REFRESH_WAIT_MS;
      return this._decision(task, 'REFRESHED_ONCE', true, atMs);
    }

    if (task.refresh_count > REFRESH_LIMIT) throw new Error('REFRESH_LIMIT_BREACH');
    if (atMs < task.post_refresh_due_ms) return this._decision(task, 'POST_REFRESH_WAIT', false, atMs);
    return this._decision(task, task.terminal_seen ? 'TERMINAL_PRESENT_AFTER_REFRESH' : 'TERMINAL_STILL_MISSING', false, atMs);
  }

  _decision(task, reason, refreshed, atMs) {
    task.last_decision = reason;
    const receipt = {
      schema_version: 'C_MODE_THIRTY_MINUTE_CHECK_RECEIPT_V1',
      task_id: task.task_id,
      directive_id: task.directive_id,
      evaluated_at_ms: atMs,
      reason,
      refreshed,
      refresh_count: task.refresh_count,
      terminal_seen: task.terminal_seen,
      generating: task.generating
    };
    this.state.receipts.push(receipt);
    this._persist();
    return clone(receipt);
  }

  snapshot() {
    return clone(this.state);
  }
}

module.exports = {
  ThirtyMinuteCheckRuntime,
  CHECK_THRESHOLD_MS,
  POST_REFRESH_WAIT_MS,
  REFRESH_LIMIT
};
