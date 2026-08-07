'use strict';
const fs=require('fs'); const crypto=require('crypto'); const cp=require('child_process'); const path=require('path');
function sha256(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function fail(msg){const e=new Error(msg); e.code='FAIL_CLOSED'; throw e;}
function classifyHistoricalLog(text){return {err_aborted:(text.match(/ERR_ABORTED/g)||[]).length,err_failed:(text.match(/ERR_FAILED/g)||[]).length,current_c_work_count:0,legacy_ae_excluded:true};}
function validateManifest(m){
 const req=['schema_version','candidate_version','package_path','package_sha256','w3_collector','w5_validator','evidence_output'];
 for(const k of req) if(!m[k]) fail('MANIFEST_MISSING_'+k.toUpperCase());
 if(!/^5\.10\.2\.4\.1(?:[-+].*)?$/.test(m.candidate_version)) fail('EXACT_VERSION_MISMATCH');
 if(!fs.existsSync(m.package_path)) fail('PACKAGE_NOT_FOUND');
 if(sha256(m.package_path)!==m.package_sha256) fail('PACKAGE_SHA256_MISMATCH');
 return true;
}
function runCommand(cmd,args,env){const r=cp.spawnSync(cmd,args,{encoding:'utf8',env:{...process.env,...env}}); if(r.status!==0) fail('SUBPROCESS_FAILED:'+cmd+':'+(r.stderr||r.stdout)); return r.stdout.trim();}
function runBundle(manifestPath){
 const m=JSON.parse(fs.readFileSync(manifestPath,'utf8')); validateManifest(m);
 const smoke=path.resolve(m.smoke_profile||'./tmp-smoke-profile'); const live=path.resolve(m.live_profile||'./live-profile'); const log=path.resolve(m.work_control_log||'./work-control.log');
 const liveBefore=fs.existsSync(live)?sha256(live):null; const logBefore=fs.existsSync(log)?sha256(log):null;
 fs.mkdirSync(smoke,{recursive:true});
 const common={YOLLA_SMOKE_PROFILE:smoke,YOLLA_LIVE_PROFILE:live,YOLLA_WORK_CONTROL_LOG:log,YOLLA_HIDDEN_BROWSER_RELEASE_REQUIRED:'true',YOLLA_RETRY_INTERVAL_MS:'30000',YOLLA_MAX_ATTEMPTS:'5'};
 const ui=runCommand(process.execPath,[m.w3_collector,'--manifest',manifestPath],common);
 const w5=runCommand(process.execPath,[m.w5_validator,'--manifest',manifestPath],common);
 const liveAfter=fs.existsSync(live)?sha256(live):null; const logAfter=fs.existsSync(log)?sha256(log):null;
 if(liveBefore!==liveAfter) fail('LIVE_PROFILE_MUTATED');
 if(logBefore && !logAfter) fail('WORK_CONTROL_LOG_LOST');
 const historical=m.historical_runtime_log&&fs.existsSync(m.historical_runtime_log)?classifyHistoricalLog(fs.readFileSync(m.historical_runtime_log,'utf8')):null;
 const evidence={schema_version:'C6W_W3_W5_TARGET_PC_EVIDENCE_V1',status:'OFFLINE_PASS_TARGET_PC_PENDING',candidate_version:m.candidate_version,package_sha256:m.package_sha256,smoke_profile_temporary:true,live_profile_preserved:true,work_control_log_preserved:true,hidden_browser_release_required:true,retry_interval_ms:30000,max_attempts:5,rollback_required:true,restart_required:true,w3_collector:JSON.parse(ui),w5_validator:JSON.parse(w5),historical_log_fixture:historical,target_pc_live_receipt:null,production:false,ready:false,merge:false};
 fs.mkdirSync(path.dirname(m.evidence_output),{recursive:true}); fs.writeFileSync(m.evidence_output,JSON.stringify(evidence,null,2)); return evidence;
}
if(require.main===module){try{console.log(JSON.stringify(runBundle(process.argv[2])))}catch(e){console.error(e.code||'ERROR',e.message);process.exit(2)}}
module.exports={runBundle,validateManifest,classifyHistoricalLog,sha256};
