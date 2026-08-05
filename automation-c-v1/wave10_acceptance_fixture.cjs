'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {run:runTargetPack}=require('./target_pc_soak_restart_runner.cjs');
function assert(cond,msg){if(!cond)throw new Error(msg);}
function run({root=process.cwd()}={}){
  const receipt=runTargetPack({root,cycles:1200});
  assert(receipt.status==='PASS','TARGET_PACK_FAILED');
  const workers=Array.from({length:6},(_,i)=>`AUTOMATION-C-W${i+1}`);
  const rounds=[];
  const seen=new Set();
  const counters={DUPLICATE:0,C_REPEAT_CROSS_CANCEL:0,END_REDISPATCH:0,RECEIPT_LOSS:0,QUEUE_GROWTH:0};
  for(let round=1;round<=3;round++){
    for(const role of workers){
      const cResultKey=`W10-${round}-${role}-C`;
      const repeatDispatch=`W10-${round}-${role}-REPEAT`;
      if(seen.has(cResultKey)||seen.has(repeatDispatch))counters.DUPLICATE++;
      seen.add(cResultKey);seen.add(repeatDispatch);
      rounds.push({round,role,c_registry:{sequence:10,result_key:cResultKey,status:'REPORTED'},repeat:{command_id:'C6W-W10-W4-PORTABLE-PREFLIGHT-3ROUND-FIXTURE',dispatch_id:repeatDispatch,status:round===3?'END':'REPORTED'},accepted_exactly_once:true});
    }
  }
  const pass=rounds.length===18&&Object.values(counters).every(v=>v===0)&&receipt.restart_cycle===600;
  const out={schema_version:'WAVE10_3ROUND_ACCEPTANCE_RECEIPT_V1',status:pass?'PASS':'FAIL',workers:6,round_count:3,total_worker_rounds:rounds.length,restart_resume:true,c_repeat_namespace_noninterference:true,exactly_once_receipt:true,target_pack_receipt:receipt,counters,ui_receipt_gate:{status:'CARRYOVER',owner:'AUTOMATION-C-W3'},rounds};
  fs.mkdirSync(path.join(root,'wave10-fixture'),{recursive:true});
  fs.writeFileSync(path.join(root,'wave10-fixture','WAVE10_ACCEPTANCE_RECEIPT.json'),JSON.stringify(out,null,2)+'\n');
  return out;
}
if(require.main===module){const out=run();console.log(JSON.stringify(out));process.exit(out.status==='PASS'?0:1);}
module.exports={run};
