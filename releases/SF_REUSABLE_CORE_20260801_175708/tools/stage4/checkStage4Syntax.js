'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const RESULT_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  SKIP: 'SKIP',
  TOOL_MISSING: 'TOOL_MISSING'
});

const SUPPORTED_EXTENSIONS = Object.freeze({
  '.js': 'javascript',
  '.cjs': 'javascript',
  '.mjs': 'javascript',
  '.json': 'json',
  '.py': 'python'
});

const DEFAULT_IGNORED_DIRS = Object.freeze([
  '.git',
  'node_modules',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'dist',
  'build'
]);

function nowIso() {
  return new Date().toISOString();
}

function toText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || typeof value === 'undefined') {
    return '';
  }
  return String(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeExt(value) {
  const raw = toText(value).trim().toLowerCase();
  if (!raw) {
    return '';
  }
  return raw.charAt(0) === '.' ? raw : '.' + raw;
}

function getLanguageForPath(filePath) {
  return SUPPORTED_EXTENSIONS[normalizeExt(path.extname(toText(filePath)))] || 'unsupported';
}

function makeResult(status, filePath, language, details) {
  const safeDetails = isPlainObject(details) ? details : {};
  return {
    status: status,
    file_path: filePath || '',
    language: language || 'unknown',
    command: safeDetails.command || '',
    exit_code: typeof safeDetails.exitCode === 'number' ? safeDetails.exitCode : null,
    stdout: safeDetails.stdout || '',
    stderr: safeDetails.stderr || '',
    error_message: safeDetails.errorMessage || '',
    duration_ms: typeof safeDetails.durationMs === 'number' ? safeDetails.durationMs : 0
  };
}

function makeMissingFileResult(filePath) {
  return makeResult(RESULT_STATUS.FAIL, filePath, getLanguageForPath(filePath), {
    errorMessage: 'file does not exist or is not accessible'
  });
}

function safeReadTextFile(filePath) {
  try {
    return { ok: true, text: fs.readFileSync(filePath, 'utf8'), error: null };
  } catch (error) {
    return { ok: false, text: '', error: error };
  }
}

function runCommand(command, args, options) {
  const start = Date.now();
  const spawnOptions = Object.assign({
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: process.env
  }, isPlainObject(options) ? options : {});

  let result;
  try {
    result = childProcess.spawnSync(command, args, spawnOptions);
  } catch (error) {
    return {
      ok: false,
      missing: error && error.code === 'ENOENT',
      exitCode: null,
      stdout: '',
      stderr: '',
      errorMessage: error ? error.message : 'unknown spawn error',
      durationMs: Date.now() - start
    };
  }

  const spawnError = result.error || null;
  return {
    ok: !spawnError && result.status === 0,
    missing: !!(spawnError && spawnError.code === 'ENOENT'),
    exitCode: typeof result.status === 'number' ? result.status : null,
    stdout: toText(result.stdout),
    stderr: toText(result.stderr),
    errorMessage: spawnError ? spawnError.message : '',
    durationMs: Date.now() - start
  };
}

function checkJavaScriptSyntax(filePath) {
  const command = process.execPath;
  const args = ['--check', filePath];
  const commandText = 'node --check ' + filePath;
  const result = runCommand(command, args, {});

  if (result.missing) {
    return makeResult(RESULT_STATUS.TOOL_MISSING, filePath, 'javascript', {
      command: commandText,
      errorMessage: 'node executable is not available',
      durationMs: result.durationMs
    });
  }

  return makeResult(result.ok ? RESULT_STATUS.PASS : RESULT_STATUS.FAIL, filePath, 'javascript', {
    command: commandText,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    errorMessage: result.errorMessage,
    durationMs: result.durationMs
  });
}

function checkJsonSyntax(filePath) {
  const start = Date.now();
  const readResult = safeReadTextFile(filePath);
  if (!readResult.ok) {
    return makeResult(RESULT_STATUS.FAIL, filePath, 'json', {
      command: 'JSON.parse ' + filePath,
      errorMessage: readResult.error ? readResult.error.message : 'failed to read json file',
      durationMs: Date.now() - start
    });
  }

  try {
    JSON.parse(readResult.text);
    return makeResult(RESULT_STATUS.PASS, filePath, 'json', {
      command: 'JSON.parse ' + filePath,
      durationMs: Date.now() - start
    });
  } catch (error) {
    return makeResult(RESULT_STATUS.FAIL, filePath, 'json', {
      command: 'JSON.parse ' + filePath,
      errorMessage: error ? error.message : 'JSON.parse failed',
      durationMs: Date.now() - start
    });
  }
}

function getPythonCandidates(options) {
  const candidates = [];
  const configured = options && options.pythonBin ? toText(options.pythonBin).trim() : '';
  const envPython = process.env.STAGE4_PYTHON || process.env.PYTHON || '';

  if (configured) {
    candidates.push({ command: configured, argsPrefix: [] });
  }
  if (envPython) {
    candidates.push({ command: envPython, argsPrefix: [] });
  }

  candidates.push({ command: 'python', argsPrefix: [] });
  candidates.push({ command: 'python3', argsPrefix: [] });
  if (process.platform === 'win32') {
    candidates.push({ command: 'py', argsPrefix: ['-3'] });
  }

  const seen = Object.create(null);
  return candidates.filter(function keepUnique(candidate) {
    const key = candidate.command + '::' + candidate.argsPrefix.join(' ');
    if (seen[key]) {
      return false;
    }
    seen[key] = true;
    return true;
  });
}

function checkPythonSyntax(filePath, options) {
  const candidates = getPythonCandidates(options || {});
  const attempts = [];
  const env = Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: '1' });

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const args = candidate.argsPrefix.concat(['-m', 'py_compile', filePath]);
    const commandText = candidate.command + ' ' + args.join(' ');
    const result = runCommand(candidate.command, args, { env: env });

    attempts.push({
      command: commandText,
      missing: result.missing,
      exitCode: result.exitCode,
      stderr: result.stderr,
      errorMessage: result.errorMessage
    });

    if (result.missing) {
      continue;
    }

    return makeResult(result.ok ? RESULT_STATUS.PASS : RESULT_STATUS.FAIL, filePath, 'python', {
      command: commandText,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs
    });
  }

  return makeResult(RESULT_STATUS.TOOL_MISSING, filePath, 'python', {
    command: 'python -m py_compile ' + filePath,
    errorMessage: 'no python executable found; attempts=' + JSON.stringify(attempts),
    durationMs: 0
  });
}

