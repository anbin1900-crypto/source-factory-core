'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const binder = require('../roleSelectedCardBindingAdapter.js');
const renderer = require('../../directiveResultStateCards.js');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ROLE_SELECTED_CARD_FIXTURE_V2.json'), 'utf8'));
const acceptance = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'C2_ROLE_SELECTION_ACCEPTANCE_V2.json'), 'utf8'));

function input(selectedRoleId) {
  return {
    selectedRoleId,
    c2Acceptance: acceptance,
    roles: fixture.roles,
    cardPackagesByRole: fixture.card_packages_by_role
  };
}

test('accepts exact C-2 Head and Blobs', () => {
  assert.equal(binder.validateC2Acceptance(acceptance).accepted, true);
});

test('rejects C-2 Head drift', () => {
  const broken = structuredClone(acceptance);
  broken.c2_authority.head = '0'.repeat(40);
  assert.throws(() => binder.validateC2Acceptance(broken), /C2_HEAD_MISMATCH/);
});

test('A-2 role binds result and PC cards only', () => {
  const bound = binder.bindRoleSelectedCards(input('A-2'), { renderer });
  assert.equal(bound.model.selected_role.role_id, 'A-2');
  assert.equal(bound.model.cards.directive, null);
  assert.equal(bound.model.cards.result.result_comment_id, 5154868280);
  assert.equal(bound.model.cards.pc_agent_backup.pc_id, 'YOLLA-PC-A2-FIXTURE');
  assert.match(bound.html, /data-selected-role-id="A-2"/);
});

test('B-1 idle role emits empty directive and result cards without leak', () => {
  const bound = binder.bindRoleSelectedCards(input('B-1'), { renderer });
  assert.equal(bound.model.cards.directive, null);
  assert.equal(bound.model.cards.result, null);
  assert.equal(bound.model.cards.pc_agent_backup.pc_id, 'YOLLA-PC-B1-FIXTURE');
  assert.match(bound.html, /data-card-state="EMPTY"/);
  assert.doesNotMatch(JSON.stringify(bound.model), /WORKER_TERMINALS_PENDING/);
});

