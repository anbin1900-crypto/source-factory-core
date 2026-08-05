'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fail(code, detail = {}) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  throw error;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function parseArgs(argv) {
  const out = {};
  const map = {
    '--contract': 'contractPath',
    '--legacy-installer': 'legacyInstallerPath',
    '--rc7-installer': 'rc7InstallerPath',
    '--receipt': 'receiptPath'
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = map[argv[i]];
    if (!key) fail('UNKNOWN_ARGUMENT', { arg: argv[i] });
    if (i + 1 >= argv.length) fail('ARGUMENT_VALUE_MISSING', { arg: argv[i] });
    out[key] = argv[++i];
  }
  if (!out.contractPath) fail('CONTRACT_PATH_REQUIRED');
  return out;
}

function analyzeInstaller(text, contract) {
  const checks = [];
  const findings = [];
  const check = (id, passed, code = id) => {
    checks.push({ id, passed: Boolean(passed) });
    if (!passed) findings.push(code);
  };
  const has = pattern => pattern.test(text);
  const target = contract.target_version;

  check('TARGET_VERSION_RC7', text.includes(target), 'TARGET_VERSION_MISMATCH');
  check('RESOLVER_SOURCE_REFERENCED', /target_pc_runtime_locator\.cjs/i.test(text), 'RESOLVER_SOURCE_NOT_REFERENCED');
  check('RESOLVER_INVOKED', /&\s*(?:node|\$NodePath|\$ElectronPath|\$NodeExecutable)\s+@?\w*Resolver\w*/i.test(text), 'RESOLVER_INVOCATION_MISSING');
  check('RESOLVER_EXIT_CHECKED', /\$LASTEXITCODE\s*-ne\s*0|ExitCode\s*-ne\s*0/i.test(text), 'RESOLVER_EXIT_NOT_CHECKED');

  for (const token of ['-ReleaseRoot','-BaselineVersion','-TargetVersion','-CandidateReleasePath','-LauncherPath','-ReceiptPath']) {
    check(`RESOLVER_ARG_${token}`, text.includes(token), `RESOLVER_ARGUMENT_MISSING:${token}`);
  }
  check('EXPLICIT_BASE_RELEASE_PATH_FORWARDING', /if\s*\([^)]*\$BaseReleasePath[^)]*\)[\s\S]{0,350}-BaseReleasePath/i.test(text), 'EXPLICIT_BASE_RELEASE_PATH_NOT_FORWARDED');
  check('RESOLVER_RECEIPT_PARSED', /ConvertFrom-Json/i.test(text), 'RESOLVER_RECEIPT_NOT_PARSED');
  check('RESOLVED_BASE_PATH_USED', /\.baseline\.path/i.test(text), 'RESOLVED_BASE_PATH_NOT_USED');
  check('RESOLVED_CANDIDATE_PATH_USED', /\.clone\.candidate_release_path/i.test(text), 'RESOLVED_CANDIDATE_PATH_NOT_USED');
  check('BASELINE_TREE_SHA_CONSUMED', /\.clone\.baseline_tree_sha256/i.test(text), 'BASELINE_TREE_SHA_NOT_CONSUMED');
  check('LAUNCHER_SHA_CONSUMED', /\.launcher\.launcher_sha256/i.test(text), 'LAUNCHER_SHA_NOT_CONSUMED');
  check('LAUNCHER_BACKUP_CONSUMED', /\.launcher\.launcher_backup_path/i.test(text), 'LAUNCHER_BACKUP_NOT_CONSUMED');
  check('GUESSED_PATH_ZERO_ASSERTED', /guessed_path_count[^\r\n]{0,100}(?:-ne|!=|!==)\s*0/i.test(text), 'GUESSED_PATH_ZERO_NOT_ASSERTED');
  check('CLONE_PERFORMED_ASSERTED', /baseline_clone_performed[^\r\n]{0,100}(?:-ne\s*\$true|!==\s*true|!=\s*true)/i.test(text), 'CLONE_PERFORMED_NOT_ASSERTED');

  check('NO_INLINE_BASELINE_DISCOVERY', !has(/Get-ChildItem[\s\S]{0,240}\$ReleaseRoot/i), 'INLINE_BASELINE_DISCOVERY_FORBIDDEN');
  check('NO_INLINE_BASELINE_CLONE', !has(/Copy-Item[\s\S]{0,180}\$BaseReleasePath/i), 'INLINE_BASELINE_CLONE_FORBIDDEN');
  check('NO_INLINE_LAUNCHER_BACKUP', !has(/WriteAllBytes\([^\r\n]{0,200}\$Launcher/i), 'INLINE_LAUNCHER_BACKUP_FORBIDDEN');
  const invocationIndex = text.search(/&\s*(?:node|\$NodePath|\$ElectronPath|\$NodeExecutable)\s+@?\w*Resolver\w*/i);
  const preInvocationText = invocationIndex >= 0 ? text.slice(0, invocationIndex) : text;
  check('NO_CANDIDATE_PREDELETE', !/Remove-Item[^\r\n]{0,180}\$Candidate(?:InputPath|ReleasePath)?/i.test(preInvocationText), 'CANDIDATE_PREDELETE_FORBIDDEN');
  check('NO_MANUAL_BASELINE_ASSIGNMENT', !has(/\$BaseReleasePath\s*=\s*(?:Join-Path|\$c\[0\]|Get-ChildItem)/i), 'MANUAL_BASELINE_ASSIGNMENT_FORBIDDEN');
  check('NO_MANUAL_CANDIDATE_ASSIGNMENT', !has(/\$Candidate(?:ReleasePath)?\s*=\s*Join-Path\s+\$ReleaseRoot/i), 'MANUAL_CANDIDATE_ASSIGNMENT_FORBIDDEN');

  const duplicateCodes = findings.filter((code, index) => findings.indexOf(code) !== index);
  check('FINDING_CODES_UNIQUE', duplicateCodes.length === 0, 'DUPLICATE_FINDING_CODE');

  return {
    pass: findings.length === 0,
    findings: [...new Set(findings)],
    checks,
    check_count: checks.length,
    installer_sha256: sha256(Buffer.from(text)),
    installer_size_bytes: Buffer.byteLength(text)
  };
}

