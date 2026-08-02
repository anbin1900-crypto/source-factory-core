'use strict';

const ROLE_STATUSES = Object.freeze([
  'IDLE',
  'DIRECTIVE_LOOKUP',
  'DIRECTIVE_READY',
  'DISPATCHING',
  'RUNNING',
  'RESULT_WAITING',
  'COMPLETED',
  'BLOCKED',
  'FAILED',
  'RETRYING',
  'OFFLINE'
]);

const ROLE_TYPES = Object.freeze([
  'SUPREME_COMMANDER',
  'GROUP_COMMANDER',
  'WORKER',
  'GROUP'
]);

const MINIMUM_ROLE_FIELDS = Object.freeze([
  'role_id',
  'role_name',
  'group_id',
  'role_type',
  'commander_id',
  'worker_window_id',
  'browser_session_id',
  'authority_repository',
  'authority_pr',
  'current_cycle_id',
  'current_assignment_id',
  'current_status',
  'latest_directive_pointer',
  'latest_result_pointer',
  'last_event_at',
  'order'
]);

class RoleRegistryError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RoleRegistryError';
    this.details = details;
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDateTime(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function validatePointer(pointer, fieldName, roleId) {
  if (pointer === null) return;
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer)) {
    throw new RoleRegistryError(`${fieldName} must be an object or null`, { role_id: roleId });
  }
  const required = [
    'repository',
    'pr_number',
    'comment_id',
    'directive_id',
    'cycle_id',
    'assignment_id',
    'source_time',
    'selection_reason'
  ];
  for (const field of required) {
    if (!(field in pointer)) {
      throw new RoleRegistryError(`${fieldName}.${field} is required`, { role_id: roleId });
    }
  }
  if (!isNonEmptyString(pointer.repository) || !pointer.repository.includes('/')) {
    throw new RoleRegistryError(`${fieldName}.repository is invalid`, { role_id: roleId });
  }
  if (!Number.isInteger(pointer.pr_number) || pointer.pr_number < 1) {
    throw new RoleRegistryError(`${fieldName}.pr_number is invalid`, { role_id: roleId });
  }
  if (pointer.comment_id !== null && (!Number.isInteger(pointer.comment_id) || pointer.comment_id < 1)) {
    throw new RoleRegistryError(`${fieldName}.comment_id is invalid`, { role_id: roleId });
  }
  if (!isIsoDateTime(pointer.source_time)) {
    throw new RoleRegistryError(`${fieldName}.source_time is invalid`, { role_id: roleId });
  }
  if (!isNonEmptyString(pointer.selection_reason)) {
    throw new RoleRegistryError(`${fieldName}.selection_reason is required`, { role_id: roleId });
  }
}

function validateGroup(group) {
  const required = ['group_id', 'group_name', 'order', 'collapsible', 'default_expanded'];
  for (const field of required) {
    if (!(field in group)) throw new RoleRegistryError(`group.${field} is required`);
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(group.group_id)) {
    throw new RoleRegistryError(`invalid group_id: ${group.group_id}`);
  }
  if (!isNonEmptyString(group.group_name)) {
    throw new RoleRegistryError(`invalid group_name: ${group.group_id}`);
  }
  if (!Number.isInteger(group.order) || group.order < 0) {
    throw new RoleRegistryError(`invalid group order: ${group.group_id}`);
  }
  if (typeof group.collapsible !== 'boolean' || typeof group.default_expanded !== 'boolean') {
    throw new RoleRegistryError(`invalid group collapse flags: ${group.group_id}`);
  }
}

function validateRole(role, groupsById) {
  for (const field of MINIMUM_ROLE_FIELDS) {
    if (!(field in role)) {
      throw new RoleRegistryError(`role.${field} is required`, { role_id: role.role_id || null });
    }
  }
  if (!/^[A-Z][A-Z0-9_-]*$/.test(role.role_id)) {
    throw new RoleRegistryError(`invalid role_id: ${role.role_id}`);
  }
  if (!isNonEmptyString(role.role_name)) {
    throw new RoleRegistryError(`invalid role_name: ${role.role_id}`);
  }
  if (!groupsById.has(role.group_id)) {
    throw new RoleRegistryError(`unknown group_id ${role.group_id}`, { role_id: role.role_id });
  }
  if (!ROLE_TYPES.includes(role.role_type)) {
    throw new RoleRegistryError(`invalid role_type ${role.role_type}`, { role_id: role.role_id });
  }
  if (role.commander_id !== null && !isNonEmptyString(role.commander_id)) {
    throw new RoleRegistryError(`invalid commander_id`, { role_id: role.role_id });
  }
  if (!isNonEmptyString(role.worker_window_id)) {
    throw new RoleRegistryError(`worker_window_id is required`, { role_id: role.role_id });
  }
  if (role.browser_session_id !== null && !isNonEmptyString(role.browser_session_id)) {
    throw new RoleRegistryError(`invalid browser_session_id`, { role_id: role.role_id });
  }
  if (!isNonEmptyString(role.authority_repository) || !role.authority_repository.includes('/')) {
    throw new RoleRegistryError(`invalid authority_repository`, { role_id: role.role_id });
  }
  if (!Number.isInteger(role.authority_pr) || role.authority_pr < 1) {
    throw new RoleRegistryError(`invalid authority_pr`, { role_id: role.role_id });
  }
  if (!ROLE_STATUSES.includes(role.current_status)) {
    throw new RoleRegistryError(`invalid current_status ${role.current_status}`, { role_id: role.role_id });
  }
  if (!isIsoDateTime(role.last_event_at)) {
    throw new RoleRegistryError(`invalid last_event_at`, { role_id: role.role_id });
  }
  if (!Number.isInteger(role.order) || role.order < 0) {
    throw new RoleRegistryError(`invalid role order`, { role_id: role.role_id });
  }
  validatePointer(role.latest_directive_pointer, 'latest_directive_pointer', role.role_id);
  validatePointer(role.latest_result_pointer, 'latest_result_pointer', role.role_id);

  const statusRequiresEvidence = !['IDLE', 'OFFLINE'].includes(role.current_status);
  if (statusRequiresEvidence && role.latest_directive_pointer === null && role.latest_result_pointer === null) {
    throw new RoleRegistryError(
      `status ${role.current_status} requires a directive or result pointer`,
      { role_id: role.role_id }
    );
  }
}

