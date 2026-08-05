'use strict';
const assert = require('node:assert/strict');
const { inspectArtifactGateV2, parseResultComment, collectExactResult, buildCommanderResultComment, fetchAllPagesWithRestart } = require('../result_watcher/rc8_actual_artifact_gate_v2.cjs');
let count=0;
const ok=(v,m)=>{assert.ok(v,m);count++};
const eq=(a,b,m)=>{assert.equal(a,b,m);count++};
const throws=(fn,re,m)=>{assert.throws(fn,re,m);count++};

const expected={
  resolver:{source_sha256:'r'.repeat(64),bundle_manifest_sha256:'m'.repeat(64)},
  ui:{hook_sha256:'h'.repeat(64),rollback_sha256:'b'.repeat(64)},
  manifest_sha256:'x'.repeat(64),
  smoke:{required_component_count:8},
  preservation:{
    state_root:'E:/SOURCE FACTORY/.yolla/state',
    profile_root:'E:/SOURCE FACTORY/.yolla/profiles',
    partition_c:'persist:yolla-v510241-c',
    partition_repeat:'persist:yolla-v510241-repeat',
    work_control_path:'E:/SOURCE FACTORY/.yolla/state/work-control.jsonl',
    dispatch_receipt_path:'E:/SOURCE FACTORY/.yolla/state/dispatch-receipts'
  }
};

const rc7={
  resolver:{exact_bundle_match:false,source_sha256:'z',bundle_manifest_sha256:''},
  ui:{exact_hook_bundle_match:false,exact_rollback_bundle_match:false,hook_sha256:'',rollback_sha256:''},
  manifest:{generated_from_current_tree:true,compared_to_expected:false,expected_manifest_sha256:'',observed_manifest_sha256:'generated'},
  smoke:{full_component:false,behavioral_execution:false,executed_component_count:2,resolver_invoked:false,registry_invoked:false,result_watcher_invoked:false,repeat_runtime_invoked:false,ui_bridge_invoked:false,rollback_invoked:false},
  preservation:{state_root:'E:/SOURCE FACTORY/.yolla/yolla-workspace-v5-2',profile_root:'E:/SOURCE FACTORY/.yolla/yolla-workspace-browser-profile',partition_c:'persist:sf4-safe-panel-worker-1',partition_repeat:'persist:yolla-analysis-browser-v1',work_control_path:'E:/SOURCE FACTORY/.yolla/yolla-workspace-v5-2/work_control_events.jsonl',dispatch_receipt_path:'E:/SOURCE FACTORY/.yolla/yolla-workspace-v5-2/dispatch-receipts'},
  archive:{authority_type:'MUTABLE_BRANCH',commit:'854c3d928e17a30a124b2aab294ff5a9d781a252',byte_readback:true,member_manifest_pinned:false},
  target_pc:{pass_claimed:true,execution_authorized:false,receipt_verified:false,evidence_complete:false,live_execution_performed:false},
  installable_runtime_evidence:true
};

const neg=inspectArtifactGateV2({reportedOutcome:'PASS',candidate:rc7,expected});
eq(neg.REPORTED,true);
eq(neg.OFFLINE_ARTIFACT_ACCEPTED,false);
eq(neg.INSTALLABLE_RUNTIME,false);
eq(neg.TARGET_PC_PENDING,false);
eq(neg.TARGET_PC_ACCEPTED,false);
eq(neg.EFFECTIVE_OUTCOME,'BLOCKED');
eq(neg.PASS_DOES_NOT_OVERRIDE_TECHNICAL_GATE,true);
for(const k of [
  'SIMPLIFIED_RESOLVER_SUBSTITUTION',
  'SIMPLIFIED_UI_HOOK_OR_ROLLBACK_SUBSTITUTION',
  'SELF_GENERATED_MANIFEST_WITHOUT_EXPECTED_MANIFEST_COMPARISON',
  'SHALLOW_COMPONENT_SMOKE',
  'WRONG_PRESERVATION_PATHS',
  'PREMATURE_TARGET_PC_PASS',
  'MUTABLE_BRANCH_ONLY_ARCHIVE_AUTHORITY'
]) eq(neg.REJECTION_FLAGS[k],true,k);
eq(neg.REJECTION_REASONS.length,7);

