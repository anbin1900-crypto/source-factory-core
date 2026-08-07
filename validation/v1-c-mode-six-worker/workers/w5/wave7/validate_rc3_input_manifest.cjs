#!/usr/bin/env node
'use strict';
const fs=require('fs');
const p=process.argv[2];if(!p){console.error('manifest required');process.exit(2);}const m=JSON.parse(fs.readFileSync(p,'utf8'));const errors=[];
if(m.schema!=='C_MODE_RC3_INPUT_MANIFEST_V1')errors.push('schema');if(m.target_version!=='5.10.2.4.2-rc3')errors.push('target_version');if(m.installed_baseline!=='5.10.2.4.0')errors.push('installed_baseline');if(m.manual_4_1_preinstall_required!==false)errors.push('manual_4_1_preinstall_required');
for(const r of ['W1','W2','W3','W4']){const x=m.inputs?.[r];if(!x?.head||!/^[0-9a-f]{40}$/.test(x.head))errors.push(`${r}.head`);if(!Array.isArray(x?.files)||!x.files.length)errors.push(`${r}.files`);}if(m.preserve?.login_profile!==true||m.preserve?.runtime_log!==true||m.preserve?.work_control_jsonl!==true||m.preserve?.dispatch_receipts!==true||m.preserve?.c_repeat_state!==true)errors.push('preserve');if(m.ae_reintroduced!==false)errors.push('ae_reintroduced');
if(errors.length){console.error(JSON.stringify({status:'BLOCKED',errors},null,2));process.exit(3);}console.log(JSON.stringify({status:'PASS',roles:4},null,2));