'use strict';
const fs=require('node:fs'),path=require('node:path');
function get(name){const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw new Error(`MISSING_${name}`);return process.argv[i+1];}
const release=get('--release'),receipt=get('--receipt'),backup=path.join(release,'.w3-rc7-backup');
const restored=[];
for(const name of ['main.js','workspace.html']){const src=path.join(backup,name),dst=path.join(release,name);if(fs.existsSync(src)){fs.copyFileSync(src,dst);restored.push(name);}}
for(const rel of ['automation-c-v1/workspace_ui_truth_bridge.cjs','workspace_c_mode_rc4_truth.css','workspace_c_mode_rc4_truth.js']){const p=path.join(release,rel);if(fs.existsSync(p))fs.rmSync(p,{force:true});}
if(fs.existsSync(backup))fs.rmSync(backup,{recursive:true,force:true});
const out={schema_version:'W3_RC7_UI_ROLLBACK_RECEIPT_V1',status:'PASS',restored,overlay_removed:true};fs.writeFileSync(receipt,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
