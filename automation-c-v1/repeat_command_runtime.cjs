'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MODES = new Set(['EVERY_X_MINUTES', 'AFTER_COMPLETION']);
const STATUSES = new Set(['ACTIVE', 'PAUSED', 'END']);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`INVALID_${name}`);
  return value;
}
function normalizeTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) throw new Error('INVALID_TARGETS');
  const seen = new Set();
  return targets.map((target) => {
    const groupId = requireString(target.group_id, 'GROUP_ID');
    const slotId = requireString(target.slot_id, 'SLOT_ID');
    const key = `${groupId}\u0000${slotId}`;
    if (seen.has(key)) throw new Error('DUPLICATE_TARGET');
    seen.add(key);
    return { group_id: groupId, slot_id: slotId };
  });
}

class RepeatCommandRuntime {
  constructor({ statePath, now = () => Date.now(), emit = () => {} } = {}) {
    this.statePath = statePath || null;
    this.now = now;
    this.emit = emit;
    this.state = { schema_version: 'REPEAT_COMMAND_RUNTIME_STATE_V1', commands: {}, receipts: [], work_control_log: [] };
    this._load();
  }

  _load() {
    if (!this.statePath || !fs.existsSync(this.statePath)) return;
    const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
    if (parsed.schema_version !== 'REPEAT_COMMAND_RUNTIME_STATE_V1') throw new Error('STATE_SCHEMA_MISMATCH');
    this.state = parsed;
  }

