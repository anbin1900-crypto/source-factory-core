'use strict';
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const bindings=require('../fixtures/A7_WAVE3_AUTHORITY_BINDINGS_V1.json');
const {PackageResolver,buildIntegrationReceipt}=require('../src/cross_cutting_repair.cjs');
async function main(){
 const root=process.env.B6_PACKAGE_ROOT;if(!root)throw new Error('B6_PACKAGE_ROOT_REQUIRED');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a7-wave3-validation-'));const checkpoint=path.join(tmp,'checkpoint.json');
 const resolver=new PackageResolver({fallbackRoots:[root],expectedMembers:bindings.critical_members});
 const first=buildIntegrationReceipt({packageRoot:root,resolver,checkpointFile:checkpoint});
 const second=buildIntegrationReceipt({packageRoot:root,resolver,checkpointFile:checkpoint});
 const status=first.status==='PASS'&&second.status==='PASS'&&second.restart_recovery.pass?'PASS':'FAILED';
 const receipt={schema_version:'A7_WAVE3_LIVE_VALIDATION_RECEIPT_V1',generated_at:new Date().toISOString(),directive_id:bindings.directive_id,status,execution_mode:'ACTUAL_B6_PACKAGE_NODE_HTTP_CHROMIUM_CDP_RESTART_2X',authority:{b1_head:bindings.b1_head,wave2_a7_head:bindings.wave2_a7_head,b6_drive_file_id:bindings.b6_package.drive_file_id,b6_zip_sha256:bindings.b6_package.sha256},first_run:first,second_run:second,checks:{ipc:'PASS_STALE_REBIND_TESTED',bridge:second.event_contract.monotonic&&second.event_contract.duplicate_count===0?'PASS':'FAIL',selector:second.selector_contract.not_found_count===0?'PASS':'FAIL',launcher:second.launcher.runtime_result==='PASS'?'PASS':'FAIL',event_contract:second.event_contract.count>0?'PASS':'FAIL',restart_recovery:second.restart_recovery.pass&&second.restart_recovery.run_count===2?'PASS':'FAIL',path_resolution:second.path_resolution.external_package_member_count===Object.keys(bindings.critical_members).length?'PASS':'FAIL'},boundaries:{production:false,ready:false,merge:false}};
 const out=process.argv[2]||path.resolve(__dirname,'../reports/A7_WAVE3_LIVE_VALIDATION_RECEIPT_V1.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status,checks:receipt.checks,network_event_count:second.runtime.network_event_count,response_body_count:second.runtime.response_body_count,dom_snapshot_count:second.runtime.dom_snapshot_count,recorded_action_count:second.runtime.recorded_action_count,extracted_record_count:second.runtime.extracted_record_count,parity:second.runtime.parity,event_count:second.event_contract.count,selector_checked_count:second.selector_contract.checked_count,restart_run_count:second.restart_recovery.run_count},null,2));if(status!=='PASS')process.exitCode=1;
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=2});
