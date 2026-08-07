#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
function args(){const o={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i]?.startsWith('--')||process.argv[i+1]==null)throw new Error('BAD_ARG');o[process.argv[i].slice(2)]=process.argv[i+1];}if(!o.manifest||!o.receipt)throw new Error('MISSING_ARG');return o;}
function assert(c,m){if(!c)throw new Error(m);}
function validate(m,w1){
 assert(m.schema_version==='W3_RC5_INSTALLER_READY_UI_EXPORT_V1','SCHEMA');
 assert(m.target_version==='5.10.2.4.2-rc5','VERSION');
 assert(m.runtime_roots.release_root==='E:\\SOURCE FACTORY\\.yolla\\yolla-panel\\releases','RELEASE_ROOT');
 assert(m.runtime_roots.state_root==='E:\\SOURCE FACTORY\\.yolla\\yolla-workspace-v5-2','STATE_ROOT');
 assert(m.runtime_roots.fixed_login_profile==='E:\\SOURCE FACTORY\\.yolla\\yolla-workspace-browser-profile','PROFILE_ROOT');
 assert(m.runtime_roots.localappdata_yolla_allowed===false,'LOCALAPPDATA_FORBIDDEN');
 const f=m.runtime_files;assert(f.length===3,'FILE_COUNT');
 assert(f.map(x=>x.component).join(',')==='UI_TRUTH_BRIDGE,UI_TRUTH_CSS,UI_TRUTH_RUNTIME','COMPONENT_ORDER');
 assert(f.map(x=>x.load_order).join(',')==='11,12,13','LOAD_ORDER');
 assert(new Set(f.map(x=>x.package_path)).size===3,'PACKAGE_DUP');
 assert(new Set(f.map(x=>x.install_destination)).size===3,'DEST_DUP');
 for(const x of f){assert(/^rc5-package\//.test(x.package_path),'PACKAGE_PREFIX');assert(x.install_destination.startsWith(m.runtime_roots.versioned_release_root+'\\'),'DEST_ROOT');assert(/^[0-9a-f]{40}$/.test(x.source_commit),'COMMIT');assert(/^[0-9a-f]{40}$/.test(x.source_blob),'BLOB');assert(/^[0-9a-f]{64}$/.test(x.sha256),'SHA256');}
 assert(m.load_hooks.css.anchor.includes('workspace_c_mode.css'),'CSS_ANCHOR');
 assert(m.load_hooks.css.insert_after.includes('workspace_c_mode_rc4_truth.css'),'CSS_HOOK');
 assert(m.load_hooks.js.anchor.includes('workspace_c_mode.js'),'JS_ANCHOR');
 assert(m.load_hooks.js.insert_after.includes('workspace_c_mode_rc4_truth.js'),'JS_HOOK');
 assert(m.rollback.mode==='REMOVAL_ONLY'&&m.rollback.base_files_modified===false,'ROLLBACK');
 assert(m.fixed_login_profile_contract.preserved===true&&m.fixed_login_profile_contract.write_scope==='NONE','PROFILE');
 assert(m.required_truth_gates.C_AND_REPEAT_DISABLED_WORKING_COUNT===0,'IDLE');
 let alignment='PENDING_W1_RC5_ASSEMBLY_MAP';
 if(w1){
  const wf=(w1.files||[]).filter(x=>x.owner==='W3');
  assert(wf.length===3,'W1_W3_COUNT');
  for(const x of f){const y=wf.find(v=>v.component===x.component);assert(y,'W1_COMPONENT');assert(y.package_path===x.package_path,'W1_PACKAGE_PATH');assert(y.install_destination===x.install_destination,'W1_DEST');assert(y.load_order===x.load_order,'W1_ORDER');}
  alignment='PASS';
 }
 return {schema_version:'W3_RC5_MEMBERSHIP_RECEIPT_V1',status:w1?'PASS':'BLOCKED',nondependent_checks:'PASS',w1_alignment:alignment,runtime_file_count:3,load_order:[11,12,13],fixed_login_profile_contract_preserved:true,live_pass_claimed:false};
}
if(require.main===module){const a=args();const m=JSON.parse(fs.readFileSync(a.manifest,'utf8'));const w=a['w1-map']?JSON.parse(fs.readFileSync(a['w1-map'],'utf8')):null;const r=validate(m,w);fs.writeFileSync(a.receipt,JSON.stringify(r,null,2)+'\n');console.log(`W3_RC5_MEMBERSHIP_${r.status}`);}
module.exports={validate};
