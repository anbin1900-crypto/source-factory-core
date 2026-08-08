'use strict';
const { normalizeObservation, buildCausalGraph, sha256 } = require('./A3_ALIAS_SAFE_NORMALIZER_V1.cjs');
function consumeDelta(ledger, delta, options={}){
  const current=ledger&&ledger.schema_version==='A3_V2_LATE_BIND_LEDGER_V1'?JSON.parse(JSON.stringify(ledger)):{schema_version:'A3_V2_LATE_BIND_LEDGER_V1',revision:0,entries:[],conflicts:[],last_graph:null};
  const rows=Array.isArray(delta)?delta:[delta];
  const byId=new Map(current.entries.map(e=>[e.observation_id,e]));
  let appended=0,idempotent=0;
  for(const row of rows){
    const obs=normalizeObservation(row,options);
    const existing=byId.get(obs.observation_id);
    if(existing){
      if(existing.integrity_sha256===obs.integrity_sha256){idempotent++;continue;}
      current.conflicts.push({observation_id:obs.observation_id,existing_sha256:existing.integrity_sha256,incoming_sha256:obs.integrity_sha256,policy:'APPEND_CONFLICT_RECORD_DO_NOT_MUTATE_EXISTING'});continue;
    }
    current.entries.push(obs);byId.set(obs.observation_id,obs);appended++;
  }
  current.revision+=appended>0?1:0;
  current.last_graph=buildCausalGraph(current.entries);
  current.last_delta_receipt={schema_version:'A3_V2_LATE_BIND_DELTA_RECEIPT_V1',appended_count:appended,idempotent_count:idempotent,conflict_count:current.conflicts.length,entry_count:current.entries.length,ledger_sha256:'sha256:'+sha256(current.entries.map(e=>e.integrity_sha256)),append_only:true,target_value_guessing:false};
  return current;
}
module.exports={consumeDelta};
