'use strict';

const DEFAULT_RENDERER_PATH = '../directiveResultStateCards.js';
const EXPECTED_C2_HEAD = '4327e06343cebd28273168cfaffdb2eda7d98222';
const EXPECTED_C2_FIXTURE_BLOB = 'ef50d074fba002d9be6434fc4c2619045ef52715';
const EXPECTED_C2_SOURCE_BLOB = 'ce4ba836fea040dcdc9d603110372cd5c5519e8c';
const EXPECTED_C2_REPORT_BLOB = 'd03f80bfd5913e87da47aa07ba693e69d1cc32ff';
const EXPECTED_PARENT_RENDERER_BLOB = '82a14c89f0d4f0ce2db55ea6da35cb00d23f846a';

class RoleSelectedCardBindingError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'RoleSelectedCardBindingError';
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireCondition(condition, code, details = {}) {
  if (!condition) throw new RoleSelectedCardBindingError(code, details);
}

function loadDefaultRenderer() {
  return require(DEFAULT_RENDERER_PATH);
}

function validateRenderer(renderer) {
  const methods = [
    'buildDirectiveCard',
    'buildResultCard',
    'buildPcAgentBackupStatusCard',
    'renderDirectiveCardHtml',
    'renderResultCardHtml',
    'renderPcAgentBackupStatusCardHtml'
  ];
  for (const method of methods) {
    requireCondition(renderer && typeof renderer[method] === 'function', 'RENDERER_CONTRACT_INCOMPLETE', { method });
  }
  return renderer;
}

function validateC2Acceptance(acceptance) {
  requireCondition(acceptance?.accepted === true, 'C2_ACCEPTANCE_NOT_PASS');
  const authority = acceptance?.c2_authority;
  requireCondition(authority?.head === EXPECTED_C2_HEAD, 'C2_HEAD_MISMATCH');
  requireCondition(authority?.role_registry_fixture?.blob === EXPECTED_C2_FIXTURE_BLOB, 'C2_FIXTURE_BLOB_MISMATCH');
  requireCondition(authority?.role_registry_source?.blob === EXPECTED_C2_SOURCE_BLOB, 'C2_SOURCE_BLOB_MISMATCH');
  requireCondition(authority?.final_report?.blob === EXPECTED_C2_REPORT_BLOB, 'C2_REPORT_BLOB_MISMATCH');
  requireCondition(
    acceptance?.c4_parent_card_authority?.renderer_blob === EXPECTED_PARENT_RENDERER_BLOB,
    'C4_PARENT_RENDERER_BLOB_MISMATCH'
  );
  requireCondition(
    acceptance?.consumption_mode === 'EXACT_HEAD_BLOB_ADAPTER_NO_C2_SOURCE_COPY',
    'C2_CONSUMPTION_MODE_INVALID'
  );
  return clone(acceptance);
}

function validateRoleContext(role) {
  const required = [
    'role_id', 'role_name', 'group_id', 'role_type', 'worker_window_id',
    'authority_repository', 'authority_pr', 'current_status',
    'latest_directive_pointer', 'latest_result_pointer'
  ];
  for (const field of required) {
    requireCondition(Object.prototype.hasOwnProperty.call(role || {}, field), 'ROLE_CONTEXT_FIELD_MISSING', {
      role_id: role?.role_id ?? null,
      field
    });
  }
  return role;
}

function pointerIdentity(pointer) {
  if (pointer === null) return null;
  return {
    repository: pointer.repository,
    pr_number: pointer.pr_number,
    comment_id: pointer.comment_id,
    directive_id: pointer.directive_id,
    cycle_id: pointer.cycle_id,
    assignment_id: pointer.assignment_id
  };
}