  _persist() {
    if (!this.statePath) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const tmp = `${this.statePath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, this.statePath);
  }

  _log(event, command, extra = {}) {
    const entry = { at_ms: this.now(), event, command_id: command.command_id, role: command.role, ...extra };
    this.state.work_control_log.push(entry);
    return entry;
  }

  create(spec) {
    const commandId = requireString(spec.command_id, 'COMMAND_ID');
    if (this.state.commands[commandId] && this.state.commands[commandId].status !== 'END') throw new Error('ACTIVE_COMMAND_DUPLICATE');
    const role = requireString(spec.role, 'ROLE');
    const prompt = requireString(spec.prompt, 'PROMPT');
    const mode = requireString(spec.trigger_mode, 'TRIGGER_MODE');
    if (!MODES.has(mode)) throw new Error('INVALID_TRIGGER_MODE');
    const intervalMinutes = mode === 'EVERY_X_MINUTES' ? Number(spec.interval_minutes) : null;
    if (mode === 'EVERY_X_MINUTES' && (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0)) throw new Error('INVALID_INTERVAL');
    const now = this.now();
    const command = {
      command_id: commandId,
      role,
      prompt,
      prompt_byte_length: Buffer.byteLength(prompt, 'utf8'),
      prompt_sha256: sha256(Buffer.from(prompt, 'utf8')),
      targets: normalizeTargets(spec.targets),
      trigger_mode: mode,
      interval_minutes: intervalMinutes,
      status: 'ACTIVE',
      created_at_ms: now,
      updated_at_ms: now,
      next_due_at_ms: mode === 'EVERY_X_MINUTES' ? now : null,
      awaiting_completion: false,
      dispatch_count: 0,
      last_dispatch_id: null,
      last_completed_dispatch_id: null
    };
    this.state.commands[commandId] = command;
    this._log('CREATED', command);
    this._persist();
    return clone(command);
  }

  get(commandId) { return this.state.commands[commandId] ? clone(this.state.commands[commandId]) : null; }
  list() { return Object.values(this.state.commands).map(clone); }

  tick(atMs = this.now()) {
    const dispatched = [];
    for (const command of Object.values(this.state.commands)) {
      if (command.status !== 'ACTIVE') continue;
      const due = command.trigger_mode === 'EVERY_X_MINUTES'
        ? atMs >= command.next_due_at_ms && !command.awaiting_completion
        : command.dispatch_count === 0 && !command.awaiting_completion;
      if (!due) continue;
      dispatched.push(this._dispatch(command, atMs));
    }
    if (dispatched.length) this._persist();
    return dispatched;
  }

  _dispatch(command, atMs) {
    command.dispatch_count += 1;
    command.awaiting_completion = true;
    command.updated_at_ms = atMs;
    command.last_dispatch_id = `${command.command_id}:${command.dispatch_count}`;
    if (command.trigger_mode === 'EVERY_X_MINUTES') command.next_due_at_ms = atMs + command.interval_minutes * 60_000;
    const receipt = {
      receipt_id: `receipt:${command.last_dispatch_id}`,
      dispatch_id: command.last_dispatch_id,
      command_id: command.command_id,
      role: command.role,
      prompt: command.prompt,
      prompt_byte_length: command.prompt_byte_length,
      prompt_sha256: command.prompt_sha256,
      targets: clone(command.targets),
      dispatched_at_ms: atMs
    };
    this.state.receipts.push(receipt);
    this._log('DISPATCHED', command, { dispatch_id: receipt.dispatch_id });
    this.emit(clone(receipt));
    return clone(receipt);
  }

  complete({ role, command_id: commandId, dispatch_id: dispatchId, status = 'REPORTED' }) {
    const command = this.state.commands[commandId];
    if (!command) return { accepted: false, reason: 'UNKNOWN_COMMAND' };
    if (role !== command.role) return { accepted: false, reason: 'ROLE_MISMATCH' };
    if (dispatchId !== command.last_dispatch_id || !command.awaiting_completion) return { accepted: false, reason: 'DISPATCH_MISMATCH' };
    if (!['REPORTED', 'END'].includes(status)) return { accepted: false, reason: 'INVALID_COMPLETION_STATUS' };
    command.awaiting_completion = false;
    command.last_completed_dispatch_id = dispatchId;
    command.updated_at_ms = this.now();
    if (status === 'END') {
      command.status = 'END';
      command.next_due_at_ms = null;
    } else if (command.trigger_mode === 'AFTER_COMPLETION') {
      command.next_due_at_ms = command.updated_at_ms;
    }
    this._log(status === 'END' ? 'AUTO_STOP_END' : 'COMPLETED', command, { dispatch_id: dispatchId });
    this._persist();
    return { accepted: true, status: command.status };
  }

  triggerAfterCompletion(commandId) {
    const command = this.state.commands[commandId];
    if (!command) throw new Error('UNKNOWN_COMMAND');
    if (command.trigger_mode !== 'AFTER_COMPLETION') throw new Error('NOT_AFTER_COMPLETION');
    if (command.status !== 'ACTIVE' || command.awaiting_completion || command.dispatch_count === 0) return null;
    const receipt = this._dispatch(command, this.now());
    this._persist();
    return receipt;
  }

  pause(commandId) { return this._transition(commandId, 'PAUSED', 'PAUSED'); }
  resume(commandId) { return this._transition(commandId, 'ACTIVE', 'RESUMED'); }
  delete(commandId) {
    const command = this.state.commands[commandId];
    if (!command) return false;
    this._log('DELETED', command);
    delete this.state.commands[commandId];
    this._persist();
    return true;
  }

  _transition(commandId, status, event) {
    if (!STATUSES.has(status)) throw new Error('INVALID_STATUS');
    const command = this.state.commands[commandId];
    if (!command) throw new Error('UNKNOWN_COMMAND');
    if (command.status === 'END') throw new Error('COMMAND_ENDED');
    command.status = status;
    command.updated_at_ms = this.now();
    if (status === 'ACTIVE' && command.trigger_mode === 'EVERY_X_MINUTES' && command.next_due_at_ms < command.updated_at_ms) command.next_due_at_ms = command.updated_at_ms;
    this._log(event, command);
    this._persist();
    return clone(command);
  }

  snapshot() { return clone(this.state); }
}

module.exports = { RepeatCommandRuntime };
