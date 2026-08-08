/* eslint-env node */
"use strict";

const ALLOWED = new Set(["SELECT_GROUP", "SELECT_ROLE", "ADD_GROUP", "UPDATE_GROUP", "DELETE_GROUP", "ADD_ROLE", "UPDATE_ROLE", "DELETE_ROLE", "ASSIGN_CURRENT_WORKER", "OPEN_COMMANDS"]);

function getManifest() {
  return {
    schema_version: "YOLLA_V6_MODULE_PROVIDER_MANIFEST_V1",
    module_id: "commander-worker-menu",
    owner: "B-1",
    version: "1.0.0",
    mount_slots: ["CONTEXT_TOP_ACTIONS", "CONTEXT_SIDEBAR", "CONTEXT_DRAWER", "CONTEXT_STATUS"],
    allowed_actions: Array.from(ALLOWED)
  };
}

function getViewModel(context = {}) {
  const roles = Object.values(context.roles || {});
  const groups = Object.values(context.groups || {}).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map(group => ({
    ...group,
    roles: roles.filter(role => role.group_id === group.group_id).sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
  }));
  return {
    schema_version: "COMMANDER_WORKER_MENU_VIEW_MODEL_V1",
    module_id: "commander-worker-menu",
    selected_group_id: context.selected_group_id || null,
    selected_role_id: context.selected_role_id || null,
    labels: { mode: "커맨더·워커", sidebar: "커맨더·워커 그룹", add_group: "＋ 그룹 추가", add_role: "＋ 워커 추가" },
    groups,
    counts: { groups: groups.length, roles: roles.length },
    slots: {
      CONTEXT_STATUS: { kind: "status", text: `B-1 메뉴 Provider 연결 · 그룹 ${groups.length} · 좌석 ${roles.length}` },
      CONTEXT_TOP_ACTIONS: { kind: "actions", actions: [{ action: "OPEN_COMMANDS", label: "명령" }] }
    }
  };
}

function getStatus(context = {}) {
  return { schema_version: "COMMANDER_WORKER_MENU_STATUS_V1", status: "BOUND", owner: "B-1", group_count: Object.keys(context.groups || {}).length, role_count: Object.keys(context.roles || {}).length };
}

async function handleAction(request, host) {
  const action = String(request && request.action || "").toUpperCase();
  if (!ALLOWED.has(action)) throw new Error(`B1_ACTION_NOT_ALLOWED:${action}`);
  return host.perform(action, request && request.payload || {});
}

module.exports = { getManifest, getViewModel, getStatus, handleAction };