function checkFileSyntax(filePath, options) {
  const safePath = toText(filePath).trim();
  if (!safePath) {
    return makeResult(RESULT_STATUS.FAIL, safePath, 'unknown', {
      errorMessage: 'empty file path'
    });
  }

  if (!fs.existsSync(safePath)) {
    return makeMissingFileResult(safePath);
  }

  let stat;
  try {
    stat = fs.statSync(safePath);
  } catch (error) {
    return makeResult(RESULT_STATUS.FAIL, safePath, getLanguageForPath(safePath), {
      errorMessage: error ? error.message : 'failed to stat file'
    });
  }

  if (!stat.isFile()) {
    return makeResult(RESULT_STATUS.SKIP, safePath, 'unsupported', {
      errorMessage: 'path is not a file'
    });
  }

  const language = getLanguageForPath(safePath);
  if (language === 'javascript') {
    return checkJavaScriptSyntax(safePath);
  }
  if (language === 'json') {
    return checkJsonSyntax(safePath);
  }
  if (language === 'python') {
    return checkPythonSyntax(safePath, options || {});
  }

  return makeResult(RESULT_STATUS.SKIP, safePath, language, {
    errorMessage: 'unsupported file extension: ' + path.extname(safePath)
  });
}

function shouldIgnoreDirectory(dirName, options) {
  if (options && options.noDefaultIgnore === true) {
    return false;
  }
  return DEFAULT_IGNORED_DIRS.indexOf(dirName) !== -1;
}

function walkDirectory(rootDir, options) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    entries.forEach(function handleEntry(entry) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldIgnoreDirectory(entry.name, options)) {
          stack.push(fullPath);
        }
        return;
      }
      if (entry.isFile() && getLanguageForPath(fullPath) !== 'unsupported') {
        files.push(fullPath);
      }
    });
  }

  return files.sort();
}

function collectTargetFiles(inputs, options) {
  const files = [];
  const missing = [];
  const skipped = [];

  inputs.forEach(function collectInput(input) {
    const target = toText(input).trim();
    if (!target) {
      return;
    }
    if (!fs.existsSync(target)) {
      missing.push(target);
      return;
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      files.push.apply(files, walkDirectory(target, options));
      return;
    }
    if (stat.isFile()) {
      files.push(target);
      return;
    }
    skipped.push(target);
  });

  return { files: files, missing: missing, skipped: skipped };
}