function validateFixture(baseDir, fixture, contract) {
  const fixturePath = path.resolve(baseDir, fixture.path);
  const analysis = analyzeInstaller(readText(fixturePath), contract);
  const expected = fixture.expected_outcome;
  const expectedCodes = fixture.expected_findings || [];
  const missingExpectedCodes = expectedCodes.filter(code => !analysis.findings.includes(code));
  const outcomeMatches = expected === 'PASS' ? analysis.pass : !analysis.pass;
  return {
    id: fixture.id,
    path: fixture.path,
    expected_outcome: expected,
    actual_outcome: analysis.pass ? 'PASS' : 'FAIL_CLOSED',
    outcome_matches: outcomeMatches,
    expected_findings: expectedCodes,
    missing_expected_findings: missingExpectedCodes,
    analysis,
    fixture_pass: outcomeMatches && missingExpectedCodes.length === 0
  };
}

function validateContract(contract) {
  const failures = [];
  const required = [
    ['CONTROL_ID', contract.control_id === 'V1-C-MODE-6W-VALIDATION-CYCLE-002'],
    ['WAVE_ID', contract.wave_id === 'V1-C-MODE-6W-WAVE-016'],
    ['REGISTRY_SEQUENCE', contract.registry_sequence === 16],
    ['ROLE', contract.role === 'AUTOMATION-C-W1'],
    ['TARGET_VERSION', contract.target_version === '5.10.2.4.2-rc7'],
    ['RESULT_KEY', contract.result_key === `${contract.directive_comment}00`],
    ['RESOLVER_COMMIT', contract.inputs?.resolver?.commit === 'ed8bde5eb66f0d65de64ad1dfae4fde038e6012c'],
    ['HANDOFF_COMMIT', contract.inputs?.handoff?.commit === '001f2b23f743b204565f91bd058094330fbaa11a'],
    ['RC6_COMMIT', contract.inputs?.rc6_installer?.commit === 'ceb5ae6591c223be7a8b093d55c869170cb505f2'],
    ['GUESSED_PATH_ZERO', contract.required_semantics?.guessed_path_count === 0],
    ['CANDIDATE_OVERWRITE_ZERO', contract.required_semantics?.candidate_overwrite_count === 0]
  ];
  for (const [id, pass] of required) if (!pass) failures.push(id);
  return { pass: failures.length === 0, failures, assertion_count: required.length };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const contractPath = path.resolve(args.contractPath);
  const baseDir = path.dirname(contractPath);
  const contract = readJson(contractPath);
  const contractValidation = validateContract(contract);
  const fixtures = (contract.fixtures || []).map(fixture => validateFixture(baseDir, fixture, contract));

  let legacyInstaller = null;
  if (args.legacyInstallerPath) {
    legacyInstaller = analyzeInstaller(readText(path.resolve(args.legacyInstallerPath)), contract);
  }

  let rc7Installer = { status: 'PENDING_NOT_PROVIDED', pass: false, findings: ['RC7_INSTALLER_NOT_PROVIDED'] };
  if (args.rc7InstallerPath) {
    const p = path.resolve(args.rc7InstallerPath);
    rc7Installer = { status: 'VALIDATED', path: p, ...analyzeInstaller(readText(p), contract) };
  }

  const fixturePass = fixtures.every(x => x.fixture_pass);
  const legacyNegativePass = legacyInstaller ? !legacyInstaller.pass : true;
  const actualRc7Required = Boolean(args.rc7InstallerPath);
  const actualRc7Pass = actualRc7Required ? rc7Installer.pass : false;
  const offlineFixtureGatePass = contractValidation.pass && fixturePass && legacyNegativePass;
  const status = actualRc7Required
    ? (offlineFixtureGatePass && actualRc7Pass ? 'PASS_ACTUAL_RC7' : 'FAIL_ACTUAL_RC7')
    : (offlineFixtureGatePass ? 'PASS_FIXTURES_RC7_PENDING' : 'FAIL_FIXTURES');
  const assertionCount = contractValidation.assertion_count
    + fixtures.reduce((sum, x) => sum + x.analysis.check_count + x.expected_findings.length + 1, 0)
    + (legacyInstaller ? legacyInstaller.check_count + 1 : 0)
    + (actualRc7Required ? rc7Installer.check_count + 1 : 0);

  const receipt = {
    schema_version: 'RC7_RESOLVER_INTEGRATION_VALIDATION_RECEIPT_V1',
    status,
    control_id: contract.control_id,
    wave_id: contract.wave_id,
    result_key: contract.result_key,
    contract_validation: contractValidation,
    fixture_validation: fixtures,
    legacy_rc6_validation: legacyInstaller,
    actual_rc7_validation: rc7Installer,
    offline_fixture_gate_pass: offlineFixtureGatePass,
    actual_rc7_installer_provided: actualRc7Required,
    actual_rc7_installer_pass: actualRc7Pass,
    assertion_count: assertionCount,
    target_pc_execution_performed: false,
    production: false,
    ready: false,
    merge: false
  };

  const output = `${JSON.stringify(receipt, null, 2)}\n`;
  if (args.receiptPath) {
    fs.mkdirSync(path.dirname(path.resolve(args.receiptPath)), { recursive: true });
    fs.writeFileSync(path.resolve(args.receiptPath), output);
  }
  process.stdout.write(output);
  if (!offlineFixtureGatePass || (actualRc7Required && !actualRc7Pass)) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { analyzeInstaller, validateFixture, validateContract };
