#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const EXACT = Object.freeze({
  TRUTH_BRIDGE: ['27267b1b0b1d057e2ca40e3fcc864fd4609a1520','8086f56f1f0b5731cb9ad4be5339fc211d1468f4195fcf249b7a300cc3b830e8',4012],
  CSS_OVERLAY: ['ff1bf6c84fb9806328bb3e5d8616a85cce943473','43b6a3721c250e76b2562c45d931fd17d87ae219fec70aa3ef3206af9cd8b0fe',1504],
  JS_OVERLAY: ['82862f1b4c8c2599c4035c78023ffea850909b4c','5fdd1719e110ce80ad4b3efb911fd20a86ccbfeb27182645e8d2170287114b54',7858],
  EXACT_LOAD_HOOK: ['1e6e54914737b1878a3f3ba1e88adbba57eab190','188dcc15f0f88ac41e5179272ccc0ee11b9ee48001ee986d1732f6414d88f462',6304],
  EXACT_ROLLBACK: ['1b3df39a0ffa6c80ffa0b99e44422d6a26110f11','7a86437b703b50a6b7bbe575802bdf6d82a228919d5dc48bd8169046baf9253b',2873]
});
const RC7 = Object.freeze({
  patch_blob:'077e4c2a892d3188e4c93b12fcf0d162e9246be8',
  rollback_blob:'3b341821a41ebbdebf1b5e271612e258dd978623'
});
function sha256(body){return crypto.createHash('sha256').update(body).digest('hex');}
function count(text, token){return text.split(token).length - 1;}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function parseArgs(argv){const out={};for(let i=2;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||argv[i+1]==null)throw new Error(`BAD_ARG:${argv[i]||''}`);out[argv[i].slice(2)]=argv[i+1];}for(const k of ['manifest','bundle-root','negative-fixture','receipt'])if(!out[k])throw new Error(`MISSING_ARG:${k}`);return out;}
function validateManifest(m){
  assert.equal(m.schema_version,'RC8_EXACT_UI_HOOK_ROLLBACK_BUNDLE_V2');
  assert.equal(m.control_id,'V1-C-MODE-6W-VALIDATION-CYCLE-002');
  assert.equal(m.wave_id,'V1-C-MODE-6W-WAVE-017');
  assert.equal(String(m.result_key),'519851160600');
  assert.equal(m.target_version,'5.10.2.4.2-rc8');
  assert.equal(m.members.length,5);
  assert.equal(new Set(m.members.map(x=>x.logical_role)).size,5);
  for(const member of m.members){
    const expected=EXACT[member.logical_role];assert.ok(expected,`UNEXPECTED_ROLE:${member.logical_role}`);
    assert.equal(member.blob_sha1,expected[0],`BLOB_MISMATCH:${member.logical_role}`);
    assert.equal(member.sha256,expected[1],`SHA256_MISMATCH:${member.logical_role}`);
    assert.equal(member.size_bytes,expected[2],`SIZE_MISMATCH:${member.logical_role}`);
    assert.match(member.source_commit,/^[0-9a-f]{40}$/);
  }
  assert.equal(m.hook_contract.main.anchor,'"use strict";');
  assert.equal(m.hook_contract.main.required_binding,'globalThis.__YOLLA_W3_UI_TRUTH_BRIDGE__');
  assert.equal(m.hook_contract.css.base_anchor_exactly_one,true);
  assert.equal(m.hook_contract.js.base_anchor_exactly_one,true);
  assert.equal(m.rollback_contract.exact_pre_overlay_byte_restore,true);
  assert.equal(m.rollback_contract.fixed_browser_profile_preserved,true);
  return true;
}
function verifyMaterialized(m, root){
  const results=[];
  for(const member of m.members){
    const file=path.resolve(root,member.bundle_path);const prefix=path.resolve(root)+path.sep;
    assert.ok(file.startsWith(prefix),`PATH_ESCAPE:${member.bundle_path}`);
    assert.ok(fs.existsSync(file)&&fs.statSync(file).isFile(),`MEMBER_MISSING:${member.bundle_path}`);
    const body=fs.readFileSync(file);
    assert.equal(body.length,member.size_bytes,`MATERIALIZED_SIZE:${member.logical_role}`);
    assert.equal(sha256(body),member.sha256,`MATERIALIZED_SHA:${member.logical_role}`);
    results.push({logical_role:member.logical_role,bundle_path:member.bundle_path,status:'PASS'});
  }
  return results;
}
function verifyStaticSource(root){
  const patch=fs.readFileSync(path.join(root,'tools/apply_w3_rc6_ui_overlay.cjs'),'utf8');
  const rollback=fs.readFileSync(path.join(root,'tools/rollback_w3_rc6_ui_overlay.cjs'),'utf8');
  for(const token of ["const anchor='\"use strict\";'",'globalThis.__YOLLA_W3_UI_TRUTH_BRIDGE__','<link rel="stylesheet" href="./workspace_c_mode.css">','<script src="./workspace_c_mode.js"></script>','DUPLICATE_${label}_HOOK','PARTIAL_OR_DUPLICATE_MAIN_HOOK'])assert.ok(patch.includes(token),`PATCH_TOKEN_MISSING:${token}`);
  for(const token of ['removeHookLine','removeMainBlock','OVERLAY_FILE_HASH_MISMATCH','BASE_UI_BYTES_CHANGED_DURING_ROLLBACK','profile_or_state_modified:false'])assert.ok(rollback.includes(token),`ROLLBACK_TOKEN_MISSING:${token}`);
  assert.equal(count(patch,'globalThis.__YOLLA_W3_UI_TRUTH_BRIDGE__'),1);
  return {patch_static:'PASS',rollback_static:'PASS'};
}
function validateNegativeFixture(f){
  assert.equal(f.schema_version,'RC7_SIMPLIFIED_UI_HOOK_ROLLBACK_NEGATIVE_FIXTURE_V1');
  assert.equal(f.patch.blob_sha1,RC7.patch_blob);
  assert.equal(f.rollback.blob_sha1,RC7.rollback_blob);
  assert.notEqual(f.patch.blob_sha1,EXACT.EXACT_LOAD_HOOK[0]);
  assert.notEqual(f.rollback.blob_sha1,EXACT.EXACT_ROLLBACK[0]);
  const required=['SIMPLIFIED_LOAD_HOOK_SUBSTITUTION','TRUTH_BRIDGE_NOT_IMMEDIATELY_AFTER_USE_STRICT','GLOBAL_TRUTH_BRIDGE_BINDING_MISSING','BASE_CSS_ANCHOR_NOT_ENFORCED','BASE_JS_ANCHOR_NOT_ENFORCED','ROLLBACK_MISSING_BACKUP_NOT_FAIL_CLOSED','EXACT_SOURCE_IDENTITY_MISMATCH'];
  for(const reason of required)assert.ok(f.expected_rejection_reasons.includes(reason),`NEGATIVE_REASON_MISSING:${reason}`);
  assert.equal(f.accepted,false);
  return {status:'REJECTED_AS_REQUIRED',reasons:required};
}
function fileMap(root){const names=['main.js','workspace.html','workspace_c_mode.js','workspace_c_mode.css'];return Object.fromEntries(names.map(n=>[n,fs.readFileSync(path.join(root,n))]));}
function assertSameMap(a,b){for(const k of Object.keys(a))assert.deepEqual(b[k],a[k],`PREIMAGE_MISMATCH:${k}`);}
function runBehavioral(m, bundleRoot){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'w3-rc8-hook-v2-'));
  const release=path.join(tmp,'release'),profile=path.join(tmp,'profile');fs.mkdirSync(release,{recursive:true});fs.mkdirSync(profile,{recursive:true});
  fs.writeFileSync(path.join(release,'main.js'),'"use strict";\nconst APP_VERSION="5.10.2.4.0";\nfunction createWorkspaceWindow(){ return true; }\n');
  fs.writeFileSync(path.join(release,'workspace.html'),'<!doctype html>\n<html><head>\n  <link rel="stylesheet" href="./workspace.css">\n  <link rel="stylesheet" href="./workspace_c_mode.css">\n</head><body>\n  <script src="./workspace.js"></script>\n  <script src="./workspace_c_mode.js"></script>\n</body></html>\n');
  fs.writeFileSync(path.join(release,'workspace_c_mode.js'),'window.baseCMode=true;\n');fs.writeFileSync(path.join(release,'workspace_c_mode.css'),'.base-c-mode{display:block}\n');fs.writeFileSync(path.join(profile,'Preferences'),'fixed-profile-byte\n');
  const pre=fileMap(release),profilePre=fs.readFileSync(path.join(profile,'Preferences'));
  const patch=path.join(bundleRoot,'tools/apply_w3_rc6_ui_overlay.cjs'),rollback=path.join(bundleRoot,'tools/rollback_w3_rc6_ui_overlay.cjs');
  const p1=path.join(tmp,'patch1.json'),p2=path.join(tmp,'patch2.json'),r1=path.join(tmp,'rollback1.json'),r2=path.join(tmp,'rollback2.json');
  cp.execFileSync(process.execPath,[patch,'--release',release,'--package',bundleRoot,'--receipt',p1]);
  cp.execFileSync(process.execPath,[patch,'--release',release,'--package',bundleRoot,'--receipt',p2]);
  assert.equal(readJson(p1).changed,true);assert.equal(readJson(p2).changed,false);
  const main=fs.readFileSync(path.join(release,'main.js'),'utf8'),html=fs.readFileSync(path.join(release,'workspace.html'),'utf8');
  assert.equal(count(main,'YOLLA_W3_RC6_UI_LOAD_HOOK_V1_BEGIN'),1);assert.equal(count(main,'globalThis.__YOLLA_W3_UI_TRUTH_BRIDGE__'),1);
  const strict='"use strict";';assert.equal(count(main,strict),1);assert.ok(main.indexOf('YOLLA_W3_RC6_UI_LOAD_HOOK_V1_BEGIN')>main.indexOf(strict));assert.ok(main.indexOf('globalThis.__YOLLA_W3_UI_TRUTH_BRIDGE__')<main.indexOf('createWorkspaceWindow'));
  assert.equal(count(html,'data-yolla-overlay="w3-rc6"'),2);assert.ok(html.indexOf('workspace_c_mode_rc4_truth.css')>html.indexOf('workspace_c_mode.css'));assert.ok(html.indexOf('workspace_c_mode_rc4_truth.js')>html.indexOf('workspace_c_mode.js'));
  assert.deepEqual(fs.readFileSync(path.join(release,'workspace_c_mode.js')),pre['workspace_c_mode.js']);assert.deepEqual(fs.readFileSync(path.join(release,'workspace_c_mode.css')),pre['workspace_c_mode.css']);assert.deepEqual(fs.readFileSync(path.join(profile,'Preferences')),profilePre);
  cp.execFileSync(process.execPath,[rollback,'--release',release,'--receipt',r1]);cp.execFileSync(process.execPath,[rollback,'--release',release,'--receipt',r2]);
  assertSameMap(pre,fileMap(release));assert.deepEqual(fs.readFileSync(path.join(profile,'Preferences')),profilePre);
  return {status:'PASS',patch_first_changed:true,patch_second_changed:false,rollback_runs:2,hook_cardinality:1,exact_pre_overlay_byte_restore:true,base_ui_preserved:true,fixed_browser_profile_preserved:true};
}
function validate(manifestPath,bundleRoot,negativePath){const m=readJson(manifestPath),negative=readJson(negativePath);validateManifest(m);const members=verifyMaterialized(m,bundleRoot);const staticSource=verifyStaticSource(bundleRoot);const negativeResult=validateNegativeFixture(negative);const behavior=runBehavioral(m,bundleRoot);return {schema_version:'RC8_EXACT_UI_HOOK_ROLLBACK_OFFLINE_RECEIPT_V2',control_id:m.control_id,wave_id:m.wave_id,result_key:m.result_key,target_version:m.target_version,status:'PASS',member_count:members.length,members,static_source:staticSource,negative_fixture:negativeResult,behavior,target_pc_live_pass_claimed:false,production:false,ready:false,merge:false};}
if(require.main===module){try{const a=parseArgs(process.argv);const receipt=validate(path.resolve(a.manifest),path.resolve(a['bundle-root']),path.resolve(a['negative-fixture']));fs.mkdirSync(path.dirname(path.resolve(a.receipt)),{recursive:true});fs.writeFileSync(a.receipt,JSON.stringify(receipt,null,2)+'\n');console.log(`RC8_EXACT_UI_HOOK_BUNDLE_V2_PASS members=${receipt.member_count}`);}catch(error){console.error(error.stack||String(error));process.exit(1);}}
module.exports={validateManifest,verifyMaterialized,verifyStaticSource,validateNegativeFixture,runBehavioral,validate,sha256,count,EXACT,RC7};