function aggregateStatus(results) {
  if (results.some(function hasFail(result) { return result.status === RESULT_STATUS.FAIL; })) {
    return RESULT_STATUS.FAIL;
  }
  if (results.some(function hasMissingTool(result) { return result.status === RESULT_STATUS.TOOL_MISSING; })) {
    return RESULT_STATUS.TOOL_MISSING;
  }
  if (results.length === 0 || results.every(function allSkipped(result) { return result.status === RESULT_STATUS.SKIP; })) {
    return RESULT_STATUS.SKIP;
  }
  return RESULT_STATUS.PASS;
}

function countStatuses(results) {
  return results.reduce(function reduceStatusCounts(accumulator, result) {
    accumulator.total += 1;
    if (!accumulator[result.status]) {
      accumulator[result.status] = 0;
    }
    accumulator[result.status] += 1;
    return accumulator;
  }, { total: 0, PASS: 0, FAIL: 0, SKIP: 0, TOOL_MISSING: 0 });
}

function checkStage4Syntax(inputs, options) {
  const safeInputs = Array.isArray(inputs) ? inputs : [];
  const safeOptions = isPlainObject(options) ? options : {};
  const startedAt = nowIso();

  if (safeInputs.length === 0) {
    const noInputResult = makeResult(RESULT_STATUS.SKIP, '', 'unknown', {
      errorMessage: 'no input files or directories provided'
    });
    return {
      status: RESULT_STATUS.SKIP,
      success: true,
      started_at: startedAt,
      finished_at: nowIso(),
      counts: countStatuses([noInputResult]),
      results: [noInputResult],
      run_instruction: 'node tools/stage4/checkStage4Syntax.js <file-or-dir> [more-files-or-dirs] --json'
    };
  }

  const collected = collectTargetFiles(safeInputs, safeOptions);
  const results = [];

  collected.missing.forEach(function addMissingResult(filePath) {
    results.push(makeMissingFileResult(filePath));
  });
  collected.skipped.forEach(function addSkippedResult(filePath) {
    results.push(makeResult(RESULT_STATUS.SKIP, filePath, 'unsupported', {
      errorMessage: 'input path is neither file nor directory'
    }));
  });
  collected.files.forEach(function addFileResult(filePath) {
    results.push(checkFileSyntax(filePath, safeOptions));
  });

  if (results.length === 0) {
    results.push(makeResult(RESULT_STATUS.SKIP, '', 'unknown', {
      errorMessage: 'no supported JS, JSON, or Python files found'
    }));
  }

  const status = aggregateStatus(results);
  return {
    status: status,
    success: status !== RESULT_STATUS.FAIL && status !== RESULT_STATUS.TOOL_MISSING,
    started_at: startedAt,
    finished_at: nowIso(),
    counts: countStatuses(results),
    results: results,
    run_instruction: 'node tools/stage4/checkStage4Syntax.js <file-or-dir> [more-files-or-dirs] --json'
  };
}

function printHelp() {
  const help = [
    'Usage:',
    '  node tools/stage4/checkStage4Syntax.js <file-or-dir> [more-files-or-dirs] [--json]',
    '',
    'Checks:',
    '  .js/.cjs/.mjs  node --check',
    '  .json          JSON.parse',
    '  .py            python -m py_compile',
    '',
    'Options:',
    '  --json                 print JSON result; this is the default output shape',
    '  --python=<command>     use a specific Python command for py_compile',
    '  --no-default-ignore    include node_modules, .git, build, dist, and cache folders when walking directories',
    '  --help                 show this help'
  ];
  console.log(help.join('\n'));
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const options = { json: true, noDefaultIgnore: false, pythonBin: '' };
  const inputs = [];

  args.forEach(function parseArg(arg) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      return;
    }
    if (arg === '--json') {
      options.json = true;
      return;
    }
    if (arg === '--no-default-ignore') {
      options.noDefaultIgnore = true;
      return;
    }
    if (arg.indexOf('--python=') === 0) {
      options.pythonBin = arg.slice('--python='.length).trim();
      return;
    }
    inputs.push(arg);
  });

  return { inputs: inputs, options: options };
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.options.help) {
    printHelp();
    return 0;
  }

  const result = checkStage4Syntax(parsed.inputs, parsed.options);
  console.log(JSON.stringify(result, null, 2));

  if (result.status === RESULT_STATUS.FAIL) {
    return 1;
  }
  if (result.status === RESULT_STATUS.TOOL_MISSING) {
    return 2;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  RESULT_STATUS: RESULT_STATUS,
  SUPPORTED_EXTENSIONS: SUPPORTED_EXTENSIONS,
  checkFileSyntax: checkFileSyntax,
  checkStage4Syntax: checkStage4Syntax,
  parseArgs: parseArgs,
  main: main
};