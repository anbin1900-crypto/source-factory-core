#!/usr/bin/env node
'use strict';
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const REQUIRED=['W1','W2','W3','W4'];
function sha256(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function fail(m){console.error(m);process.exit(2);}
const manifestPath=process.argv[2];const outDir=process.argv[3];if(!manifestPath||!outDir)fail('usage: node candidate_assembler_rc3.cjs <input-manifest.json> <out-dir>');
const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(m.target_version!=='5.10.2.4.2-rc3')fail('target_version mismatch');
for(const r of REQUIRED){const x=m.inputs?.[r];if(!x||!x.head||!Array.isArray(x.files)||x.files.length===0)fail(`missing ${r} input`);for(const f of x.files){if(!f.path||!f.sha256||!fs.existsSync(f.path))fail(`missing file ${r}:${f.path}`);if(sha256(f.path)!==f.sha256)fail(`sha256 mismatch ${r}:${f.path}`);}}
fs.mkdirSync(outDir,{recursive:true});const payload=[];for(const r of REQUIRED){for(const f of m.inputs[r].files){const dst=path.join(outDir,'payload',r,f.install_path||path.basename(f.path));fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(f.path,dst);payload.push({role:r,source:f.path,destination:path.relative(outDir,dst),sha256:sha256(dst)});}}
const receipt={schema:'C_MODE_RC3_ASSEMBLY_RECEIPT_V1',target_version:m.target_version,baseline:'5.10.2.4.0',internal_staging:'5.10.2.4.1',preserve:['login_profile','runtime_log','work_control_jsonl','dispatch_receipts','c_repeat_state'],ae_reintroduced:false,payload};fs.writeFileSync(path.join(outDir,'PAYLOAD_MANIFEST.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:'PASS',files:payload.length},null,2));