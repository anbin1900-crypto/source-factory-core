/* eslint-env node */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SCHEMA = "YOLLA_V6_WORKSPACE_STATE_V1";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cleanText(value, maxLength = 3000) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (_error) {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, filePath);
}

function normalizeId(value, prefix) {
  const text = cleanText(value, 80).toUpperCase();
  const safe = text.replace(/[^A-Z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  if (safe) return safe;
  return `${prefix}-${Date.now()}`;
}

function inferGroupId(roleId, oldState) {
  const custom = oldState.custom_roles && oldState.custom_roles[roleId];
  if (custom && custom.group_id) return String(custom.group_id).toUpperCase();
  if (/^B-\d+$/i.test(roleId)) return "B_GROUP";
  const match = String(roleId).match(/^GROUP(\d+)-/i);
  if (match) return `GROUP-${match[1].padStart(2, "0")}`;
  return null;
}

function defaultState() {
  const groupId = "GROUP-01";
  const roleId = "GROUP01-W01";
  return {
    schema_version: SCHEMA,
    selected_mode: "CONTEXTS",
    selected_group_id: groupId,
    selected_role_id: roleId,
    selected_site_id: null,
    groups: {
      [groupId]: {
        group_id: groupId,
        display_name: "새 그룹",
        color: "#64748b",
        collapsed: false,
        order: 10,
        commander_id: roleId,
        authority_repository: "",
        authority_pr: null
      }
    },
    roles: {
      [roleId]: {
        role_id: roleId,
        group_id: groupId,
        display_name: "커맨더",
        role_type: "GROUP_COMMANDER",
        context_url: "https://chatgpt.com/",
        project_url: "https://chatgpt.com/projects",
        last_url: "https://chatgpt.com/",
        status: "IDLE",
        enabled: true,
        order: 10
      }
    },
    sites: {},
    browser: {
      WORKER: { url: "https://chatgpt.com/projects" },
      ANALYZER: { url: "https://www.google.com" }
    },
    imported_from: null,
    updated_at: new Date().toISOString()
  };
}

function importLegacyState(oldState, sourcePath) {
  if (!oldState || typeof oldState !== "object") return defaultState();
  const state = defaultState();
  state.groups = {};
  state.roles = {};
  state.sites = {};

  const order = Array.isArray(oldState.group_order)
    ? oldState.group_order.map(value => String(value).toUpperCase())
    : Object.keys(oldState.group_preferences || {});
  const groupIds = Array.from(new Set([
    ...order,
    ...Object.keys(oldState.group_preferences || {}),
    ...Object.keys(oldState.custom_groups || {})
  ].map(value => String(value).toUpperCase()).filter(Boolean)));

  groupIds.forEach((groupId, index) => {
    const pref = oldState.group_preferences && oldState.group_preferences[groupId] || {};
    const custom = oldState.custom_groups && oldState.custom_groups[groupId] || {};
    const commander = oldState.commander_overrides && oldState.commander_overrides[groupId]
      || custom.commander_id
      || pref.commander_id
      || null;
    state.groups[groupId] = {
      group_id: groupId,
      display_name: cleanText(pref.display_name || custom.group_name || groupId, 120),
      color: cleanText(pref.color || custom.color || "#64748b", 20),
      collapsed: Boolean(pref.collapsed),
      order: Number(custom.order || (index + 1) * 10),
      commander_id: commander ? String(commander).toUpperCase() : null,
      authority_repository: cleanText(custom.authority_repository || "", 300),
      authority_pr: Number(custom.authority_pr || 0) || null
    };
  });

  const profiles = oldState.seat_profiles && typeof oldState.seat_profiles === "object"
    ? oldState.seat_profiles
    : {};
  const customRoles = oldState.custom_roles && typeof oldState.custom_roles === "object"
    ? oldState.custom_roles
    : {};

  for (const [rawRoleId, profileValue] of Object.entries(profiles)) {
    const roleId = String(rawRoleId).toUpperCase();
    const profile = profileValue && typeof profileValue === "object" ? profileValue : {};
    const custom = customRoles[rawRoleId] || customRoles[roleId] || {};
    const groupId = String(custom.group_id || inferGroupId(roleId, oldState) || "").toUpperCase();
    if (!groupId) continue;
    if (!state.groups[groupId]) {
      state.groups[groupId] = {
        group_id: groupId,
        display_name: groupId,
        color: "#64748b",
        collapsed: false,
        order: Object.keys(state.groups).length * 10 + 10,
        commander_id: null,
        authority_repository: "",
        authority_pr: null
      };
    }
    const commanderId = String(state.groups[groupId].commander_id || "").toUpperCase();
    const roleType = String(custom.role_type || (commanderId === roleId ? "GROUP_COMMANDER" : "WORKER")).toUpperCase();
    state.roles[roleId] = {
      role_id: roleId,
      group_id: groupId,
      display_name: cleanText(profile.display_name || custom.user_display_name || roleId, 120),
      role_type: /COMMANDER/.test(roleType) ? "GROUP_COMMANDER" : "WORKER",
      context_url: cleanText(profile.context_url || profile.last_browser_url || profile.project_url || "https://chatgpt.com/", 3000),
      project_url: cleanText(profile.project_url || "https://chatgpt.com/projects", 3000),
      last_url: cleanText(profile.last_browser_url || profile.context_url || profile.project_url || "https://chatgpt.com/", 3000),
      status: "IDLE",
      enabled: profile.enabled !== false,
      order: Number(custom.order || custom.preferred_slot || 0) || Object.values(state.roles).filter(role => role.group_id === groupId).length * 10 + 10
    };
  }

  for (const [roleId, custom] of Object.entries(customRoles)) {
    const id = String(roleId).toUpperCase();
    if (state.roles[id] || !custom || typeof custom !== "object") continue;
    const groupId = String(custom.group_id || "").toUpperCase();
    if (!groupId || !state.groups[groupId]) continue;
    state.roles[id] = {
      role_id: id,
      group_id: groupId,
      display_name: cleanText(custom.user_display_name || id, 120),
      role_type: /COMMANDER/.test(String(custom.role_type || "")) ? "GROUP_COMMANDER" : "WORKER",
      context_url: "https://chatgpt.com/",
      project_url: "https://chatgpt.com/projects",
      last_url: "https://chatgpt.com/",
      status: "IDLE",
      enabled: custom.enabled !== false,
      order: Number(custom.order || custom.preferred_slot || 0) || 10
    };
  }

  for (const group of Object.values(state.groups)) {
    const groupRoles = Object.values(state.roles)
      .filter(role => role.group_id === group.group_id)
      .sort((a, b) => Number(a.order) - Number(b.order));
    let commander = groupRoles.find(role => role.role_id === group.commander_id);
    if (!commander) commander = groupRoles.find(role => role.role_type === "GROUP_COMMANDER") || groupRoles[0] || null;
    group.commander_id = commander ? commander.role_id : null;
    for (const role of groupRoles) role.role_type = commander && role.role_id === commander.role_id ? "GROUP_COMMANDER" : "WORKER";
  }

  const oldSites = oldState.sites && typeof oldState.sites === "object" ? oldState.sites : {};
  for (const [siteId, siteValue] of Object.entries(oldSites)) {
    const site = siteValue && typeof siteValue === "object" ? siteValue : {};
    state.sites[siteId] = {
      site_id: siteId,
      display_name: cleanText(site.display_name || siteId, 160),
      url: cleanText(site.current_url || site.root_url || "", 3000),
      analyzer_provider: cleanText(site.adapter_id || "GENERIC", 100),
      status: "READY_FOR_PROVIDER",
      updated_at: new Date().toISOString()
    };
  }

  const selectedGroup = String(oldState.selected_group_id || "").toUpperCase();
  const selectedRole = String(oldState.selected_seat_code || "").toUpperCase();
  state.selected_group_id = state.groups[selectedGroup] ? selectedGroup : Object.keys(state.groups)[0] || null;
  state.selected_role_id = state.roles[selectedRole] ? selectedRole : Object.values(state.roles).find(role => role.group_id === state.selected_group_id)?.role_id || Object.keys(state.roles)[0] || null;
  const selectedProfile = state.selected_role_id && state.roles[state.selected_role_id];
  state.browser.WORKER.url = selectedProfile ? selectedProfile.last_url : "https://chatgpt.com/projects";
  state.browser.ANALYZER.url = cleanText(oldState.analysis_url || "https://www.google.com", 3000);
  state.imported_from = { path: sourcePath || null, imported_at: new Date().toISOString() };
  state.updated_at = new Date().toISOString();
  return state;
}

class V6StateStore {
  constructor(statePath, legacyStatePath) {
    this.statePath = statePath;
    this.legacyStatePath = legacyStatePath;
    this.value = null;
  }

  load() {
    let state = readJson(this.statePath, null);
    if (!state) {
      const legacy = readJson(this.legacyStatePath, null);
      state = legacy ? importLegacyState(legacy, this.legacyStatePath) : defaultState();
      this.value = this.normalize(state);
      this.save();
      return clone(this.value);
    }
    this.value = this.normalize(state);
    return clone(this.value);
  }

  normalize(input) {
    const state = input && typeof input === "object" ? clone(input) : defaultState();
    state.schema_version = SCHEMA;
    state.groups = state.groups && typeof state.groups === "object" ? state.groups : {};
    state.roles = state.roles && typeof state.roles === "object" ? state.roles : {};
    state.sites = state.sites && typeof state.sites === "object" ? state.sites : {};
    state.browser = state.browser && typeof state.browser === "object" ? state.browser : {};
    state.browser.WORKER = state.browser.WORKER || { url: "https://chatgpt.com/projects" };
    state.browser.ANALYZER = state.browser.ANALYZER || { url: "https://www.google.com" };
    state.selected_mode = ["CONTEXTS", "ANALYZER"].includes(state.selected_mode) ? state.selected_mode : "CONTEXTS";
    for (const group of Object.values(state.groups)) {
      group.group_id = String(group.group_id || "").toUpperCase();
      group.display_name = cleanText(group.display_name || group.group_id, 120);
      group.color = cleanText(group.color || "#64748b", 20);
      group.collapsed = Boolean(group.collapsed);
      group.order = Number(group.order || 0);
      group.commander_id = group.commander_id ? String(group.commander_id).toUpperCase() : null;
      group.authority_repository = cleanText(group.authority_repository || "", 300);
      group.authority_pr = Number(group.authority_pr || 0) || null;
    }
    for (const role of Object.values(state.roles)) {
      role.role_id = String(role.role_id || "").toUpperCase();
      role.group_id = String(role.group_id || "").toUpperCase();
      role.display_name = cleanText(role.display_name || role.role_id, 120);
      role.role_type = role.role_type === "GROUP_COMMANDER" ? "GROUP_COMMANDER" : "WORKER";
      role.context_url = cleanText(role.context_url || "https://chatgpt.com/", 3000);
      role.project_url = cleanText(role.project_url || "https://chatgpt.com/projects", 3000);
      role.last_url = cleanText(role.last_url || role.context_url || role.project_url, 3000);
      role.status = cleanText(role.status || "IDLE", 40).toUpperCase();
      role.enabled = role.enabled !== false;
      role.order = Number(role.order || 0);
    }
    const groupIds = Object.keys(state.groups);
    if (!state.groups[state.selected_group_id]) state.selected_group_id = groupIds[0] || null;
    const roleIds = Object.keys(state.roles);
    if (!state.roles[state.selected_role_id]) {
      state.selected_role_id = Object.values(state.roles).find(role => role.group_id === state.selected_group_id)?.role_id || roleIds[0] || null;
    }
    state.updated_at = new Date().toISOString();
    return state;
  }

  save() {
    if (!this.value) throw new Error("STATE_NOT_LOADED");
    this.value.updated_at = new Date().toISOString();
    writeJsonAtomic(this.statePath, this.value);
    return clone(this.value);
  }

  snapshot() {
    if (!this.value) this.load();
    return clone(this.value);
  }

  mutate(fn) {
    if (!this.value) this.load();
    fn(this.value);
    this.value = this.normalize(this.value);
    return this.save();
  }

  setMode(mode) {
    return this.mutate(state => { state.selected_mode = mode === "ANALYZER" ? "ANALYZER" : "CONTEXTS"; });
  }

  selectGroup(groupId) {
    const id = String(groupId || "").toUpperCase();
    return this.mutate(state => {
      if (!state.groups[id]) throw new Error(`GROUP_NOT_FOUND:${id}`);
      state.selected_group_id = id;
      if (!state.roles[state.selected_role_id] || state.roles[state.selected_role_id].group_id !== id) {
        state.selected_role_id = Object.values(state.roles).filter(role => role.group_id === id).sort((a,b)=>a.order-b.order)[0]?.role_id || null;
      }
    });
  }

  selectRole(roleId) {
    const id = String(roleId || "").toUpperCase();
    return this.mutate(state => {
      const role = state.roles[id];
      if (!role) throw new Error(`ROLE_NOT_FOUND:${id}`);
      state.selected_role_id = id;
      state.selected_group_id = role.group_id;
      state.browser.WORKER.url = role.last_url || role.context_url || role.project_url;
    });
  }

  addGroup(payload) {
    return this.mutate(state => {
      const index = Object.keys(state.groups).length + 1;
      const id = normalizeId(payload && payload.group_id, "GROUP");
      if (state.groups[id]) throw new Error(`GROUP_EXISTS:${id}`);
      state.groups[id] = {
        group_id: id,
        display_name: cleanText(payload && payload.display_name || `그룹 ${index}`, 120),
        color: cleanText(payload && payload.color || "#64748b", 20),
        collapsed: false,
        order: Math.max(0, ...Object.values(state.groups).map(group => Number(group.order || 0))) + 10,
        commander_id: null,
        authority_repository: "",
        authority_pr: null
      };
      state.selected_group_id = id;
      state.selected_role_id = null;
    });
  }

  updateGroup(payload) {
    const id = String(payload && payload.group_id || "").toUpperCase();
    return this.mutate(state => {
      const group = state.groups[id];
      if (!group) throw new Error(`GROUP_NOT_FOUND:${id}`);
      if (payload.display_name != null) group.display_name = cleanText(payload.display_name, 120);
      if (payload.color != null) group.color = cleanText(payload.color, 20);
      if (payload.collapsed != null) group.collapsed = Boolean(payload.collapsed);
      if (payload.authority_repository != null) group.authority_repository = cleanText(payload.authority_repository, 300);
      if (payload.authority_pr != null) group.authority_pr = Number(payload.authority_pr || 0) || null;
      if (payload.commander_id != null) {
        const commanderId = String(payload.commander_id || "").toUpperCase();
        if (commanderId && (!state.roles[commanderId] || state.roles[commanderId].group_id !== id)) throw new Error(`COMMANDER_NOT_IN_GROUP:${commanderId}`);
        group.commander_id = commanderId || null;
        for (const role of Object.values(state.roles)) {
          if (role.group_id === id) role.role_type = role.role_id === commanderId ? "GROUP_COMMANDER" : "WORKER";
        }
      }
    });
  }

  deleteGroup(groupId) {
    const id = String(groupId || "").toUpperCase();
    return this.mutate(state => {
      if (!state.groups[id]) throw new Error(`GROUP_NOT_FOUND:${id}`);
      for (const roleId of Object.keys(state.roles)) if (state.roles[roleId].group_id === id) delete state.roles[roleId];
      delete state.groups[id];
      state.selected_group_id = Object.keys(state.groups)[0] || null;
      state.selected_role_id = Object.values(state.roles).find(role => role.group_id === state.selected_group_id)?.role_id || Object.keys(state.roles)[0] || null;
    });
  }

  addRole(payload) {
    return this.mutate(state => {
      const groupId = String(payload && payload.group_id || state.selected_group_id || "").toUpperCase();
      if (!state.groups[groupId]) throw new Error(`GROUP_NOT_FOUND:${groupId}`);
      const groupNumber = (groupId.match(/(\d+)/) || [null, "1"])[1];
      const sequence = Object.values(state.roles).filter(role => role.group_id === groupId).length + 1;
      const id = normalizeId(payload && payload.role_id || `GROUP${String(groupNumber).padStart(2,"0")}-W${String(sequence).padStart(2,"0")}`, "ROLE");
      if (state.roles[id]) throw new Error(`ROLE_EXISTS:${id}`);
      const commander = Boolean(payload && payload.role_type === "GROUP_COMMANDER") || !state.groups[groupId].commander_id;
      state.roles[id] = {
        role_id: id,
        group_id: groupId,
        display_name: cleanText(payload && payload.display_name || (commander ? "커맨더" : `워커 ${sequence}`), 120),
        role_type: commander ? "GROUP_COMMANDER" : "WORKER",
        context_url: cleanText(payload && payload.context_url || "https://chatgpt.com/", 3000),
        project_url: cleanText(payload && payload.project_url || "https://chatgpt.com/projects", 3000),
        last_url: cleanText(payload && (payload.context_url || payload.project_url) || "https://chatgpt.com/", 3000),
        status: "IDLE",
        enabled: true,
        order: Math.max(0, ...Object.values(state.roles).filter(role => role.group_id === groupId).map(role => Number(role.order || 0))) + 10
      };
      if (commander) {
        state.groups[groupId].commander_id = id;
        for (const role of Object.values(state.roles)) if (role.group_id === groupId) role.role_type = role.role_id === id ? "GROUP_COMMANDER" : "WORKER";
      }
      state.selected_group_id = groupId;
      state.selected_role_id = id;
    });
  }

  updateRole(payload) {
    const id = String(payload && payload.role_id || "").toUpperCase();
    return this.mutate(state => {
      const role = state.roles[id];
      if (!role) throw new Error(`ROLE_NOT_FOUND:${id}`);
      if (payload.display_name != null) role.display_name = cleanText(payload.display_name, 120);
      if (payload.context_url != null) role.context_url = cleanText(payload.context_url, 3000);
      if (payload.project_url != null) role.project_url = cleanText(payload.project_url, 3000);
      if (payload.last_url != null) role.last_url = cleanText(payload.last_url, 3000);
      if (payload.enabled != null) role.enabled = Boolean(payload.enabled);
      if (payload.status != null) role.status = cleanText(payload.status, 40).toUpperCase();
      if (payload.role_type === "GROUP_COMMANDER") {
        const group = state.groups[role.group_id];
        group.commander_id = id;
        for (const member of Object.values(state.roles)) if (member.group_id === role.group_id) member.role_type = member.role_id === id ? "GROUP_COMMANDER" : "WORKER";
      }
    });
  }

  deleteRole(roleId) {
    const id = String(roleId || "").toUpperCase();
    return this.mutate(state => {
      const role = state.roles[id];
      if (!role) throw new Error(`ROLE_NOT_FOUND:${id}`);
      const groupId = role.group_id;
      delete state.roles[id];
      const members = Object.values(state.roles).filter(item => item.group_id === groupId).sort((a,b)=>a.order-b.order);
      if (state.groups[groupId] && state.groups[groupId].commander_id === id) {
        state.groups[groupId].commander_id = members[0]?.role_id || null;
        for (const member of members) member.role_type = member.role_id === state.groups[groupId].commander_id ? "GROUP_COMMANDER" : "WORKER";
      }
      if (state.selected_role_id === id) state.selected_role_id = members[0]?.role_id || Object.keys(state.roles)[0] || null;
    });
  }

  updateBrowser(kind, url) {
    const key = kind === "ANALYZER" ? "ANALYZER" : "WORKER";
    return this.mutate(state => {
      // Browser navigation is intentionally not treated as a role-address write.
      // Worker/commander addresses change only through explicit assignment/edit actions.
      state.browser[key].url = cleanText(url, 3000);
    });
  }

  registerSite(payload) {
    return this.mutate(state => {
      const url = cleanText(payload && payload.url, 3000);
      if (!url) throw new Error("SITE_URL_REQUIRED");
      const id = normalizeId(payload && payload.site_id || `SITE-${Date.now()}`, "SITE");
      state.sites[id] = {
        site_id: id,
        display_name: cleanText(payload && payload.display_name || url, 160),
        url,
        analyzer_provider: cleanText(payload && payload.analyzer_provider || "UNASSIGNED", 100),
        status: "READY_FOR_PROVIDER",
        updated_at: new Date().toISOString()
      };
      state.selected_site_id = id;
    });
  }

  deleteSite(siteId) {
    const id = String(siteId || "");
    return this.mutate(state => {
      delete state.sites[id];
      if (state.selected_site_id === id) state.selected_site_id = Object.keys(state.sites)[0] || null;
    });
  }

  selectSite(siteId) {
    const id = String(siteId || "");
    return this.mutate(state => {
      if (!state.sites[id]) throw new Error(`SITE_NOT_FOUND:${id}`);
      state.selected_site_id = id;
      state.browser.ANALYZER.url = cleanText(state.sites[id].url, 3000);
    });
  }

  toCRegistry() {
    const state = this.snapshot();
    return {
      groups: Object.values(state.groups).map(group => ({ group_id: group.group_id, group_name: group.display_name, order: group.order })),
      roles: Object.values(state.roles).map(role => ({
        role_id: role.role_id,
        seat_code: role.role_id,
        role_name: role.display_name,
        group_id: role.group_id,
        role_type: role.role_type,
        enabled: role.enabled,
        order: role.order
      }))
    };
  }

  toCWorkspace() {
    const state = this.snapshot();
    const groupPreferences = {};
    for (const group of Object.values(state.groups)) {
      groupPreferences[group.group_id] = {
        display_name: group.display_name,
        color: group.color,
        collapsed: group.collapsed,
        commander_id: group.commander_id
      };
    }
    const seatProfiles = {};
    for (const role of Object.values(state.roles)) {
      seatProfiles[role.role_id] = {
        seat_code: role.role_id,
        display_name: role.display_name,
        status: role.status,
        enabled: role.enabled,
        project_url: role.project_url,
        context_url: role.context_url,
        last_browser_url: role.last_url
      };
    }
    return {
      selected_group_id: state.selected_group_id,
      selected_seat_code: state.selected_role_id,
      group_preferences: groupPreferences,
      seat_profiles: seatProfiles
    };
  }
}

module.exports = {
  SCHEMA,
  V6StateStore,
  defaultState,
  importLegacyState,
  readJson,
  writeJsonAtomic,
  cleanText
};
