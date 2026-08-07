'use strict';
const assert = require('assert');
const {
  REJECTION_KEYS,
  evaluateRc5PackageEvidence,
  applyRc5PackageGate,
  collectRc5PackageTechnicalAcceptance,
  fetchAllPagesForRc5,
} = require('../result_watcher/rc5_package_technical_acceptance_gate.cjs');

const negative = {
  byte_exists: true,
  executable_source_present: true,
  install_action_present: true,
  smoke_and_rollback_present: true,
  package_directory_present: false,
  self_contained_payload: false,
  network_dependent_installer: true,
  active_runtime_root_match: false,
  fixed_profile_binding: false,
  ui_path_and_load_order_match: false,
  required_components_loaded_by_smoke: false,
  rollback_preservation_verified: false,
  target_pc_accepted: false,
};
const positive = {
  byte_exists: true,
  executable_source_present: true,
  install_action_present: true,
  smoke_and_rollback_present: true,
  package_directory_present: true,
  self_contained_payload: true,
  network_dependent_installer: false,
  active_runtime_root_match: true,
  fixed_profile_binding: true,
  ui_path_and_load_order_match: true,
  required_components_loaded_by_smoke: true,
  rollback_preservation_verified: true,
  target_pc_accepted: false,
};
let assertions = 0;
function ok(value, msg){ assert.ok(value,msg); assertions++; }
function eq(a,b,msg){ assert.strictEqual(a,b,msg); assertions++; }

const negVerdict = evaluateRc5PackageEvidence(negative);
eq(negVerdict.REJECTION_COUNT, 8);
for (const key of REJECTION_KEYS) ok(negVerdict[key], key);
eq(negVerdict.INSTALLABLE_RUNTIME, false);
eq(negVerdict.TARGET_PC_ACCEPTED, false);
eq(negVerdict.TARGET_PC_PENDING, false);

const negGate = applyRc5PackageGate('PASS', negative);
eq(negGate.REPORTED, true);
eq(negGate.TECHNICALLY_ACCEPTED, false);
eq(negGate.EFFECTIVE_OUTCOME, 'BLOCKED');
eq(negGate.PASS_DOES_NOT_OVERRIDE_TECHNICAL_GATE, true);

const posGate = applyRc5PackageGate('PASS', positive);
eq(posGate.TECHNICALLY_ACCEPTED, true);
eq(posGate.INSTALLABLE_RUNTIME, true);
eq(posGate.TARGET_PC_PENDING, true);
eq(posGate.TARGET_PC_ACCEPTED, false);
eq(posGate.EFFECTIVE_OUTCOME, 'PASS');
const accepted = applyRc5PackageGate('PASS', {...positive,target_pc_accepted:true});
eq(accepted.TARGET_PC_ACCEPTED, true);
eq(accepted.TARGET_PC_PENDING, false);
const blockedAccepted = applyRc5PackageGate('BLOCKED', positive);
eq(blockedAccepted.TECHNICALLY_ACCEPTED,true);
eq(blockedAccepted.EFFECTIVE_OUTCOME,'BLOCKED');
assert.throws(()=>applyRc5PackageGate('UNKNOWN',positive),/INVALID_WORKER_OUTCOME/); assertions++;

const registry={schema:'C_MODE_WAVE_V2',control_id:'C',wave_id:'W13',registry_sequence:13,target_version:'rc5',workers:[
 {role:'AUTOMATION-C-W2',pr:60,directive_comment:100,result_key:'200'},
 {role:'AUTOMATION-C-W5',pr:63,directive_comment:101,result_key:'201'},
]};
const comments=[
 {id:150,pr:60,body:'C_RESULT|RESULT_KEY=200|ROLE=AUTOMATION-C-W2|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=1111111111111111111111111111111111111111'},
 {id:151,pr:63,body:'C_RESULT|RESULT_KEY=201|ROLE=AUTOMATION-C-W5|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=2222222222222222222222222222222222222222'},
 {id:152,pr:63,body:'C_RESULT|RESULT_KEY=999|ROLE=AUTOMATION-C-W5|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=3333333333333333333333333333333333333333'},
];
const collection=collectRc5PackageTechnicalAcceptance({registry,comments,packageEvidenceByRole:{'AUTOMATION-C-W5':negative}});
eq(collection.reported,2);
eq(collection.missing,0);
eq(collection.duplicate,0);
eq(collection.results[1].report_state,'REPORTED');
eq(collection.results[1].technical_acceptance.TECHNICALLY_ACCEPTED,false);
ok(collection.commander_output.includes('RESULT_COMMENT=151'));
ok(collection.commander_output.includes('PACKAGE_DIRECTORY_MISSING'));
const missing=collectRc5PackageTechnicalAcceptance({registry,comments:comments.slice(0,1),packageEvidenceByRole:{'AUTOMATION-C-W5':negative}});
eq(missing.missing,1);
eq(missing.results[1].report_state,'MISSING');
assert.throws(()=>collectRc5PackageTechnicalAcceptance({registry,comments:[comments[0],{...comments[0],id:160}],packageEvidenceByRole:{}}),/DUPLICATE_RESULT/);assertions++;
assert.throws(()=>collectRc5PackageTechnicalAcceptance({registry:{schema:'BAD'},comments:[]}),/INVALID_REGISTRY/);assertions++;

(async()=>{
 let calls=0;
 const paged=await fetchAllPagesForRc5(async(page,attempt)=>{
   calls++;
   if(page===1&&attempt<3)throw new Error('TEMP');
   if(page===1)return{items:[{id:1},{id:2}],has_next:true};
   return{items:[{id:2},{id:3}],has_next:false};
 },{restartState:{collected_comment_ids:[1]}});
 eq(paged.items.length,2);
 eq(paged.items[0].id,2);
 eq(paged.items[1].id,3);
 eq(paged.restart_state.last_page,2);
 ok(paged.restart_state.collected_comment_ids.includes(1));
 ok(calls>=4);
 let exhausted=0;
 try{
   await fetchAllPagesForRc5(async()=>{exhausted++;throw new Error('DOWN');},{maxRetries:5});
 }catch(e){eq(e.message,'DOWN');}
 eq(exhausted,5);
 console.log(`PASS_${assertions}_OF_${assertions}`);
})().catch((error)=>{console.error(error);process.exit(1);});
