'use strict';

const { spawn } = require('child_process');

const DEFAULT_TIMEOUT_MS = 30000;

function nowMs() {
  return Date.now();
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

function buildResult({
  ok,
  status,
  command,
  args,
  cwd,
  exitCode,
  stdout,
  stderr,
  errorMessage,
  durationMs
}) {
  return {
    ok: Boolean(ok),
    status: String(status || 'UNKNOWN'),
    command: command ? String(command) : '',
    args: toArray(args),
    cwd: cwd ? String(cwd) : process.cwd(),
    exitCode: exitCode === null || exitCode === undefined ? null : exitCode,
    stdout: stdout || '',
    stderr: stderr || '',
    errorMessage: errorMessage || '',
    durationMs: Number.isFinite(durationMs) ? durationMs : 0
  };
}

function runCmd(input) {
  const startedAt = nowMs();
  const options = input && typeof input === 'object' ? input : {};
  const command = options.command ? String(options.command) : '';
  const args = toArray(options.args);
  const cwd = options.cwd ? String(options.cwd) : process.cwd();
  const timeoutMs = toPositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);

  if (!command.trim()) {
    return Promise.resolve(
      buildResult({
        ok: false,
        status: 'INVALID_COMMAND',
        command,
        args,
        cwd,
        exitCode: null,
        stdout: '',
        stderr: '',
        errorMessage: 'command is required',
        durationMs: nowMs() - startedAt
      })
    );
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true
    });

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(
        buildResult({
          ...result,
          command,
          args,
          cwd,
          stdout,
          stderr,
          durationMs: nowMs() - startedAt
        })
      );
    };

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
      finish({
        ok: false,
        status: 'SPAWN_ERROR',
        exitCode: null,
        errorMessage: error && error.message ? error.message : String(error)
      });
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);

      if (timedOut) {
        finish({
          ok: false,
          status: 'TIMEOUT',
          exitCode,
          errorMessage: `Command timed out after ${timeoutMs}ms`
        });
        return;
      }

      finish({
        ok: exitCode === 0,
        status: exitCode === 0 ? 'EXECUTION_RESULT' : 'NON_ZERO_EXIT',
        exitCode,
        errorMessage: exitCode === 0 ? '' : `Command exited with code ${exitCode}`
      });
    });
  });
}

function parseCliArgs(argv) {
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  let cwd = process.cwd();
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const commandParts = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--cwd') {
      cwd = tokens[index + 1] ? String(tokens[index + 1]) : cwd;
      index += 1;
      continue;
    }

    if (token === '--timeoutMs') {
      timeoutMs = toPositiveInteger(tokens[index + 1], DEFAULT_TIMEOUT_MS);
      index += 1;
      continue;
    }

    commandParts.push(token);
  }

  const command = commandParts.shift() || '';

  return {
    command,
    args: commandParts,
    cwd,
    timeoutMs
  };
}

async function runCli() {
  const parsed = parseCliArgs(process.argv.slice(2));
  const result = await runCmd(parsed);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    const result = buildResult({
      ok: false,
      status: 'CLI_ERROR',
      command: '',
      args: [],
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
  runCmd,
  parseCliArgs
};