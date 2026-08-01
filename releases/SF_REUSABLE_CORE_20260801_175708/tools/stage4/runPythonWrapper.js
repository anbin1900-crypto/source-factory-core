'use strict';

const { spawn } = require('child_process');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_PYTHON_COMMAND = 'python';

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

function buildPythonResult(input) {
  const source = input && typeof input === 'object' ? input : {};

  return {
    ok: Boolean(source.ok),
    status: toSafeString(source.status, 'ERROR'),
    mode: toSafeString(source.mode, ''),
    pythonCommand: toSafeString(source.pythonCommand, DEFAULT_PYTHON_COMMAND),
    filePath: toSafeString(source.filePath, ''),
    args: toArray(source.args),
    cwd: toSafeString(source.cwd, process.cwd()),
    exitCode: source.exitCode === undefined || source.exitCode === null ? null : source.exitCode,
    stdout: toSafeString(source.stdout, ''),
    stderr: toSafeString(source.stderr, ''),
    errorMessage: toSafeString(source.errorMessage, ''),
    durationMs: Number.isFinite(source.durationMs) ? source.durationMs : 0
  };
}

function runPythonProcess(options) {
  const startedAt = nowMs();
  const source = options && typeof options === 'object' ? options : {};
  const mode = toSafeString(source.mode, 'script');
  const pythonCommand = toSafeString(source.pythonCommand, DEFAULT_PYTHON_COMMAND).trim() || DEFAULT_PYTHON_COMMAND;
  const filePath = toSafeString(source.filePath, '');
  const args = toArray(source.args);
  const cwd = toSafeString(source.cwd, process.cwd());
  const timeoutMs = toPositiveInteger(source.timeoutMs, DEFAULT_TIMEOUT_MS);

  if (!filePath.trim()) {
    return Promise.resolve(
      buildPythonResult({
        ok: false,
        status: 'ERROR',
        mode,
        pythonCommand,
        filePath,
        args,
        cwd,
        exitCode: null,
        stdout: '',
        stderr: '',
        errorMessage: 'filePath is required',
        durationMs: nowMs() - startedAt
      })
    );
  }

  const processArgs = mode === 'compile'
    ? ['-m', 'py_compile', filePath]
    : [filePath].concat(args);

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
        buildPythonResult({
          ...result,
          mode,
          pythonCommand,
          filePath,
          args,
          cwd,
          stdout,
          stderr,
          durationMs: nowMs() - startedAt
        })
      );
    };

    const child = spawn(pythonCommand, processArgs, {
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
          errorMessage: `Python command not found: ${pythonCommand}`
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
          errorMessage: `Python process timed out after ${timeoutMs}ms`
        });
        return;
      }

      finish({
        ok: exitCode === 0,
        status: exitCode === 0 ? 'PASS' : 'FAIL',
        exitCode,
        errorMessage: exitCode === 0 ? '' : `Python process exited with code ${exitCode}`
      });
    });
  });
}

function runPythonScript(input) {
  const source = input && typeof input === 'object' ? input : {};

  return runPythonProcess({
    ...source,
    mode: 'script'
  });
}

function runPythonCompileCheck(input) {
  const source = input && typeof input === 'object' ? input : {};

  return runPythonProcess({
    ...source,
    mode: 'compile',
    args: []
  });
}

function parseCliArgs(argv) {
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  let mode = 'script';
  let cwd = process.cwd();
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let pythonCommand = DEFAULT_PYTHON_COMMAND;
  const commandParts = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--mode') {
      mode = toSafeString(tokens[index + 1], mode);
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

    if (token === '--python') {
      pythonCommand = toSafeString(tokens[index + 1], DEFAULT_PYTHON_COMMAND);
      index += 1;
      continue;
    }

    commandParts.push(token);
  }

  const filePath = commandParts.shift() || '';

  return {
    mode,
    pythonCommand,
    filePath,
    args: commandParts,
    cwd,
    timeoutMs
  };
}

async function runCli() {
  const parsed = parseCliArgs(process.argv.slice(2));
  const result = parsed.mode === 'compile'
    ? await runPythonCompileCheck(parsed)
    : await runPythonScript(parsed);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    const result = buildPythonResult({
      ok: false,
      status: 'ERROR',
      mode: 'cli',
      pythonCommand: DEFAULT_PYTHON_COMMAND,
      filePath: '',
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
  DEFAULT_PYTHON_COMMAND,
  runPythonScript,
  runPythonCompileCheck,
  parseCliArgs
};