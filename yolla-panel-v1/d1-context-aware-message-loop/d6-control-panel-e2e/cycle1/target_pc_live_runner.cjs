'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ContextAwareMessageLoop } = require('./context_aware_message_loop.cjs');

function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  throw e;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

function loadExistingAdapter() {
  const adapterPath = readArg('--adapter') || process.env.YOLLA_EXISTING_BROWSER_AGENT_ADAPTER;
  if (!adapterPath) fail('EXISTING_BROWSER_AGENT_ADAPTER_NOT_BOUND');
  const resolved = path.resolve(adapterPath);
  if (!fs.existsSync(resolved)) fail('EXISTING_BROWSER_AGENT_ADAPTER_NOT_FOUND', resolved);
  const mod = require(resolved);
  const factory = typeof mod.createContextAwareMessageAdapters === 'function'
    ? mod.createContextAwareMessageAdapters
    : typeof mod.createAdapters === 'function'
      ? mod.createAdapters
      : null;
  if (!factory) fail('EXISTING_BROWSER_AGENT_ADAPTER_FACTORY_MISSING');
  const adapters = factory();
  for (const name of ['identifyContext','sendMessage','readStatus','fetchReply']) {
    if (!adapters || typeof adapters[name] !== 'function') fail(`EXISTING_BROWSER_AGENT_ADAPTER_${name.toUpperCase()}_MISSING`);
  }
  return adapters;
}

async function main() {
  const inputPath = readArg('--input');
  if (!inputPath) fail('LIVE_INPUT_PATH_REQUIRED');
  const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const adapters = loadExistingAdapter();
  const loop = new ContextAwareMessageLoop(adapters, {
    maxPolls: Number(input.max_polls || 120),
    pollDelayMs: Number(input.poll_delay_ms || 1000)
  });
  const result = await loop.run(input);
  const outputPath = readArg('--output');
  if (outputPath) fs.writeFileSync(path.resolve(outputPath), JSON.stringify(result, null, 2), 'utf8');
  if (!result.ok) process.exitCode = 42;
  else if (result.run.result_return_status !== 'RETURNED_TO_D1') process.exitCode = 43;
}

main().catch((error) => {
  console.error(JSON.stringify({ok:false,code:error.code || 'D6_LIVE_RUNNER_ERROR',message:error.message}));
  process.exitCode = 41;
});
