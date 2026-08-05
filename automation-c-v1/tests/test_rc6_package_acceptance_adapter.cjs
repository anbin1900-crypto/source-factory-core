'use strict';
const assert = require('node:assert/strict');
const { parseResultComment, evaluatePackageProvenance, evaluateReportedTechnicalState, collectWaveAcceptance, fetchAllPagesWithRestart } = require('../result_watcher/rc6_package_acceptance_adapter.cjs');
let assertions = 0;
function ok(value, message) { assertions += 1; assert.ok(value, message); }
function eq(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
function deep(actual, expected, message) { assertions += 1; assert.deepEqual(actual, expected, message); }
function throws(fn, re, message) { assertions += 1; assert.throws(fn, re, message); }

const authorityMembers = [
  ['automation-c-v1/c_mode_runtime.cjs',5081,'7ba9ec69c501d94e79b20774b4462a1108d8896608cd440d5932f518aab10995'],
  ['automation-c-v1/c_mode_wave_pointer.cjs',3303,'7688f6fa74829e31739f4adad26fa83f77b311f8606a7a1f981caafb46f783ba'],
  ['automation-c-v1/c_mode_registry_authority.cjs',3164,'87c019aebf35f6f07a8c27c2b0a7487a121d9a5f8b862ba1784993ce0f499f40'],
  ['automation-c-v1/result_watcher/runtime_result_adapter.cjs',2605,'7e91f62425c971d5f062c4af065aa5f828dce00ac4f9693ee68e5f8bf504c0c3'],
  ['automation-c-v1/repeat_command_runtime.cjs',8594,'20f57e91910af1346db23f16eb3e88bf572fd547a65d249820957444b1618cd2'],
  ['automation-c-v1/actual_repeat_release_adapter.cjs',3073,'a15590ed669f4e996e77846a32ee81537a7db6d32758dc3375ffbfe9fc12b05d'],
  ['automation-c-v1/c_repeat_namespace_adapter.cjs',3073,'57ec0d4eec89c5cd7d8685029d4560673f6135605d04857edb56c29eca00112c'],
  ['automation-c-v1/actual_candidate_bridge_binding.cjs',1113,'02d5d9d9bbda02bdb0200b4c0b493e15de186802de4caade60bf913ffb77404f'],
  ['automation-c-v1/background_browser_dispatch.cjs',1805,'6d87056c3b1714490f97541288f4cd3a7f1287478f63545c36730416e7c125c9'],
  ['automation-c-v1/work_control_event_log.cjs',1219,'afb3376c9b70448d916f93f577a86cb8034e7b6a5c679e38fa5a809b8049b30c'],
  ['automation-c-v1/workspace_ui_truth_bridge.cjs',4012,'8086f56f1f0b5731cb9ad4be5339fc211d1468f4195fcf249b7a300cc3b830e8'],
  ['workspace_c_mode_rc4_truth.css',1504,'43b6a3721c250e76b2562c45d931fd17d87ae219fec70aa3ef3206af9cd8b0fe'],
  ['workspace_c_mode_rc4_truth.js',7858,'5fdd1719e110ce80ad4b3efb911fd20a86ccbfeb27182645e8d2170287114b54'],
  ['automation-c-v1/tests/rc4_isolated_smoke.cjs',2500,'1111111111111111111111111111111111111111111111111111111111111111'],
  ['automation-c-v1/rc4_launcher_switch.cjs',1800,'2222222222222222222222222222222222222222222222222222222222222222'],
  ['automation-c-v1/rc4_rollback_runtime.cjs',1600,'3333333333333333333333333333333333333333333333333333333333333333'],
  ['RUN_YOLLA_WORKSPACE_V5_2.bat',1200,'4444444444444444444444444444444444444444444444444444444444444444'],
].map(([package_path,size_bytes,sha256])=>({package_path,size_bytes,sha256}));

const authority = {
  target_version:'5.10.2.4.2-rc6', required_member_count:17,
  release_root:'E:/SOURCE FACTORY/.yolla/releases/5.10.2.4.2-rc6',
  preservation:{state_root:'E:/SOURCE FACTORY/.yolla/state',profile_root:'E:/SOURCE FACTORY/.yolla/profiles',partition_c:'persist:yolla-v510241-c',partition_repeat:'persist:yolla-v510241-repeat'},
  required_load_hooks:['automation-c-v1/result_watcher/runtime_result_adapter.cjs','automation-c-v1/workspace_ui_truth_bridge.cjs','workspace_c_mode_rc4_truth.css','workspace_c_mode_rc4_truth.js','automation-c-v1/repeat_command_runtime.cjs'],
  members:authorityMembers,
};

const rc5Members = [
  ['automation-c-v1/c_mode_runtime.cjs',142,'4c6c85cf00a63685c0b16bbcb7b335e2fa81844797f0cf831b02d7aeb5f3798a'],
  ['automation-c-v1/c_mode_wave_pointer.cjs',170,'a95cb5c5455a022a5e95136e5adea1bb38ec8144ceb86f3ca6e28c95e0e04c07'],
  ['automation-c-v1/result_watcher/runtime_result_adapter.cjs',206,'2beb60c850a8fa2c6af8c57b7f6405f38b62dd397a2f24562e9babd98fefec89'],
  ['automation-c-v1/workspace_ui_truth_bridge.cjs',223,'69b0d6eeb8ab4f4c500cb59e0fb0df737d683ba9c225b120c476ccf343242c3d'],
  ['workspace_c_mode_rc5_truth.css',151,'904c91952769382cb9e18a2388abd7fd4b5c409fc3a62b79c50bf583fa4136a9'],
  ['workspace_c_mode_rc5_truth.js',65,'1919c60aadddac29eec4e3aede1b103cf54bdb9ab844cc53a95644a81cb9d83c'],
  ['automation-c-v1/repeat_command_runtime.cjs',203,'b41bc30e2b1f51ece8d3048c593fd051167e5470de0197434eed20e500950935'],
  ['automation-c-v1/background_browser_dispatch.cjs',252,'5d60fd34df7e31c869bf824ab8c150f6cff7a6422d962fdcd77bbdcd2b7dbbc4'],
  ['automation-c-v1/work_control_event_log.cjs',165,'402f7dab7d8850b0abfecbb4d94b6266b405bf50b267bdcd298ef52c3b1f14cf'],
  ['automation-c-v1/rc5_launcher_switch.cjs',213,'e1914ddbebc15671c3cd3219f720189a5e6ad5e6fd1c96892b18872d6efb981b'],
  ['automation-c-v1/rc5_rollback_runtime.cjs',178,'a16c979052546823c79d959d024c1f519abf50f02a85ff8b79cc71e87519806b'],
  ['automation-c-v1/rc5_full_smoke.cjs',547,'e32760e6e65df486738d53fe2fe0752dab9a36aa3bdeb6d5ffc9842d3bf40f12'],
].map(([path,size,sha256])=>({path,size,sha256}));

const rc5 = {
  target_version:'5.10.2.4.2-rc5', release_root:'ExistingReleaseRoot/5.10.2.4.2-rc5',
  preservation:{state_root:'ExistingStateRoot',profile_root:'ExistingStateRoot/login-profile',partition_c:'',partition_repeat:''},
  runtime_load_hooks:['automation-c-v1/c_mode_runtime.cjs','automation-c-v1/c_mode_wave_pointer.cjs','automation-c-v1/result_watcher/runtime_result_adapter.cjs'],
  base_release_present:false,base_release_cloned:false,launcher_target_executable:false,authoritative_path_match:false,members:rc5Members,
};

const negative=evaluateReportedTechnicalState({reportedOutcome:'PASS',authority,candidate:rc5,targetVersion:'5.10.2.4.2-rc6'});
eq(negative.REPORTED,true); eq(negative.TECHNICALLY_ACCEPTED,false); eq(negative.INSTALLABLE_RUNTIME,false); eq(negative.TARGET_PC_ACCEPTED,false); eq(negative.EFFECTIVE_OUTCOME,'BLOCKED'); eq(negative.PASS_DOES_NOT_OVERRIDE_TECHNICAL_GATE,true);
for(const reason of ['STUB_PAYLOAD_SUBSTITUTION','EXACT_SOURCE_HASH_MISMATCH','REQUIRED_MEMBER_COUNT_MISMATCH','BASE_RELEASE_NOT_PRESENT_OR_CLONED','RUNTIME_LOAD_HOOK_MISSING','AUTHORITATIVE_PATH_MISMATCH','PRESERVATION_PATH_MISMATCH','LAUNCHER_TARGET_NOT_EXECUTABLE','TARGET_VERSION_MISMATCH']) ok(negative.REJECTION_REASONS.includes(reason),reason);
eq(negative.DETAILS.candidate_member_count,12); eq(negative.DETAILS.authoritative_member_count,17); ok(negative.DETAILS.stub_members.length>=7); ok(negative.DETAILS.exact_hash_mismatches.length>=7); ok(negative.DETAILS.missing_members.length>=5);

const rc6={target_version:'5.10.2.4.2-rc6',release_root:authority.release_root,preservation:{...authority.preservation},runtime_load_hooks:[...authority.required_load_hooks],base_release_present:true,base_release_cloned:false,launcher_target_executable:true,authoritative_path_match:true,target_pc_accepted:false,members:authorityMembers.map(i=>({path:i.package_path,size:i.size_bytes,sha256:i.sha256}))};
const positive=evaluateReportedTechnicalState({reportedOutcome:'PASS',authority,candidate:rc6,targetVersion:'5.10.2.4.2-rc6'});
eq(positive.TECHNICALLY_ACCEPTED,true); eq(positive.INSTALLABLE_RUNTIME,true); eq(positive.TARGET_PC_PENDING,true); eq(positive.TARGET_PC_ACCEPTED,false); eq(positive.EFFECTIVE_OUTCOME,'PASS'); eq(positive.REJECTION_REASONS.length,0);
const accepted=evaluatePackageProvenance({authority,candidate:{...rc6,target_pc_accepted:true},targetVersion:'5.10.2.4.2-rc6'}); eq(accepted.TARGET_PC_ACCEPTED,true); eq(accepted.TARGET_PC_PENDING,false);

const parsed=parseResultComment({id:700,pr:63,body:'C_RESULT|RESULT_KEY=519606510900|ROLE=AUTOMATION-C-W5|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=e9d690ea71092924aec58ed32eeb47c1fa6f7d1c'});
eq(parsed.role,'AUTOMATION-C-W5'); eq(parsed.result_key,'519606510900'); eq(parsed.result_comment,700); eq(parseResultComment({id:1,pr:63,body:'invalid'}),null);
const registry={schema:'C_MODE_WAVE_V2',control_id:'V1-C-MODE-6W-VALIDATION-CYCLE-002',wave_id:'V1-C-MODE-6W-WAVE-014',registry_sequence:14,workers:[{role:'AUTOMATION-C-W5',pr:63,directive_comment:5196065109,result_key:'519606510900'}]};
const collected=collectWaveAcceptance({registry,comments:[{id:5196292106,pr:63,body:'C_RESULT|RESULT_KEY=519606510900|ROLE=AUTOMATION-C-W5|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=e9d690ea71092924aec58ed32eeb47c1fa6f7d1c'}],packageByRole:{'AUTOMATION-C-W5':rc5},authorityByRole:{'AUTOMATION-C-W5':authority},targetVersion:'5.10.2.4.2-rc6'});
eq(collected.reported,1); eq(collected.missing,0); eq(collected.results[0].report_state,'REPORTED'); eq(collected.results[0].technical_state,'TECHNICALLY_REJECTED'); ok(collected.commander_output.includes('RESULT_COMMENT=5196292106')); ok(collected.commander_output.includes('TECHNICAL=TECHNICALLY_REJECTED'));
throws(()=>collectWaveAcceptance({registry,comments:[{id:5196292106,pr:63,body:'C_RESULT|RESULT_KEY=519606510900|ROLE=AUTOMATION-C-W5|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=e9d690ea71092924aec58ed32eeb47c1fa6f7d1c'},{id:5196292107,pr:63,body:'C_RESULT|RESULT_KEY=519606510900|ROLE=AUTOMATION-C-W5|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=e9d690ea71092924aec58ed32eeb47c1fa6f7d1c'}],packageByRole:{},authorityByRole:{},targetVersion:'5.10.2.4.2-rc6'}),/DUPLICATE_RESULT/);

(async()=>{let calls=0;const pageResult=await fetchAllPagesWithRestart(async(page,attempt)=>{calls+=1;if(page===1&&attempt<3)throw new Error('TEMP');if(page===1)return{items:[{id:1},{id:2}],has_next:true};return{items:[{id:2},{id:3}],has_next:false};},{restartState:{collected_comment_ids:[1]}});eq(calls,4);deep(pageResult.items.map(i=>i.id),[2,3]);deep(pageResult.restart_state.collected_comment_ids,[1,2,3]);eq(pageResult.restart_state.last_page,2);console.log(`PASS_${assertions}_OF_${assertions}`);})().catch(error=>{console.error(error);process.exit(1);});