function validateRoleRegistry(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new RoleRegistryError('registry must be an object');
  }
  if (registry.schema_version !== '1.0.0') {
    throw new RoleRegistryError('schema_version must be 1.0.0');
  }
  if (!isNonEmptyString(registry.registry_id)) {
    throw new RoleRegistryError('registry_id is required');
  }
  if (!registry.contract_binding || registry.contract_binding.authority !== 'A2_ROLE_CONTRACT_COMPATIBLE') {
    throw new RoleRegistryError('A-2 compatible contract binding is required');
  }
  const requiredFieldSet = new Set(registry.contract_binding.minimum_fields || []);
  for (const field of MINIMUM_ROLE_FIELDS.slice(0, 14)) {
    if (!requiredFieldSet.has(field)) {
      throw new RoleRegistryError(`contract binding omits required field ${field}`);
    }
  }
  const declaredStatuses = registry.contract_binding.status_values || [];
  if (declaredStatuses.length !== ROLE_STATUSES.length || ROLE_STATUSES.some((status) => !declaredStatuses.includes(status))) {
    throw new RoleRegistryError('contract binding status values do not match the authority status set');
  }
  if (!Array.isArray(registry.groups) || registry.groups.length === 0) {
    throw new RoleRegistryError('groups must be a non-empty array');
  }
  if (!Array.isArray(registry.roles) || registry.roles.length === 0) {
    throw new RoleRegistryError('roles must be a non-empty array');
  }

  const groupsById = new Map();
  for (const group of registry.groups) {
    validateGroup(group);
    if (groupsById.has(group.group_id)) {
      throw new RoleRegistryError(`duplicate group_id: ${group.group_id}`);
    }
    groupsById.set(group.group_id, group);
  }

  const rolesById = new Map();
  for (const role of registry.roles) {
    validateRole(role, groupsById);
    if (rolesById.has(role.role_id)) {
      throw new RoleRegistryError(`duplicate role_id: ${role.role_id}`);
    }
    rolesById.set(role.role_id, role);
  }

  for (const role of registry.roles) {
    if (role.commander_id !== null && !rolesById.has(role.commander_id)) {
      throw new RoleRegistryError(`unknown commander_id ${role.commander_id}`, { role_id: role.role_id });
    }
  }

  return {
    status: 'PASS',
    registry_id: registry.registry_id,
    group_count: groupsById.size,
    role_count: rolesById.size,
    status_count: ROLE_STATUSES.length
  };
}

function appendRole(registry, role) {
  const next = deepClone(registry);
  next.roles.push(deepClone(role));
  validateRoleRegistry(next);
  return next;
}

function updateRoleStatus(registry, roleId, update) {
  const next = deepClone(registry);
  const role = next.roles.find((candidate) => candidate.role_id === roleId);
  if (!role) throw new RoleRegistryError(`unknown role_id: ${roleId}`);
  if (!ROLE_STATUSES.includes(update.current_status)) {
    throw new RoleRegistryError(`invalid current_status ${update.current_status}`, { role_id: roleId });
  }
  role.current_status = update.current_status;
  role.last_event_at = update.last_event_at;
  if ('latest_directive_pointer' in update) role.latest_directive_pointer = deepClone(update.latest_directive_pointer);
  if ('latest_result_pointer' in update) role.latest_result_pointer = deepClone(update.latest_result_pointer);
  validateRoleRegistry(next);
  return next;
}

function createRoleRegistryStore(initialRegistry) {
  let registry = deepClone(initialRegistry);
  validateRoleRegistry(registry);
  return Object.freeze({
    getSnapshot: () => deepClone(registry),
    appendRole: (role) => {
      registry = appendRole(registry, role);
      return deepClone(registry);
    },
    updateRoleStatus: (roleId, update) => {
      registry = updateRoleStatus(registry, roleId, update);
      return deepClone(registry);
    }
  });
}

module.exports = {
  ROLE_STATUSES,
  ROLE_TYPES,
  MINIMUM_ROLE_FIELDS,
  RoleRegistryError,
  deepClone,
  validateRoleRegistry,
  appendRole,
  updateRoleStatus,
  createRoleRegistryStore
};
