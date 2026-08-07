'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ThirtyMinuteCheckRuntime,
  CHECK_THRESHOLD_MS,
  POST_REFRESH_WAIT_MS
} = require('./thirty_minute_check_runtime.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c6w-w19-w4-'));
const statePath = path.join(root, 'timer-state.json');
const refreshes = [];
const start = 1_000_000;
const runtime = new ThirtyMinuteCheckRuntime({
  statePath,
  refresh: payload => refreshes.push(payload),
  now: () => start
});

let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };

check(runtime.register({task_id:'T1', directive_id:'D1', started_at_ms:start}).accepted, 'register');
let r = runtime.evaluate('T1', start + CHECK_THRESHOLD_MS - 1);
check(r.reason === 'BEFORE_THRESHOLD' && refreshes.length === 0, 'before threshold no-op');
r = runtime.evaluate('T1', start + CHECK_THRESHOLD_MS);
check(r.reason === 'GENERATING' && refreshes.length === 0, 'generating no-op');
runtime.update({task_id:'T1', generating:false});
r = runtime.evaluate('T1', start + CHECK_THRESHOLD_MS);
check(r.reason === 'REFRESHED_ONCE' && r.refreshed && refreshes.length === 1, 'refresh once');
r = runtime.evaluate('T1', start + CHECK_THRESHOLD_MS + POST_REFRESH_WAIT_MS - 1);
check(r.reason === 'POST_REFRESH_WAIT' && refreshes.length === 1, 'wait 30 sec');

const restarted = new ThirtyMinuteCheckRuntime({
  statePath,
  refresh: payload => refreshes.push(payload),
  now: () => start + CHECK_THRESHOLD_MS + POST_REFRESH_WAIT_MS
});
r = restarted.evaluate('T1', start + CHECK_THRESHOLD_MS + POST_REFRESH_WAIT_MS);
check(r.reason === 'TERMINAL_STILL_MISSING' && refreshes.length === 1, 'restart restores refresh count');
restarted.update({task_id:'T1', terminal_seen:true});
r = restarted.evaluate('T1', start + CHECK_THRESHOLD_MS + POST_REFRESH_WAIT_MS + 1);
check(r.reason === 'TERMINAL_PRESENT' && refreshes.length === 1, 'terminal no refresh');

const duplicate = restarted.register({task_id:'T1', directive_id:'D1', started_at_ms:start});
check(!duplicate.accepted && duplicate.reason === 'DUPLICATE_DIRECTIVE', 'duplicate directive rejected');
const snapshot = restarted.snapshot();
check(snapshot.tasks.T1.refresh_count === 1, 'refresh count persisted');
check(snapshot.counters.generating_refresh_count === 0, 'generating refresh zero');
check(snapshot.counters.duplicate_refresh_count === 0, 'duplicate refresh zero');
check(snapshot.counters.duplicate_directive_count === 1, 'duplicate directive observed and rejected');
check(refreshes.length === 1, 'refresh limit exactly one');

const receipt = {
  schema_version: 'C_MODE_THIRTY_MINUTE_CHECK_OFFLINE_RECEIPT_V1',
  status: 'PASS',
  assertions,
  refresh_invocation_count: refreshes.length,
  check_threshold_ms: CHECK_THRESHOLD_MS,
  post_refresh_wait_ms: POST_REFRESH_WAIT_MS,
  counters: {
    GENERATING_REFRESH_COUNT: snapshot.counters.generating_refresh_count,
    DUPLICATE_DIRECTIVE_ACCEPTED_COUNT: 0,
    DUPLICATE_REFRESH_COUNT: snapshot.counters.duplicate_refresh_count
  },
  state_recovery: 'PASS',
  browser_required: false
};
console.log(JSON.stringify(receipt, null, 2));
