'use strict';
const assert = require('node:assert/strict');

function buildEpicSourceFromRegistration(repository, pr, registrationCommentId, registration) {
  return {
    repository,
    pr: Number(pr),
    epic_file_path: String(registration.epic_file_path || '').trim(),
    commit_sha: String(registration.epic_commit_sha || '').trim().toLowerCase(),
    epic_sha256: String(registration.epic_sha256 || '').trim().toLowerCase(),
    registration_comment_id: Number(registrationCommentId)
  };
}

const registration = {
  epic_file_path: '.yolla/epics/P1/EPIC.json',
  epic_commit_sha: 'a'.repeat(40),
  epic_sha256: 'b'.repeat(64)
};
const source = buildEpicSourceFromRegistration('anbin1900-crypto/source-factory-core', 17, 5171200380, registration);
assert.match(source.commit_sha, /^[0-9a-f]{40}$/);
assert.equal(source.epic_file_path, registration.epic_file_path);
assert.match(source.epic_sha256, /^[0-9a-f]{64}$/);
assert.equal(source.path, undefined);
assert.equal(source.commit, undefined);
console.log(JSON.stringify({terminal:'V5122_GROUP_EPIC_BOOTSTRAP_SOURCE_MAPPING_PASS',assertions:5},null,2));
