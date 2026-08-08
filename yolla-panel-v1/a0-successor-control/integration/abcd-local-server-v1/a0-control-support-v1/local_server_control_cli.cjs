#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS, STANDARD_ACTIONS, enqueueJob, reconcile } = require('./local_server_control_support.cjs');

function parseJson(value, name) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('must be an object');
    return parsed;
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${error.message}`);
  }
}

function configFromEnv() {
  return {
    targetPc: process.env.YOLLA_TARGET_PC || DEFAULTS.targetPc,
    targetRoot: process.env.YOLLA_TARGET_ROOT || DEFAULTS.targetRoot,
    actionQueue: process.env.YOLLA_PC_AGENT_ACTION_QUEUE || DEFAULTS.actionQueue,
    stateRoot: process.env.YOLLA_LOCAL_SERVER_CONTROL_STATE_ROOT || DEFAULTS.stateRoot,
    receiptRoot: process.env.YOLLA_LOCAL_SERVER_RECEIPT_ROOT || DEFAULTS.receiptRoot,
    serviceName: process.env.YOLLA_LOCAL_SERVER_SERVICE_NAME || DEFAULTS.serviceName,
    bindScope: '127.0.0.1_ONLY',
  };
}

function usage() {
  return [
    'Usage:',
    '  node local_server_control_cli.cjs enqueue <STANDARD_ACTION> [PARAMETERS_JSON]',
    '  node local_server_control_cli.cjs reconcile',
    '  node local_server_control_cli.cjs status',
    '  node local_server_control_cli.cjs catalog',
    '',
    'Environment overrides:',
    '  YOLLA_PC_AGENT_ACTION_QUEUE',
    '  YOLLA_LOCAL_SERVER_CONTROL_STATE_ROOT',
    '  YOLLA_LOCAL_SERVER_RECEIPT_ROOT',
    '  YOLLA_TARGET_PC',
    '  YOLLA_TARGET_ROOT',
    '',
    'This CLI never installs or operates the local server itself. It only writes canonical jobs',
    'to the existing PC Agent file queue and reduces D-group receipts into a status ViewModel.',
  ].join('\n');
}

function main(argv) {
  const [command, arg1, arg2] = argv;
  const config = configFromEnv();
  switch (command) {
    case 'enqueue': {
      if (!arg1) throw new Error('STANDARD_ACTION is required');
      process.stdout.write(`${JSON.stringify(enqueueJob(arg1, parseJson(arg2, 'PARAMETERS_JSON'), config), null, 2)}\n`);
      return 0;
    }
    case 'reconcile':
      process.stdout.write(`${JSON.stringify(reconcile(config), null, 2)}\n`);
      return 0;
    case 'status': {
      const file = path.join(config.stateRoot, 'LOCAL_SERVER_STATUS_VIEWMODEL.json');
      if (!fs.existsSync(file)) {
        process.stdout.write(`${JSON.stringify({ status: 'NOT_YET_GENERATED', path: file }, null, 2)}\n`);
        return 2;
      }
      process.stdout.write(fs.readFileSync(file, 'utf8'));
      return 0;
    }
    case 'catalog':
      process.stdout.write(`${JSON.stringify({ standard_actions: STANDARD_ACTIONS }, null, 2)}\n`);
      return 0;
    case '--help':
    case '-h':
    case undefined:
      process.stdout.write(`${usage()}\n`);
      return 0;
    default:
      throw new Error(`unsupported command: ${command}`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
