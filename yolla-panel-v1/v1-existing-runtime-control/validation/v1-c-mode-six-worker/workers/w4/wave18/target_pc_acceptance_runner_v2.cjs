'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function fail(code){const e=new Error(code);e.code=code;throw e;}
function run({evidenceDir,schemaPath,outputPath}){
  const required=['pre_evidence.json','post_evidence.json','runtime_receipts.json','rollback_receipt.json'];
  for(const f of required)if(!fs.existsSync(`${evidenceDir}/${f}`))fail(`MISSING_${f.toUpperCase()}`);
  const pre=read(`${evidenceDir}/pre_evidence.json`),post=read(`${evidenceDir}/post_evidence.json`),runtime=read(`${evidenceDir}/runtime_receipts.json`),rollback=read(`${evidenceDir}/rollback_receipt.json`),schema=read(schemaPath);
  for(const x of [pre,post,runtime,rollback])if(x.synthetic===true||x.shallow===true)fail('SYNTHETIC_OR_SHALLOW_RECEIPT_REJECTED');
  if(!Array.isArray(runtime.receipts)||runtime.receipts.length!==18)fail('REQUIRES_18_RECEIPTS');
  const ids=runtime.receipts.map(x=>x.receipt_id);if(new Set(ids).size!==18)fail('DUPLICATE_RECEIPT_ID');
  for(const r of runtime.receipts)if(!/^AUTOMATION-C-W[1-6]$/.test(r.role)||![1,2,3].includes(r.round)||r.status!=='PASS')fail('INVALID_WORKER_ROUND_RECEIPT');
  const counters=runtime.counters||{};for(const k of ['DUPLICATE','C_REPEAT_CROSS_CANCEL','END_REDISPATCH','RECEIPT_LOSS','QUEUE_GROWTH'])if(counters[k]!==0)fail(`NONZERO_${k}`);
  for(const key of ['launcher_sha256','state_sha256','log_sha256','profile_sha256'])if(!pre[key]||!post[key])fail(`MISSING_${key.toUpperCase()}`);
  if(pre.state_sha256!==post.state_sha256||pre.log_sha256!==post.log_sha256||pre.profile_sha256!==post.profile_sha256)fail('PRESERVATION_READBACK_MISMATCH');
  if(rollback.status!=='PASS'||rollback.launcher_sha256!==pre.launcher_sha256)fail('ROLLBACK_READBACK_MISMATCH');
  const result={schema_version:schema.$id,status:'PASS',target_pc_evidence:true,receipts:18,counters,evidence_sha256:Object.fromEntries(required.map(f=>[f,sha(`${evidenceDir}/${f}`)]))};
  fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module){try{console.log(JSON.stringify(run({evidenceDir:process.argv[2],schemaPath:process.argv[3],outputPath:process.argv[4]})));}catch(e){console.error(e.code||e.message);process.exit(2);}}
module.exports={run};
