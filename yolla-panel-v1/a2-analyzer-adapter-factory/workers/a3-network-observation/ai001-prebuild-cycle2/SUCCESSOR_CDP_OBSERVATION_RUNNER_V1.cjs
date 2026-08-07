'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');

const SCHEMA_REQUEST = 'CDP_OBSERVATION_RUN_REQUEST_V1';
const SCHEMA_RECEIPT = 'CDP_OBSERVATION_RUN_RECEIPT_V1';
const INTERNAL_URL_RE = /^(devtools|chrome|chrome-extension|edge|about):\/\//i;
const BACKGROUND_TYPES = new Set([
  'background_page', 'service_worker', 'shared_worker', 'worker', 'webview',
  'browser', 'other'
]);

const SENSITIVE_NAME_RE = /(authorization|proxy-authorization|cookie|set-cookie|token|secret|password|passwd|api[_-]?key|session[_-]?key|credential|jwt)/i;

function redactString(value) {
  return String(value ?? '')
    .replace(/(bearer\s+)[a-z0-9._~+/=-]{8,}/ig, '$1<REDACTED>')
    .replace(/(basic\s+)[a-z0-9+/=]{8,}/ig, '$1<REDACTED>')
    .replace(/([?&](?:access_token|refresh_token|token|api_key|apikey|key|secret|password|passwd|authorization|cookie)=)[^&#\s]*/ig, '$1<REDACTED>')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|cookie)\s*[:=]\s*)[^\s,;}&"']{3,}/ig, '$1<REDACTED>');
}

function sanitizeArtifact(value) {
  if (Array.isArray(value)) return value.map(sanitizeArtifact);
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE_NAME_RE.test(key) ? '<REDACTED>' : sanitizeArtifact(item);
    }
    return output;
  }
  if (typeof value === 'string') return redactString(value);
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(
    typeof value === 'string' ? value : stableStringify(value), 'utf8'
  );
  return createHash('sha256').update(input).digest('hex');
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
}

