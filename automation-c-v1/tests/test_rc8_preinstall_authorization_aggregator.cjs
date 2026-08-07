'use strict';
const assert = require('node:assert/strict');
const {
  parseResultComment,
  aggregatePreinstallAuthorization,
  buildCommanderOutput,
  fetchAllPagesWithRestart,
} = require('../result_watcher/rc8_preinstall_authorization_aggregator.cjs');

let assertions = 0;
function eq(a,b,m){assert.deepEqual(a,b,m);assertions++;}
function ok(a,m){assert.ok(a,m);assertions++;}
const registry={
  schema:'C_MODE_PREINSTALL_REGISTRY_V1',control_id:'V1-C-MODE-6W-VALIDATION-CYCLE-002',wave_id:'V1-C-MODE-6W-WAVE-018',registry_sequence:18,
  workers:[
    {role:'AUTOMATION-C-W1',pr:59,directive_comment:5198507579,result_key:'519850757900',expected_result_commit:'f55870053245177430c20a3f9ba0029f955df8f0',expected_head:'33f04ce798592d1338e86e554d495d95134e7052'},
    {role:'AUTOMATION-C-W3',pr:61,directive_comment:5198511606,result_key:'519851160600',expected_result_commit:'7af7a51ee18e6b5ae6f64942cf02392f596e4678',expected_head:'f023ce7ab94d5522eaf2c790a172478ea268e184'},
    {role:'AUTOMATION-C-W4',pr:62,directive_comment:5198513106,result_key:'519851310600',expected_result_commit:'c068f213af2cf7cf0636ad23219cc64c157c247f',expected_head:'c068f213af2cf7cf0636ad23219cc64c157c247f'},
    {role:'AUTOMATION-C-W6',pr:64,directive_comment:5198516800,result_key:'519851680000',expected_result_commit:'e461d6be7bca1de7682649a2c25657c976120745',expected_head:'e461d6be7bca1de7682649a2c25657c976120745'},
    {role:'AUTOMATION-C-W5',pr:63,directive_comment:5198514990,result_key:'519851499000',expected_result_commit:'5555555555555555555555555555555555555555',expected_head:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},
  ]
};
const comment=(id,pr,key,role,outcome,commit)=>({id,pr,body:`C_RESULT|RESULT_KEY=${key}|ROLE=${role}|OUTCOME=${outcome}|STATUS=END|RESULT_COMMIT=${commit}`});
const baseComments=[
 comment(5198777211,59,'519850757900','AUTOMATION-C-W1','PASS','f55870053245177430c20a3f9ba0029f955df8f0'),
 comment(5198723961,61,'519851160600','AUTOMATION-C-W3','PASS','7af7a51ee18e6b5ae6f64942cf02392f596e4678'),
 comment(5198603151,62,'519851310600','AUTOMATION-C-W4','PASS','c068f213af2cf7cf0636ad23219cc64c157c247f'),
 comment(5198605692,64,'519851680000','AUTOMATION-C-W6','PASS','e461d6be7bca1de7682649a2c25657c976120745'),
];
const evidence={
 'AUTOMATION-C-W1':{scoped_accepted:true,head:'33f04ce798592d1338e86e554d495d95134e7052'},
 'AUTOMATION-C-W3':{scoped_accepted:true,head:'f023ce7ab94d5522eaf2c790a172478ea268e184'},
 'AUTOMATION-C-W4':{scoped_accepted:true,head:'c068f213af2cf7cf0636ad23219cc64c157c247f'},
 'AUTOMATION-C-W6':{scoped_accepted:true,head:'e461d6be7bca1de7682649a2c25657c976120745'},
 'AUTOMATION-C-W5':{scoped_accepted:true,head:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},
};

const parsed=parseResultComment(baseComments[0]);
eq(parsed.role,'AUTOMATION-C-W1');eq(parsed.outcome,'PASS');
let current=aggregatePreinstallAuthorization({registry,comments:baseComments,evidenceByRole:evidence,expectedManifestSha256:'b'.repeat(64),artifact:{}});
eq(current.REPORTED,false);eq(current.SCOPED_ACCEPTED,false);eq(current.OFFLINE_ARTIFACT_ACCEPTED,false);eq(current.INSTALLABLE_RUNTIME,false);eq(current.TARGET_PC_AUTHORIZED,false);eq(current.TARGET_PC_ACCEPTED,false);ok(current.REASONS.includes('MISSING_W5'));ok(!buildCommanderOutput(current).includes('TARGET_PC_AUTHORIZED=true'));

