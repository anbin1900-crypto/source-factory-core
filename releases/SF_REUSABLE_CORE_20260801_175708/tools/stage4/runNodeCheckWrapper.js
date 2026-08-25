'use strict';

const { spawn } = require('child_process');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_NODE_COMMAND = process.execPath || 'node';

function nowMs() {
  return Date.now();
}

function toSafeString(value, fallback) {
  if (value === undefined || value === null) {
    return fallback || '';
  }

  return String(value);
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [String(value)];
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function buildNodeCheckResult(input) {
  const source = input && typeof input === 'object' ? input : {};

  return {
    ok: Boolean(source.ok),
    status: toSafeString(source.status, 'ERROR'),
    tool: 'node --check',
    nodeCommand: toSafeString(source.nodeCommand, DEFAULT_NODE_COMMAND),
    filePath: toSafeString(source.filePath, ''),
    cwd: toSafeString(source.cwd, process.cwd()),
    exitCode: source.exitCode === undefined || source.exitCode === null ? null : source.exitCode,
    stdout: toSafeString(source.stdout, ''),
    stderr: toSafeString(source.stderr, ''),
    errorMessage: toSafeString(source.errorMessage, ''),
    durationMs: Number.isFinite(source.durationMs) ? source.durationMs : 0
  };
}

function runNodeCheck(input) {
  const startedAt = nowMs();
  const source = input && typeof input === 'object' ? input : {};
  const filePath = toSafeString(source.filePath || source.file, '');
  const cwd = toSafeString(source.cwd, process.cwd());
  const timeoutMs = toPositiveInteger(source.timeoutMs, DEFAULT_TIMEOUT_MS);
  const nodeCommand = toSafeString(source.nodeCommand || source.node, DEFAULT_NODE_COMMAND).trim() || DEFAULT_NODE_COMMAND;

  if (!filePath.trim()) {
    return Promise.resolve(
      buildNodeCheckResult({
        ok: false,
        status: 'ERROR',
        nodeCommand,
        filePath,
        cwd,
        exitCode: null,
        stdout: '',
        stderr: '',
        errorMessage: 'filePath is required',
        durationMs: nowMs() - startedAt
      })
    );
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(
        buildNodeCheckResult({
          ...result,
          nodeCommand,
          filePath,
          cwd,
          stdout,
          stderr,
          durationMs: nowMs() - startedAt
        })
      );
    };

    const child = spawn(nodeCommand, ['--check', filePath], {
      cwd,
      shell: false,
      windowsHide: true
    });

    const timer = setTimeout(() => {
      timedOut = true;

      try {
        child.kill('SIGTERM');
      } catch (error) {
        stderr += `${stderr ? '\n' : ''}${error && error.message ? error.message : String(error)}`;
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);

      const message = error && error.message ? error.message : String(error);
      const code = error && error.code ? String(error.code) : '';

      if (code === 'ENOENT') {
        finish({
          ok: false,
          status: 'TOOL_MISSING',
          exitCode: null,
          errorMessage: `Node command not found: ${nodeCommand}`
        });
        return;
      }

      finish({
        ok: false,
        status: 'ERROR',
        exitCode: null,
        errorMessage: message
      });
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);

      if (timedOut) {
        finish({
          ok: false,
          status: 'ERROR',
          exitCode,
          errorMessage: `node --check timed out after ${timeoutMs}ms`
        });
        return;
      }

      finish({
        ok: exitCode === 0,
        status: exitCode === 0 ? 'PASS' : 'FAIL',
        exitCode,
        errorMessage: exitCode === 0 ? '' : `node --check exited with code ${exitCode}`
      });
    });
  });
}

async function runNodeCheckBatch(input) {
  const startedAt = nowMs();
  const source = input && typeof input === 'object' ? input : {};
  const files = toArray(source.files || source.filePaths || source.filePath || source.file);
  const cwd = toSafeString(source.cwd, process.cwd());
  const timeoutMs = toPositiveInteger(source.timeoutMs, DEFAULT_TIMEOUT_MS);
  const nodeCommand = toSafeString(source.nodeCommand || source.node, DEFAULT_NODE_COMMAND).trim() || DEFAULT_NODE_COMMAND;

  if (files.length === 0) {
    return {
      ok: false,
      status: 'ERROR',
      tool: 'node --check batch',
      nodeCommand,
      cwd,
      total: 0,
      passed: 0,
      failed: 0,
      results: [],
      errorMessage: 'at least one file is required',
      durationMs: nowMs() - startedAt
    };
  }

  const results = await Promise.all(
    files.map((filePath) => runNodeCheck({
      filePath,
      cwd,
      timeoutMs,
      nodeCommand
    }))
  );

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;

  return {
    ok: failed === 0,
    status: failed === 0 ? 'PASS' : 'FAIL',
    tool: 'node --check batch',
    nodeCommand,
    cwd,
    total: results.length,
    passed,
    failed,
    results,
    errorMessage: failed === 0 ? '' : `${failed} node --check result(s) failed`,
    durationMs: nowMs() - startedAt
  };
}

function parseCliArgs(argv) {
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  const files = [];
  let cwd = process.cwd();
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let nodeCommand = DEFAULT_NODE_COMMAND;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--file') {
      if (tokens[index + 1]) {
        files.push(String(tokens[index + 1]));
      }
      index += 1;
      continue;
    }

    if (token === '--cwd') {
      cwd = toSafeString(tokens[index + 1], cwd);
      index += 1;
      continue;
    }

    if (token === '--timeoutMs') {
      timeoutMs = toPositiveInteger(tokens[index + 1], DEFAULT_TIMEOUT_MS);
      index += 1;
      continue;
    }

    if (token === '--node') {
      nodeCommand = toSafeString(tokens[index + 1], DEFAULT_NODE_COMMAND);
      index += 1;
      continue;
    }

    if (token && !token.startsWith('--')) {
      files.push(String(token));
    }
  }

  return {
    files,
    cwd,
    timeoutMs,
    nodeCommand
  };
}

async function runCli() {
  const parsed = parseCliArgs(process.argv.slice(2));
  const result = parsed.files.length === 1
    ? await runNodeCheck({
      filePath: parsed.files[0],
      cwd: parsed.cwd,
      timeoutMs: parsed.timeoutMs,
      nodeCommand: parsed.nodeCommand
    })
    : await runNodeCheckBatch(parsed);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    const result = buildNodeCheckResult({
      ok: false,
      status: 'ERROR',
      nodeCommand: DEFAULT_NODE_COMMAND,
      filePath: '',
      cwd: process.cwd(),
      exitCode: null,
      stdout: '',
      stderr: '',
      errorMessage: error && error.message ? error.message : String(error),
      durationMs: 0
    });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_NODE_COMMAND,
  runNodeCheck,
  runNodeCheckBatch,
  parseCliArgs
};