'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 'A0_D_LOCAL_SERVER_PC_AGENT_CONTROL_SUPPORT_V1';
const JOB_SCHEMA_VERSION = 'LOCAL_SERVER_PC_AGENT_JOB_V1';
const RECEIPT_SCHEMA_VERSION = 'LOCAL_SERVER_PC_AGENT_RECEIPT_V1';
const VIEWMODEL_SCHEMA_VERSION = 'LOCAL_SERVER_STATUS_VIEWMODEL_V1';

const STANDARD_ACTIONS = Object.freeze([
  'LOCAL_SERVER_ENVIRONMENT_DOCTOR',
  'LOCAL_SERVER_INSTALL_OR_UPDATE',
  'LOCAL_SERVER_START',
  'LOCAL_SERVER_STOP',
  'LOCAL_SERVER_RESTART',
  'LOCAL_SERVER_HEALTH',
  'LOCAL_SERVER_BACKUP',
  'LOCAL_SERVER_RESTORE_SMOKE',
  'LOCAL_SERVER_LOG_BUNDLE',
]);

const TERMINAL_RECEIPT_STATUSES = new Set([
  'PASS',
  'FAILED_ROLLED_BACK',
  'FAILED_EXACT_BLOCKER',
  'BLOCKED_EXTERNAL',
  'CANCELLED',
]);

const DEFAULTS = Object.freeze({
  targetPc: 'YOLLA-USER-PC01',
  targetRoot: 'E:\\YOLLA',
  actionQueue: 'E:\\YOLLA\\agent\\state\\file-management\\action_queue',
  stateRoot: 'E:\\YOLLA\\agent\\state\\local-server-control-support',
  receiptRoot: 'E:\\YOLLA\\receipts\\d-group-local-server',
  serviceName: 'YOLLA-D-LOCAL-SERVER',
  bindScope: '127.0.0.1_ONLY',
});

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = canonicalize(value[key]);
      return out;
    }, {});
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function nowIso(clock) {
  return (clock ? clock() : new Date()).toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temp, file);
}

function replaceJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

function listJsonFilesRecursive(root) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) output.push(full);
    }
  }
  return output.sort();
}

function buildRollbackPlan(action, parameters = {}) {
  switch (action) {
    case 'LOCAL_SERVER_INSTALL_OR_UPDATE':
      return { required_on_failure: true, strategy: 'RESTORE_PRE_ACTION_SNAPSHOT_AND_PREVIOUS_COMPONENT_MANIFEST', executor_owner: 'D_GROUP' };
    case 'LOCAL_SERVER_START':
      return { required_on_failure: true, strategy: 'STOP_PARTIALLY_STARTED_SERVICE_AND_RESTORE_PRE_ACTION_STATUS', executor_owner: 'D_GROUP' };
    case 'LOCAL_SERVER_STOP':
      return {
        required_on_failure: true,
        strategy: parameters.pre_action_service_status === 'RUNNING' ? 'RESTART_SERVICE_TO_PRE_ACTION_STATUS' : 'RESTORE_PRE_ACTION_STATUS',
        executor_owner: 'D_GROUP',
      };
    case 'LOCAL_SERVER_RESTART':
      return { required_on_failure: true, strategy: 'RESTORE_PRE_ACTION_SERVICE_STATUS_AND_LAST_KNOWN_GOOD_CONFIG', executor_owner: 'D_GROUP' };
    case 'LOCAL_SERVER_RESTORE_SMOKE':
      return { required_on_failure: true, strategy: 'DELETE_ISOLATED_SMOKE_RESTORE_TARGET_ONLY', executor_owner: 'D_GROUP' };
    default:
      return { required_on_failure: false, strategy: 'NO_MUTATING_ROLLBACK_REQUIRED', executor_owner: 'D_GROUP' };
  }
}

function resolveConfig(input = {}) {
  return {
    targetPc: input.targetPc || DEFAULTS.targetPc,
    targetRoot: input.targetRoot || DEFAULTS.targetRoot,
    actionQueue: input.actionQueue || DEFAULTS.actionQueue,
    stateRoot: input.stateRoot || DEFAULTS.stateRoot,
    receiptRoot: input.receiptRoot || DEFAULTS.receiptRoot,
    serviceName: input.serviceName || DEFAULTS.serviceName,
    bindScope: input.bindScope || DEFAULTS.bindScope,
    clock: input.clock,
  };
}

function identityPayload(action, parameters, config) {
  return {
    schema_version: JOB_SCHEMA_VERSION,
    action,
    parameters: canonicalize(parameters || {}),
    target_pc: config.targetPc,
    target_root: config.targetRoot,
    service_name: config.serviceName,
    bind_scope: config.bindScope,
  };
}

