'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { STANDARD_ACTIONS, createReceipt, enqueueJob, makeJob, reconcile, validateReceipt } = require('./local_server_control_support.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yolla-a0-local-server-'));
const queue = path.join(root, 'action_queue');
const state = path.join(root, 'state');
const receipts = path.join(root, 'receipts');
const fixedTimes = [
  '2026-08-06T10:00:00.000Z','2026-08-06T10:00:01.000Z','2026-08-06T10:00:02.000Z',
  '2026-08-06T10:00:03.000Z','2026-08-06T10:00:04.000Z','2026-08-06T10:00:05.000Z',
];
let timeIndex = 0;
const config = {
  actionQueue: queue,
  stateRoot: state,
  receiptRoot: receipts,
  targetRoot: 'E:\\YOLLA',
  clock: () => new Date(fixedTimes[Math.min(timeIndex++, fixedTimes.length - 1)]),
};

let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function eq(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }

try {
  eq(STANDARD_ACTIONS.length, 9, 'nine standard actions');
  for (const action of STANDARD_ACTIONS) {
    const job = makeJob(action, {}, config);
    eq(job.action, action, `action preserved ${action}`);
    eq(job.transport.type, 'LOCAL_DURABLE_FILE_QUEUE_V1', 'existing transport');
    eq(job.transport.new_runtime, false, 'no new runtime');
    eq(job.ownership.install_and_operation_owner, 'D_GROUP', 'D owns install');
    eq(job.constraints.public_binding, false, 'loopback only');
  }

  const first = enqueueJob('LOCAL_SERVER_START', { pre_action_service_status: 'STOPPED' }, config);
  eq(first.status, 'QUEUED', 'first job queued');
  ok(fs.existsSync(first.queue_file), 'queue file exists');
  ok(fs.existsSync(first.ledger_file), 'ledger file exists');

  const duplicate = enqueueJob('LOCAL_SERVER_START', { pre_action_service_status: 'STOPPED' }, config);
  eq(duplicate.status, 'DUPLICATE_SUPPRESSED', 'duplicate suppressed');
  eq(duplicate.write_count, 0, 'duplicate writes zero');
  eq(first.job.job_id, duplicate.job.job_id, 'deterministic job id');

  const different = enqueueJob('LOCAL_SERVER_START', { pre_action_service_status: 'UNKNOWN' }, config);
  ok(first.job.job_id !== different.job.job_id, 'different parameters produce different id');

  fs.mkdirSync(receipts, { recursive: true });
  const passReceipt = createReceipt(first.job, 'PASS', { service_status: 'RUNNING' }, config);
  validateReceipt(passReceipt, first.job);
  fs.writeFileSync(path.join(receipts, `${first.job.job_id}.json`), `${JSON.stringify(passReceipt, null, 2)}\n`);
  const view1 = reconcile(config);
  eq(view1.service.status, 'RUNNING', 'service running from receipt');
  eq(view1.last_receipt_pointer.job_id, first.job.job_id, 'last receipt pointer');
  ok(view1.recovery.missed_event_recovery_count >= 1, 'missed event recovered');

  const view2 = reconcile(config);
  ok(view2.queue.duplicate_receipt_count >= 1, 'duplicate receipt suppressed');

  const restartJob = enqueueJob('LOCAL_SERVER_BACKUP', { backup_id: 'BKP-001' }, config);
  fs.rmSync(restartJob.queue_file, { force: true });
  const view3 = reconcile(config);
  ok(fs.existsSync(restartJob.queue_file), 'missing queue file restored');
  ok(view3.recovery.restart_recovery_count >= 1, 'restart recovery counted');

  const failed = createReceipt(restartJob.job, 'FAILED_ROLLED_BACK', {
    service_status: 'RUNNING',
    rollback: { status: 'PASS', strategy: 'NO_MUTATING_ROLLBACK_REQUIRED' },
  }, config);
  fs.writeFileSync(path.join(receipts, `${restartJob.job.job_id}-failed.json`), `${JSON.stringify(failed, null, 2)}\n`);
  const view4 = reconcile(config);
  eq(view4.action_status.LOCAL_SERVER_BACKUP, 'FAILED_ROLLED_BACK', 'failed rollback surfaced');
  eq(view4.service.install_owner, 'D_GROUP', 'viewmodel preserves D ownership');
  eq(view4.service.public_binding, false, 'viewmodel forbids public binding');
  eq(view4.queue.duplicate_execution_count, 0, 'duplicate execution zero');
  ok(fs.existsSync(path.join(state, 'LOCAL_SERVER_STATUS_VIEWMODEL.json')), 'viewmodel persisted');
  ok(fs.existsSync(path.join(state, 'LAST_RECEIPT_POINTER.json')), 'last receipt pointer persisted');

  assert.throws(() => enqueueJob('LOCAL_SERVER_UNKNOWN', {}, config), /unsupported action/);
  assertions += 1;

  console.log(JSON.stringify({
    terminal: 'A0_D_LOCAL_SERVER_CONTROL_SUPPORT_FIXTURE_PASS',
    assertions,
    standard_job_count: STANDARD_ACTIONS.length,
    duplicate_execution_count: 0,
    new_pc_agent_runtime: false,
    new_transport: false,
    d_install_ownership: false,
    public_binding: false,
    production: false,
    ready: false,
    merge: false,
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
