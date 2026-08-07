'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key || !key.startsWith('--') || argv[i + 1] == null) throw new Error(`BAD_ARG:${key || ''}`);
    out[key.slice(2)] = argv[i + 1];
  }
  for (const key of ['root', 'manifest', 'receipt']) if (!out[key]) throw new Error(`MISSING_ARG:${key}`);
  return out;
}
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function validate(root, manifest) {
  if (manifest.schema_version !== 'W3_RC4_UI_PAYLOAD_EXPORT_V1') throw new Error('MANIFEST_SCHEMA_MISMATCH');
  if (manifest.target_version !== '5.10.2.4.2-rc4') throw new Error('TARGET_VERSION_MISMATCH');
  const members = [...(manifest.runtime_files || []), ...(manifest.evidence_files || [])];
  if (!members.length) throw new Error('EMPTY_MEMBERSHIP');
  const destinations = new Set();
  const results = [];
  for (const item of members) {
    const packagePath = path.resolve(root, item.package_path);
    const rootPath = path.resolve(root) + path.sep;
    if (!packagePath.startsWith(rootPath)) throw new Error(`PACKAGE_PATH_ESCAPE:${item.package_path}`);
    if (!fs.existsSync(packagePath) || !fs.statSync(packagePath).isFile()) throw new Error(`PACKAGE_MEMBER_MISSING:${item.package_path}`);
    const body = fs.readFileSync(packagePath);
    const actual = {size_bytes: body.length, sha256: sha256(body)};
    if (actual.size_bytes !== item.size_bytes) throw new Error(`PACKAGE_SIZE_MISMATCH:${item.package_path}`);
    if (actual.sha256 !== item.sha256) throw new Error(`PACKAGE_SHA256_MISMATCH:${item.package_path}`);
    if (item.install_destination) {
      if (destinations.has(item.install_destination)) throw new Error(`DUPLICATE_INSTALL_DESTINATION:${item.install_destination}`);
      destinations.add(item.install_destination);
    }
    results.push({logical_role:item.logical_role, package_path:item.package_path, install_destination:item.install_destination || null, ...actual, status:'PASS'});
  }
  const required = new Set(['UI_RUNTIME','CSS_RUNTIME','TRUTH_BRIDGE']);
  for (const role of required) if (!results.some(x => x.logical_role === role)) throw new Error(`REQUIRED_RUNTIME_ROLE_MISSING:${role}`);
  const ordered = (manifest.runtime_files || []).slice().sort((a,b)=>a.load_order-b.load_order);
  if (ordered.map(x=>x.logical_role).join(',') !== 'TRUTH_BRIDGE,CSS_RUNTIME,UI_RUNTIME') throw new Error('RUNTIME_LOAD_ORDER_INVALID');
  return {schema_version:'W3_RC4_UI_MEMBERSHIP_RECEIPT_V1', target_version:manifest.target_version, member_count:results.length, runtime_member_count:(manifest.runtime_files||[]).length, evidence_member_count:(manifest.evidence_files||[]).length, members:results, status:'PASS', live_pass_claimed:false};
}
if (require.main === module) {
  const args = parseArgs(process.argv);
  const manifest = JSON.parse(fs.readFileSync(args.manifest,'utf8'));
  const receipt = validate(args.root, manifest);
  fs.mkdirSync(path.dirname(path.resolve(args.receipt)), {recursive:true});
  fs.writeFileSync(args.receipt, JSON.stringify(receipt,null,2)+'\n');
  console.log(`W3_RC4_UI_MEMBERSHIP_PASS members=${receipt.member_count}`);
}
module.exports = {validate, sha256};