const positive={
  resolver:{exact_bundle_match:true,...expected.resolver},
  ui:{exact_hook_bundle_match:true,exact_rollback_bundle_match:true,...expected.ui},
  manifest:{compared_to_expected:true,expected_manifest_sha256:expected.manifest_sha256,observed_manifest_sha256:expected.manifest_sha256},
  smoke:{full_component:true,behavioral_execution:true,executed_component_count:8,resolver_invoked:true,registry_invoked:true,result_watcher_invoked:true,repeat_runtime_invoked:true,ui_bridge_invoked:true,rollback_invoked:true},
  preservation:{...expected.preservation},
  archive:{authority_type:'IMMUTABLE_COMMIT',commit:'a'.repeat(40),byte_readback:true,member_manifest_pinned:true},
  target_pc:{pass_claimed:false,execution_authorized:false,receipt_verified:false,evidence_complete:false,live_execution_performed:false},
  installable_runtime_evidence:true
};
const pos=inspectArtifactGateV2({reportedOutcome:'PASS',candidate:positive,expected});
eq(pos.OFFLINE_ARTIFACT_ACCEPTED,true);
eq(pos.INSTALLABLE_RUNTIME,true);
eq(pos.TARGET_PC_PENDING,true);
eq(pos.TARGET_PC_ACCEPTED,false);
eq(pos.EFFECTIVE_OUTCOME,'PASS');
eq(pos.REJECTION_REASONS.length,0);

const accepted=JSON.parse(JSON.stringify(positive));
accepted.target_pc={pass_claimed:true,execution_authorized:true,receipt_verified:true,evidence_complete:true,live_execution_performed:true};
const live=inspectArtifactGateV2({reportedOutcome:'PASS',candidate:accepted,expected});
eq(live.TARGET_PC_ACCEPTED,true);
eq(live.TARGET_PC_PENDING,false);
eq(live.REJECTION_FLAGS.PREMATURE_TARGET_PC_PASS,false);
throws(()=>inspectArtifactGateV2({reportedOutcome:'UNKNOWN',candidate:positive,expected}),/INVALID_REPORTED_OUTCOME/);

const body='C_RESULT|RESULT_KEY=519850936600|ROLE=AUTOMATION-C-W2|OUTCOME=PASS|STATUS=END|RESULT_COMMIT='+'f'.repeat(40);
const parsed=parseResultComment({id:5198509500,pr:60,body});
eq(parsed.result_key,'519850936600');
eq(parsed.role,'AUTOMATION-C-W2');
eq(parsed.result_comment,5198509500);
eq(parseResultComment({body:'bad'}),null);
const one=collectExactResult({comments:[{id:5198509500,pr:60,body}],resultKey:'519850936600',role:'AUTOMATION-C-W2',pr:60,directiveComment:5198509366});
eq(one.report_state,'REPORTED');
const missing=collectExactResult({comments:[],resultKey:'x',role:'AUTOMATION-C-W2',pr:60,directiveComment:1});
eq(missing.report_state,'MISSING');
throws(()=>collectExactResult({comments:[{id:5198509500,pr:60,body},{id:5198509501,pr:60,body}],resultKey:'519850936600',role:'AUTOMATION-C-W2',pr:60,directiveComment:1}),/DUPLICATE_RESULT/);

const cmd=buildCommanderResultComment({role:'AUTOMATION-C-W5',resultComment:5198366530,gate:neg});
ok(cmd.includes('RESULT_COMMENT=5198366530'));
ok(cmd.includes('OFFLINE_ARTIFACT_ACCEPTED=false'));
ok(cmd.includes('MUTABLE_BRANCH_ONLY_ARCHIVE_AUTHORITY'));

(async()=>{
  let attempts=0;
  const pages=await fetchAllPagesWithRestart(async(page,attempt)=>{
    attempts++;
    if(page===1&&attempt<3)throw new Error('TEMP');
    return page===1?{items:[{id:1},{id:2}],has_next:true}:{items:[{id:2},{id:3}],has_next:false};
  },{maxRetries:5});
  eq(attempts,4);
  eq(pages.items.length,3);
  eq(pages.restart_state.last_page,2);
  eq(pages.restart_state.collected_comment_ids.length,3);
  const resumed=await fetchAllPagesWithRestart(async()=>({items:[{id:3},{id:4}],has_next:false}),{restartState:pages.restart_state});
  eq(resumed.items.length,1);
  eq(resumed.items[0].id,4);
  console.log(`PASS_${count}_OF_${count}`);
})().catch(e=>{console.error(e);process.exit(1)});
