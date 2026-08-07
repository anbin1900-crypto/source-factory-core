import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv=process.argv.slice(2);
const args={};
for(let i=0;i<argv.length;i+=1){if(argv[i].startsWith('--')) args[argv[i].slice(2)]=argv[i+1];}
const readJson=p=>JSON.parse(fs.readFileSync(path.resolve(p),'utf8'));
const binding=readJson(args.binding);
const baseState=readJson(args.state);
const set=readJson(args.receipts);

function classify(receipt){
  if(!receipt) return 'UNBOUND';
  const s=String(receipt.status||'').toUpperCase();
  const t=String(receipt.terminal||'').toUpperCase();
  if(s.includes('ERROR')||s.includes('FAILED')) return 'ERROR';
  if(s.includes('BLOCK')||t.includes('WITH_PROVEN_')||(/PROVEN_.*BLOCKER$/.test(t)&&!t.includes('_OR_PROVEN_'))) return 'BLOCKED';
  if(s==='PASS'||s.includes('TERMINAL_PASS')||s.startsWith('PASS_')||(t.includes('PASS')&&!t.includes('WITH_PROVEN_')&&!t.includes('PROVEN_EXTERNAL_BLOCKER'))) return 'COMPLETE';
  if(['RUNNING','STARTED','ACTIVE'].some(x=>s.includes(x))) return 'RUNNING';
  return 'UNBOUND';
}

const state=structuredClone(baseState);
state.source_receipt_refs={};
for(const worker of Object.keys(binding.sources)){
  const receipt=set.receipts?.[worker]||null;
  state.source_states[worker]=classify(receipt);
  if(receipt){
    state.source_receipt_refs[worker]={receipt_id:receipt.receipt_id,source_ref:receipt.source_ref};
    state.viewmodels.trace_error_drawer.events.push({
      trace_event_id:`bind:${worker}`,
      category:state.source_states[worker]==='BLOCKED'?'ERROR':'RECIPE',
      producer:worker,
      state:state.source_states[worker],
      source_ref:receipt.source_ref,
      correlation:{session_id:receipt.session_id??null,page_id:receipt.page_id??null,action_id:receipt.action_id??null,command_id:receipt.command_id??null},
      terminal:receipt.terminal||null
    });
  }
}
const receipts=Object.values(set.receipts||{}).filter(Boolean);
state.viewmodels.live_session.session_id=receipts.find(r=>r.session_id)?.session_id??null;
state.viewmodels.live_session.selected_page_id=receipts.find(r=>r.page_id)?.page_id??null;
state.restore.last_rebuild_at='DETERMINISTIC_REBUILD';
const preDigest=JSON.stringify(state);
state.restore.view_state_digest=crypto.createHash('sha256').update(preDigest).digest('hex');
const rebuildReceipt={schema_version:'UI_STATE_REBUILD_RECEIPT_V1',source_states:state.source_states,chat_context_required:false,receipt_count:receipts.length,unbound_count:Object.values(state.source_states).filter(x=>x==='UNBOUND').length,digest:state.restore.view_state_digest};
if(args.out) fs.writeFileSync(path.resolve(args.out),JSON.stringify(state,null,2)+'\n');
if(args.receiptOut) fs.writeFileSync(path.resolve(args.receiptOut),JSON.stringify(rebuildReceipt,null,2)+'\n');
console.log(JSON.stringify({state,rebuildReceipt}));