test('C-1 role binds exact Directive and PC cards', () => {
  const bound = binder.bindRoleSelectedCards(input('C-1'), { renderer });
  assert.equal(bound.model.cards.directive.comment_id, 5154763830);
  assert.equal(bound.model.cards.result, null);
  assert.match(bound.model.cards.directive.open_post_url, /pull\/175#issuecomment-5154763830$/);
});

test('selection controller switches A-2 to B-1 to C-1', () => {
  const controller = binder.createRoleSelectionController({
    c2Acceptance: acceptance,
    roles: fixture.roles,
    cardPackagesByRole: fixture.card_packages_by_role
  }, { renderer });
  for (const roleId of ['A-2', 'B-1', 'C-1']) {
    const result = controller.selectRole(roleId);
    assert.equal(result.model.selected_role.role_id, roleId);
    assert.equal(controller.getSelectedRoleId(), roleId);
  }
});

test('switching roles replaces current model instead of merging cards', () => {
  const controller = binder.createRoleSelectionController({
    c2Acceptance: acceptance,
    roles: fixture.roles,
    cardPackagesByRole: fixture.card_packages_by_role
  }, { renderer });
  controller.selectRole('A-2');
  const c1 = controller.selectRole('C-1');
  assert.equal(c1.model.cards.result, null);
  assert.doesNotMatch(JSON.stringify(c1), /A2_P0_COMMON_CONTRACT/);
});

test('cross-role package is rejected', () => {
  const broken = structuredClone(fixture.card_packages_by_role);
  broken['A-2'].role_id = 'B-1';
  assert.throws(() => binder.bindRoleSelectedCards({
    ...input('A-2'),
    cardPackagesByRole: broken
  }, { renderer }), /CROSS_ROLE_PACKAGE_REJECTED/);
});

test('cross-role PC state is rejected', () => {
  const broken = structuredClone(fixture.card_packages_by_role);
  broken['C-1'].pc_state.role_id = 'A-2';
  assert.throws(() => binder.bindRoleSelectedCards({
    ...input('C-1'),
    cardPackagesByRole: broken
  }, { renderer }), /CROSS_ROLE_PC_STATE_REJECTED/);
});

test('directive package without C-2 pointer fails closed', () => {
  const broken = structuredClone(fixture.card_packages_by_role);
  broken['B-1'].directive = structuredClone(fixture.card_packages_by_role['C-1'].directive);
  broken['B-1'].directive.role_id = 'B-1';
  assert.throws(() => binder.bindRoleSelectedCards({
    ...input('B-1'),
    cardPackagesByRole: broken
  }, { renderer }), /DIRECTIVE_PACKAGE_WITHOUT_C2_POINTER/);
});

test('result pointer mismatch fails closed', () => {
  const broken = structuredClone(fixture.card_packages_by_role);
  broken['A-2'].result.result_comment_id = 1;
  assert.throws(() => binder.bindRoleSelectedCards({
    ...input('A-2'),
    cardPackagesByRole: broken
  }, { renderer }), /RESULT_POINTER_PACKAGE_MISMATCH/);
});

test('unknown role fails closed', () => {
  assert.throws(() => binder.bindRoleSelectedCards(input('D-99'), { renderer }), /SELECTED_ROLE_NOT_FOUND/);
});

test('incomplete renderer contract is rejected', () => {
  assert.throws(() => binder.bindRoleSelectedCards(input('A-2'), { renderer: {} }), /RENDERER_CONTRACT_INCOMPLETE/);
});

test('Fixture badges survive role binding', () => {
  for (const roleId of ['A-2', 'B-1', 'C-1']) {
    const bound = binder.bindRoleSelectedCards(input(roleId), { renderer });
    assert.equal(bound.model.cards.pc_agent_backup.badge, 'FIXTURE');
    if (bound.model.cards.directive) assert.equal(bound.model.cards.directive.badge, 'FIXTURE');
    if (bound.model.cards.result) assert.equal(bound.model.cards.result.badge, 'FIXTURE');
  }
});

test('unsupported PASS remains suppressed by parent card contract', () => {
  const broken = structuredClone(fixture.card_packages_by_role);
  broken['A-2'].result.decision = 'PASS';
  broken['A-2'].result.remote_head = null;
  broken['A-2'].result.output_pointer = null;
  broken['A-2'].result.blocker = null;
  const bound = binder.bindRoleSelectedCards({
    ...input('A-2'),
    cardPackagesByRole: broken
  }, { renderer });
  assert.equal(bound.model.cards.result.display_decision, 'UNVERIFIED');
  assert.equal(bound.unsupported_pass_display_count, 1);
});

test('supported fixture backup remains marked Fixture', () => {
  const bound = binder.bindRoleSelectedCards(input('C-1'), { renderer });
  assert.equal(bound.model.cards.pc_agent_backup.backup_evidence_status, 'SUPPORTED');
  assert.equal(bound.model.cards.pc_agent_backup.badge, 'FIXTURE');
});

test('mount fallback replaces innerHTML', () => {
  const container = { innerHTML: 'old' };
  const bound = binder.bindRoleSelectedCards(input('C-1'), { renderer });
  binder.mountRoleSelectedCards(container, bound);
  assert.match(container.innerHTML, /data-selected-role-id="C-1"/);
  assert.doesNotMatch(container.innerHTML, /^old/);
});

test('binding output contains exact authority identities', () => {
  const bound = binder.bindRoleSelectedCards(input('A-2'), { renderer });
  assert.equal(bound.model.authority.c2_head, '4327e06343cebd28273168cfaffdb2eda7d98222');
  assert.equal(bound.model.authority.c2_fixture_blob, 'ef50d074fba002d9be6434fc4c2619045ef52715');
  assert.equal(bound.model.authority.c4_parent_renderer_blob, '82a14c89f0d4f0ce2db55ea6da35cb00d23f846a');
});

test('selected output contains no other role package terminal or blocker', () => {
  for (const roleId of ['A-2', 'B-1', 'C-1']) {
    const bound = binder.bindRoleSelectedCards(input(roleId), { renderer });
    const encoded = JSON.stringify(bound);
    for (const other of ['A-2', 'B-1', 'C-1'].filter((candidate) => candidate !== roleId)) {
      const pkg = fixture.card_packages_by_role[other];
      if (pkg.result?.terminal) assert.equal(encoded.includes(pkg.result.terminal), false);
      if (pkg.result?.blocker) assert.equal(encoded.includes(pkg.result.blocker), false);
    }
  }
});
