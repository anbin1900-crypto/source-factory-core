'use strict';
const fs=require('node:fs');
const path=require('node:path');
function clone(v){return JSON.parse(JSON.stringify(v));}
class CRepeatNamespaceAdapter{
  constructor({repeatRuntime,statePath,now=()=>Date.now()}={}){
    if(!repeatRuntime||typeof repeatRuntime.complete!=='function')throw new Error('INVALID_REPEAT_RUNTIME');
    this.repeatRuntime=repeatRuntime;this.statePath=statePath||null;this.now=now;
    this.state={schema_version:'C_REPEAT_NAMESPACE_ADAPTER_V1',registry_sequence:0,current_registry:null,c_results:{},repeat_results:{},repeat_active:{},c_queue:[],repeat_receipts:[],events:[]};
    this._load();
  }
  _load(){if(!this.statePath||!fs.existsSync(this.statePath))return;const s=JSON.parse(fs.readFileSync(this.statePath,'utf8'));if(s.schema_version!==this.state.schema_version)throw new Error('STATE_SCHEMA_MISMATCH');this.state=s;}
  _persist(){if(!this.statePath)return;fs.mkdirSync(path.dirname(this.statePath),{recursive:true});const t=this.statePath+'.tmp-'+process.pid;fs.writeFileSync(t,JSON.stringify(this.state,null,2)+'\n');fs.renameSync(t,this.statePath);}
  registerRegistry({registry_id,result_key}){this.state.registry_sequence++;if(this.state.current_registry)this.state.current_registry.status='SUPERSEDED';this.state.current_registry={registry_id,result_key,sequence:this.state.registry_sequence,status:'CURRENT'};this.state.events.push({at_ms:this.now(),type:'REGISTRY_CURRENT',registry_id,result_key,sequence:this.state.registry_sequence});this._persist();return clone(this.state.current_registry);}
  acceptCResult(p){if(!p||!p.result_key||!p.registry_id)return{accepted:false,reason:'INVALID_C_RESULT'};const cur=this.state.current_registry;if(!cur||cur.registry_id!==p.registry_id||cur.result_key!==p.result_key)return{accepted:false,reason:'SUPERSEDED_OR_UNKNOWN_REGISTRY'};if(this.state.c_results[p.result_key])return{accepted:false,reason:'DUPLICATE_C_RESULT'};this.state.c_results[p.result_key]=clone(p);this.state.events.push({at_ms:this.now(),type:'C_RESULT_ACCEPTED',result_key:p.result_key});this._persist();return{accepted:true};}
  trackRepeatReceipt(r){if(!r||!r.dispatch_id||!r.role||!r.command_id)return{accepted:false,reason:'INVALID_REPEAT_RECEIPT'};if(this.state.repeat_active[r.dispatch_id]||this.state.repeat_receipts.some(x=>x.dispatch_id===r.dispatch_id))return{accepted:false,reason:'DUPLICATE_REPEAT_DISPATCH'};this.state.repeat_active[r.dispatch_id]=clone(r);this.state.repeat_receipts.push(clone(r));this._persist();return{accepted:true};}
  acceptRepeatResult(p){if(!p||p.schema_version!=='W2_REPEAT_RESULT_V1')return{accepted:false,reason:'INVALID_REPEAT_RESULT_SCHEMA'};const a=this.state.repeat_active[p.dispatch_id];if(!a)return{accepted:false,reason:'UNKNOWN_REPEAT_DISPATCH'};if(a.role!==p.role||a.command_id!==p.command_id)return{accepted:false,reason:'REPEAT_CORRELATION_MISMATCH'};const rr=this.repeatRuntime.complete(p);if(!rr.accepted)return rr;return this.acceptCompletedRepeatResult(p);}
  acceptCompletedRepeatResult(p){if(!p||p.schema_version!=='W2_REPEAT_RESULT_V1')return{accepted:false,reason:'INVALID_REPEAT_RESULT_SCHEMA'};const a=this.state.repeat_active[p.dispatch_id];if(!a)return{accepted:false,reason:'UNKNOWN_REPEAT_DISPATCH'};if(a.role!==p.role||a.command_id!==p.command_id)return{accepted:false,reason:'REPEAT_CORRELATION_MISMATCH'};delete this.state.repeat_active[p.dispatch_id];this.state.repeat_results[p.dispatch_id]=clone(p);this.state.events.push({at_ms:this.now(),type:'REPEAT_RESULT_ACCEPTED',dispatch_id:p.dispatch_id});this._persist();return{accepted:true};}
  enqueueC(item){if(this.state.c_queue.some(x=>x.dispatch_id===item.dispatch_id))return{accepted:false,reason:'C_QUEUE_DUPLICATE'};this.state.c_queue.push(clone(item));this._persist();return{accepted:true};}
  snapshot(){return clone(this.state);}
}
module.exports={CRepeatNamespaceAdapter};
