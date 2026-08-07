#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key || !key.startsWith('--') || argv[i + 1] == null) throw new Error(`BAD_ARG:${key || ''}`);
    out[key.slice(2)] = argv[i + 1];
  }
  for (const key of ['package-root', 'binding', 'receipt']) if (!out[key]) throw new Error(`MISSING_ARG:${key}`);
  return out;
}
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function fileSha(file) { return sha256(fs.readFileSync(file)); }
function count(text, token) { return text.split(token).length - 1; }
function ensure(condition, code) { if (!condition) throw new Error(code); }
function walkObjects(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  if (!Array.isArray(value)) out.push(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(item => walkObjects(item, out));
    else if (child && typeof child === 'object') walkObjects(child, out);
  }
  return out;
}
function normalizeSlashes(value) { return String(value || '').replace(/\\/g, '/').replace(/^\.\//, ''); }
function verifyW5Manifest(manifest, requiredMembers) {
  const objects = walkObjects(manifest);
  const matched = [];
  for (const member of requiredMembers) {
    const wantedPaths = new Set([
      normalizeSlashes(member.package_path),
      normalizeSlashes(member.install_relative),
      normalizeSlashes(member.install_destination)
    ].filter(Boolean));
    const match = objects.find(obj => {
      const paths = [obj.package_path, obj.path, obj.relative_path, obj.install_destination, obj.destination, obj.target_path]
        .map(normalizeSlashes).filter(Boolean);
      const pathMatch = paths.some(candidate => [...wantedPaths].some(wanted => candidate === wanted || candidate.endsWith('/' + wanted)));
      const hashMatch = String(obj.sha256 || obj.source_sha256 || obj.hash || '').toLowerCase() === member.sha256;
      const blob = String(obj.source_blob || obj.blob_sha1 || obj.blob || '').toLowerCase();
      const blobMatch = !blob || blob === member.source_blob;
      return pathMatch && hashMatch && blobMatch;
    });
    ensure(match, `W5_MANIFEST_MEMBER_MISSING_OR_MISMATCH:${member.logical_role}`);
    matched.push(member.logical_role);
  }
  return { status: 'PASS', matched_count: matched.length, matched_roles: matched };
}
function makeBaseline(root, profileRoot) {
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(profileRoot, { recursive: true });
  fs.writeFileSync(path.join(root, 'main.js'), '"use strict";\nconst APP_VERSION = "5.10.2.4.0";\nfunction createWorkspaceWindow(){ return true; }\n');
  fs.writeFileSync(path.join(root, 'workspace.html'), '<!doctype html>\n<html><head>\n  <link rel="stylesheet" href="./workspace.css">\n  <link rel="stylesheet" href="./workspace_c_mode.css">\n</head><body>\n  <script src="./workspace.js"></script>\n  <script src="./workspace_c_mode.js"></script>\n</body></html>\n');
  fs.writeFileSync(path.join(root, 'workspace_c_mode.js'), 'window.baseWorkspaceCMode=true;\n');
  fs.writeFileSync(path.join(root, 'workspace_c_mode.css'), '.base-c-mode{display:block}\n');
  fs.writeFileSync(path.join(profileRoot, 'Preferences'), 'fixed-browser-profile-fixture\n');
}
function snapshot(root, profileRoot) {
  return {
    main: fileSha(path.join(root, 'main.js')),
    html: fileSha(path.join(root, 'workspace.html')),
    base_js: fileSha(path.join(root, 'workspace_c_mode.js')),
    base_css: fileSha(path.join(root, 'workspace_c_mode.css')),
    profile: fileSha(path.join(profileRoot, 'Preferences'))
  };
}
function verifyPackageFiles(packageRoot, binding) {
  const results = [];
  for (const member of binding.required_members) {
    ensure(/^[0-9a-f]{40}$/.test(member.source_commit), `BAD_COMMIT:${member.logical_role}`);
    ensure(/^[0-9a-f]{40}$/.test(member.source_blob), `BAD_BLOB:${member.logical_role}`);
    ensure(/^[0-9a-f]{64}$/.test(member.sha256), `BAD_SHA256:${member.logical_role}`);
    const file = path.resolve(packageRoot, member.package_path);
    ensure(file.startsWith(path.resolve(packageRoot) + path.sep), `PACKAGE_PATH_ESCAPE:${member.logical_role}`);
    ensure(fs.existsSync(file) && fs.statSync(file).isFile(), `PACKAGE_MEMBER_MISSING:${member.logical_role}`);
    const body = fs.readFileSync(file);
    ensure(body.length === member.size_bytes, `PACKAGE_SIZE_MISMATCH:${member.logical_role}`);
    ensure(sha256(body) === member.sha256, `PACKAGE_SHA256_MISMATCH:${member.logical_role}`);
    results.push({ logical_role: member.logical_role, package_path: member.package_path, sha256: member.sha256, status: 'PASS' });
  }
  return results;
}
function loadUiTruth(releaseRoot) {
  const bridge = require(path.join(releaseRoot, 'automation-c-v1/workspace_ui_truth_bridge.cjs'));
  const context = {
    console,
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: fn => fn(),
    window: { yollaWorkspaceV5: {}, addEventListener: () => {} },
    document: { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({}) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(releaseRoot, 'workspace_c_mode_rc4_truth.js'), 'utf8'), context);
  return { bridge, ui: context.window.yollaUiTruthV12 };
}
function verifyUiTruth(releaseRoot) {
  const { bridge, ui } = loadUiTruth(releaseRoot);
  ensure(ui, 'UI_TRUTH_EXPORT_MISSING');
  const watcher = {
    c_enabled: true,
    command_enabled: true,
    reports_by_role: {
      W3: { registry_relation: 'CURRENT', result_comment_id: 5197743876, result_key: '519698639500' },
      W4: { registry_relation: 'HISTORICAL', result_comment_id: 5196694708, result_key: '519650543700' }
    }
  };
  const activity = bridge.normalizeUiTruth(watcher);
  const current = ui.projectRoleFromActivity(activity, 'W3');
  const historical = ui.projectRoleFromActivity(activity, 'W4');
  ensure(current.reference === 'RESULT_COMMENT #5197743876', 'RESULT_COMMENT_PRIORITY_FAILED');
  ensure(current.state === 'CURRENT_REGISTRY_RESULT', 'CURRENT_REGISTRY_NOT_SEPARATED');
  ensure(historical.state === 'HISTORICAL_REGISTRY_RESULT', 'HISTORICAL_REGISTRY_NOT_SEPARATED');
  const disabled = ui.truthCountsFromActivity(['W1', 'W2', 'W3', 'W4', 'W5', 'W6'], { ...activity, c_enabled: false, command_enabled: false });
  ensure(disabled.working === 0, 'DISABLED_WORKING_NOT_ZERO');
  return {
    c_and_command_disabled_working_count: disabled.working,
    result_comment_priority: true,
    current_historical_registry_separated: true
  };
}
function run(packageRoot, bindingPath, receiptPath, w5ManifestPath) {
  const binding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));
  ensure(binding.schema_version === 'RC7_UI_PACKAGE_BINDING_V1', 'BINDING_SCHEMA_MISMATCH');
  ensure(binding.target_version === '5.10.2.4.2-rc7', 'TARGET_VERSION_MISMATCH');
  ensure(binding.result_key === '519828395400', 'RESULT_KEY_MISMATCH');
  const members = verifyPackageFiles(packageRoot, binding);
  const w5Manifest = w5ManifestPath ? JSON.parse(fs.readFileSync(w5ManifestPath, 'utf8')) : null;
  const w5Binding = w5Manifest ? verifyW5Manifest(w5Manifest, binding.required_members) : { status: 'PENDING_W5_RC7_PACKAGE', matched_count: 0, matched_roles: [] };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w3-rc7-binding-'));
  const release = path.join(tmp, 'release');
  const profile = path.join(tmp, 'browser-profile');
  makeBaseline(release, profile);
  const pre = snapshot(release, profile);
  const patch = path.resolve(packageRoot, binding.execution.patch.package_path);
  const rollback = path.resolve(packageRoot, binding.execution.rollback.package_path);
  const packagePayloadRoot = path.resolve(packageRoot, binding.execution.payload_root);
  const patch1 = path.join(tmp, 'patch1.json');
  const patch2 = path.join(tmp, 'patch2.json');
  cp.execFileSync(process.execPath, [patch, '--release', release, '--package', packagePayloadRoot, '--receipt', patch1], { stdio: 'pipe' });
  cp.execFileSync(process.execPath, [patch, '--release', release, '--package', packagePayloadRoot, '--receipt', patch2], { stdio: 'pipe' });
  const p1 = JSON.parse(fs.readFileSync(patch1, 'utf8'));
  const p2 = JSON.parse(fs.readFileSync(patch2, 'utf8'));
  ensure(p1.changed === true, 'PATCH_FIRST_RUN_DID_NOT_CHANGE');
  ensure(p2.changed === false, 'PATCH_SECOND_RUN_NOT_IDEMPOTENT');

  const html = fs.readFileSync(path.join(release, 'workspace.html'), 'utf8');
  const main = fs.readFileSync(path.join(release, 'main.js'), 'utf8');
  const hooks = binding.hook_contract;
  ensure(count(html, hooks.css.overlay) === 1, 'CSS_HOOK_COUNT_NOT_ONE');
  ensure(count(html, hooks.js.overlay) === 1, 'JS_HOOK_COUNT_NOT_ONE');
  ensure(count(main, hooks.bridge.begin_marker) === 1, 'BRIDGE_HOOK_COUNT_NOT_ONE');
  ensure(html.indexOf(hooks.css.overlay) > html.indexOf(hooks.css.anchor), 'CSS_HOOK_ORDER_INVALID');
  ensure(html.indexOf(hooks.js.overlay) > html.indexOf(hooks.js.anchor), 'JS_HOOK_ORDER_INVALID');
  ensure(main.indexOf(hooks.bridge.module) < main.indexOf(hooks.bridge.renderer_anchor), 'BRIDGE_HOOK_ORDER_INVALID');
  const patched = snapshot(release, profile);
  ensure(patched.base_js === pre.base_js && patched.base_css === pre.base_css, 'BASE_UI_BYTES_CHANGED');
  ensure(patched.profile === pre.profile, 'FIXED_BROWSER_PROFILE_CHANGED');
  const uiTruth = verifyUiTruth(release);

  const rollback1 = path.join(tmp, 'rollback1.json');
  const rollback2 = path.join(tmp, 'rollback2.json');
  cp.execFileSync(process.execPath, [rollback, '--release', release, '--receipt', rollback1], { stdio: 'pipe' });
  cp.execFileSync(process.execPath, [rollback, '--release', release, '--receipt', rollback2], { stdio: 'pipe' });
  const post = snapshot(release, profile);
  assert.deepEqual(post, pre, 'ROLLBACK_DID_NOT_RESTORE_EXACT_PREIMAGE');
  for (const relative of binding.rollback.overlay_install_relatives) {
    ensure(!fs.existsSync(path.join(release, relative)), `OVERLAY_FILE_NOT_REMOVED:${relative}`);
  }

  const receipt = {
    schema_version: 'RC7_UI_PACKAGE_BINDING_OFFLINE_RECEIPT_V1',
    control_id: binding.control_id,
    wave_id: binding.wave_id,
    result_key: binding.result_key,
    target_version: binding.target_version,
    status: w5Manifest ? 'PASS_W5_RC7_PACKAGE_BOUND' : 'PASS_REFERENCE_PACKAGE_W5_RC7_PENDING',
    member_count: members.length,
    members,
    w5_package_binding: w5Binding,
    hook_counts: { bridge: 1, css: 1, js: 1 },
    patch_runs: { first_changed: true, second_changed: false, idempotent: true },
    rollback_runs: { first_pass: true, second_pass: true, idempotent: true, exact_preimage_restored: true },
    base_ui_css_js_bytes_unchanged: true,
    fixed_browser_profile_unchanged: true,
    ui_truth: uiTruth,
    target_pc_live_pass_claimed: false,
    production: false,
    ready: false,
    merge: false
  };
  fs.mkdirSync(path.dirname(path.resolve(receiptPath)), { recursive: true });
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`RC7_UI_BINDING_${receipt.status} members=${members.length}`);
  return receipt;
}
if (require.main === module) {
  const args = parseArgs(process.argv);
  run(path.resolve(args['package-root']), path.resolve(args.binding), path.resolve(args.receipt), args['w5-manifest'] ? path.resolve(args['w5-manifest']) : null);
}
module.exports = { run, verifyW5Manifest, verifyPackageFiles, sha256 };
