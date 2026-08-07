'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function sha256(value) {
  const b = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return crypto.createHash('sha256').update(b).digest('hex');
}
function sha256File(file) { return sha256(fs.readFileSync(file)); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((o,k)=>(o[k]=stable(value[k]),o),{});
  return value;
}
function stableDigest(value) { return sha256(JSON.stringify(stable(value))); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function normalizeRelativePath(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('PATH_REQUIRED');
  if (path.isAbsolute(input) || /^[A-Za-z]:[\\/]/.test(input)) throw new Error('ABSOLUTE_PATH_REJECTED');
  const p = input.replace(/\\/g, '/').replace(/^\.\//, '');
  const normalized = path.posix.normalize(p);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error('PATH_TRAVERSAL_REJECTED');
  return normalized;
}

class PackageResolver {
  constructor({ declaredRoot, fallbackRoots = [], expectedMembers = {} } = {}) {
    this.declaredRoot = declaredRoot;
    this.fallbackRoots = fallbackRoots;
    this.expectedMembers = expectedMembers;
  }
  resolve(relativePath) {
    const rel = normalizeRelativePath(relativePath);
    const expected = this.expectedMembers[rel] || null;
    const candidates = [
      ...(this.declaredRoot ? [{ kind: 'DECLARED_GIT_TREE', root: this.declaredRoot }] : []),
      ...this.fallbackRoots.map(root => ({ kind: 'VERIFIED_EXTERNAL_PACKAGE', root }))
    ];
    const failures = [];
    for (const candidate of candidates) {
      const file = path.join(candidate.root, ...rel.split('/'));
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { failures.push(`${candidate.kind}:MISSING`); continue; }
      const actual = sha256File(file);
      if (expected && actual !== expected) { failures.push(`${candidate.kind}:SHA256_MISMATCH:${actual}`); continue; }
      return { relative_path: rel, absolute_path: file, root: candidate.root, source: candidate.kind, sha256: actual, expected_sha256: expected };
    }
    throw new Error(`PATH_AUTHORITY_RESOLUTION_FAILED:${rel}:${failures.join('|')}`);
  }
  verifyCritical() { return Object.keys(this.expectedMembers).map(p => this.resolve(p)); }
}

function selectorToCss(locator) {
  if (!locator) return null;
  const strategy = String(locator.strategy || '').toLowerCase();
  const value = String(locator.value || '');
  if (!value || /[\u0000-\u001f]/.test(value)) throw new Error('UNSAFE_SELECTOR_VALUE');
  if (strategy === 'css') return value;
  const esc = value.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  if (strategy === 'test_id') return `[data-testid="${esc}"]`;
  if (strategy === 'id') return `#${value.replace(/[^A-Za-z0-9_-]/g, s => `\\${s}`)}`;
  throw new Error(`UNSUPPORTED_SELECTOR_STRATEGY:${strategy}`);
}
function countSelectorInHtml(css, html) {
  if (!css) return 0;
  let needle;
  const m = css.match(/^\[data-testid="(.*)"\]$/);
  if (m) needle = `data-testid="${m[1].replace(/\\"/g,'"')}"`;
  else if (css.startsWith('#')) needle = `id="${css.slice(1).replace(/\\/g,'')}"`;
  else return 0;
  return String(html).split(needle).length - 1;
}
function validateRecipeSelectors(recipe, htmlBodies) {
  const results = [];
  for (const step of recipe.steps || []) {
    if (!step.locator) continue;
    const css = selectorToCss(step.locator);
    const total = htmlBodies.reduce((n,h)=>n+countSelectorInHtml(css,h),0);
    results.push({ step_id: step.step_id, sequence: step.sequence, css, match_count: total, status: total === 1 ? 'UNIQUE' : total > 1 ? 'AMBIGUOUS' : 'NOT_FOUND' });
  }
  return results;
}

class CanonicalEventBridge {
  constructor() { this.events = []; this.fingerprints = new Set(); }
  push(source, type, payload = {}) {
    const semantic = { source, type, payload };
    const fp = stableDigest(semantic);
    if (this.fingerprints.has(fp)) return null;
    this.fingerprints.add(fp);
    const e = { schema_version:'YOLLA_SITE_ANALYZER_EVENT_V2', sequence:this.events.length+1, source, type, fingerprint:fp, payload };
    this.events.push(e); return e;
  }
  ingestNodeHttp(receipt) {
    for (const e of receipt.events || []) this.push('B4_NODE_HTTP', `network.${e.type}`, e);
    for (const b of receipt.bodies || []) this.push('B4_NODE_HTTP', 'network.response_body', { url:b.url,status:b.status,sha256:b.sha256,body_bytes:Buffer.byteLength(b.body||'') });
  }
  ingestChromium(receipt) {
    for (const e of receipt.network_events || []) this.push('A3_CHROMIUM_CDP', 'cdp.network', e);
    for (const e of receipt.navigation_events || []) this.push('A3_CHROMIUM_CDP', 'cdp.navigation', e);
    for (const e of receipt.actions || []) this.push('B3_ACTION_RECORDER', `action.${e.type}`, e);
    this.push('A3_CHROMIUM_CDP','dom.snapshot.summary',{count:receipt.dom_snapshot_count||0,frame_count:receipt.frame_count||0});
  }
  snapshot() {
    const monotonic = this.events.every((e,i)=>e.sequence===i+1);
    return { count:this.events.length, unique_fingerprint_count:this.fingerprints.size, duplicate_count:this.events.length-this.fingerprints.size, monotonic, digest:stableDigest(this.events), events:this.events };
  }
}

const IPC_MARK = Symbol.for('yolla.a7.wave3.ipc.binding');
function bindIpc({ ipcMain, ownerId, handlers }) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new TypeError('IPC_MAIN_HANDLE_REQUIRED');
  const previous = ipcMain[IPC_MARK];
  if (previous && previous.ownerId === ownerId) return previous;
  if (previous) previous.dispose();
  const channels = Object.keys(handlers).sort();
  for (const name of channels) ipcMain.handle(name, handlers[name]);
  const binding = { ownerId, channels, generation:(previous?.generation||0)+1, dispose(){ for(const name of channels) ipcMain.removeHandler?.(name); if(ipcMain[IPC_MARK]===binding) delete ipcMain[IPC_MARK]; } };
  ipcMain[IPC_MARK] = binding;
  return binding;
}

function saveCheckpoint(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  const payload = { schema_version:'A7_WAVE3_RESTART_CHECKPOINT_V1', saved_at:new Date().toISOString(), ...data };
  fs.writeFileSync(file, JSON.stringify(payload,null,2)+'\n'); return payload;
}
function loadCheckpoint(file) { return fs.existsSync(file) ? readJson(file) : null; }

function runExternalLauncher(packageRoot) {
  const launcher = path.join(packageRoot, 'launcher.cjs');
  if (!fs.existsSync(launcher)) throw new Error('EXTERNAL_LAUNCHER_MISSING');
  const r = spawnSync(process.execPath, [launcher, 'sample'], { cwd:packageRoot, encoding:'utf8', timeout:45000 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`EXTERNAL_LAUNCHER_FAILED:${r.status}:${(r.stderr||'').trim()}`);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { throw new Error(`EXTERNAL_LAUNCHER_NON_JSON:${r.stdout}`); }
  return { parsed, stdout:r.stdout, stderr:r.stderr || '' };
}

function buildIntegrationReceipt({ packageRoot, resolver, checkpointFile }) {
  const resolved = resolver.verifyCritical();
  const launch = runExternalLauncher(packageRoot);
  const out = path.join(packageRoot,'outputs');
  const scenario = readJson(path.join(out,'sample-scenario-receipt.json'));
  const nodeHttp = readJson(path.join(out,'node-http-runtime-receipt.json'));
  const chromium = readJson(path.join(out,'chromium-cdp-receipt.json'));
  const recipe = readJson(path.join(out,'workflow-recipe.json'));
  const htmlBodies = (nodeHttp.bodies||[]).filter(x=>/text\/html/i.test(x.content_type||'') || /^<!doctype html/i.test(x.body||'')).map(x=>x.body||'');
  const selectors = validateRecipeSelectors(recipe, htmlBodies);
  const bridge = new CanonicalEventBridge(); bridge.ingestNodeHttp(nodeHttp); bridge.ingestChromium(chromium); const events=bridge.snapshot();
  const previous = loadCheckpoint(checkpointFile);
  const invariant = {
    result_sha256:scenario.adapter.result_sha256,
    records_hash:scenario.hashes.records,
    recipe_hash:recipe.recipe_hash,
    parity:scenario.preview_export.parity,
    exact_record_count:scenario.adapter.exact_record_count,
    selector_digest:stableDigest(selectors.map(x=>({step_id:x.step_id,css:x.css,status:x.status})))
  };
  const restartRecovery = !previous || stableDigest(previous.invariant) === stableDigest(invariant);
  const checkpoint = saveCheckpoint(checkpointFile,{run_count:(previous?.run_count||0)+1,invariant,event_digest:events.digest,resolved_members:resolved.map(x=>({relative_path:x.relative_path,source:x.source,sha256:x.sha256}))});
  const selectorHardFailures = selectors.filter(x=>['NOT_FOUND'].includes(x.status));
  const pass = scenario.runtime_result==='PASS' && scenario.adapter.exact_record_count===10 && scenario.adapter.deterministic===true && scenario.preview_export.parity==='PASS_10_10_10' && events.monotonic && events.unique_fingerprint_count===events.count && selectorHardFailures.length===0 && restartRecovery;
  return {
    schema_version:'A7_SITE_ANALYZER_WAVE3_INTEGRATION_RECEIPT_V1', status:pass?'PASS':'FAILED',
    launcher:{terminal:launch.parsed.terminal,runtime_result:launch.parsed.runtime_result},
    path_resolution:{critical_member_count:resolved.length,external_package_member_count:resolved.filter(x=>x.source==='VERIFIED_EXTERNAL_PACKAGE').length,resolved},
    ipc_contract:{stale_rebind_supported:true},
    event_contract:{count:events.count,unique_fingerprint_count:events.unique_fingerprint_count,duplicate_count:events.duplicate_count,monotonic:events.monotonic,digest:events.digest},
    selector_contract:{checked_count:selectors.length,not_found_count:selectorHardFailures.length,results:selectors},
    runtime:{network_event_count:scenario.node_http_runtime_bridge.network_event_count+scenario.chromium_cdp.network_event_count,response_body_count:scenario.node_http_runtime_bridge.response_body_count+scenario.chromium_cdp.response_body_count,dom_snapshot_count:scenario.chromium_cdp.dom_snapshot_count,recorded_action_count:scenario.chromium_cdp.recorded_action_count,extracted_record_count:scenario.adapter.exact_record_count,parity:scenario.preview_export.parity,deterministic:scenario.adapter.deterministic},
    restart_recovery:{previous_checkpoint_present:!!previous,pass:restartRecovery,run_count:checkpoint.run_count,invariant_digest:stableDigest(invariant)},
    invariant,
    boundaries:{production:false,ready:false,merge:false}
  };
}

module.exports = { sha256,sha256File,stableDigest,normalizeRelativePath,PackageResolver,selectorToCss,validateRecipeSelectors,CanonicalEventBridge,bindIpc,saveCheckpoint,loadCheckpoint,runExternalLauncher,buildIntegrationReceipt };
