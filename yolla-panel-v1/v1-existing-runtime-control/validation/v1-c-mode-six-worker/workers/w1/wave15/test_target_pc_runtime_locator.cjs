'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
  validateBaselineCandidate, discoverExactlyOneBaseline, resolveBaseline,
  launcherReadbackAndBackup, cloneCompleteBaseline, runResolver, parseArgs
} = require('./target_pc_runtime_locator.cjs');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; process.stdout.write(`PASS ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${name}: ${error.stack}\n`); process.exitCode = 1; }
}
function expectCode(code, fn) {
  assert.throws(fn, error => error && error.code === code, code);
}
function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'yolla-w15-')); }
function makeRelease(root, name, version = '5.10.2.4.0', overrides = {}) {
  const dir = path.join(root, name); fs.mkdirSync(dir, { recursive: true });
  const pkg = { name: 'yolla', version, main: overrides.main === undefined ? 'main.js' : overrides.main };
  if (!overrides.noPackage) fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  if (!overrides.noMain) fs.writeFileSync(path.join(dir, 'main.js'), 'module.exports=1;\n');
  if (!overrides.noWorkspace) fs.writeFileSync(path.join(dir, 'workspace.html'), '<html></html>\n');
  fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'nested', 'asset.txt'), 'asset\n');
  return dir;
}
function makeLauncher(root, text = '@echo off\r\necho yolla\r\n') {
  const file = path.join(root, 'launcher.bat'); fs.writeFileSync(file, text); return file;
}

