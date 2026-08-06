#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REQUIRED = [
  'process_count',
  'private_bytes',
  'renderer_count',
  'webcontents_count',
  'listener_count',
  'timer_count',
  'log_entries',
  'closed_background_active'
];

function fail(message) {
  const error = new Error(message);
  error.code = 'A7_RUNTIME_BRIDGE_EXACT_BLOCKER';
  throw error;
}

function writeContext(context) {
  const file = path.join(os.tmpdir(), `yolla-a7-${process.pid}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`);
  fs.writeFileSync(file, JSON.stringify(context, null, 2), 'utf8');
  return file;
}

function invokePowerShell(script, args, context) {
  if (!script || !fs.existsSync(script)) fail(`DRIVER_NOT_FOUND:${script || '<empty>'}`);
  const contextPath = writeContext(context);
  try {
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args, '-ContextPath', contextPath],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
    );
    if (result.error) fail(`DRIVER_START_FAILED:${result.error.message}`);
    if (result.status !== 0) fail(`DRIVER_EXIT_${result.status}:${(result.stderr || result.stdout || '').trim()}`);
    return (result.stdout || '').trim();
  } finally {
    try { fs.unlinkSync(contextPath); } catch {}
  }
}

function validateSnapshot(value) {
  for (const key of REQUIRED) {
    if (!Number.isFinite(Number(value[key]))) fail(`REQUIRED_METRIC_MISSING:${key}`);
    value[key] = Number(value[key]);
  }
  return value;
}

async function createAdapter(context = {}) {
  const actionDriver = process.env.YOLLA_A7_ACTION_DRIVER || '';
  const snapshotDriver = process.env.YOLLA_A7_SNAPSHOT_DRIVER || '';
  if (!actionDriver || !snapshotDriver) fail('A6_RUNTIME_ACTION_OR_SNAPSHOT_DRIVER_REQUIRED');

  async function action(operation, callContext) {
    invokePowerShell(actionDriver, ['-Operation', operation], { ...context, ...callContext, operation });
  }

  return {
    name: 'A7_TARGET_PC_RUNTIME_BRIDGE_V1',
    version: '1.0.0',
    capabilities: {
      real_target_pc_driver: true,
      fail_closed_required_metrics: REQUIRED,
      action_driver: path.basename(actionDriver),
      snapshot_driver: path.basename(snapshotDriver)
    },
    async snapshot(callContext) {
      const stdout = invokePowerShell(snapshotDriver, [], { ...context, ...callContext, operation: 'snapshot' });
      let parsed;
      try { parsed = JSON.parse(stdout); } catch (error) { fail(`SNAPSHOT_JSON_INVALID:${error.message}`); }
      return validateSnapshot(parsed);
    },
    async openBrowser(callContext) { await action('openBrowser', callContext); },
    async activateBrowser(callContext) { await action('activateBrowser', callContext); },
    async switchSeat(callContext) { await action('switchSeat', callContext); },
    async hideBrowser(callContext) { await action('hideBrowser', callContext); },
    async closeBrowser(callContext) { await action('closeBrowser', callContext); },
    async reopenBrowser(callContext) { await action('reopenBrowser', callContext); },
    async shutdown(callContext) { await action('shutdown', callContext); }
  };
}

module.exports = { createAdapter };
