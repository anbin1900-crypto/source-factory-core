#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { inspectAndRepair, safeJoin } = require('./CROSS_CUTTING_REPAIR_HOOK_V1.cjs');
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function arg(name, fallback = null) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
function has(name) { return process.argv.includes(name); }
function parseTime(value) { const n = Date.parse(value || ''); return Number.isFinite(n) ? n : null; }
function loadPointer(pointerFile) { const pointer = readJson(pointerFile); const root = path.dirname(pointerFile); const read = key => readJson(safeJoin(root, pointer.inputs[key])); return { pointer, root, mission: read('MISSION_POINTER'), current: read('CURRENT_COMMAND'), latest: read('LATEST_RESULT'), checkpoint: read('CHECKPOINT') }; }
function validateMinimum(x) { const missing = []; if (!x.pointer) missing.push('MISSION_POINTER'); if (!x.current) missing.push('CURRENT_COMMAND'); if (!x.latest) missing.push('LATEST_RESULT'); if (!x.checkpoint) missing.push('CHECKPOINT'); if (missing.length) throw new Error(`MINIMUM_RECOVERY_INPUT_MISSING:${missing.join(',')}`); }
function fresh(current, now, staleAfterSec) { const heartbeat = parseTime(current.heartbeat_at); return heartbeat != null && (now - heartbeat) / 1000 <= staleAfterSec; }
function decide({ current, latest, checkpoint, blocker, repair, now, staleAfterSec }) {
  const sameKeyPass = latest.status === 'PASS' && latest.idempotency_key && latest.idempotency_key === current.idempotency_key;
  if (sameKeyPass) return { decision: 'SKIP_DUPLICATE', command_id: current.command_id, reason: 'PASS_RECEIPT_ALREADY_BOUND_TO_IDEMPOTENCY_KEY', resume_from: null };
  if (blocker && blocker.active && blocker.repairable !== true) return { decision: 'BLOCKED', command_id: current.command_id, reason: `ACTIVE_BLOCKER:${blocker.code || 'UNKNOWN'}`, resume_from: null };
  if (current.status === 'RUNNING' && fresh(current, now, staleAfterSec)) return { decision: 'BLOCKED', command_id: current.command_id, reason: 'ACTIVE_EXECUTION_HEARTBEAT_FRESH', resume_from: null };
  const interrupted = ['RUNNING','INTERRUPTED'].includes(current.status) && !fresh(current, now, staleAfterSec);
  if (interrupted && checkpoint.durable === true && repair.repairable_count > 0 && repair.nonrepairable_count === 0) return { decision: 'REPAIR_THEN_RESUME', command_id: current.command_id, reason: 'STALE_INTERRUPTED_WITH_REPAIRABLE_PARTIAL_STATE', resume_from: checkpoint.checkpoint_id };
  if (interrupted && checkpoint.durable === true) return { decision: 'RESUME', command_id: current.command_id, reason: 'STALE_INTERRUPTED_WITH_DURABLE_CHECKPOINT', resume_from: checkpoint.checkpoint_id };
  if (interrupted && checkpoint.durable !== true && current.safe_rerun === true && current.non_idempotent_side_effect_committed !== true) return { decision: 'SAFE_RERUN', command_id: current.command_id, reason: 'NO_DURABLE_CHECKPOINT_BUT_COMMAND_DECLARED_SAFE_RERUN', resume_from: null };
  if (current.status === 'PASS') return { decision: 'ADVANCE', command_id: current.command_id, reason: 'CURRENT_COMMAND_PASS', resume_from: null };
  return { decision: 'BLOCKED', command_id: current.command_id, reason: 'NO_SAFE_RECOVERY_RULE_MATCHED', resume_from: null };
}
function reconstruct(x, options = {}) { validateMinimum(x); const now = options.now ?? Date.now(); const staleAfterSec = x.pointer.stale_after_seconds || 120; const repair = inspectAndRepair({ root: x.root, checkpoint: x.checkpoint, apply: options.repair === true }); const next = decide({ current: x.current, latest: x.latest, checkpoint: x.checkpoint, blocker: x.pointer.blocker || null, repair, now, staleAfterSec }); const state = { schema_version: 'AI001_MISSION_CONTINUITY_RECOVERED_STATE_V1', recovered_at: new Date(now).toISOString(), MISSION: { mission_id: x.pointer.mission_id, directive_id: x.pointer.directive_id, cycle_id: x.pointer.cycle_id, status: x.pointer.status, authority_head: x.pointer.authority_head || null }, CURRENT_COMMAND: x.current, LATEST_RESULT: x.latest, LAST_PASS_COMMAND: x.latest.status === 'PASS' ? { command_id: x.latest.command_id, idempotency_key: x.latest.idempotency_key, receipt_path: x.latest.receipt_path, receipt_sha256: x.latest.receipt_sha256 } : (x.pointer.last_pass_command || null), BLOCKER: x.pointer.blocker || null, CHECKPOINT: x.checkpoint, REPAIR: repair, NEXT_ACTION: next }; state.recovery_digest = sha256({ mission: state.MISSION, current: state.CURRENT_COMMAND, latest: state.LATEST_RESULT, checkpoint: state.CHECKPOINT, next: state.NEXT_ACTION }); return state; }
function main() { const pointer = path.resolve(arg('--pointer', path.join(process.cwd(), 'LATEST_MISSION_POINTER.json'))); const x = loadPointer(pointer); const state = reconstruct(x, { repair: has('--repair') }); if (has('--json')) console.log(JSON.stringify(state, null, 2)); else console.log(JSON.stringify({ mission_id: state.MISSION.mission_id, current_command: state.CURRENT_COMMAND.command_id, latest_result: state.LATEST_RESULT.status, checkpoint: state.CHECKPOINT.checkpoint_id, resume_candidate: state.NEXT_ACTION, blocker: state.BLOCKER, recovery_digest: state.recovery_digest }, null, 2)); if (state.NEXT_ACTION.decision === 'BLOCKED') process.exitCode = 3; }
if (require.main === module) main();
module.exports = { loadPointer, reconstruct, decide };