function makeJobId(action, parameters, config) {
  const digest = sha256(canonicalJson(identityPayload(action, parameters, config)));
  return `LSJ-${action.replace(/^LOCAL_SERVER_/, '')}-${digest.slice(0, 20).toUpperCase()}`;
}

function makeJob(action, parameters = {}, inputConfig = {}) {
  if (!STANDARD_ACTIONS.includes(action)) throw new Error(`unsupported action: ${action}`);
  assertObject(parameters, 'parameters');
  const config = resolveConfig(inputConfig);
  const jobId = makeJobId(action, parameters, config);
  const createdAt = nowIso(config.clock);
  const idempotencyKey = sha256(canonicalJson(identityPayload(action, parameters, config)));
  return {
    schema_version: JOB_SCHEMA_VERSION,
    support_contract: SCHEMA_VERSION,
    job_id: jobId,
    idempotency_key: idempotencyKey,
    action,
    target: { pc: config.targetPc, root: config.targetRoot, service_name: config.serviceName, bind_scope: config.bindScope },
    transport: {
      type: 'LOCAL_DURABLE_FILE_QUEUE_V1',
      queue_path: config.actionQueue,
      existing_pc_agent_service: 'YOLLA-PROJECT-AGENT',
      new_runtime: false,
      new_transport: false,
    },
    ownership: { control_owner: 'A0', install_and_operation_owner: 'D_GROUP', a0_may_execute_install: false },
    parameters: canonicalize(parameters),
    rollback_plan: buildRollbackPlan(action, parameters),
    receipt_contract: {
      schema_version: RECEIPT_SCHEMA_VERSION,
      required_job_id: jobId,
      required_idempotency_key: idempotencyKey,
      receipt_root: config.receiptRoot,
    },
    lifecycle: { state: 'PREPARED', attempt: 1, created_at: createdAt, prepared_at: createdAt },
    constraints: { public_binding: false, production: false, ready: false, merge: false, raw_secret_in_job: false },
  };
}

function ledgerPaths(config) {
  return {
    jobs: path.join(config.stateRoot, 'jobs'),
    receiptsSeen: path.join(config.stateRoot, 'receipts-seen'),
    events: path.join(config.stateRoot, 'events'),
    viewmodel: path.join(config.stateRoot, 'LOCAL_SERVER_STATUS_VIEWMODEL.json'),
    lastReceipt: path.join(config.stateRoot, 'LAST_RECEIPT_POINTER.json'),
  };
}

