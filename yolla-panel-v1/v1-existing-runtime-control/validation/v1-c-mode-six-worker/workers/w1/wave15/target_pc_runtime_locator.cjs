'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUTHORITY = Object.freeze({
  releaseRoot: 'E:\\SOURCE FACTORY\\.yolla\\yolla-panel\\releases',
  stateRoot: 'E:\\SOURCE FACTORY\\.yolla\\yolla-workspace-v5-2',
  browserProfile: 'E:\\SOURCE FACTORY\\.yolla\\yolla-workspace-browser-profile',
  launcherPath: 'E:\\SOURCE FACTORY\\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat',
  baselineVersion: '5.10.2.4.0',
  targetVersion: '5.10.2.4.2-rc6'
});

function fail(code, detail = {}) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  throw error;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function canonical(input) {
  return path.resolve(String(input));
}

function comparable(input) {
  const value = canonical(input);
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function assertStrictChild(child, root, code = 'PATH_OUTSIDE_RELEASE_ROOT') {
  const childPath = canonical(child);
  const rootPath = canonical(root);
  const rel = path.relative(rootPath, childPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    fail(code, { child: childPath, root: rootPath });
  }
  return childPath;
}

function assertFile(filePath, code) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { fail(code, { path: filePath }); }
  if (!stat.isFile()) fail(code, { path: filePath });
}

function assertDirectory(dirPath, code) {
  let stat;
  try { stat = fs.statSync(dirPath); } catch { fail(code, { path: dirPath }); }
  if (!stat.isDirectory()) fail(code, { path: dirPath });
}

function validateBaselineCandidate(candidatePath, options = {}) {
  const releaseRoot = canonical(options.releaseRoot || AUTHORITY.releaseRoot);
  const baselineVersion = String(options.baselineVersion || AUTHORITY.baselineVersion);
  if (!path.isAbsolute(candidatePath)) fail('BASE_RELEASE_PATH_NOT_ABSOLUTE', { candidatePath });
  const candidate = assertStrictChild(candidatePath, releaseRoot);
  assertDirectory(candidate, 'BASE_RELEASE_DIRECTORY_MISSING');

  const required = {
    packageJson: path.join(candidate, 'package.json'),
    mainJs: path.join(candidate, 'main.js'),
    workspaceHtml: path.join(candidate, 'workspace.html')
  };
  assertFile(required.packageJson, 'BASE_PACKAGE_JSON_MISSING');
  assertFile(required.mainJs, 'BASE_MAIN_JS_MISSING');
  assertFile(required.workspaceHtml, 'BASE_WORKSPACE_HTML_MISSING');

  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(required.packageJson, 'utf8')); }
  catch (error) { fail('BASE_PACKAGE_JSON_INVALID', { message: error.message }); }

  if (String(pkg.version || '') !== baselineVersion) {
    fail('BASELINE_VERSION_MISMATCH', { expected: baselineVersion, actual: pkg.version || null });
  }
  if (typeof pkg.main !== 'string' || !pkg.main.trim()) fail('BASE_EXECUTABLE_ENTRY_UNDECLARED');
  const entry = canonical(path.join(candidate, pkg.main));
  const rel = path.relative(candidate, entry);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail('BASE_EXECUTABLE_ENTRY_ESCAPES_RELEASE', { entry });
  assertFile(entry, 'BASE_EXECUTABLE_ENTRY_MISSING');

  return {
    path: candidate,
    version: baselineVersion,
    package_json: required.packageJson,
    main_js: required.mainJs,
    workspace_html: required.workspaceHtml,
    executable_entry: entry
  };
}

function discoverExactlyOneBaseline(options = {}) {
  const releaseRoot = canonical(options.releaseRoot || AUTHORITY.releaseRoot);
  assertDirectory(releaseRoot, 'RELEASE_ROOT_MISSING');
  const candidates = [];
  for (const entry of fs.readdirSync(releaseRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidatePath = path.join(releaseRoot, entry.name);
    try { candidates.push(validateBaselineCandidate(candidatePath, options)); }
    catch (error) {
      if (!error || !error.code) throw error;
    }
  }
  if (candidates.length === 0) fail('BASELINE_CANDIDATE_COUNT_ZERO');
  if (candidates.length > 1) fail('BASELINE_CANDIDATE_COUNT_MULTIPLE', { count: candidates.length, paths: candidates.map(x => x.path) });
  return candidates[0];
}

function resolveBaseline(options = {}) {
  if (options.baseReleasePath) {
    return { resolution_mode: 'EXPLICIT_VALIDATED_PARAMETER', ...validateBaselineCandidate(options.baseReleasePath, options) };
  }
  return { resolution_mode: 'EXACTLY_ONE_DISCOVERY', ...discoverExactlyOneBaseline(options) };
}

function launcherReadbackAndBackup(options = {}) {
  const launcherPath = canonical(options.launcherPath || AUTHORITY.launcherPath);
  const backupDirectory = canonical(options.launcherBackupDirectory || path.join(options.stateRoot || AUTHORITY.stateRoot, 'automation-c-v1', 'launcher-backups'));
  assertFile(launcherPath, 'AUTHORITY_LAUNCHER_MISSING');
  const bytes = fs.readFileSync(launcherPath);
  const digest = sha256(bytes);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, `${path.basename(launcherPath)}.${digest}.bak`);
  if (fs.existsSync(backupPath)) {
    const prior = fs.readFileSync(backupPath);
    if (sha256(prior) !== digest || !prior.equals(bytes)) fail('LAUNCHER_BACKUP_BYTE_MISMATCH', { backupPath });
  } else {
    fs.writeFileSync(backupPath, bytes, { flag: 'wx' });
  }
  return { launcher_path: launcherPath, launcher_size: bytes.length, launcher_sha256: digest, launcher_backup_path: backupPath };
}