test('explicit valid baseline', () => { const r=temp(); const b=makeRelease(r,'base'); assert.equal(validateBaselineCandidate(b,{releaseRoot:r}).version,'5.10.2.4.0'); });
test('explicit path must be absolute', () => expectCode('BASE_RELEASE_PATH_NOT_ABSOLUTE',()=>validateBaselineCandidate('relative',{releaseRoot:temp()})));
test('explicit outside root rejected', () => { const r=temp(), x=temp(); const b=makeRelease(x,'base'); expectCode('PATH_OUTSIDE_RELEASE_ROOT',()=>validateBaselineCandidate(b,{releaseRoot:r})); });
test('version mismatch rejected', () => { const r=temp(), b=makeRelease(r,'base','0.0.0'); expectCode('BASELINE_VERSION_MISMATCH',()=>validateBaselineCandidate(b,{releaseRoot:r})); });
test('missing main.js rejected', () => { const r=temp(), b=makeRelease(r,'base','5.10.2.4.0',{noMain:true}); expectCode('BASE_MAIN_JS_MISSING',()=>validateBaselineCandidate(b,{releaseRoot:r})); });
test('missing workspace.html rejected', () => { const r=temp(), b=makeRelease(r,'base','5.10.2.4.0',{noWorkspace:true}); expectCode('BASE_WORKSPACE_HTML_MISSING',()=>validateBaselineCandidate(b,{releaseRoot:r})); });
test('missing package.json rejected', () => { const r=temp(), b=makeRelease(r,'base','5.10.2.4.0',{noPackage:true}); expectCode('BASE_PACKAGE_JSON_MISSING',()=>validateBaselineCandidate(b,{releaseRoot:r})); });
test('undeclared entry rejected', () => { const r=temp(), b=makeRelease(r,'base','5.10.2.4.0',{main:''}); expectCode('BASE_EXECUTABLE_ENTRY_UNDECLARED',()=>validateBaselineCandidate(b,{releaseRoot:r})); });
test('entry escape rejected', () => { const r=temp(), b=makeRelease(r,'base','5.10.2.4.0',{main:'../escape.js'}); fs.writeFileSync(path.join(r,'escape.js'),'x'); expectCode('BASE_EXECUTABLE_ENTRY_ESCAPES_RELEASE',()=>validateBaselineCandidate(b,{releaseRoot:r})); });
test('missing declared entry rejected', () => { const r=temp(), b=makeRelease(r,'base','5.10.2.4.0',{main:'missing.js'}); expectCode('BASE_EXECUTABLE_ENTRY_MISSING',()=>validateBaselineCandidate(b,{releaseRoot:r})); });
test('exactly one discovery', () => { const r=temp(), b=makeRelease(r,'base'); assert.equal(discoverExactlyOneBaseline({releaseRoot:r}).path,b); });
test('zero discovery fail closed', () => { const r=temp(); expectCode('BASELINE_CANDIDATE_COUNT_ZERO',()=>discoverExactlyOneBaseline({releaseRoot:r})); });
test('multiple discovery fail closed', () => { const r=temp(); makeRelease(r,'a'); makeRelease(r,'b'); expectCode('BASELINE_CANDIDATE_COUNT_MULTIPLE',()=>discoverExactlyOneBaseline({releaseRoot:r})); });
test('explicit mode retained', () => { const r=temp(), b=makeRelease(r,'base'); assert.equal(resolveBaseline({releaseRoot:r,baseReleasePath:b}).resolution_mode,'EXPLICIT_VALIDATED_PARAMETER'); });
test('discovery mode retained', () => { const r=temp(); makeRelease(r,'base'); assert.equal(resolveBaseline({releaseRoot:r}).resolution_mode,'EXACTLY_ONE_DISCOVERY'); });
test('launcher readback hash and immutable backup', () => { const r=temp(), l=makeLauncher(r), d=path.join(r,'backups'); const x=launcherReadbackAndBackup({launcherPath:l,launcherBackupDirectory:d}); assert.equal(x.launcher_sha256,crypto.createHash('sha256').update(fs.readFileSync(l)).digest('hex')); assert.deepEqual(fs.readFileSync(x.launcher_backup_path),fs.readFileSync(l)); const y=launcherReadbackAndBackup({launcherPath:l,launcherBackupDirectory:d}); assert.equal(y.launcher_backup_path,x.launcher_backup_path); });
test('launcher missing rejected', () => { const r=temp(); expectCode('AUTHORITY_LAUNCHER_MISSING',()=>launcherReadbackAndBackup({launcherPath:path.join(r,'missing'),launcherBackupDirectory:r})); });
test('recursive clone preserves full tree', () => { const r=temp(), b=makeRelease(r,'base'), c=path.join(r,'candidate'); const x=cloneCompleteBaseline(b,c,{releaseRoot:r}); assert.equal(x.cloned_entry_count,4); assert.equal(fs.readFileSync(path.join(c,'nested','asset.txt'),'utf8'),'asset\n'); });
test('existing candidate rejected', () => { const r=temp(), b=makeRelease(r,'base'), c=path.join(r,'candidate'); fs.mkdirSync(c); expectCode('CANDIDATE_RELEASE_ALREADY_EXISTS',()=>cloneCompleteBaseline(b,c,{releaseRoot:r})); });
test('candidate outside root rejected', () => { const r=temp(), b=makeRelease(r,'base'), x=temp(); expectCode('CANDIDATE_OUTSIDE_RELEASE_ROOT',()=>cloneCompleteBaseline(b,path.join(x,'candidate'),{releaseRoot:r})); });
test('candidate equals baseline rejected', () => { const r=temp(), b=makeRelease(r,'base'); expectCode('CANDIDATE_EQUALS_BASELINE',()=>cloneCompleteBaseline(b,b,{releaseRoot:r})); });
test('full resolver resolves backs up and clones', () => { const r=temp(), b=makeRelease(r,'base'), l=makeLauncher(r), c=path.join(r,'rc6'); const x=runResolver({releaseRoot:r,baseReleasePath:b,launcherPath:l,launcherBackupDirectory:path.join(r,'backups'),candidateReleasePath:c}); assert.equal(x.guessed_path_count,0); assert.equal(x.baseline_clone_performed,true); assert.equal(x.clone.candidate_release_path,c); });
test('resolve-only avoids candidate write', () => { const r=temp(), b=makeRelease(r,'base'), l=makeLauncher(r), c=path.join(r,'rc6'); const x=runResolver({releaseRoot:r,baseReleasePath:b,launcherPath:l,launcherBackupDirectory:path.join(r,'backups'),candidateReleasePath:c,resolveOnly:true}); assert.equal(x.baseline_clone_performed,false); assert.equal(fs.existsSync(c),false); });
test('PowerShell style argument names accepted', () => { const x=parseArgs(['-BaseReleasePath','X','-ReleaseRoot','R','-ResolveOnly']); assert.deepEqual(x,{baseReleasePath:'X',releaseRoot:'R',resolveOnly:true}); });
test('unknown argument fail closed', () => expectCode('UNKNOWN_ARGUMENT',()=>parseArgs(['-GuessPath','x'])));

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`PASS_${passed}_OF_25\n`);