function appendEvent(config, event) {
  const paths = ledgerPaths(config);
  ensureDir(paths.events);
  const eventId = `${Date.now()}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  writeJsonAtomic(path.join(paths.events, `${eventId}.json`), event);
}

function enqueueJob(action, parameters = {}, inputConfig = {}) {
  const config = resolveConfig(inputConfig);
  const paths = ledgerPaths(config);
  ensureDir(config.actionQueue);
  ensureDir(paths.jobs);
  const job = makeJob(action, parameters, config);
  const ledgerFile = path.join(paths.jobs, `${job.job_id}.json`);
  const queueFile = path.join(config.actionQueue, `${job.job_id}.json`);

  if (fs.existsSync(ledgerFile)) {
    const existing = readJson(ledgerFile);
    if (existing.idempotency_key !== job.idempotency_key) throw new Error(`job identity collision: ${job.job_id}`);
    return { status: 'DUPLICATE_SUPPRESSED', job: existing, queue_file: fs.existsSync(queueFile) ? queueFile : null, ledger_file: ledgerFile, write_count: 0 };
  }

  const dispatchedAt = nowIso(config.clock);
  job.lifecycle.state = 'QUEUED';
  job.lifecycle.queued_at = dispatchedAt;
  writeJsonAtomic(ledgerFile, job);
  try {
    writeJsonAtomic(queueFile, job);
  } catch (error) {
    fs.rmSync(ledgerFile, { force: true });
    throw error;
  }
  appendEvent(config, {
    schema_version: 'LOCAL_SERVER_CONTROL_EVENT_V1', event: 'JOB_QUEUED', job_id: job.job_id,
    idempotency_key: job.idempotency_key, action: job.action, occurred_at: dispatchedAt,
  });
  return { status: 'QUEUED', job, queue_file: queueFile, ledger_file: ledgerFile, write_count: 2 };
}

function validateReceipt(receipt, expectedJob) {
  assertObject(receipt, 'receipt');
  if (receipt.schema_version !== RECEIPT_SCHEMA_VERSION) throw new Error('invalid receipt schema');
  if (!receipt.job_id || !receipt.idempotency_key || !receipt.status) throw new Error('receipt identity incomplete');
  if (expectedJob) {
    if (receipt.job_id !== expectedJob.job_id) throw new Error('receipt job_id mismatch');
    if (receipt.idempotency_key !== expectedJob.idempotency_key) throw new Error('receipt idempotency mismatch');
  }
  if (!TERMINAL_RECEIPT_STATUSES.has(receipt.status) && receipt.status !== 'RUNNING' && receipt.status !== 'ACCEPTED') {
    throw new Error(`unsupported receipt status: ${receipt.status}`);
  }
  return true;
}

function findLatestReceipts(config) {
  const receipts = [];
  for (const file of listJsonFilesRecursive(config.receiptRoot)) {
    try {
      const receipt = readJson(file);
      if (receipt.schema_version !== RECEIPT_SCHEMA_VERSION) continue;
      validateReceipt(receipt);
      receipts.push({ file, receipt });
    } catch (_) {}
  }
  receipts.sort((a, b) => {
    const aTime = a.receipt.completed_at || a.receipt.updated_at || a.receipt.accepted_at || '';
    const bTime = b.receipt.completed_at || b.receipt.updated_at || b.receipt.accepted_at || '';
    return aTime.localeCompare(bTime) || a.file.localeCompare(b.file);
  });
  return receipts;
}

function deriveServiceStatus(receipt, current) {
  if (!receipt) return current || 'UNKNOWN';
  if (receipt.service_status) return receipt.service_status;
  if (receipt.status === 'RUNNING') return 'STARTING';
  if (receipt.status === 'FAILED_EXACT_BLOCKER' || receipt.status === 'BLOCKED_EXTERNAL') return 'DEGRADED';
  if (receipt.status === 'FAILED_ROLLED_BACK') return current || 'UNKNOWN';
  switch (receipt.action) {
    case 'LOCAL_SERVER_START':
    case 'LOCAL_SERVER_RESTART': return receipt.status === 'PASS' ? 'RUNNING' : (current || 'UNKNOWN');
    case 'LOCAL_SERVER_STOP': return receipt.status === 'PASS' ? 'STOPPED' : (current || 'UNKNOWN');
    case 'LOCAL_SERVER_HEALTH': return receipt.status === 'PASS' ? (receipt.health_status || current || 'RUNNING') : 'DEGRADED';
    default: return current || 'UNKNOWN';
  }
}

function reconcile(inputConfig = {}) {
  const config = resolveConfig(inputConfig);
  const paths = ledgerPaths(config);
  ensureDir(paths.jobs);
  ensureDir(paths.receiptsSeen);
  ensureDir(config.actionQueue);

  const jobs = listJsonFilesRecursive(paths.jobs).map(file => ({ file, job: readJson(file) }));
  const receipts = findLatestReceipts(config);
  const receiptByJob = new Map();
  let missedEventRecoveryCount = 0;
  let duplicateReceiptCount = 0;

  for (const item of receipts) {
    const digest = sha256(fs.readFileSync(item.file));
    const seenFile = path.join(paths.receiptsSeen, `${digest}.json`);
    if (fs.existsSync(seenFile)) duplicateReceiptCount += 1;
    else {
      writeJsonAtomic(seenFile, {
        schema_version: 'LOCAL_SERVER_RECEIPT_SEEN_V1', receipt_sha256: digest,
        receipt_path: item.file, job_id: item.receipt.job_id, seen_at: nowIso(config.clock),
      });
      missedEventRecoveryCount += 1;
    }
    const existing = receiptByJob.get(item.receipt.job_id);
    const time = item.receipt.completed_at || item.receipt.updated_at || item.receipt.accepted_at || '';
    const existingTime = existing ? (existing.receipt.completed_at || existing.receipt.updated_at || existing.receipt.accepted_at || '') : '';
    if (!existing || time >= existingTime) receiptByJob.set(item.receipt.job_id, item);
  }

  let restartRecoveryCount = 0;
  let serviceStatus = 'UNKNOWN';
  const actionStates = {};
  const jobStates = [];
  let lastReceipt = null;

  for (const { file, job } of jobs) {
    const receiptItem = receiptByJob.get(job.job_id);
    const queueFile = path.join(config.actionQueue, `${job.job_id}.json`);
    let state = job.lifecycle && job.lifecycle.state || 'UNKNOWN';

    if (receiptItem) {
      validateReceipt(receiptItem.receipt, job);
      const receipt = receiptItem.receipt;
      state = TERMINAL_RECEIPT_STATUSES.has(receipt.status) ? 'TERMINAL' : receipt.status;
      serviceStatus = deriveServiceStatus(receipt, serviceStatus);
      lastReceipt = receiptItem;
      replaceJsonAtomic(file, {
        ...job,
        lifecycle: {
          ...(job.lifecycle || {}), state, last_receipt_status: receipt.status,
          last_receipt_at: receipt.completed_at || receipt.updated_at || receipt.accepted_at || nowIso(config.clock),
          last_receipt_path: receiptItem.file,
        },
      });
      actionStates[job.action] = receipt.status;
    } else if ((state === 'PREPARED' || state === 'QUEUED' || state === 'ACCEPTED' || state === 'RUNNING') && !fs.existsSync(queueFile)) {
      const recovered = {
        ...job,
        lifecycle: {
          ...(job.lifecycle || {}), state: 'QUEUED', restart_recovered_at: nowIso(config.clock),
          recovery_count: Number(job.lifecycle && job.lifecycle.recovery_count || 0) + 1,
        },
      };
      writeJsonAtomic(queueFile, recovered);
      replaceJsonAtomic(file, recovered);
      restartRecoveryCount += 1;
      state = 'QUEUED';
      actionStates[job.action] = 'QUEUED';
    } else actionStates[job.action] = state;

    jobStates.push({ job_id: job.job_id, action: job.action, state, receipt_status: receiptItem ? receiptItem.receipt.status : null, queue_file_present: fs.existsSync(queueFile) });
  }

  const activeJobs = jobStates.filter(item => !['TERMINAL', 'CANCELLED'].includes(item.state));
  const viewmodel = {
    schema_version: VIEWMODEL_SCHEMA_VERSION,
    support_contract: SCHEMA_VERSION,
    generated_at: nowIso(config.clock),
    target: { pc: config.targetPc, root: config.targetRoot, service_name: config.serviceName, bind_scope: config.bindScope },
    service: { status: serviceStatus, install_owner: 'D_GROUP', control_owner: 'A0', public_binding: false, production: false },
    queue: {
      path: config.actionQueue, pending_count: activeJobs.length, total_job_count: jobStates.length,
      duplicate_execution_count: 0, duplicate_receipt_count: duplicateReceiptCount,
    },
    recovery: {
      restart_recovery_count: restartRecoveryCount,
      missed_event_recovery_count: missedEventRecoveryCount,
      duplicate_event_suppression: true,
      rollback_on_failed_reversible_action: true,
    },
    active_job: activeJobs[0] || null,
    jobs: jobStates,
    action_status: actionStates,
    last_receipt_pointer: lastReceipt ? {
      path: lastReceipt.file, job_id: lastReceipt.receipt.job_id, status: lastReceipt.receipt.status,
      completed_at: lastReceipt.receipt.completed_at || null,
    } : null,
    terminal: jobStates.length > 0 && activeJobs.length === 0 ? 'ALL_OBSERVED_JOBS_TERMINAL' : 'CONTROL_SUPPORT_ACTIVE',
  };

  replaceJsonAtomic(paths.viewmodel, viewmodel);
  if (viewmodel.last_receipt_pointer) replaceJsonAtomic(paths.lastReceipt, viewmodel.last_receipt_pointer);
  appendEvent(config, {
    schema_version: 'LOCAL_SERVER_CONTROL_EVENT_V1', event: 'STATE_RECONCILED', occurred_at: viewmodel.generated_at,
    restart_recovery_count: restartRecoveryCount, missed_event_recovery_count: missedEventRecoveryCount, pending_count: activeJobs.length,
  });
  return viewmodel;
}

function createReceipt(job, status, extra = {}, inputConfig = {}) {
  const config = resolveConfig(inputConfig);
  if (!job || job.schema_version !== JOB_SCHEMA_VERSION) throw new Error('invalid job');
  const timestamp = nowIso(config.clock);
  const receipt = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    job_id: job.job_id,
    idempotency_key: job.idempotency_key,
    action: job.action,
    status,
    accepted_at: extra.accepted_at || timestamp,
    updated_at: extra.updated_at || timestamp,
    completed_at: TERMINAL_RECEIPT_STATUSES.has(status) ? (extra.completed_at || timestamp) : null,
    service_status: extra.service_status || null,
    health_status: extra.health_status || null,
    result: extra.result || {},
    blocker: extra.blocker || null,
    rollback: extra.rollback || null,
    executor_owner: 'D_GROUP',
    production: false,
    ready: false,
    merge: false,
  };
  validateReceipt(receipt, job);
  return receipt;
}

module.exports = {
  DEFAULTS,
  JOB_SCHEMA_VERSION,
  RECEIPT_SCHEMA_VERSION,
  SCHEMA_VERSION,
  STANDARD_ACTIONS,
  VIEWMODEL_SCHEMA_VERSION,
  buildRollbackPlan,
  canonicalJson,
  createReceipt,
  enqueueJob,
  makeJob,
  reconcile,
  validateReceipt,
};