function inventoryTree(root) {
  const base = canonical(root);
  const entries = [];
  function walk(current) {
    for (const dirent of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, dirent.name);
      const rel = path.relative(base, full).split(path.sep).join('/');
      if (dirent.isDirectory()) walk(full);
      else if (dirent.isSymbolicLink()) entries.push({ path: rel, type: 'symlink', target: fs.readlinkSync(full) });
      else if (dirent.isFile()) {
        const bytes = fs.readFileSync(full);
        entries.push({ path: rel, type: 'file', size: bytes.length, sha256: sha256(bytes) });
      } else fail('UNSUPPORTED_BASELINE_ENTRY_TYPE', { path: full });
    }
  }
  walk(base);
  return { entries, tree_sha256: sha256(Buffer.from(JSON.stringify(entries))) };
}

function cloneCompleteBaseline(baseReleasePath, candidateReleasePath, options = {}) {
  const releaseRoot = canonical(options.releaseRoot || AUTHORITY.releaseRoot);
  const base = assertStrictChild(baseReleasePath, releaseRoot);
  if (!path.isAbsolute(candidateReleasePath)) fail('CANDIDATE_RELEASE_PATH_NOT_ABSOLUTE');
  const candidate = assertStrictChild(candidateReleasePath, releaseRoot, 'CANDIDATE_OUTSIDE_RELEASE_ROOT');
  if (comparable(base) === comparable(candidate)) fail('CANDIDATE_EQUALS_BASELINE');
  if (fs.existsSync(candidate)) fail('CANDIDATE_RELEASE_ALREADY_EXISTS', { candidate });
  const before = inventoryTree(base);
  fs.cpSync(base, candidate, { recursive: true, force: false, errorOnExist: true, dereference: false, preserveTimestamps: true });
  const after = inventoryTree(candidate);
  if (JSON.stringify(before.entries) !== JSON.stringify(after.entries) || before.tree_sha256 !== after.tree_sha256) {
    try { fs.rmSync(candidate, { recursive: true, force: true }); } catch {}
    fail('BASELINE_RECURSIVE_CLONE_MISMATCH', { before: before.tree_sha256, after: after.tree_sha256 });
  }
  return { candidate_release_path: candidate, baseline_tree_sha256: before.tree_sha256, cloned_entry_count: before.entries.length };
}

function runResolver(options = {}) {
  const releaseRoot = canonical(options.releaseRoot || AUTHORITY.releaseRoot);
  const baseline = resolveBaseline({ ...options, releaseRoot });
  const launcher = launcherReadbackAndBackup(options);
  const result = {
    schema_version: 'YOLLA_TARGET_PC_RUNTIME_LOCATOR_RECEIPT_V1',
    baseline_version: options.baselineVersion || AUTHORITY.baselineVersion,
    target_version: options.targetVersion || AUTHORITY.targetVersion,
    release_root: releaseRoot,
    baseline,
    launcher,
    guessed_path_count: 0,
    baseline_clone_performed: false
  };
  if (!options.resolveOnly) {
    const candidatePath = options.candidateReleasePath || path.join(releaseRoot, options.targetVersion || AUTHORITY.targetVersion);
    result.clone = cloneCompleteBaseline(baseline.path, candidatePath, { releaseRoot });
    result.baseline_clone_performed = true;
  }
  return result;
}

function parseArgs(argv) {
  const map = {
    '-BaseReleasePath': 'baseReleasePath', '--base-release-path': 'baseReleasePath',
    '-ReleaseRoot': 'releaseRoot', '--release-root': 'releaseRoot',
    '-BaselineVersion': 'baselineVersion', '--baseline-version': 'baselineVersion',
    '-TargetVersion': 'targetVersion', '--target-version': 'targetVersion',
    '-CandidateReleasePath': 'candidateReleasePath', '--candidate-release-path': 'candidateReleasePath',
    '-LauncherPath': 'launcherPath', '--launcher-path': 'launcherPath',
    '-LauncherBackupDirectory': 'launcherBackupDirectory', '--launcher-backup-directory': 'launcherBackupDirectory',
    '-StateRoot': 'stateRoot', '--state-root': 'stateRoot',
    '-ReceiptPath': 'receiptPath', '--receipt-path': 'receiptPath'
  };
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-ResolveOnly' || arg === '--resolve-only') { out.resolveOnly = true; continue; }
    const key = map[arg];
    if (!key) fail('UNKNOWN_ARGUMENT', { arg });
    if (i + 1 >= argv.length) fail('ARGUMENT_VALUE_MISSING', { arg });
    out[key] = argv[++i];
  }
  return out;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = runResolver(options);
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (options.receiptPath) {
      fs.mkdirSync(path.dirname(canonical(options.receiptPath)), { recursive: true });
      fs.writeFileSync(options.receiptPath, json, { flag: 'wx' });
    }
    process.stdout.write(json);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ outcome: 'FAIL_CLOSED', code: error.code || 'UNEXPECTED_ERROR', detail: error.detail || {}, message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = {
  AUTHORITY, assertStrictChild, validateBaselineCandidate, discoverExactlyOneBaseline,
  resolveBaseline, launcherReadbackAndBackup, inventoryTree, cloneCompleteBaseline,
  runResolver, parseArgs
};