function assertPointerMatchesPackage(pointer, packageValue, kind, roleId) {
  if (pointer === null) {
    requireCondition(packageValue === null, `${kind}_PACKAGE_WITHOUT_C2_POINTER`, { role_id: roleId });
    return;
  }
  requireCondition(packageValue !== null && typeof packageValue === 'object', `${kind}_PACKAGE_MISSING`, {
    role_id: roleId
  });
  const packageIdentity = kind === 'DIRECTIVE'
    ? {
        repository: packageValue.repository,
        pr_number: packageValue.pr_number,
        comment_id: packageValue.comment_id,
        directive_id: packageValue.directive_id,
        cycle_id: packageValue.cycle_id,
        assignment_id: packageValue.assignment_id
      }
    : {
        repository: packageValue.repository,
        pr_number: packageValue.pr_number,
        comment_id: packageValue.result_comment_id,
        directive_id: packageValue.result_for_directive_id,
        cycle_id: pointer.cycle_id,
        assignment_id: pointer.assignment_id
      };
  requireCondition(
    JSON.stringify(pointerIdentity(pointer)) === JSON.stringify(packageIdentity),
    `${kind}_POINTER_PACKAGE_MISMATCH`,
    { role_id: roleId, pointer: pointerIdentity(pointer), package_identity: packageIdentity }
  );
}

function emptyCardHtml(cardType, roleId) {
  return `<article class="state-card empty-card" data-card-type="${cardType}" data-role-id="${roleId}" data-card-state="EMPTY"></article>`;
}

function selectRolePackage(input, selectedRoleId) {
  requireCondition(input && typeof input === 'object', 'BINDING_INPUT_REQUIRED');
  validateC2Acceptance(input.c2Acceptance);
  requireCondition(Array.isArray(input.roles), 'ROLE_CONTEXTS_REQUIRED');
  const roles = input.roles.map(validateRoleContext);
  requireCondition(new Set(roles.map((role) => role.role_id)).size === roles.length, 'DUPLICATE_ROLE_ID');
  const role = roles.find((candidate) => candidate.role_id === selectedRoleId);
  requireCondition(Boolean(role), 'SELECTED_ROLE_NOT_FOUND', { selected_role_id: selectedRoleId });
  const packageValue = clone(input.cardPackagesByRole?.[selectedRoleId]);
  requireCondition(Boolean(packageValue), 'SELECTED_ROLE_PACKAGE_MISSING', { selected_role_id: selectedRoleId });
  requireCondition(packageValue.role_id === selectedRoleId, 'CROSS_ROLE_PACKAGE_REJECTED', {
    selected_role_id: selectedRoleId,
    package_role_id: packageValue.role_id
  });
  requireCondition(packageValue.pc_state?.role_id === selectedRoleId, 'CROSS_ROLE_PC_STATE_REJECTED');
  requireCondition(packageValue.backup_receipt?.role_id === selectedRoleId, 'CROSS_ROLE_BACKUP_REJECTED');
  if (packageValue.directive !== null) {
    requireCondition(packageValue.directive.role_id === selectedRoleId, 'CROSS_ROLE_DIRECTIVE_REJECTED');
  }
  assertPointerMatchesPackage(role.latest_directive_pointer, packageValue.directive, 'DIRECTIVE', selectedRoleId);
  assertPointerMatchesPackage(role.latest_result_pointer, packageValue.result, 'RESULT', selectedRoleId);
  return { role: clone(role), packageValue };
}

