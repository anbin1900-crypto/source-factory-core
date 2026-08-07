'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SCHEMA_REQUEST = 'CDP_OBSERVATION_RUN_REQUEST_V1';
const SCHEMA_RECEIPT = 'CDP_OBSERVATION_RUN_RECEIPT_V1';
const INTERNAL_URL_RE = /^(devtools|chrome|chrome-extension|edge|about):\/\//i;
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
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_NAME_RE.test(k) ? '<REDACTED>' : sanitizeArtifact(v);
    return out;
  }
  return typeof value === 'string' ? redactString(value) : value;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  return value;
}
function stableStringify(value) { return JSON.stringify(stable(value)); }
function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : stableStringify(value), 'utf8');
  return createHash('sha256').update(input).digest('hex');
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}
function writeJson(file, value) { atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`); }
function writeNdjson(file, rows) { atomicWrite(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')); }
function safeErrorCode(error) { return String(error?.code || error?.message || 'UNKNOWN_ERROR').replace(/[\r\n\t]/g, ' ').slice(0, 512); }
function inferRetryable(code) { return /(?:TIMEOUT|ECONNREFUSED|ECONNRESET|EPIPE|CDP_NOT_CONNECTED|WEBSOCKET_CONNECT_FAILED|CDP_VERSION_HTTP_5\d\d)/i.test(code); }
class RunError extends Error {
  constructor(code, retryable = false) { super(code); this.code = code; this.retryable = Boolean(retryable); }
}
function validateRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RunError('INVALID_REQUEST_OBJECT', false);
  const request = JSON.parse(JSON.stringify(input));
  if (request.schema_version !== SCHEMA_REQUEST) throw new RunError(`INVALID_SCHEMA_VERSION:${request.schema_version || 'MISSING'}`, false);
  if (typeof request.cdp_endpoint !== 'string' || !request.cdp_endpoint.trim()) throw new RunError('CDP_ENDPOINT_REQUIRED', false);
  if (request.cdp_endpoint.length > 2048) throw new RunError('CDP_ENDPOINT_TOO_LONG', false);
  const ms = Number(request.observation_window_ms);
  if (!Number.isFinite(ms) || ms < 0 || ms > 600000) throw new RunError('INVALID_OBSERVATION_WINDOW_MS', false);
  request.observation_window_ms = Math.floor(ms);
  request.page_selector = request.page_selector && typeof request.page_selector === 'object' ? request.page_selector : {};
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
  if (/^chrome-search:\/\//i.test(url)) return false;
  return true;
}
function filterPageTargets(targetInfos) { return (targetInfos || []).filter(isEligiblePageTarget); }
function selectEligiblePage(targetInfos, request) {
  const eligible = filterPageTargets(targetInfos);
  if (!eligible.length) throw new RunError('NO_ELIGIBLE_PAGE_TARGET', false);
  if (request.page_id) {
    const exact = eligible.find((t) => t.targetId === request.page_id);
    if (!exact) throw new RunError(`PAGE_TARGET_NOT_FOUND:${request.page_id}`, false);
    return exact;
  }
  const s = request.page_selector || {};
  if (s.url_contains) { const t = eligible.find((x) => String(x.url || '').includes(String(s.url_contains))); if (t) return t; }
  if (s.title_contains) { const t = eligible.find((x) => String(x.title || '').includes(String(s.title_contains))); if (t) return t; }
  if (s.url_regex) {
    let re;
    try { re = new RegExp(s.url_regex); } catch { throw new RunError('INVALID_PAGE_SELECTOR_URL_REGEX', false); }
    const t = eligible.find((x) => re.test(String(x.url || ''))); if (t) return t;
  }
  return eligible[0];
}
function defaultDependencies() {
  const cycle1 = require('../ai001-prebuild/CDP_OBSERVER_MODULE_V1.cjs');
  return {
    transportFactory: async (request) => new cycle1.BrowserCdpConnection(/^wss?:\/\//i.test(request.cdp_endpoint) ? { websocketUrl: request.cdp_endpoint } : { browserUrl: request.cdp_endpoint }).connect(),
    observerFactory: ({ transport, statePath }) => new cycle1.CdpObserverModuleV1({ transport, statePath }),
    redactUrl: cycle1.redactUrl,
    clock: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
function pointer(root, file, count) {
  const bytes = fs.readFileSync(file);
  return { path: path.relative(root, file).replace(/\\/g, '/'), sha256: sha256(bytes), size_bytes: bytes.length, record_count: count };
}
function buckets(events, f) {
  return {
    dom: f.dom_snapshot ? events.filter((e) => e.type === 'dom.snapshot').map(sanitizeArtifact) : [],
    network: f.network_metadata ? events.filter((e) => ['network.request','network.response','network.loadingFinished','network.loadingFailed'].includes(e.type)).map(sanitizeArtifact) : [],
    bodies: f.response_body ? events.filter((e) => e.type === 'network.responseBody').map((e) => sanitizeArtifact({schema_version:e.schema_version,page_id:e.page_id,request_id:e.request_id,action_id:e.action_id,timestamp:e.timestamp,type:e.type,payload:{status:e.payload?.status??null,mime_type:e.payload?.mime_type??null,base64_encoded:Boolean(e.payload?.base64_encoded),raw_sha256:e.payload?.raw_sha256||null,raw_size_bytes:e.payload?.raw_size_bytes??null,truncated:Boolean(e.payload?.truncated),redacted_body:e.payload?.redacted_body??'',redacted_body_sha256:e.payload?.redacted_body_sha256||null,raw_body_retained:false}})) : [],
    frames: f.frame_navigation ? events.filter((e) => ['page.frameNavigated','page.lifecycleEvent'].includes(e.type)).map(sanitizeArtifact) : [],
    console: f.console ? events.filter((e) => e.type === 'runtime.console').map(sanitizeArtifact) : [],
  };
}
async function runObservationRequest(input, options = {}) {
  const request = validateRequest(input);
  const defaults = options.skip_default_dependencies ? {} : defaultDependencies();
  const transportFactory = options.transportFactory || defaults.transportFactory;
  const observerFactory = options.observerFactory || defaults.observerFactory;
  const redactUrl = options.redactUrl || defaults.redactUrl || ((v) => v);
  const clock = options.clock || defaults.clock || (() => Date.now());
  const sleep = options.sleep || defaults.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  if (!transportFactory || !observerFactory) throw new RunError('RUNNER_DEPENDENCY_MISSING', false);
  const digestInput = { ...request }; delete digestInput.output_root;
  const requestSha = sha256(digestInput);
  const runId = input.run_id || `cdp-${requestSha.slice(0,24)}`;
  const root = path.resolve(options.output_root || request.output_root || './runtime/cdp-observation-runs');
  const dir = path.join(root, runId);
  const receiptFile = path.join(dir, 'receipt.json');
  if (fs.existsSync(receiptFile)) {
    const old = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    if (old.schema_version === SCHEMA_RECEIPT && old.request_sha256 === requestSha) return { ...old, idempotent_replay: true };
    throw new RunError('RUN_ID_COLLISION_WITH_DIFFERENT_REQUEST', false);
  }
  const startedAt = new Date(clock()).toISOString();
  let transport = null; let observer = null;
  try {
    transport = await transportFactory(request);
    const targets = await transport.send('Target.getTargets', {});
    const selected = selectEligiblePage(targets.targetInfos || [], request);
    const pageIdentity = { page_id:selected.targetId, target_type:selected.type, title:String(selected.title||'').slice(0,1024), url:redactUrl(String(selected.url||'')) };
    observer = observerFactory({ transport, statePath:path.join(dir,'observer-state.json'), request });
    const events = []; observer.on('evidence', (e) => events.push(e));
    await observer.start({ target:{ target_id:selected.targetId } });
    await sleep(request.observation_window_ms);
    await observer.stop('observation_window_elapsed');
    const b = buckets(events, request.capture_flags); fs.mkdirSync(dir, { recursive:true });
    const dom=path.join(dir,'dom-snapshots.ndjson'), net=path.join(dir,'network-metadata.ndjson'), body=path.join(dir,'response-bodies-redacted.ndjson'), frame=path.join(dir,'frame-navigation.ndjson'), con=path.join(dir,'console.ndjson');
    writeNdjson(dom,b.dom); writeNdjson(net,b.network); writeNdjson(body,b.bodies); writeNdjson(frame,b.frames); if(request.capture_flags.console) writeNdjson(con,b.console);
    const receipt = {
      schema_version:SCHEMA_RECEIPT,status:'PASS',run_id:runId,request_sha256:requestSha,cdp_endpoint_sha256:sha256(request.cdp_endpoint),page_identity:pageIdentity,observation_window_ms:request.observation_window_ms,capture_flags:request.capture_flags,
      artifacts:{dom_snapshot_pointer:pointer(dir,dom,b.dom.length),request_response_metadata_pointer:pointer(dir,net,b.network.length),redacted_response_body_pointer:pointer(dir,body,b.bodies.length),frame_navigation_pointer:pointer(dir,frame,b.frames.length)},
      timestamps:{started_at:startedAt,finished_at:new Date(clock()).toISOString()},retry_count:0,retry_policy:'NO_INTERNAL_RETRY',idempotent_replay:false
    };
    if(request.capture_flags.console) receipt.artifacts.console_pointer=pointer(dir,con,b.console.length);
    writeJson(receiptFile,receipt); return receipt;
  } catch (error) {
    if (error instanceof RunError) throw error;
    const exact=safeErrorCode(error); throw new RunError(exact,error?.retryable??inferRetryable(exact));
  } finally {
    try { if(observer?.started) await observer.stop('runner_finally'); } catch {}
    try { if(transport?.close) await transport.close(); } catch {}
  }
}
function parseArgs(argv) { const o={}; for(let i=2;i<argv.length;i++){const a=argv[i];if(!a.startsWith('--'))continue;const k=a.slice(2),n=argv[i+1];if(n&&!n.startsWith('--')){o[k]=n;i++;}else o[k]=true;} return o; }
async function cli() {
  const a=parseArgs(process.argv); if(!a.request) throw new RunError('REQUEST_FILE_REQUIRED',false);
  const input=JSON.parse(fs.readFileSync(path.resolve(a.request),'utf8'));
  const receipt=await runObservationRequest(input,{output_root:a['output-root']?path.resolve(a['output-root']):undefined});
  process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
}
if(require.main===module) cli().catch((error)=>{process.stderr.write(`${JSON.stringify({schema_version:SCHEMA_RECEIPT,status:'ERROR',exact_error:safeErrorCode(error),retryable:Boolean(error?.retryable)},null,2)}\n`);process.exitCode=2;});
module.exports={SCHEMA_REQUEST,SCHEMA_RECEIPT,RunError,validateRequest,filterPageTargets,isEligiblePageTarget,selectEligiblePage,runObservationRequest,sha256,stableStringify,sanitizeArtifact};
