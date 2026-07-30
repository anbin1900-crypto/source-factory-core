const childProcess = require("child_process");

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

function toArray(value) {
if (Array.isArray(value)) {
return value.slice();
}

if (value === undefined || value === null) {
return [];
}

return [String(value)];
}

function appendLimitedText(currentText, chunk, maxBytes) {
const safeMaxBytes = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_OUTPUT_BYTES;
const chunkText = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
const combinedText = String(currentText || "") + chunkText;

if (Buffer.byteLength(combinedText, "utf8") <= safeMaxBytes) {
return combinedText;
}

const overflowNotice = "\n[output trimmed to last " + safeMaxBytes + " bytes]\n";
const allowedBodyBytes = Math.max(0, safeMaxBytes - Buffer.byteLength(overflowNotice, "utf8"));
const combinedBuffer = Buffer.from(combinedText, "utf8");
const trimmedBuffer = combinedBuffer.slice(Math.max(0, combinedBuffer.length - allowedBodyBytes));

return overflowNotice + trimmedBuffer.toString("utf8");
}

function makeProcessResult(overrides) {
return Object.assign({
ok: false,
command: "",
args: [],
cwd: "",
exitCode: null,
signal: null,
stdout: "",
stderr: "",
error: "",
timedOut: false,
durationMs: 0
}, overrides || {});
}

function runProcess(command, args, options) {
const settings = options || {};
const processArgs = toArray(args);
const timeoutMs = Number.isFinite(settings.timeoutMs) ? settings.timeoutMs : DEFAULT_TIMEOUT_MS;
const maxOutputBytes = Number.isFinite(settings.maxOutputBytes) ? settings.maxOutputBytes : DEFAULT_MAX_OUTPUT_BYTES;
const startedAt = Date.now();

return new Promise(function runProcessPromise(resolve) {
let child;
let stdoutText = "";
let stderrText = "";
let settled = false;
let timedOut = false;
let timer = null;

function finish(result) {
  if (settled) {
    return;
  }

  settled = true;

  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  resolve(makeProcessResult(Object.assign({
    command: command,
    args: processArgs,
    cwd: settings.cwd || process.cwd(),
    stdout: stdoutText,
    stderr: stderrText,
    durationMs: Date.now() - startedAt
  }, result || {})));
}

try {
  child = childProcess.spawn(command, processArgs, {
    cwd: settings.cwd || process.cwd(),
    env: Object.assign({}, process.env, settings.env || {}),
    windowsHide: true,
    shell: Boolean(settings.shell)
  });
} catch (error) {
  finish({
    ok: false,
    error: error && error.message ? error.message : String(error)
  });
  return;
}

if (timeoutMs > 0) {
  timer = setTimeout(function onTimeout() {
    timedOut = true;

    try {
      child.kill(settings.killSignal || "SIGTERM");
    } catch (error) {
      stderrText = appendLimitedText(stderrText, "\nFailed to terminate process after timeout: " + (error && error.message ? error.message : String(error)), maxOutputBytes);
    }
  }, timeoutMs);
}

if (child.stdout) {
  child.stdout.on("data", function onStdout(chunk) {
    stdoutText = appendLimitedText(stdoutText, chunk, maxOutputBytes);
  });
}

if (child.stderr) {
  child.stderr.on("data", function onStderr(chunk) {
    stderrText = appendLimitedText(stderrText, chunk, maxOutputBytes);
  });
}

child.on("error", function onError(error) {
  finish({
    ok: false,
    error: error && error.message ? error.message : String(error),
    timedOut: timedOut
  });
});

child.on("close", function onClose(code, signal) {
  finish({
    ok: code === 0 && !timedOut,
    exitCode: code,
    signal: signal,
    error: timedOut ? "Python process timed out." : (code === 0 ? "" : "Python process exited with code " + code + "."),
    timedOut: timedOut
  });
});

});
}

function runPythonScript(scriptPath, scriptArgs, options) {
const settings = options || {};
const pythonExecutable = settings.pythonExecutable || process.env.SOURCE_FACTORY_PYTHON || "python";
const pythonArgs = toArray(settings.pythonArgs);
const finalArgs = pythonArgs.concat([scriptPath]).concat(toArray(scriptArgs));

return runProcess(pythonExecutable, finalArgs, settings);
}

module.exports = {
DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
DEFAULT_MAX_OUTPUT_BYTES: DEFAULT_MAX_OUTPUT_BYTES,
runProcess: runProcess,
runPythonScript: runPythonScript
};