function bindRoleSelectedCards(input, options = {}) {
  const renderer = validateRenderer(options.renderer || loadDefaultRenderer());
  const selectedRoleId = input?.selectedRoleId;
  requireCondition(typeof selectedRoleId === 'string' && selectedRoleId.length > 0, 'SELECTED_ROLE_ID_REQUIRED');
  const { role, packageValue } = selectRolePackage(input, selectedRoleId);

  const directiveCard = packageValue.directive === null
    ? null
    : renderer.buildDirectiveCard(clone(packageValue.directive));
  const resultCard = packageValue.result === null
    ? null
    : renderer.buildResultCard(clone(packageValue.result));
  const pcAgentCard = renderer.buildPcAgentBackupStatusCard(
    clone(packageValue.pc_state),
    clone(packageValue.backup_receipt)
  );

  const directiveHtml = directiveCard
    ? renderer.renderDirectiveCardHtml(directiveCard)
    : emptyCardHtml('DIRECTIVE', selectedRoleId);
  const resultHtml = resultCard
    ? renderer.renderResultCardHtml(resultCard)
    : emptyCardHtml('RESULT', selectedRoleId);
  const pcHtml = renderer.renderPcAgentBackupStatusCardHtml(pcAgentCard);

  const model = {
    schema_version: 'ROLE_SELECTED_CARD_BINDING_V2',
    selected_role: {
      role_id: role.role_id,
      role_name: role.role_name,
      group_id: role.group_id,
      role_type: role.role_type,
      worker_window_id: role.worker_window_id,
      browser_session_id: role.browser_session_id,
      current_status: role.current_status
    },
    cards: {
      directive: directiveCard,
      result: resultCard,
      pc_agent_backup: pcAgentCard
    },
    mount_contract: {
      mount_id: `role-selected-cards::${role.role_id}`,
      replace_previous_role_content: true,
      selected_role_only: true,
      cross_role_result_leak_count: 0
    },
    authority: {
      c2_head: EXPECTED_C2_HEAD,
      c2_fixture_blob: EXPECTED_C2_FIXTURE_BLOB,
      c2_source_blob: EXPECTED_C2_SOURCE_BLOB,
      c2_report_blob: EXPECTED_C2_REPORT_BLOB,
      c4_parent_renderer_blob: EXPECTED_PARENT_RENDERER_BLOB
    }
  };

  const serialized = JSON.stringify(model);
  for (const otherRole of input.roles) {
    if (otherRole.role_id !== selectedRoleId) {
      const otherPackage = input.cardPackagesByRole?.[otherRole.role_id];
      const sensitiveValues = [
        otherPackage?.result?.blocker,
        otherPackage?.result?.terminal,
        otherPackage?.directive?.directive_id
      ].filter((value) => typeof value === 'string' && value.length > 0);
      for (const value of sensitiveValues) {
        requireCondition(!serialized.includes(value), 'CROSS_ROLE_RESULT_LEAK_DETECTED', {
          selected_role_id: selectedRoleId,
          leaked_role_id: otherRole.role_id,
          value
        });
      }
    }
  }

  return {
    model,
    html: `<section class="role-selected-card-mount" data-selected-role-id="${role.role_id}">${directiveHtml}${resultHtml}${pcHtml}</section>`,
    unsupported_pass_display_count:
      Number(Boolean(resultCard?.unsupported_pass_suppressed)) +
      Number(Boolean(pcAgentCard?.unsupported_pass_suppressed))
  };
}

function createRoleSelectionController(input, options = {}) {
  let selectedRoleId = null;
  let current = null;
  return Object.freeze({
    selectRole(roleId) {
      current = bindRoleSelectedCards({ ...input, selectedRoleId: roleId }, options);
      selectedRoleId = roleId;
      return clone(current);
    },
    getSelectedRoleId() {
      return selectedRoleId;
    },
    getCurrentBinding() {
      return clone(current);
    }
  });
}

function mountRoleSelectedCards(container, binding) {
  requireCondition(container && typeof container === 'object', 'MOUNT_CONTAINER_REQUIRED');
  requireCondition(binding && typeof binding.html === 'string', 'MOUNT_BINDING_REQUIRED');
  if (typeof container.replaceChildren === 'function' && container.ownerDocument?.createRange) {
    const fragment = container.ownerDocument.createRange().createContextualFragment(binding.html);
    container.replaceChildren(fragment);
    return container;
  }
  requireCondition('innerHTML' in container, 'MOUNT_CONTAINER_UNSUPPORTED');
  container.innerHTML = binding.html;
  return container;
}

module.exports = {
  EXPECTED_C2_HEAD,
  EXPECTED_C2_FIXTURE_BLOB,
  EXPECTED_C2_SOURCE_BLOB,
  EXPECTED_C2_REPORT_BLOB,
  EXPECTED_PARENT_RENDERER_BLOB,
  RoleSelectedCardBindingError,
  validateC2Acceptance,
  selectRolePackage,
  bindRoleSelectedCards,
  createRoleSelectionController,
  mountRoleSelectedCards
};
