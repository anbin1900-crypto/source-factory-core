'use strict';

const {
  ROLE_STATUSES,
  deepClone,
  validateRoleRegistry,
  appendRole
} = require('./roleRegistry');

const STATUS_BADGE_LABELS = Object.freeze({
  IDLE: '대기',
  DIRECTIVE_LOOKUP: '지시조회',
  DIRECTIVE_READY: '지시준비',
  DISPATCHING: '배포중',
  RUNNING: '실행중',
  RESULT_WAITING: '결과대기',
  COMPLETED: '완료',
  BLOCKED: '차단',
  FAILED: '실패',
  RETRYING: '재시도',
  OFFLINE: '오프라인'
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildRoleMenuModel(registry, options = {}) {
  validateRoleRegistry(registry);
  const selectedRoleId = options.selectedRoleId || null;
  const collapsedGroupIds = new Set(options.collapsedGroupIds || []);
  const groups = [...registry.groups]
    .sort((left, right) => left.order - right.order || left.group_id.localeCompare(right.group_id))
    .map((group) => {
      const roles = registry.roles
        .filter((role) => role.group_id === group.group_id)
        .sort((left, right) => left.order - right.order || left.role_id.localeCompare(right.role_id))
        .map((role) => ({
          ...deepClone(role),
          badge_label: STATUS_BADGE_LABELS[role.current_status],
          is_selected: role.role_id === selectedRoleId
        }));
      const expanded = group.collapsible
        ? !collapsedGroupIds.has(group.group_id)
        : true;
      return {
        ...deepClone(group),
        expanded,
        roles
      };
    });
  return {
    registry_id: registry.registry_id,
    selected_role_id: selectedRoleId,
    groups
  };
}

function renderRoleMenuHtml(model) {
  const groupHtml = model.groups.map((group) => {
    const groupId = escapeHtml(group.group_id);
    const rolesHtml = group.roles.map((role) => {
      const roleId = escapeHtml(role.role_id);
      const status = escapeHtml(role.current_status);
      const selectedClass = role.is_selected ? ' role-menu__role--selected' : '';
      const ariaCurrent = role.is_selected ? ' aria-current="true"' : '';
      return [
        `<li class="role-menu__item" data-role-item="${roleId}">`,
        `<button type="button" class="role-menu__role${selectedClass}" data-role-id="${roleId}" data-worker-window-id="${escapeHtml(role.worker_window_id)}"${ariaCurrent}>`,
        `<span class="role-menu__role-name">${escapeHtml(role.role_name)}</span>`,
        `<span class="role-menu__status role-menu__status--${status.toLowerCase()}" data-status="${status}">${escapeHtml(role.badge_label)}</span>`,
        '</button>',
        '</li>'
      ].join('');
    }).join('');
    const toggleDisabled = group.collapsible ? '' : ' disabled';
    return [
      `<section class="role-menu__group" data-group-id="${groupId}">`,
      `<button type="button" class="role-menu__group-toggle" data-group-toggle="${groupId}" aria-expanded="${group.expanded}"${toggleDisabled}>`,
      `<span>${escapeHtml(group.group_name)}</span>`,
      `<span class="role-menu__group-count">${group.roles.length}</span>`,
      '</button>',
      `<ul class="role-menu__roles" data-group-roles="${groupId}"${group.expanded ? '' : ' hidden'}>`,
      rolesHtml,
      '</ul>',
      '</section>'
    ].join('');
  }).join('');
  return `<nav class="role-menu" aria-label="역할 선택" data-registry-id="${escapeHtml(model.registry_id)}">${groupHtml}</nav>`;
}

function createLeftRoleMenuController(initialRegistry, options = {}) {
  let registry = deepClone(initialRegistry);
  validateRoleRegistry(registry);
  let selectedRoleId = options.selectedRoleId || null;
  const collapsedGroupIds = new Set(options.collapsedGroupIds || []);

  function getModel() {
    return buildRoleMenuModel(registry, { selectedRoleId, collapsedGroupIds: [...collapsedGroupIds] });
  }

  return Object.freeze({
    getModel,
    render: () => renderRoleMenuHtml(getModel()),
    selectRole: (roleId) => {
      if (!registry.roles.some((role) => role.role_id === roleId)) {
        throw new Error(`unknown role_id: ${roleId}`);
      }
      selectedRoleId = roleId;
      return getModel();
    },
    toggleGroup: (groupId) => {
      const group = registry.groups.find((candidate) => candidate.group_id === groupId);
      if (!group) throw new Error(`unknown group_id: ${groupId}`);
      if (!group.collapsible) return getModel();
      if (collapsedGroupIds.has(groupId)) collapsedGroupIds.delete(groupId);
      else collapsedGroupIds.add(groupId);
      return getModel();
    },
    appendRole: (role) => {
      registry = appendRole(registry, role);
      return getModel();
    },
    getRegistrySnapshot: () => deepClone(registry)
  });
}

function mountLeftRoleMenu(container, registry, options = {}) {
  if (!container || typeof container.addEventListener !== 'function') {
    throw new TypeError('container must be a DOM-like element');
  }
  const controller = createLeftRoleMenuController(registry, options);
  const render = () => { container.innerHTML = controller.render(); };
  container.addEventListener('click', (event) => {
    const target = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-role-id], [data-group-toggle]')
      : null;
    if (!target) return;
    if (target.dataset.roleId) controller.selectRole(target.dataset.roleId);
    if (target.dataset.groupToggle) controller.toggleGroup(target.dataset.groupToggle);
    render();
  });
  render();
  return controller;
}

function assertStatusBadgeCoverage() {
  const missing = ROLE_STATUSES.filter((status) => !STATUS_BADGE_LABELS[status]);
  if (missing.length) throw new Error(`missing status badge labels: ${missing.join(', ')}`);
  return true;
}

module.exports = {
  STATUS_BADGE_LABELS,
  escapeHtml,
  buildRoleMenuModel,
  renderRoleMenuHtml,
  createLeftRoleMenuController,
  mountLeftRoleMenu,
  assertStatusBadgeCoverage
};
