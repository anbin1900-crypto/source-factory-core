'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {RepeatCommandRuntime}=require('./repeat_command_runtime.cjs');
const {ActualCandidateBridgeBinding}=require('./actual_candidate_bridge_binding.cjs');
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
function run({root=process.cwd(),cycles=1200}={}){
  const stateDir=path.join(root,'target-pc-state');
  fs.rmSync(stateDir,{recursive:true,force:true});
  let now=1700000000000;
  const runtime=new RepeatCommandRuntime({statePath:path.join(stateDir,'repeat-runtime.json'),now:()=>now});
  const popup={items:[],send(item){this.items.push(item);}};
  let binding=new ActualCandidateBridgeBinding({repeatRuntime:runtime,popupBridge:popup,releaseStatePath:path.join(stateDir,'release.json'),namespaceStatePath:path.join(stateDir,'namespace.json'),now:()=>now});
  const role='AUTOMATION-C-W4', commandId='C6W-W9-W4-TARGET-PC-SOAK-RESTART-PACK';
  runtime.create({command_id:commandId,role,prompt:'target pc soak restart',targets:[1,2,3,4,5,6].map(n=>({group_id:'C',slot_id:String(n)})),trigger_mode:'EVERY_X_MINUTES',interval_minutes:1});
  binding.registerRegistry({registry_id:'wave9-registry',result_key:'519441390400'});
  const counters={DUPLICATE:0,C_REPEAT_CROSS_CANCEL:0,END_REDISPATCH:0,RECEIPT_LOSS:0,QUEUE_GROWTH:0};
  let expectedReceipts=0;
  for(let i=1;i<=cycles;i++){
    const before=binding.snapshot();
    const released=binding.dispatchDue(now); expectedReceipts+=released.length;
    if(released.length!==new Set(released.map(x=>x.dispatch_id)).size)counters.DUPLICATE++;
    for(const rec of [...released].reverse()){
      const end=(i>cycles-2)&&['2','4','6'].includes(String(rec.slot_id));
      const r=binding.acceptRepeatResult({schema_version:'W2_REPEAT_RESULT_V1',role,command_id:commandId,dispatch_id:rec.dispatch_id,status:end?'END':'REPORTED'});
      if(!r.accepted)counters.C_REPEAT_CROSS_CANCEL++;
    }
    if(i%100===0)binding.acceptCResult({registry_id:'wave9-registry',result_key:'519441390400',status:'REPORTED',sequence:9});
    now+=60000;
    if(i===Math.floor(cycles/2)){
      binding=new ActualCandidateBridgeBinding({repeatRuntime:new RepeatCommandRuntime({statePath:path.join(stateDir,'repeat-runtime.json'),now:()=>now}),popupBridge:popup,releaseStatePath:path.join(stateDir,'release.json'),namespaceStatePath:path.join(stateDir,'namespace.json'),now:()=>now});
    }
    const after=binding.snapshot();
    if(after.repeat_receipts.length<before.repeat_receipts.length)counters.RECEIPT_LOSS++;
    if(after.repeat_active.length>6)counters.QUEUE_GROWTH++;
  }
  const final=binding.snapshot();
  if(final.repeat_receipts.length!==expectedReceipts)counters.RECEIPT_LOSS++;
  for(const x of final.repeat_active){if(['2','4','6'].includes(String(x.slot_id)))counters.END_REDISPATCH++;}
  const receipt={schema_version:'TARGET_PC_SOAK_RESTART_RECEIPT_V1',status:Object.values(counters).every(v=>v===0)?'PASS':'FAIL',cycles,slots:6,restart_cycle:Math.floor(cycles/2),repeat_receipts:final.repeat_receipts.length,popup_messages:popup.items.length,counters,state_files:['repeat-runtime.json','release.json','namespace.json']};
  writeJson(path.join(stateDir,'TARGET_PC_RECEIPT.json'),receipt);
  return receipt;
}
if(require.main===module){const out=run({cycles:Number(process.env.CYCLES||1200)});console.log(JSON.stringify(out));process.exit(out.status==='PASS'?0:1);}
module.exports={run};
