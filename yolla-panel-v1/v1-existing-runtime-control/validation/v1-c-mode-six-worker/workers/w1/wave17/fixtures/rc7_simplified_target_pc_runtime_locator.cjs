'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function arg(name,required=true){const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1]){if(required)throw new Error(`MISSING_${name}`);return null;}return process.argv[i+1];}
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function exactOne(xs,code){if(xs.length!==1)throw new Error(`${code}:${xs.length}`);return xs[0];}
const releaseRoot=arg('--release-root');
const baselineVersion=arg('--baseline-version');
const targetVersion=arg('--target-version');
const candidateReleasePath=arg('--candidate-release-path');
const launcherPath=arg('--launcher-path');
const stateRoot=arg('--state-root');
const receiptPath=arg('--receipt-path');
const explicitBase=arg('--base-release-path',false);
if(!fs.existsSync(releaseRoot))throw new Error('RELEASE_ROOT_MISSING');
if(!fs.existsSync(launcherPath))throw new Error('LAUNCHER_MISSING');
if(!fs.existsSync(stateRoot))throw new Error('STATE_ROOT_MISSING');
let baseReleasePath=explicitBase;
if(baseReleasePath){if(!fs.existsSync(baseReleasePath))throw new Error('EXPLICIT_BASE_RELEASE_MISSING');}
else{
 const launcher=fs.readFileSync(launcherPath,'utf8');
 const escaped=baselineVersion.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const matches=[...launcher.matchAll(new RegExp(`[^"'\\r\\n]*${escaped}[^"'\\r\\n]*`,'g'))].map(m=>m[0].trim()).filter(Boolean).filter(p=>fs.existsSync(p));
 if(matches.length===1)baseReleasePath=matches[0];
 else{
  const candidates=fs.readdirSync(releaseRoot,{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name===baselineVersion).map(d=>path.join(releaseRoot,d.name));
  baseReleasePath=exactOne(candidates,'BASE_RELEASE_RESOLUTION_NOT_EXACTLY_ONE');
 }
}
if(path.resolve(baseReleasePath)===path.resolve(candidateReleasePath))throw new Error('BASE_AND_CANDIDATE_COLLISION');
if(fs.existsSync(candidateReleasePath))throw new Error('CANDIDATE_ALREADY_EXISTS');
fs.cpSync(baseReleasePath,candidateReleasePath,{recursive:true,errorOnExist:true});
const receipt={schema_version:'W1_TARGET_PC_RUNTIME_LOCATOR_RECEIPT_V1',baseline_version:baselineVersion,target_version:targetVersion,release_root:releaseRoot,base_release_path:baseReleasePath,candidate_release_path:candidateReleasePath,launcher_path:launcherPath,launcher_sha256:sha(launcherPath),state_root:stateRoot,baseline_cloned:true,resolution_mode:explicitBase?'EXPLICIT':'LAUNCHER_OR_EXACTLY_ONE',created_at:new Date().toISOString()};
fs.mkdirSync(path.dirname(receiptPath),{recursive:true});fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
