#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PATCH_START = '/* YOLLA_PC_AGENT_STAGE4_BRIDGE_V1_START */';
const PATCH_END = '/* YOLLA_PC_AGENT_STAGE4_BRIDGE_V1_END */';
const DISPATCH_SIGNATURE = 'async function handleStage4DispatchNextPrompt(event, payload, deps) {';
const DISPATCH_ORIGINAL_SIGNATURE = 'async function handleStage4DispatchNextPrompt__PC_AGENT_ORIGINAL(event, payload, deps) {';
const RUN_SIGNATURE = 'async function handleStage4RunCheck(event, payload, deps) {';
const RUN_ORIGINAL_SIGNATURE = 'async function handleStage4RunCheck__PC_AGENT_ORIGINAL(event, payload, deps) {';
const INSERT_ANCHOR = 'async function handleStage4ManageResource(event, payload, deps) {';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function countOf(source, needle) {
  return source.split(needle).length - 1;
}

function patchBlock() {
  return `${PATCH_START}
var __yollaPcAgentBridgePath = require('path');
var __yollaPcAgentBridgeAdapter = null;

function __yollaResolvePcAgentBridgeAdapter() {
  if (__yollaPcAgentBridgeAdapter) return __yollaPcAgentBridgeAdapter;
  try {
    __yollaPcAgentBridgeAdapter = require(__yollaPcAgentBridgePath.join(
      __dirname, '..', '..', 'src', 'shared', 'stage4', 'pcAgentBridgeAdapter'
    ));
  } catch (_error) {
    __yollaPcAgentBridgeAdapter = null;
  }
  return __yollaPcAgentBridgeAdapter;
}

function __yollaPcAgentBridgeOptions(deps) {
  var services = deps && typeof deps === 'object' ? deps : {};
  return services.pcAgentBridgeOptions && typeof services.pcAgentBridgeOptions === 'object'
    ? services.pcAgentBridgeOptions
    : {};
}

async function handleStage4DispatchNextPrompt(event, payload, deps) {
  var originalResponse = await handleStage4DispatchNextPrompt__PC_AGENT_ORIGINAL(event, payload, deps);
  var adapter = __yollaResolvePcAgentBridgeAdapter();
  var input = normalizePayload(payload);
  if (!adapter || !adapter.isEnabled(input, __yollaPcAgentBridgeOptions(deps))) {
    return originalResponse;
  }
  try {
    var bridgeResult = adapter.dispatchWorkRequest(input, Object.assign(
      { source: 'handleStage4DispatchNextPrompt' },
      __yollaPcAgentBridgeOptions(deps)
    ));
    return adapter.enhanceDispatchResponse(originalResponse, bridgeResult);
  } catch (error) {
    return adapter.enhanceDispatchResponse(originalResponse, {
      pc_agent_dispatched: false,
      dispatch_status: 'fallback',
      reason: 'PC_AGENT_DISPATCH_ADAPTER_ERROR',
      error: { message: error && error.message ? error.message : String(error) }
    });
  }
}

async function handleStage4RunCheck(event, payload, deps) {
  var adapter = __yollaResolvePcAgentBridgeAdapter();
  var input = normalizePayload(payload);
  if (!adapter || !adapter.hasWorkIdentity(input)) {
    return handleStage4RunCheck__PC_AGENT_ORIGINAL(event, payload, deps);
  }

  var bridgeResult;
  try {
    bridgeResult = adapter.readWorkResult(input, __yollaPcAgentBridgeOptions(deps));
  } catch (error) {
    bridgeResult = {
      available: false,
      status: 'invalid',
      reason: 'PC_AGENT_RESULT_ADAPTER_ERROR',
      error: { message: error && error.message ? error.message : String(error) }
    };
  }

  if (!bridgeResult.available) {
    var pendingFallback = await handleStage4RunCheck__PC_AGENT_ORIGINAL(event, payload, deps);
    return adapter.enhancePendingResultResponse(pendingFallback, bridgeResult);
  }

  var collectorPayload = adapter.toCollectorPayload(bridgeResult.result, input);
  var collectorResponse = await handleStage4RunCheck__PC_AGENT_ORIGINAL(event, collectorPayload, deps);
  var storageResponse = null;
  try {
    storageResponse = await handleStage4AppendStationRecords(
      event,
      adapter.toStoragePayload(bridgeResult.result, input),
      deps
    );
  } catch (storageError) {
    storageResponse = {
      ok: false,
      error: {
        code: 'PC_AGENT_RESULT_STORAGE_FAILED',
        message: storageError && storageError.message ? storageError.message : String(storageError)
      }
    };
  }
  return adapter.enhanceResultResponse(collectorResponse, bridgeResult.result, storageResponse);
}
${PATCH_END}

`;
}

