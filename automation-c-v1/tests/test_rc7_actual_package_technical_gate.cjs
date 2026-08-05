'use strict';
const assert = require('node:assert/strict');
const {
  inspectActualPackage, parseResultComment, collectExactResult,
  buildCommanderResultComment, fetchAllPagesWithRestart,
} = require('../result_watcher/rc7_actual_package_technical_gate.cjs');
let count = 0;
function eq(a,b){assert.deepEqual(a,b);count++;}
function ok(v){assert.ok(v);count++;}
function throws(fn,re){assert.throws(fn,re);count++;}

const rc6Installer = `
$TargetVersion='5.10.2.4.2-rc6'
$Payload=Join-Path $PSScriptRoot 'rc6-payload'
Copy-Item -LiteralPath $BaseReleasePath -Destination $Candidate -Recurse
& node (Join-Path $Candidate 'automation-c-v1\\tests\\rc4_isolated_smoke.cjs')
if(Test-Path -LiteralPath $LauncherBackup){[IO.File]::WriteAllBytes($LauncherPath,[IO.File]::ReadAllBytes($LauncherBackup))}
`;
const rc6Payload = `handle = await this.open(job.target, {hidden:true, temporaryProfile:true});`;
const neg = inspectActualPackage({reportedOutcome:'PASS',installerText:rc6Installer,payloadTexts:[rc6Payload]});
eq(neg.REPORTED,true); eq(neg.REPORTED_OUTCOME,'PASS'); eq(neg.TECHNICALLY_ACCEPTED,false);
eq(neg.INSTALLABLE_RUNTIME,false); eq(neg.TARGET_PC_PENDING,false); eq(neg.TARGET_PC_ACCEPTED,false);
eq(neg.EFFECTIVE_OUTCOME,'BLOCKED'); eq(neg.PASS_DOES_NOT_OVERRIDE_TECHNICAL_GATE,true);
for (const key of ['W1_RESOLVER_NOT_BOUND','W3_MAIN_JS_TRUTH_BRIDGE_HOOK_NOT_BOUND','FULL_COMPONENT_SMOKE_MISSING','TEMPORARY_PROFILE_USED','SPLIT_INSTALLER_PAYLOAD_NOT_SINGLE_DOWNLOAD','BASELINE_TREE_READBACK_MISSING','ROLLBACK_PRESERVATION_READBACK_MISSING']) eq(neg.REJECTION_FLAGS[key],true);
eq(neg.REJECTION_REASONS.length,7); eq(neg.EVIDENCE.temporary_profile_used,true);

const positiveEvidence = {
  w1ResolverBound:true,w3MainJsTruthBridgeHookBound:true,fullComponentSmoke:true,
  temporaryProfileUsed:false,singleDownloadArtifact:true,baselineTreeReadback:true,
  rollbackPreservationReadback:true,
};
const pos = inspectActualPackage({reportedOutcome:'PASS',evidence:positiveEvidence,targetPcAccepted:false});
eq(pos.TECHNICALLY_ACCEPTED,true); eq(pos.INSTALLABLE_RUNTIME,true); eq(pos.TARGET_PC_PENDING,true);
eq(pos.TARGET_PC_ACCEPTED,false); eq(pos.EFFECTIVE_OUTCOME,'PASS'); eq(pos.REJECTION_REASONS.length,0);
const live = inspectActualPackage({reportedOutcome:'PASS',evidence:positiveEvidence,targetPcAccepted:true});
eq(live.TECHNICALLY_ACCEPTED,true); eq(live.TARGET_PC_PENDING,false); eq(live.TARGET_PC_ACCEPTED,true);
throws(()=>inspectActualPackage({reportedOutcome:'UNKNOWN'}),/INVALID_REPORTED_OUTCOME/);

const body='C_RESULT|RESULT_KEY=519827953700|ROLE=AUTOMATION-C-W2|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=0123456789abcdef0123456789abcdef01234567';
const parsed=parseResultComment({id:5199000000,pr:60,body});
eq(parsed.result_key,'519827953700'); eq(parsed.role,'AUTOMATION-C-W2'); eq(parsed.outcome,'PASS'); eq(parsed.pr,60);
eq(parseResultComment({id:1,pr:60,body:'bad'}),null);
const found=collectExactResult({comments:[{id:5199000000,pr:60,body}],resultKey:'519827953700',role:'AUTOMATION-C-W2',pr:60,directiveComment:5198279537});
eq(found.report_state,'REPORTED'); eq(found.result_comment,5199000000);
const missing=collectExactResult({comments:[],resultKey:'519827953700',role:'AUTOMATION-C-W2',pr:60,directiveComment:5198279537});
eq(missing.report_state,'MISSING'); eq(missing.result_comment,null);
throws(()=>collectExactResult({comments:[{id:5199000000,pr:60,body},{id:5199000001,pr:60,body}],resultKey:'519827953700',role:'AUTOMATION-C-W2',pr:60,directiveComment:5198279537}),/DUPLICATE_RESULT/);

const commander=buildCommanderResultComment({role:'AUTOMATION-C-W5',resultComment:5197743827,gate:neg});
ok(commander.includes('RESULT_COMMENT=5197743827')); ok(commander.includes('TECHNICALLY_ACCEPTED=false'));
ok(commander.includes('TARGET_PC_ACCEPTED=false')); ok(commander.includes('W1_RESOLVER_NOT_BOUND'));

(async()=>{
  let calls=0;
  const pages=await fetchAllPagesWithRestart(async(page,attempt)=>{
    calls++; if(page===1 && attempt<5) throw new Error('TEMP');
    if(page===1) return {items:[{id:1},{id:2}],has_next:true};
    return {items:[{id:2},{id:3}],has_next:false};
  },{maxRetries:5,restartState:{collected_comment_ids:[1]}});
  eq(calls,6); eq(pages.items.length,2); eq(pages.items[0].id,2); eq(pages.items[1].id,3);
  eq(pages.restart_state.last_page,2); eq(pages.restart_state.collected_comment_ids.length,3);
  eq(pages.restart_state.schema,'C_MODE_RC7_ACTUAL_PACKAGE_GATE_RESTART_V1');
  console.log(`PASS_${count}_OF_${count}`);
})().catch(e=>{console.error(e);process.exit(1)});
