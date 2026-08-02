'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SERVICE_NAMES,
  COMPONENT_NAMES,
  AiYollaWaveCardError,
  parseKstMinute,
  waveNumber,
  validateDirective,
  classifyWaveDirective,
  buildWaveTimeCard,
  renderWaveTimeCardHtml,
  buildAndRenderWaveTimeCard
} = require('../aiYollaWaveTimeCards.js');

const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'AI_YOLLA_WAVE_TIME_CARD_FIXTURE_V1.json'), 'utf8'));
const ledger = fixture.ledger;
const cases = fixture.cases;

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof AiYollaWaveCardError && error.code === code);
}

test('KST minute parsing and wave number are deterministic', () => {
  assert.equal(parseKstMinute('2026-08-02 18:03 KST', 'time'), Date.parse('2026-08-02T18:03:00+09:00'));
  assert.equal(waveNumber('WAVE_2'), 2);
});

test('executable Wave 2 card is displayed', () => {
  const card = buildWaveTimeCard({ ...cases.executable, ledger });
  assert.equal(card.state_code, 'EXECUTABLE');
  assert.equal(card.state_label, '실행가능');
  assert.equal(card.wave_number, 2);
});

test('duplicate prompt key is blocked', () => {
  const card = buildWaveTimeCard({ ...cases.duplicate, ledger });
  assert.equal(card.state_code, 'DUPLICATE_BLOCKED');
  assert.equal(card.state_label, '중복 Prompt 차단');
});

test('stale Wave is blocked', () => {
  const card = buildWaveTimeCard({ ...cases.stale, ledger });
  assert.equal(card.state_code, 'STALE_WAVE_BLOCKED');
  assert.equal(card.state_label, '구버전 Wave 차단');
});

test('same Wave newer timestamp without supersession is authority conflict', () => {
  const card = buildWaveTimeCard({ ...cases.conflict, ledger });
  assert.equal(card.state_code, 'AUTHORITY_CONFLICT');
  assert.equal(card.state_label, '권위 충돌');
});

test('supported PASS result marks completion and published time', () => {
  const card = buildWaveTimeCard({ ...cases.completed, ledger });
  assert.equal(card.state_code, 'COMPLETED');
  assert.equal(card.decision_display, 'PASS');
  assert.equal(card.result_published_at_kst, '2026-08-02 18:20 KST');
});

test('unsupported PASS is suppressed and not completed', () => {
  const card = buildWaveTimeCard({ ...cases.unsupported_pass, ledger });
  assert.equal(card.state_code, 'EXECUTABLE');
  assert.equal(card.decision_display, 'UNVERIFIED');
  assert.equal(card.unsupported_pass_suppressed, true);
});

test('Duplicate Prompt Key prefix is exactly 12 characters', () => {
  const card = buildWaveTimeCard({ ...cases.executable, ledger });
  assert.equal(card.duplicate_prompt_key_prefix, 'c92e436459bd');
  assert.equal(card.duplicate_prompt_key_prefix.length, 12);
});

test('all three canonical service names are present', () => {
  const card = buildWaveTimeCard({ ...cases.executable, ledger });
  assert.deepEqual(card.service_catalog, SERVICE_NAMES);
  assert.equal(new Set(card.service_catalog).size, 3);
});

test('canonical AI Yolla component names are enforced', () => {
  assert.deepEqual(COMPONENT_NAMES, ['AI욜라 Runtime', 'AI욜라 Data Base', '선택된 전문 AI 서비스']);
  const broken = structuredClone(cases.executable.directive);
  broken.ai_yolla_component_name = 'PC Agent 상태';
  expectCode(() => validateDirective(broken), 'UNSUPPORTED_COMPONENT_NAME');
});

test('HTML displays registered and published times, Wave badge and service names', () => {
  const card = buildWaveTimeCard({ ...cases.completed, ledger });
  const html = renderWaveTimeCardHtml(card);
  for (const value of [
    'Wave 번호', '지시 등록시간 KST', '결과 게시시간 KST', 'Directive ID',
    'Duplicate Prompt Key', '현재 상태', '선택 서비스명', 'AI욜라 구성요소명',
    '2026-08-02 18:03 KST', '2026-08-02 18:20 KST', 'WAVE_2',
    ...SERVICE_NAMES, 'AI욜라 Runtime 상태'
  ]) assert.match(html, new RegExp(value));
  assert.doesNotMatch(html, />PC Agent 상태</);
});

test('HTML includes duplicate and stale badges', () => {
  const duplicateHtml = buildAndRenderWaveTimeCard({ ...cases.duplicate, ledger }).html;
  const staleHtml = buildAndRenderWaveTimeCard({ ...cases.stale, ledger }).html;
  assert.match(duplicateHtml, /badge-duplicate/);
  assert.match(duplicateHtml, /중복 Prompt 차단/);
  assert.match(staleHtml, /badge-stale/);
  assert.match(staleHtml, /구버전 Wave 차단/);
});

test('HTML escapes service and directive content', () => {
  const broken = structuredClone(cases.executable.directive);
  broken.directive_id = '<script>alert(1)</script>';
  const card = buildWaveTimeCard({ directive: broken, ledger, result: null });
  const html = renderWaveTimeCardHtml(card);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('explicit supersession permits same-Wave newer directive', () => {
  const directive = structuredClone(cases.conflict.directive);
  directive.supersedes_directive_id = cases.executable.directive.directive_id;
  const card = buildWaveTimeCard({ directive, ledger, result: null });
  assert.equal(card.state_code, 'EXECUTABLE');
});

test('invalid duplicate key fails closed', () => {
  const directive = structuredClone(cases.executable.directive);
  directive.duplicate_prompt_key = 'bad';
  expectCode(() => validateDirective(directive), 'INVALID_DUPLICATE_PROMPT_KEY');
});

test('invalid KST format fails closed', () => {
  const directive = structuredClone(cases.executable.directive);
  directive.registered_at_kst = '2026-08-02T18:03:00+09:00';
  expectCode(() => validateDirective(directive), 'INVALID_KST_MINUTE');
});

test('unknown service fails closed', () => {
  const directive = structuredClone(cases.executable.directive);
  directive.selected_service_name = '임의 서비스';
  expectCode(() => validateDirective(directive), 'UNSUPPORTED_SERVICE_NAME');
});

test('bad ledger processed key fails closed', () => {
  const brokenLedger = structuredClone(ledger);
  brokenLedger.processed_prompt_keys.push('bad');
  expectCode(() => classifyWaveDirective(cases.executable.directive, brokenLedger, null), 'INVALID_PROCESSED_KEY');
});

test('fixture closure receipt proves Wave 1 gate', () => {
  assert.equal(fixture.wave1_closure_receipt.terminal, 'C4_WAVE1_CLOSURE_RECEIPT_PASS');
  assert.equal(fixture.wave1_closure_receipt.comment_id, 5156826967);
  assert.equal(fixture.wave1_closure_receipt.remote_head, '9b82e7a1ba853f7581d258996614b0d46107821f');
});

test('contract-required labels are preserved', () => {
  const card = buildWaveTimeCard({ ...cases.executable, ledger });
  assert.equal(card.schema_version, 'AI_YOLLA_WAVE_TIME_CARD_V1');
  assert.equal(card.badge, 'WAVE');
  assert.equal(card.unsupported_pass_suppressed, false);
});
