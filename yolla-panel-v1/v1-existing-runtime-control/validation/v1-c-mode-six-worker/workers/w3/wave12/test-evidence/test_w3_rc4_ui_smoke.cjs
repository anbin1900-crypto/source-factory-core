'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function parseArgs(argv) {
  const out={};
  for(let i=2;i<argv.length;i+=2){if(!argv[i]||!argv[i].startsWith('--')||argv[i+1]==null)throw new Error(`BAD_ARG:${argv[i]||''}`);out[argv[i].slice(2)]=argv[i+1];}
  for(const key of ['root','receipt'])if(!out[key])throw new Error(`MISSING_ARG:${key}`);
  return out;
}
function run(root) {
  const uiPath=path.join(root,'runtime-files/workspace_c_mode_rc4_truth.js');
  const cssPath=path.join(root,'runtime-files/workspace_c_mode_rc4_truth.css');
  const bridgePath=path.join(root,'runtime-files/automation-c-v1/workspace_ui_truth_bridge.cjs');
  const js=fs.readFileSync(uiPath,'utf8');
  const css=fs.readFileSync(cssPath,'utf8');
  const bridge=require(path.resolve(bridgePath));
  const context={console,setInterval:()=>0,clearInterval:()=>{},requestAnimationFrame:fn=>fn(),window:{yollaWorkspaceV5:{},addEventListener:()=>{}},document:{getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({})}};
  vm.createContext(context);vm.runInContext(js,context,{filename:'workspace_c_mode_rc4_truth.js'});
  const ui=context.window.yollaUiTruthV12;assert.ok(ui,'UI_TRUTH_EXPORT_MISSING');
  const watcher={c_enabled:true,command_enabled:true,c_active_roles:['W1'],reports_by_role:{W3:{registry_relation:'CURRENT',result_comment_id:5194991632,result_key:'519440526200'},W4:{registry_relation:'HISTORICAL',result_comment_id:5194248288,result_key:'519386239100'},W6:{result_commit:'a'.repeat(40),result_key:'missing'},W7:{duplicate_report:true,result_comment_id:7,result_key:'dup'},W8:{error:true},W9:{status:'END'}},repeat_by_role:{W2:{state:'RUNNING'},W5:{state:'AWAITING'}}};
  const activity=bridge.normalizeUiTruth(watcher);
  const roles=['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10'];
  const counts=ui.truthCountsFromActivity(roles,activity);
  assert.deepEqual({...counts},{working:4,c:1,command:1,current:1,historical:1,awaiting:1,missing:1,duplicate:1,error:1,end:1,idle:1});
  assert.equal(ui.projectRoleFromActivity(activity,'W3').reference,'RESULT_COMMENT #5194991632');
  assert.equal(ui.projectRoleFromActivity(activity,'W4').state,'HISTORICAL_REGISTRY_RESULT');
  assert.equal(ui.projectRoleFromActivity(activity,'W6').state,'REPORT_MISSING');
  assert.equal(ui.projectRoleFromActivity(activity,'W7').state,'DUPLICATE_REPORT');
  const disabled={...activity,c_enabled:false,command_enabled:false};
  assert.equal(ui.truthCountsFromActivity(roles,disabled).working,0);
  assert.ok(!js.includes('profile.status'),'LEGACY_PROFILE_STATUS_REFERENCED');
  for(const token of ['CURRENT_REGISTRY_RESULT','HISTORICAL_REGISTRY_RESULT','REPORT_MISSING','DUPLICATE_REPORT','RESULT_COMMENT'])assert.ok(js.includes(token),`UI_TOKEN_MISSING:${token}`);
  for(const token of ['status-dot.registry-current','status-dot.registry-historical','status-dot.report-missing','status-dot.duplicate-report'])assert.ok(css.includes(token),`CSS_TOKEN_MISSING:${token}`);
  const assertions={C_AND_REPEAT_DISABLED_WORKING_COUNT:0,LEGACY_A_E_EXCLUDED:true,RESULT_COMMENT_PRIORITY:true,CURRENT_AND_HISTORICAL_REGISTRY_SEPARATED:true,MISSING_DUPLICATE_ERROR_END_RESTING_SEPARATED:true};
  return {schema_version:'W3_RC4_UI_SMOKE_RECEIPT_V1',target_version:'5.10.2.4.2-rc4',assertions,counts,status:'PASS',live_pass_claimed:false};
}
if(require.main===module){const args=parseArgs(process.argv);const receipt=run(path.resolve(args.root));fs.mkdirSync(path.dirname(path.resolve(args.receipt)),{recursive:true});fs.writeFileSync(args.receipt,JSON.stringify(receipt,null,2)+'\n');console.log('W3_RC4_UI_SMOKE_PASS assertions=15');}
module.exports={run};