function writeJson(file, value) {
  atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeNdjson(file, rows) {
  atomicWrite(file, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

function safeErrorCode(error) {
  const raw = String(error?.code || error?.message || 'UNKNOWN_ERROR');
  return raw.replace(/[\r\n\t]/g, ' ').slice(0, 512);
}

function inferRetryable(errorCode) {
  return /(?:TIMEOUT|ECONNREFUSED|ECONNRESET|EPIPE|CDP_NOT_CONNECTED|WEBSOCKET_CONNECT_FAILED|CDP_VERSION_HTTP_5\d\d)/i.test(errorCode);
}

class RunError extends Error {
  constructor(code, retryable = false) {
    super(code);
    this.code = code;
    this.retryable = Boolean(retryable);
  }
}

function validateRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RunError('INVALID_REQUEST_OBJECT', false);
  }
  const request = JSON.parse(JSON.stringify(input));
  if (request.schema_version !== SCHEMA_REQUEST) {
    throw new RunError(`INVALID_SCHEMA_VERSION:${request.schema_version || 'MISSING'}`, false);
  }
  if (typeof request.cdp_endpoint !== 'string' || !request.cdp_endpoint.trim()) {
    throw new RunError('CDP_ENDPOINT_REQUIRED', false);
  }
  if (request.cdp_endpoint.length > 2048) {
    throw new RunError('CDP_ENDPOINT_TOO_LONG', false);
  }
  const windowMs = Number(request.observation_window_ms);
  if (!Number.isFinite(windowMs) || windowMs < 0 || windowMs > 600000) {
    throw new RunError('INVALID_OBSERVATION_WINDOW_MS', false);
  }
  request.observation_window_ms = Math.floor(windowMs);
  request.page_selector = request.page_selector && typeof request.page_selector === 'object'
    ? request.page_selector : {};
  request.page_id = request.page_id || null;
  request.capture_flags = {
    dom_snapshot: request.capture_flags?.dom_snapshot !== false,
    network_metadata: request.capture_flags?.network_metadata !== false,
    response_body: request.capture_flags?.response_body !== false,
    frame_navigation: request.capture_flags?.frame_navigation !== false,
    console: request.capture_flags?.console === true,
  };
  request.output_root = request.output_root || null;
  return request;
}

function isEligiblePageTarget(target) {
  if (!target || target.type !== 'page') return false;
  const url = String(target.url || '');
  if (INTERNAL_URL_RE.test(url)) return false;
  if (BACKGROUND_TYPES.has(String(target.type || '').toLowerCase())) return false;
  if (target.attached === false && /^chrome-search:\/\//i.test(url)) return false;
  return true;
}

function filterPageTargets(targetInfos) {
  return (targetInfos || []).filter(isEligiblePageTarget);
}

function selectEligiblePage(targetInfos, request) {
  const eligible = filterPageTargets(targetInfos);
  if (!eligible.length) throw new RunError('NO_ELIGIBLE_PAGE_TARGET', false);
  if (request.page_id) {
    const exact = eligible.find((target) => target.targetId === request.page_id);
    if (!exact) throw new RunError(`PAGE_TARGET_NOT_FOUND:${request.page_id}`, false);
    return exact;
  }
  const selector = request.page_selector || {};
  if (selector.url_contains) {
    const found = eligible.find((target) => String(target.url || '').includes(String(selector.url_contains)));
    if (found) return found;
  }
  if (selector.title_contains) {
    const found = eligible.find((target) => String(target.title || '').includes(String(selector.title_contains)));
    if (found) return found;
  }
  if (selector.url_regex) {
    let regex;
    try { regex = new RegExp(selector.url_regex); }
    catch { throw new RunError('INVALID_PAGE_SELECTOR_URL_REGEX', false); }
    const found = eligible.find((target) => regex.test(String(target.url || '')));
    if (found) return found;
  }
  return eligible[0];
}

function sanitizePageIdentity(target, redactUrl = (value) => value) {
  return {
    page_id: target.targetId,
    target_type: target.type,
    title: String(target.title || '').slice(0, 1024),
    url: redactUrl(String(target.url || '')),
  };
}

function defaultDependencies() {
  const cycle1 = require('../ai001-prebuild/CDP_OBSERVER_MODULE_V1.cjs');
  return {
    transportFactory: async (request) => new cycle1.BrowserCdpConnection(
      /^wss?:\/\//i.test(request.cdp_endpoint)
        ? { websocketUrl: request.cdp_endpoint }
        : { browserUrl: request.cdp_endpoint }
    ).connect(),
    observerFactory: ({ transport, statePath }) => new cycle1.CdpObserverModuleV1({
      transport, statePath
    }),
    redactUrl: cycle1.redactUrl,
    clock: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

function relativePointer(root, file, rows = null) {
  const bytes = fs.readFileSync(file);
  const pointer = {
    path: path.relative(root, file).replace(/\\/g, '/'),
    sha256: sha256(bytes),
    size_bytes: bytes.length,
  };
  if (rows !== null) pointer.record_count = rows;
  return pointer;
}

function eventBuckets(events, flags) {
  return {
    dom: flags.dom_snapshot ? events.filter((e) => e.type === 'dom.snapshot').map(sanitizeArtifact) : [],
    network: flags.network_metadata ? events.filter((e) => [
      'network.request', 'network.response', 'network.loadingFinished', 'network.loadingFailed'
    ].includes(e.type)).map(sanitizeArtifact) : [],
    bodies: flags.response_body ? events.filter((e) => e.type === 'network.responseBody').map((e) => ({
      schema_version: e.schema_version,
      page_id: e.page_id,
      request_id: e.request_id,
      action_id: e.action_id,
      timestamp: e.timestamp,
      type: e.type,
      payload: {
        status: e.payload?.status ?? null,
        mime_type: e.payload?.mime_type ?? null,
        base64_encoded: Boolean(e.payload?.base64_encoded),
        raw_sha256: e.payload?.raw_sha256 || null,
        raw_size_bytes: e.payload?.raw_size_bytes ?? null,
        truncated: Boolean(e.payload?.truncated),
        redacted_body: e.payload?.redacted_body ?? '',
        redacted_body_sha256: e.payload?.redacted_body_sha256 || null,
        raw_body_retained: false,
      }
    })).map(sanitizeArtifact) : [],
    frames: flags.frame_navigation ? events.filter((e) => [
      'page.frameNavigated', 'page.lifecycleEvent'
    ].includes(e.type)).map(sanitizeArtifact) : [],
    console: flags.console ? events.filter((e) => e.type === 'runtime.console').map(sanitizeArtifact) : [],
  };
}

async function runObservationRequest(input, options = {}) {
  const request = validateRequest(input);
  const deps = { ...options };
  const defaults = options.skip_default_dependencies ? {} : defaultDependencies();
  const transportFactory = deps.transportFactory || defaults.transportFactory;
  const observerFactory = deps.observerFactory || defaults.observerFactory;
  const redactUrl = deps.redactUrl || defaults.redactUrl || ((value) => value);
  const clock = deps.clock || defaults.clock || (() => Date.now());
  const sleep = deps.sleep || defaults.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  if (typeof transportFactory !== 'function' || typeof observerFactory !== 'function') {
    throw new RunError('RUNNER_DEPENDENCY_MISSING', false);
  }

  const requestForDigest = { ...request };
  delete requestForDigest.output_root;
  const requestSha256 = sha256(requestForDigest);
  const runId = input.run_id || `cdp-${requestSha256.slice(0, 24)}`;
  const root = path.resolve(options.output_root || request.output_root || './runtime/cdp-observation-runs');
  const runDir = path.join(root, runId);
  const receiptPath = path.join(runDir, 'receipt.json');

  if (fs.existsSync(receiptPath)) {
    const existing = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    if (existing.schema_version === SCHEMA_RECEIPT && existing.request_sha256 === requestSha256) {
      return { ...existing, idempotent_replay: true };
    }
    throw new RunError('RUN_ID_COLLISION_WITH_DIFFERENT_REQUEST', false);
  }

  const startedAt = new Date(clock()).toISOString();
  let transport = null;
  let observer = null;
  try {
    transport = await transportFactory(request);
    const targetResult = await transport.send('Target.getTargets', {});
    const selected = selectEligiblePage(targetResult.targetInfos || [], request);
    const pageIdentity = sanitizePageIdentity(selected, redactUrl);

    const statePath = path.join(runDir, 'observer-state.json');
    observer = observerFactory({ transport, statePath, request });
    const events = [];
    observer.on('evidence', (event) => events.push(event));
    await observer.start({ target: { target_id: selected.targetId } });
    await sleep(request.observation_window_ms);
    await observer.stop('observation_window_elapsed');

    const buckets = eventBuckets(events, request.capture_flags);
    fs.mkdirSync(runDir, { recursive: true });

    const domPath = path.join(runDir, 'dom-snapshots.ndjson');
    const networkPath = path.join(runDir, 'network-metadata.ndjson');
    const bodyPath = path.join(runDir, 'response-bodies-redacted.ndjson');
    const framePath = path.join(runDir, 'frame-navigation.ndjson');
    const consolePath = path.join(runDir, 'console.ndjson');

    writeNdjson(domPath, buckets.dom);
    writeNdjson(networkPath, buckets.network);
    writeNdjson(bodyPath, buckets.bodies);
    writeNdjson(framePath, buckets.frames);
    if (request.capture_flags.console) writeNdjson(consolePath, buckets.console);

    const finishedAt = new Date(clock()).toISOString();
    const receipt = {
      schema_version: SCHEMA_RECEIPT,
      status: 'PASS',
      run_id: runId,
      request_sha256: requestSha256,
      cdp_endpoint_sha256: sha256(request.cdp_endpoint),
      page_identity: pageIdentity,
      observation_window_ms: request.observation_window_ms,
      capture_flags: request.capture_flags,
      artifacts: {
        dom_snapshot_pointer: relativePointer(runDir, domPath, buckets.dom.length),
        request_response_metadata_pointer: relativePointer(runDir, networkPath, buckets.network.length),
        redacted_response_body_pointer: relativePointer(runDir, bodyPath, buckets.bodies.length),
        frame_navigation_pointer: relativePointer(runDir, framePath, buckets.frames.length),
      },
      timestamps: {
        started_at: startedAt,
        finished_at: finishedAt,
      },
      retry_count: 0,
      retry_policy: 'NO_INTERNAL_RETRY',
      idempotent_replay: false,
    };
    if (request.capture_flags.console) {
      receipt.artifacts.console_pointer = relativePointer(runDir, consolePath, buckets.console.length);
    }
    writeJson(receiptPath, receipt);
    return receipt;
  } catch (error) {
    const exact = safeErrorCode(error);
    if (error instanceof RunError) throw error;
    throw new RunError(exact, error?.retryable ?? inferRetryable(exact));
  } finally {
    try {
      if (observer?.started) await observer.stop('runner_finally');
    } catch {}
    try {
      if (transport && typeof transport.close === 'function') await transport.close();
    } catch {}
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i += 1; }
    else out[key] = true;
  }
  return out;
}

async function cli() {
  const args = parseArgs(process.argv);
  if (!args.request) throw new RunError('REQUEST_FILE_REQUIRED', false);
  const requestPath = path.resolve(args.request);
  const input = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
  const receipt = await runObservationRequest(input, {
    output_root: args['output-root'] ? path.resolve(args['output-root']) : undefined,
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (require.main === module) {
  cli().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      schema_version: SCHEMA_RECEIPT,
      status: 'ERROR',
      exact_error: safeErrorCode(error),
      retryable: Boolean(error?.retryable),
    }, null, 2)}\n`);
    process.exitCode = 2;
  });
}

module.exports = {
  SCHEMA_REQUEST,
  SCHEMA_RECEIPT,
  RunError,
  validateRequest,
  filterPageTargets,
  isEligiblePageTarget,
  selectEligiblePage,
  runObservationRequest,
  sha256,
  stableStringify,
  sanitizeArtifact,
};
