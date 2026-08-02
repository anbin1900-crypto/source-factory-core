'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cards = require('../directiveResultStateCards.js');

const root = path.resolve(__dirname, '..');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, 'fixtures', name), 'utf8'));
const directive = readJson('LATEST_VALID_DIRECTIVE_FIXTURE.json');
const result = readJson('WORK_RESULT_FIXTURE.json');
const pcState = readJson('PC_STATE_SNAPSHOT_FIXTURE.json');
const backup = readJson('BACKUP_RECEIPT_FIXTURE.json');

test('directive card preserves every exact identity field', () => {
  const card = cards.buildDirectiveCard(directive);
  for (const key of ['role_id','repository','pr_number','comment_id','directive_id','cycle_id','assignment_id','status','reason','source_time','selection_reason']) {
    assert.deepEqual(card[key], directive[key]);
  }
});

test('directive fixture renders explicit FIXTURE badge', () => {
  assert.equal(cards.buildDirectiveCard(directive).badge, 'FIXTURE');
});

test('directive open-post link is exact', () => {
  const card = cards.buildDirectiveCard(directive);
  assert.equal(card.open_post_url, 'https://github.com/fixture-org/fixture-repository/pull/165#issuecomment-900000001');
});

test('directive source hash is deterministic', () => {
  assert.equal(cards.buildDirectiveCard(directive).source_package_sha256, cards.buildDirectiveCard(JSON.parse(JSON.stringify(directive))).source_package_sha256);
});

test('result card preserves exact terminal and pointer', () => {
  const card = cards.buildResultCard(result);
  assert.equal(card.terminal, result.terminal);
  assert.equal(card.remote_head, result.remote_head);
  assert.equal(card.output_pointer, result.output_pointer);
});

test('supported PASS remains PASS', () => {
  const card = cards.buildResultCard(result);
  assert.equal(card.display_decision, 'PASS');
  assert.equal(card.evidence_status, 'SUPPORTED');
  assert.equal(card.unsupported_pass_suppressed, false);
});

test('result open-post link is exact', () => {
  assert.equal(cards.buildResultCard(result).open_result_post_url, 'https://github.com/fixture-org/fixture-repository/pull/165#issuecomment-900000002');
});

test('PASS without exact remote evidence is suppressed', () => {
  const broken = { ...result, remote_head: null, output_pointer: null };
  const card = cards.buildResultCard(broken);
  assert.equal(card.display_decision, 'UNVERIFIED');
  assert.equal(card.evidence_status, 'INCOMPLETE');
  assert.equal(card.unsupported_pass_suppressed, true);
});

test('PASS with blocker is contradictory and suppressed', () => {
  const broken = { ...result, blocker: 'EXTERNAL_GATE_MISSING' };
  const card = cards.buildResultCard(broken);
  assert.equal(card.display_decision, 'UNVERIFIED');
  assert.equal(card.evidence_status, 'CONTRADICTORY');
});

test('BLOCKED does not require PASS evidence', () => {
  const blocked = { ...result, decision: 'BLOCKED', blocker: 'TARGET_PC_OFFLINE', remote_head: null };
  const card = cards.buildResultCard(blocked);
  assert.equal(card.display_decision, 'BLOCKED');
  assert.equal(card.unsupported_pass_suppressed, false);
});

test('PC status card includes commit and retry count', () => {
  const card = cards.buildPcAgentBackupStatusCard(pcState, backup);
  assert.equal(card.github_commit, pcState.github_commit);
  assert.equal(card.retry_count, 2);
  assert.equal(card.agent_status, 'ONLINE_IDLE');
});

test('PC fixture renders explicit FIXTURE badge', () => {
  assert.equal(cards.buildPcAgentBackupStatusCard(pcState, backup).badge, 'FIXTURE');
});

test('complete backup receipt is supported', () => {
  const card = cards.buildPcAgentBackupStatusCard(pcState, backup);
  assert.equal(card.backup_evidence_status, 'SUPPORTED');
  assert.equal(card.unsupported_pass_suppressed, false);
});

test('backup PASS missing SHA is suppressed', () => {
  const card = cards.buildPcAgentBackupStatusCard(pcState, { ...backup, sha256: null });
  assert.equal(card.backup_evidence_status, 'CONTRADICTORY');
  assert.equal(card.unsupported_pass_suppressed, true);
});

test('HTML renders both required open-link actions', () => {
  const rendered = cards.renderDirectiveResultStateCards({ directive, result, pcState, backupReceipt: backup });
  assert.match(rendered.html, /data-action="open-post"/);
  assert.match(rendered.html, /data-action="open-result-post"/);
});

test('HTML contains directive, result and PC state cards', () => {
  const rendered = cards.renderDirectiveResultStateCards({ directive, result, pcState, backupReceipt: backup });
  assert.match(rendered.html, /data-card-type="DIRECTIVE"/);
  assert.match(rendered.html, /data-card-type="RESULT"/);
  assert.match(rendered.html, /data-card-type="PC_AGENT_BACKUP_STATUS"/);
});

test('HTML escapes untrusted reason text', () => {
  const unsafe = { ...directive, reason: '<script>alert(1)</script>' };
  const html = cards.renderDirectiveCardHtml(cards.buildDirectiveCard(unsafe));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('complete fixture dashboard displays no unsupported PASS', () => {
  const rendered = cards.renderDirectiveResultStateCards({ directive, result, pcState, backupReceipt: backup });
  assert.equal(rendered.unsupported_pass_display_count, 0);
});

test('all required contract and fixture JSON files parse', () => {
  const files = [
    'EXACT_DIRECTIVE_CARD_CONTRACT.json',
    'EXACT_RESULT_CARD_CONTRACT.json',
    'PC_AGENT_BACKUP_STATUS_CARD_CONTRACT.json',
    'fixtures/LATEST_VALID_DIRECTIVE_FIXTURE.json',
    'fixtures/WORK_RESULT_FIXTURE.json',
    'fixtures/PC_STATE_SNAPSHOT_FIXTURE.json',
    'fixtures/BACKUP_RECEIPT_FIXTURE.json'
  ];
  for (const file of files) assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
});
