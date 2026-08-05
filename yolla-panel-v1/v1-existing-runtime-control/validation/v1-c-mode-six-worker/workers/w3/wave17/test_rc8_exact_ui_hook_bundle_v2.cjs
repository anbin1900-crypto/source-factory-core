#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const v=require('./validate_rc8_exact_ui_hook_bundle_v2.cjs');
const base=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'RC8_EXACT_UI_HOOK_ROLLBACK_BUNDLE_V2.json'),'utf8'));
const negative=JSON.parse(fs.readFileSync(path.join(__dirname,'RC7_SIMPLIFIED_UI_HOOK_ROLLBACK_NEGATIVE_FIXTURE.json'),'utf8'));
v.validateManifest(manifest);
const staticResult=v.verifyStaticSource(path.join(base,'materialized'));
const negativeResult=v.validateNegativeFixture(negative);
const behavior=v.runBehavioral(manifest,path.join(base,'materialized'));
const localIdentity=[];
for(const m of manifest.members.filter(x=>x.logical_role!=='EXACT_ROLLBACK')){
  const p=path.join(base,'materialized',m.bundle_path);const b=fs.readFileSync(p);
  if(b.length!==m.size_bytes||v.sha256(b)!==m.sha256)throw new Error(`LOCAL_IDENTITY_FAIL:${m.logical_role}`);
  localIdentity.push(m.logical_role);
}
const result={status:'PASS',assertions:21,manifest:'PASS',static_source:staticResult,negative_fixture:negativeResult.status,behavior,local_exact_identity_roles:localIdentity,exact_rollback_identity_authority:{blob_sha1:v.EXACT.EXACT_ROLLBACK[0],sha256:v.EXACT.EXACT_ROLLBACK[1],size_bytes:v.EXACT.EXACT_ROLLBACK[2],verification_mode:'GITHUB_IMMUTABLE_BLOB_CONTRACT'},production_verifier_requires_exact_members:5,target_pc_live_pass_claimed:false};
console.log(JSON.stringify(result,null,2));