const w5=comment(5199200000,63,'519851499000','AUTOMATION-C-W5','PASS','5555555555555555555555555555555555555555');
const positiveArtifact={manifest_sha256:'b'.repeat(64),immutable_authority:true,offline_gate_passed:true,installable_runtime:true};
let positive=aggregatePreinstallAuthorization({registry,comments:[...baseComments,w5],evidenceByRole:evidence,expectedManifestSha256:'b'.repeat(64),artifact:positiveArtifact,authorizationRequested:true});
eq(positive.REPORTED,true);eq(positive.SCOPED_ACCEPTED,true);eq(positive.OFFLINE_ARTIFACT_ACCEPTED,true);eq(positive.INSTALLABLE_RUNTIME,true);eq(positive.TARGET_PC_AUTHORIZED,true);eq(positive.TARGET_PC_ACCEPTED,false);eq(positive.FAIL_CLOSED,false);

let accepted=aggregatePreinstallAuthorization({registry,comments:[...baseComments,w5],evidenceByRole:evidence,expectedManifestSha256:'b'.repeat(64),artifact:positiveArtifact,authorizationRequested:true,targetPcReceiptAccepted:true});
eq(accepted.TARGET_PC_ACCEPTED,true);

let wrongManifest=aggregatePreinstallAuthorization({registry,comments:[...baseComments,w5],evidenceByRole:evidence,expectedManifestSha256:'c'.repeat(64),artifact:positiveArtifact,authorizationRequested:true});
eq(wrongManifest.OFFLINE_ARTIFACT_ACCEPTED,false);eq(wrongManifest.TARGET_PC_AUTHORIZED,false);ok(wrongManifest.REASONS.includes('WRONG_MANIFEST'));

let staleEvidence=JSON.parse(JSON.stringify(evidence));staleEvidence['AUTOMATION-C-W3'].head='0'.repeat(40);
let stale=aggregatePreinstallAuthorization({registry,comments:[...baseComments,w5],evidenceByRole:staleEvidence,expectedManifestSha256:'b'.repeat(64),artifact:positiveArtifact,authorizationRequested:true});
eq(stale.SCOPED_ACCEPTED,false);ok(stale.REASONS.includes('STALE_HEAD'));eq(stale.TARGET_PC_AUTHORIZED,false);

let dup=aggregatePreinstallAuthorization({registry,comments:[...baseComments,w5,{...w5,id:w5.id+1}],evidenceByRole:evidence,expectedManifestSha256:'b'.repeat(64),artifact:positiveArtifact,authorizationRequested:true});
eq(dup.REPORTED,false);ok(dup.REASONS.includes('DUPLICATE_RESULT'));eq(dup.TARGET_PC_AUTHORIZED,false);

let overrideEvidence=JSON.parse(JSON.stringify(evidence));overrideEvidence['AUTOMATION-C-W5'].scoped_accepted=false;
let override=aggregatePreinstallAuthorization({registry,comments:[...baseComments,w5],evidenceByRole:overrideEvidence,expectedManifestSha256:'b'.repeat(64),artifact:positiveArtifact,authorizationRequested:true});
eq(override.SCOPED_ACCEPTED,false);ok(override.REASONS.includes('WORKER_PASS_OVERRIDE_REJECTED'));eq(override.TARGET_PC_AUTHORIZED,false);

let mutable=aggregatePreinstallAuthorization({registry,comments:[...baseComments,w5],evidenceByRole:evidence,expectedManifestSha256:'b'.repeat(64),artifact:{...positiveArtifact,immutable_authority:false},authorizationRequested:true});
eq(mutable.OFFLINE_ARTIFACT_ACCEPTED,false);ok(mutable.REASONS.includes('MUTABLE_ARTIFACT_AUTHORITY'));

let earlyReceipt=aggregatePreinstallAuthorization({registry,comments:baseComments,evidenceByRole:evidence,expectedManifestSha256:'b'.repeat(64),artifact:{},authorizationRequested:true,targetPcReceiptAccepted:true});
eq(earlyReceipt.TARGET_PC_ACCEPTED,false);ok(earlyReceipt.REASONS.includes('TARGET_PC_RECEIPT_REJECTED_BEFORE_AUTHORIZATION'));

(async()=>{
 let calls=0;
 const pages={1:{items:[{id:1},{id:2}],has_next:true},2:{items:[{id:2},{id:3}],has_next:false}};
 const fetched=await fetchAllPagesWithRestart(async(page,attempt)=>{calls++;if(page===1&&attempt<3)throw new Error('TEMP');return pages[page];});
 eq(fetched.items.map(x=>x.id),[1,2,3]);eq(fetched.restart_state.last_page,2);eq(calls,4);
 const resumed=await fetchAllPagesWithRestart(async()=>({items:[{id:3},{id:4}],has_next:false}),{restartState:fetched.restart_state,startPage:3});
 eq(resumed.items.map(x=>x.id),[4]);ok(resumed.restart_state.collected_comment_ids.includes(1));
 console.log(`PASS_${assertions}_OF_${assertions}`);
})().catch(e=>{console.error(e);process.exit(1)});
