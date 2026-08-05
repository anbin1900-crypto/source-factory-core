'use strict';
const fs=require('node:fs');
const path=require('node:path');
function clone(v){return JSON.parse(JSON.stringify(v));}
function req(v,n){if(typeof v!=='string'||!v.length)throw new Error(`INVALID_${n}`);return v;}
class ActualRepeatReleaseAdapter {
  constructor({runtime,popupBridge,stateStorePath,now=()=>Date.now()}={}) {
    if(!runtime||typeof runtime.tick!=='function'||typeof runtime.complete!=='function') throw new Error('INVALID_RUNTIME');
    if(!popupBridge||typeof popupBridge.send!=='function') throw new Error('INVALID_POPUP_BRIDGE');
    this.runtime=runtime; this.popupBridge=popupBridge; this.stateStorePath=stateStorePath||null; this.now=now;
    this.state={schema_version:'ACTUAL_REPEAT_RELEASE_ADAPTER_STATE_V1',active:{},receipts:[],events:[],c_mode_queue:[]};
    this._load(); this._rehydrate();
  }
  _key(r){return `${r.role}\u0000${r.group_id}\u0000${r.slot_id}`;}
  _load(){if(!this.stateStorePath||!fs.existsSync(this.stateStorePath))return;const p=JSON.parse(fs.readFileSync(this.stateStorePath,'utf8'));if(p.schema_version!==this.state.schema_version)throw new Error('STATE_SCHEMA_MISMATCH');this.state=p;}
  _persist(){if(!this.stateStorePath)return;fs.mkdirSync(path.dirname(this.stateStorePath),{recursive:true});const t=`${this.stateStorePath}.tmp-${process.pid}`;fs.writeFileSync(t,JSON.stringify(this.state,null,2)+'\n');fs.renameSync(t,this.stateStorePath);}
  _event(type,extra={}){this.state.events.push({at_ms:this.now(),type,...extra});}
  _rehydrate(){for(const c of this.runtime.list?.()||[]){for(const t of c.targets||[]){if(t.awaiting_completion&&t.last_dispatch_id){const r={dispatch_id:t.last_dispatch_id,command_id:c.command_id,role:c.role,group_id:t.group_id,slot_id:t.slot_id,state:'ACTIVE',rehydrated:true};this.state.active[this._key(r)]=r;}}}this._persist();}
  dispatchDue(at=this.now()){const rs=this.runtime.tick(at);const out=[];for(const r of rs){const k=this._key(r);if(this.state.active[k])throw new Error('ACTIVE_REPEAT_SLOT_DUPLICATE');if(this.state.receipts.some(x=>x.dispatch_id===r.dispatch_id))throw new Error('DUPLICATE_DISPATCH_ID');const rec={...clone(r),state:'ACTIVE',released_at_ms:this.now()};this.state.active[k]=rec;this.state.receipts.push(rec);this.popupBridge.send({...clone(r),channel:'ACTUAL_REPEAT_COMMAND'});this._event('RELEASED',{dispatch_id:r.dispatch_id,slot_id:r.slot_id});out.push(clone(rec));}this._persist();return out;}
  acceptResult(payload){if(!payload||payload.schema_version!=='W2_REPEAT_RESULT_V1')return{accepted:false,reason:'INVALID_REPEAT_RESULT_SCHEMA'};const k=Object.keys(this.state.active).find(x=>this.state.active[x].dispatch_id===payload.dispatch_id);if(!k)return{accepted:false,reason:'UNKNOWN_DISPATCH'};const a=this.state.active[k];if(a.role!==payload.role||a.command_id!==payload.command_id)return{accepted:false,reason:'CORRELATION_MISMATCH'};const result=this.runtime.complete({role:payload.role,command_id:payload.command_id,dispatch_id:payload.dispatch_id,status:payload.status});if(!result.accepted)return result;delete this.state.active[k];this._event(payload.status==='END'?'TARGET_END':'COMPLETED',{dispatch_id:payload.dispatch_id,slot_id:a.slot_id});this._persist();return{accepted:true,...result};}
  enqueueCMode(item){const id=req(item.dispatch_id,'C_MODE_DISPATCH_ID');if(this.state.c_mode_queue.some(x=>x.dispatch_id===id))return{accepted:false,reason:'C_MODE_DUPLICATE'};this.state.c_mode_queue.push({...clone(item),mode:'C_MODE'});this._persist();return{accepted:true};}
  snapshot(){return clone(this.state);}
}
module.exports={ActualRepeatReleaseAdapter};
