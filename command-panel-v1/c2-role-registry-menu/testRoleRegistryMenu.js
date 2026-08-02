'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const registryApi = require('./roleRegistry');
const menuApi = require('./leftRoleMenuGenerator');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'ROLE_REGISTRY_FIXTURE.json'), 'utf8'));

function newRole(overrides = {}) {
  return {
    role_id: 'D-1', role_name: 'D-1 그룹커맨더', group_id: 'D_GROUP',
    role_type: 'GROUP_COMMANDER', commander_id: 'SUPREME-COMMANDER',
    worker_window_id: 'worker-browser::D-1', browser_session_id: null,
    authority_repository: 'anbin1900-crypto/yolla-real-estate-data-engine', authority_pr: 188,
    current_cycle_id: null, current_assignment_id: null, current_status: 'IDLE',
    latest_directive_pointer: null, latest_result_pointer: null,
    last_event_at: '2026-08-02T00:00:00Z', order: 1, ...overrides
  };
}

test('schema-shaped fixture has 6 groups and 22 roles', () => {
  const result = registryApi.validateRoleRegistry(fixture);
  assert.deepEqual([result.group_count, result.role_count], [6, 22]);
});

test('required hierarchy exists', () => {
  const ids = new Set(fixture.roles.map((role) => role.role_id));
  const expected = ['SUPREME-COMMANDER', ...Array.from({length:7},(_,i)=>`A-${i+1}`), ...Array.from({length:6},(_,i)=>`B-${i+1}`), ...Array.from({length:6},(_,i)=>`C-${i+1}`), 'D-GROUP', 'API-GROUP'];
  expected.forEach((id) => assert.ok(ids.has(id), `missing ${id}`));
});

test('menu exposes all badges and selected role', () => {
  menuApi.assertStatusBadgeCoverage();
  assert.equal(Object.keys(menuApi.STATUS_BADGE_LABELS).length, registryApi.ROLE_STATUSES.length);
  const model = menuApi.buildRoleMenuModel(fixture, {selectedRoleId:'C-2'});
  assert.deepEqual(model.groups.flatMap((g)=>g.roles).filter((r)=>r.is_selected).map((r)=>r.role_id), ['C-2']);
});

test('group collapse and expand are local state', () => {
  const controller = menuApi.createLeftRoleMenuController(fixture, {selectedRoleId:'C-2'});
  assert.equal(controller.getModel().groups.find((g)=>g.group_id==='C_GROUP').expanded, true);
  controller.toggleGroup('C_GROUP');
  assert.equal(controller.getModel().groups.find((g)=>g.group_id==='C_GROUP').expanded, false);
  assert.match(controller.render(), /data-group-roles="C_GROUP" hidden/);
  controller.toggleGroup('C_GROUP');
  assert.equal(controller.getModel().groups.find((g)=>g.group_id==='C_GROUP').expanded, true);
});

test('dynamic role append needs no generator code change', () => {
  const controller = menuApi.createLeftRoleMenuController(fixture);
  controller.appendRole(newRole());
  assert.match(controller.render(), /data-role-id="D-1"/);
  assert.equal(controller.getRegistrySnapshot().roles.length, 23);
});

test('duplicates and unknown statuses fail closed', () => {
  assert.throws(()=>registryApi.appendRole(fixture, {...fixture.roles[0]}), registryApi.RoleRegistryError);
  const broken = structuredClone(fixture); broken.roles[0].current_status='UNKNOWN';
  assert.throws(()=>registryApi.validateRoleRegistry(broken), /invalid current_status/);
});

test('active status without evidence pointer fails closed', () => {
  const broken = structuredClone(fixture); const role=broken.roles.find((r)=>r.role_id==='A-3');
  role.current_status='RUNNING'; role.latest_directive_pointer=null; role.latest_result_pointer=null;
  assert.throws(()=>registryApi.validateRoleRegistry(broken), /requires a directive or result pointer/);
});

test('status update requires exact time and pointer', () => {
  const pointer=structuredClone(fixture.roles.find((r)=>r.role_id==='C-2').latest_directive_pointer);
  const next=registryApi.updateRoleStatus(fixture,'A-3',{current_status:'DIRECTIVE_READY',last_event_at:pointer.source_time,latest_directive_pointer:pointer});
  assert.equal(next.roles.find((r)=>r.role_id==='A-3').current_status,'DIRECTIVE_READY');
});

test('no new Electron, BrowserWindow, IPC, or prompt transport', () => {
  const source=['roleRegistry.js','leftRoleMenuGenerator.js'].map((name)=>fs.readFileSync(path.join(__dirname,name),'utf8')).join('\n');
  [/require\(['"]electron['"]\)/,/new\s+BrowserWindow\s*\(/,/ipcMain\s*\./,/ipcRenderer\s*\./,/promptTransport/i].forEach((pattern)=>assert.doesNotMatch(source,pattern));
});
