'use strict';
const crypto=require('crypto');
const STATES=new Set(['DISPATCHED','GENERATING','COMPLETE','BLOCKED','UNKNOWN']);
const TERMINAL=new Set(['COMPLETE','BLOCKED','UNKNOWN']);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
class Aggregator{
 constructor(state){this.state=state||{accepted_event_ids:[],event_log:[],latest_by_command:{},worker_latest:{},cycles:{},emitted_cycle_terminal:{}};this.seen=new Set(this.state.accepted_event_ids)}
 consume(e){
  for(const k of ['schema_version','event_id','cycle_id','command_id','worker_id','sequence_no','occurred_at','browser_state','task_status'])if(e[k]===undefined||e[k]===null||e[k]==='')throw Error('EVENT_REQUIRED_FIELD_MISSING:'+k);
  if(e.schema_version!=='WORKER_BROWSER_STATE_EVENT_V1'||!STATES.has(e.browser_state)||!Number.isInteger(e.sequence_no)||e.sequence_no<1)throw Error('EVENT_INVALID');
  const p=this.state.latest_by_command[e.command_id];
  if(this.seen.has(e.event_id))return{accepted:false,suppression:'SUPPRESS_DUPLICATE'};
  if(p&&e.sequence_no<p.sequence_no)return{accepted:false,suppression:'SUPPRESS_STALE'};
  if(p&&e.sequence_no===p.sequence_no)return{accepted:false,suppression:'SUPPRESS_DUPLICATE'};
  const a={...e,event_hash:hash(e)};this.seen.add(e.event_id);this.state.accepted_event_ids.push(e.event_id);this.state.event_log.push(a);this.state.latest_by_command[e.command_id]=a;this.state.worker_latest[e.worker_id]=a;
  const c=this.state.cycles[e.cycle_id]||{worker_ids:[]};if(!c.worker_ids.includes(e.worker_id))c.worker_ids.push(e.worker_id);this.state.cycles[e.cycle_id]=c;
  let response_state='RESPONSE_EVENT_ACCEPTED',result_binding=null;
  if(e.browser_state==='COMPLETE'){if(e.result_pointer||e.result_envelope_pointer){response_state='RESPONSE_COMPLETE_RESULT_BOUND';result_binding={command_id:e.command_id,result_pointer:e.result_pointer||null,result_envelope_pointer:e.result_envelope_pointer||null,result_contract:'SUCCESSOR_AI001_RESULT_V1'}}else response_state='RESPONSE_COMPLETE_RESULT_PENDING'}else if(e.browser_state==='BLOCKED')response_state='RESPONSE_BLOCKED';
  const view_model=this.view(e.cycle_id);let cycle_terminal_event=null;
  if(view_model.total&&c.worker_ids.every(id=>TERMINAL.has(this.state.worker_latest[id].browser_state))&&!this.state.emitted_cycle_terminal[e.cycle_id]){cycle_terminal_event={schema_version:'CYCLE_BROWSER_TERMINAL_EVENT_V1',event_type:'CYCLE_BROWSER_TERMINAL',cycle_id:e.cycle_id,total:view_model.total,complete:view_model.complete,blocked:view_model.blocked,unknown:view_model.unknown,source_command_id:e.command_id};this.state.emitted_cycle_terminal[e.cycle_id]=cycle_terminal_event}
  return{accepted:true,suppression:null,response_state,result_binding,view_model,cycle_terminal_event};
 }
 view(cycle_id){const ids=(this.state.cycles[cycle_id]||{worker_ids:[]}).worker_ids,x=ids.map(id=>this.state.worker_latest[id]).filter(Boolean);return{schema_version:'CYCLE_BROWSER_STATE_VIEW_MODEL_V1',cycle_id,total:x.length,complete:x.filter(v=>v.browser_state==='COMPLETE').length,generating:x.filter(v=>v.browser_state==='GENERATING').length,blocked:x.filter(v=>v.browser_state==='BLOCKED').length,unknown:x.filter(v=>v.browser_state==='UNKNOWN').length}}
 snapshot(cycle_id){return{schema_version:'A7_RECOVERY_DURABLE_EVENT_SNAPSHOT_V1',cycle_id,latest_by_command:this.state.latest_by_command,worker_latest:this.state.worker_latest,cycle_view_model:this.view(cycle_id),emitted_cycle_terminal:this.state.emitted_cycle_terminal[cycle_id]||null,accepted_event_count:this.state.event_log.length,recovery_rule:'reload snapshot; preserve last accepted sequence per command_id; suppress stale/duplicate before forwarding'}}
 export(){return JSON.parse(JSON.stringify(this.state))}
 static restore(s){return new Aggregator(JSON.parse(JSON.stringify(s)))}
}
module.exports={Aggregator};