function buildPatchedSource(source) {
  if (source.includes(PATCH_START)) {
    return { changed: false, source, status: 'ALREADY_PATCHED' };
  }
  const counts = {
    dispatch: countOf(source, DISPATCH_SIGNATURE),
    run: countOf(source, RUN_SIGNATURE),
    anchor: countOf(source, INSERT_ANCHOR),
  };
  if (counts.dispatch !== 1 || counts.run !== 1 || counts.anchor !== 1) {
    const error = new Error('PATCH_ANCHOR_COUNT_INVALID:' + JSON.stringify(counts));
    error.code = 'PATCH_ANCHOR_COUNT_INVALID';
    throw error;
  }
  let patched = source.replace(DISPATCH_SIGNATURE, DISPATCH_ORIGINAL_SIGNATURE);
  patched = patched.replace(RUN_SIGNATURE, RUN_ORIGINAL_SIGNATURE);
  patched = patched.replace(INSERT_ANCHOR, patchBlock() + INSERT_ANCHOR);
  if (countOf(patched, PATCH_START) !== 1 || countOf(patched, PATCH_END) !== 1) {
    throw new Error('PATCH_MARKER_COUNT_INVALID');
  }
  return { changed: true, source: patched, status: 'PATCHED' };
}

function parseArgs(argv) {
  const result = { target: '', checkOnly: false, output: '', expectedSha256: '' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--target') result.target = argv[++index] || '';
    else if (token === '--output') result.output = argv[++index] || '';
    else if (token === '--expected-sha256') result.expectedSha256 = (argv[++index] || '').toLowerCase();
    else if (token === '--check-only') result.checkOnly = true;
    else throw new Error('UNKNOWN_ARGUMENT:' + token);
  }
  if (!result.target) throw new Error('TARGET_REQUIRED');
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  const target = path.resolve(args.target);
  const originalBytes = fs.readFileSync(target);
  const originalSha256 = sha256(originalBytes);
  if (args.expectedSha256 && originalSha256 !== args.expectedSha256) {
    throw new Error('TARGET_SHA256_MISMATCH expected=' + args.expectedSha256 + ' actual=' + originalSha256);
  }
  const result = buildPatchedSource(originalBytes.toString('utf8'));
  const patchedBytes = Buffer.from(result.source, 'utf8');
  const patchedSha256 = sha256(patchedBytes);
  const output = args.output ? path.resolve(args.output) : target;

  if (args.checkOnly) {
    process.stdout.write(JSON.stringify({
      status: result.status,
      changed: result.changed,
      target,
      original_sha256: originalSha256,
      patched_sha256: patchedSha256,
      output: null
    }) + '\n');
    return;
  }

  const outputDir = path.dirname(output);
  fs.mkdirSync(outputDir, { recursive: true });

  // Keep the replacement file on the same volume as the destination. Using
  // os.tmpdir() caused EXDEV on Windows when TEMP was on C: and Source Factory
  // was on E:. The target-directory staging file also preserves atomic rename
  // where Windows permits replacing the destination.
  const tempDir = fs.mkdtempSync(path.join(outputDir, '.sf-pc-agent-patch-'));
  const tempFile = path.join(tempDir, path.basename(output));
  let writeStrategy = 'NOT_WRITTEN';
  try {
    fs.writeFileSync(tempFile, patchedBytes, { flag: 'wx' });
    const checked = childProcess.spawnSync(process.execPath, ['--check', tempFile], {
      encoding: 'utf8', shell: false
    });
    if (checked.status !== 0) {
      throw new Error('PATCHED_NODE_CHECK_FAILED:' + (checked.stderr || checked.stdout || 'unknown'));
    }

    let backupPath = null;
    if (output === target && result.changed) {
      backupPath = target + '.pre-pc-agent-bridge.' + Date.now() + '.bak';
      fs.copyFileSync(target, backupPath, fs.constants.COPYFILE_EXCL);
    }

    try {
      fs.renameSync(tempFile, output);
      writeStrategy = 'SAME_DIRECTORY_ATOMIC_RENAME';
    } catch (error) {
      const fallbackCodes = new Set(['EXDEV', 'EPERM', 'EACCES', 'EEXIST']);
      if (!fallbackCodes.has(error && error.code)) throw error;
      fs.copyFileSync(tempFile, output);
      fs.rmSync(tempFile, { force: true });
      writeStrategy = 'VERIFIED_COPY_FALLBACK_' + error.code;
    }

    const writtenBytes = fs.readFileSync(output);
    const writtenSha256 = sha256(writtenBytes);
    if (writtenSha256 !== patchedSha256) {
      const error = new Error('PATCHED_OUTPUT_SHA256_MISMATCH expected=' + patchedSha256 + ' actual=' + writtenSha256);
      error.code = 'PATCHED_OUTPUT_SHA256_MISMATCH';
      throw error;
    }
    const outputCheck = childProcess.spawnSync(process.execPath, ['--check', output], {
      encoding: 'utf8', shell: false
    });
    if (outputCheck.status !== 0) {
      throw new Error('PATCHED_OUTPUT_NODE_CHECK_FAILED:' + (outputCheck.stderr || outputCheck.stdout || 'unknown'));
    }

    process.stdout.write(JSON.stringify({
      status: result.status,
      changed: result.changed,
      target,
      original_sha256: originalSha256,
      patched_sha256: patchedSha256,
      written_sha256: writtenSha256,
      output,
      backup_path: backupPath,
      temp_parent: outputDir,
      write_strategy: writeStrategy,
      node_check: 'PASS',
      output_node_check: 'PASS'
    }) + '\n');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(JSON.stringify({
      status: 'FAIL',
      code: error && error.code ? error.code : 'PATCH_FAILED',
      message: error && error.message ? error.message : String(error)
    }) + '\n');
    process.exitCode = 2;
  }
}

module.exports = { buildPatchedSource, patchBlock };
