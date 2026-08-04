'use strict';
const assert = require('node:assert/strict');
const { buildEpicSourceFromRegistration } = require('../../../../../../automation-v2/panel_relay_runtime.cjs');
const { transformEpicPackageToSchedule } = require('../../../../../../automation-v2/src/epicToScheduleAdapter');

function runFixture(epic) {
  const registration = {
    epic_file_path: epic.registration.epic_file_path,
    epic_commit_sha: 'a'.repeat(40),
    epic_sha256: 'b'.repeat(64)
  };
  const source = buildEpicSourceFromRegistration(epic.registration.repository, epic.registration.pr_number, 5171200380, registration);
  assert.equal(source.commit_sha, 'a'.repeat(40));
  assert.equal(source.epic_file_path, epic.registration.epic_file_path);
  assert.equal(source.epic_sha256, 'b'.repeat(64));
  assert.equal(source.path, undefined);
  assert.equal(source.commit, undefined);
  const schedule = transformEpicPackageToSchedule(epic, source, () => new Date('2026-08-04T04:00:00Z'));
  assert.equal(schedule.schedule_id, epic.package_id);
  return schedule;
}

module.exports = { runFixture };
