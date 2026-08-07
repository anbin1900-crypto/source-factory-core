#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function parseArgs(argv) { const out = {}; for (let i = 2; i < argv.length; i += 2) { if (!argv[i]?.startsWith('--') || argv[i + 1] == null) throw new Error('BAD_ARG'); out[argv[i].slice(2)] = argv[i + 1]; } for (const key of ['manifest','receipt']) if (!out[key]) throw new Error(`MISSING_ARG:${key}`); return out; }
function assert(value, message) { if (!value) throw new Error(message); }
function hash(body) { return crypto.createHash('sha256').update(body).digest('hex'); }
function validate(manifest, bundleRoot = '') {
  assert(manifest.schema_version === 'W3_WAVE15_EXACT_UI_BLOB_BUNDLE_V1', 'SCHEMA_MISMATCH');
  assert(manifest.result_key === '519698639500', 'RESULT_KEY_MISMATCH');
  assert(manifest.target_version === '5.10.2.4.2-rc6', 'VERSION_MISMATCH');
  assert(manifest.git_blob_api.raw_github_dns_required === false, 'RAW_GITHUB_DNS_NOT_FALSE');
  assert(manifest.git_blob_api.mounted_checkout_required === false, 'MOUNTED_CHECKOUT_NOT_FALSE');
  assert(manifest.authority.release_root === 'E:\\SOURCE FACTORY\\.yolla\\yolla-panel\\releases', 'RELEASE_ROOT_MISMATCH');
  assert(manifest.authority.fixed_browser_profile === 'E:\\SOURCE FACTORY\\.yolla\\yolla-workspace-browser-profile', 'PROFILE_MISMATCH');
  const expectedRoles = ['TRUTH_BRIDGE','CSS_OVERLAY','JS_OVERLAY','LOAD_HOOK_PATCH','REMOVAL_ONLY_ROLLBACK'];
  assert(manifest.members.length === 5, 'MEMBER_COUNT_MISMATCH');
  assert(manifest.members.map(x => x.logical_role).join(',') === expectedRoles.join(','), 'MEMBER_ORDER_MISMATCH');
  const seenBlobs = new Set(), seenPaths = new Set();
  const results = [];
  for (const member of manifest.members) {
    assert(/^[0-9a-f]{40}$/.test(member.source_commit), `BAD_COMMIT:${member.logical_role}`);
    assert(/^[0-9a-f]{40}$/.test(member.blob_sha1), `BAD_BLOB:${member.logical_role}`);
    assert(/^[0-9a-f]{64}$/.test(member.sha256), `BAD_SHA256:${member.logical_role}`);
    assert(Number.isInteger(member.size_bytes) && member.size_bytes > 0, `BAD_SIZE:${member.logical_role}`);
    assert(member.blob_api_readback === 'PASS', `BLOB_READBACK_NOT_PASS:${member.logical_role}`);
    assert(!seenBlobs.has(member.blob_sha1), `DUPLICATE_BLOB:${member.logical_role}`); seenBlobs.add(member.blob_sha1);
    assert(!seenPaths.has(member.bundle_path), `DUPLICATE_BUNDLE_PATH:${member.logical_role}`); seenPaths.add(member.bundle_path);
    if (bundleRoot) {
      const root = path.resolve(bundleRoot), file = path.resolve(root, member.bundle_path);
      assert(file.startsWith(root + path.sep), `PATH_ESCAPE:${member.logical_role}`);
      assert(fs.existsSync(file), `BUNDLE_MEMBER_MISSING:${member.logical_role}`);
      const body = fs.readFileSync(file);
      assert(body.length === member.size_bytes, `SIZE_MISMATCH:${member.logical_role}`);
      assert(hash(body) === member.sha256, `HASH_MISMATCH:${member.logical_role}`);
    }
    results.push({ logical_role: member.logical_role, blob_sha1: member.blob_sha1, status: 'PASS' });
  }
  const hooks = manifest.renderer_hook_contract;
  assert(hooks.bridge.anchor_exactly_one === true, 'BRIDGE_ANCHOR_NOT_EXACTLY_ONE');
  assert(hooks.css.anchor_exactly_one === true, 'CSS_ANCHOR_NOT_EXACTLY_ONE');
  assert(hooks.js.anchor_exactly_one === true, 'JS_ANCHOR_NOT_EXACTLY_ONE');
  assert(hooks.css.load_after_base === true, 'CSS_ORDER_NOT_PROVEN');
  assert(hooks.js.load_after_base === true, 'JS_ORDER_NOT_PROVEN');
  const evidence = manifest.wave14_evidence;
  assert(evidence.membership_status === 'PASS' && evidence.membership_count === 7, 'WAVE14_MEMBERSHIP_NOT_PASS');
  assert(evidence.smoke_status === 'PASS' && evidence.smoke_assertion_count === 20, 'WAVE14_SMOKE_NOT_PASS');
  assert(evidence.patch_idempotent === true, 'PATCH_NOT_IDEMPOTENT');
  assert(evidence.rollback_exact_pre_overlay_byte_restore === true, 'ROLLBACK_NOT_EXACT');
  assert(evidence.fixed_browser_profile_unchanged === true, 'PROFILE_CHANGED');
  assert(evidence.c_and_repeat_disabled_working_count === 0, 'DISABLED_WORKING_NOT_ZERO');
  return { schema_version: 'W3_WAVE15_BUNDLE_VALIDATION_RECEIPT_V1', status: 'PASS', member_count: results.length, result_key: manifest.result_key, authority_release_root: manifest.authority.release_root, fixed_browser_profile: manifest.authority.fixed_browser_profile, base_anchor_exactly_one: true, patch_idempotent: true, rollback_exact_pre_overlay_byte_restore: true, c_and_repeat_disabled_working_count: 0, members: results, live_pass_claimed: false };
}
if (require.main === module) { const args = parseArgs(process.argv); const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8')); const receipt = validate(manifest, args.bundle || ''); fs.mkdirSync(path.dirname(path.resolve(args.receipt)), { recursive: true }); fs.writeFileSync(args.receipt, JSON.stringify(receipt, null, 2) + '\n'); console.log(`W3_WAVE15_BUNDLE_VALIDATE_PASS members=${receipt.member_count}`); }
module.exports = { validate, hash };
