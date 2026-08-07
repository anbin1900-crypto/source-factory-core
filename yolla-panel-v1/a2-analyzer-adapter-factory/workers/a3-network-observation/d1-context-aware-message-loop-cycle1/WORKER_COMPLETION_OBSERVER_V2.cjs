'use strict';

const { EventEmitter } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');
const {
  DEFAULT_SELECTORS: V1_SELECTORS,
  validateRegistry,
  registryMaps,
  makeCdpRuntimeAdapter,
  redactText,
} = require('../ai001-prebuild-cycle3/WORKER_COMPLETION_OBSERVER_V1.cjs');

const STATE = Object.freeze({ WORKING: 'WORKING', COMPLETED: 'COMPLETED', ERROR: 'ERROR' });
const DEFAULT_SELECTORS = Object.freeze({
  assistant: V1_SELECTORS.assistant,
  generating: {
    primary: ['button[data-testid="stop-button"]','[data-testid="stop-button"]','[data-message-streaming="true"]','[data-is-streaming="true"]','[aria-busy="true"]'],
    fallback: ['button[aria-label*="Stop"]','button[title*="Stop"]','button[aria-label*="중지"]','.result-streaming'],
  },
  error: {
    primary: ['[data-testid="conversation-turn-error"]','[data-testid*="error"] [role="alert"]','[role="alert"][data-state="error"]'],
    fallback: ['main [role="alert"]'],
  },
});
function sha256(value){return createHash('sha256').update(String(value??''),'utf8').digest('hex');}
function normalizeText(value){return String(value??'').replace(/\r\n/g,'\n').trim();}
function messageIdentity(item,index){if(!item||typeof item!=='object')return `assistant-index:${index}`;return String(item.key||item.id||item.message_id||`assistant-index:${index}`);}
function normalizeAssistantItems(snapshot={}){
  if(Array.isArray(snapshot.assistant_items)) return snapshot.assistant_items.map((item,index)=>{const text=normalizeText(item&&typeof item==='object'?item.text:item);return{key:messageIdentity(item,index),text,digest:sha256(text)};}).filter(x=>x.text);
  const messages=Array.isArray(snapshot.assistant_messages)?snapshot.assistant_messages:[];
  return messages.map((text,index)=>{const n=normalizeText(text);return{key:`assistant-index:${index}`,text:n,digest:sha256(n)};}).filter(x=>x.text);
}
function explicitError(snapshot={}){return snapshot.explicit_error_visible===true||Boolean(normalizeText(snapshot.explicit_error_text));}
function buildInjectedObserverScript(selectors=DEFAULT_SELECTORS,stableMs=1800){
  const safeSelectors=JSON.stringify(selectors);const stable=Math.max(500,Math.floor(Number(stableMs)||1800));
  return `(() => {
    const KEY='__YOLLA_WORKER_COMPLETION_OBSERVER_V2__';
    if (window[KEY]?.version === 2) return {installed:true,reused:true};
    const selectors=${safeSelectors};
    const pickAll=(groups)=>{for(const strategy of ['primary','fallback'])for(const selector of(groups[strategy]||[])){try{const nodes=[...document.querySelectorAll(selector)].filter(n=>n&&n.isConnected);if(nodes.length)return{strategy,selector,nodes};}catch{}}return{strategy:'none',selector:null,nodes:[]};};
    const visible=(node)=>{try{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)!==0&&rect.width>=0&&rect.height>=0;}catch{return true;}};
    const itemKey=(node,index)=>{const own=node.getAttribute?.('data-message-id')||node.id;if(own)return String(own);const turn=node.closest?.('[data-testid^="conversation-turn-"]');const turnId=turn?.getAttribute?.('data-testid');return turnId?String(turnId):'assistant-index:'+index;};
    const state={version:2,mutation_count:0,last_mutation_ms:Date.now(),stable_ms:${stable}};
    const read=()=>{const assistants=pickAll(selectors.assistant),generating=pickAll(selectors.generating),errors=pickAll(selectors.error);const assistantItems=assistants.nodes.map((node,index)=>({key:itemKey(node,index),text:(node.innerText||node.textContent||'').trim()})).filter(x=>x.text);const visibleGenerating=generating.nodes.filter(visible);const errorText=(n)=>(n.innerText||n.textContent||'').trim();const fallbackErrorRe=/(something went wrong|there was an error|network error|failed to|오류|문제가 발생|다시 시도)/i;const visibleErrors=errors.nodes.filter(visible).map(errorText).filter(t=>t&&(errors.strategy==='primary'||fallbackErrorRe.test(t)));const now=Date.now();return{selector_found:assistants.nodes.length>0||visibleGenerating.length>0||visibleErrors.length>0,assistant_selector_strategy:assistants.strategy,assistant_selector:assistants.selector,assistant_items:assistantItems,assistant_message_count:assistantItems.length,generating_ui_active:visibleGenerating.length>0,generating_selector_strategy:generating.strategy,generating_selector:generating.selector,explicit_error_visible:visibleErrors.length>0,explicit_error_text:visibleErrors[0]||'',error_selector_strategy:errors.strategy,error_selector:errors.selector,mutation_count:state.mutation_count,last_mutation_ms:state.last_mutation_ms,now_ms:now,dom_stable_ms:Math.max(0,now-state.last_mutation_ms)};};
    const mo=new MutationObserver(()=>{state.mutation_count+=1;state.last_mutation_ms=Date.now();});mo.observe(document.documentElement||document,{subtree:true,childList:true,characterData:true,attributes:true});state.read=read;state.disconnect=()=>mo.disconnect();window[KEY]=state;return{installed:true,reused:false};
  })()`;
}
function buildInjectedReadScript(){return `(() => { const x=window.__YOLLA_WORKER_COMPLETION_OBSERVER_V2__; return x?.read ? x.read() : null; })()`;}
class WorkerCompletionObserverV2 extends EventEmitter{
  constructor({registry,stableMs=1800,minStableObservations=2,clock=Date.now,selectors=DEFAULT_SELECTORS}={}){super();validateRegistry(registry);this.registry=registry;this.maps=registryMaps(registry);this.stableMs=Math.max(500,Number(stableMs)||1800);this.minStableObservations=Math.max(2,Number(minStableObservations)||2);this.clock=clock;this.selectors=selectors;this.workerState=new Map();this.sequence=0;}
  pageIdFor(workerId){return this.maps.workerToPage.get(workerId)||null;}
  captureBaseline(workerId,snapshot={}){const pageId=this.pageIdFor(workerId);if(!pageId)throw new Error(`WORKER_NOT_REGISTERED:${workerId}`);const items=normalizeAssistantItems(snapshot),last=items.at(-1)||null,prev=this.workerState.get(workerId)||{};this.workerState.set(workerId,{...prev,state:STATE.WORKING,baseline_count:items.length,baseline_last_key:last?.key||null,baseline_last_digest:last?.digest||null,candidate_key:null,candidate_digest:null,stable_observations:0,stable_since_ms:null,baseline_captured:true});return this.#emit(workerId,pageId,STATE.WORKING,['BASELINE_CAPTURED'],snapshot,null);}
  noteDispatch(workerId,commandId=null,baselineSnapshot=null,atMs=this.clock()){const pageId=this.pageIdFor(workerId);if(!pageId)throw new Error(`WORKER_NOT_REGISTERED:${workerId}`);if(baselineSnapshot)this.captureBaseline(workerId,baselineSnapshot);const prev=this.workerState.get(workerId)||{};this.workerState.set(workerId,{...prev,state:STATE.WORKING,command_id:commandId||prev.command_id||null,dispatched:true,dispatched_at_ms:atMs,stable_observations:0,stable_since_ms:null});return this.#emit(workerId,pageId,STATE.WORKING,['MESSAGE_VISIBLE'],baselineSnapshot||{},null);}
  observeSnapshot(workerId,snapshot={}){const pageId=this.pageIdFor(workerId);if(!pageId)throw new Error(`WORKER_NOT_REGISTERED:${workerId}`);const prev=this.workerState.get(workerId)||{},nowMs=Number(snapshot.now_ms||this.clock()),items=normalizeAssistantItems(snapshot),last=items.at(-1)||null;if(explicitError(snapshot))return this.#emit(workerId,pageId,STATE.ERROR,['EXPLICIT_ERROR_VISIBLE'],snapshot,last);if(!prev.dispatched||!prev.baseline_captured)return this.#emit(workerId,pageId,STATE.WORKING,[prev.dispatched?'BASELINE_REQUIRED':'MESSAGE_VISIBLE'],snapshot,last);const newByCount=items.length>Number(prev.baseline_count||0),newByKey=Boolean(last&&prev.baseline_last_key&&last.key!==prev.baseline_last_key),newAssistantReply=Boolean(last&&(newByCount||newByKey));if(!newAssistantReply){this.#resetCandidate(workerId);return this.#emit(workerId,pageId,STATE.WORKING,['MESSAGE_VISIBLE','AWAITING_NEW_ASSISTANT_REPLY'],snapshot,last);}if(snapshot.generating_ui_active===true){this.#trackCandidate(workerId,last,nowMs,false);return this.#emit(workerId,pageId,STATE.WORKING,['MESSAGE_VISIBLE','ASSISTANT_REPLY_STREAMING'],snapshot,last);}const domStableMs=Number(snapshot.dom_stable_ms||0),tracked=this.#trackCandidate(workerId,last,nowMs,true),stateNow=this.workerState.get(workerId),stableDuration=stateNow.stable_since_ms==null?0:Math.max(0,nowMs-stateNow.stable_since_ms),finished=tracked.same_candidate&&stateNow.stable_observations>=this.minStableObservations&&domStableMs>=this.stableMs&&stableDuration>=this.stableMs;if(!finished)return this.#emit(workerId,pageId,STATE.WORKING,['MESSAGE_VISIBLE',tracked.same_candidate?'NEW_ASSISTANT_REPLY_STABILITY_PENDING':'NEW_ASSISTANT_REPLY_MUTATED'],snapshot,last);return this.#emit(workerId,pageId,STATE.COMPLETED,['NEW_ASSISTANT_REPLY_FINISHED'],snapshot,last);}
  #resetCandidate(workerId){const prev=this.workerState.get(workerId)||{};this.workerState.set(workerId,{...prev,candidate_key:null,candidate_digest:null,stable_observations:0,stable_since_ms:null});}
  #trackCandidate(workerId,item,nowMs,countStable){const prev=this.workerState.get(workerId)||{},same=Boolean(item&&prev.candidate_key===item.key&&prev.candidate_digest===item.digest);let stableObservations=0,stableSinceMs=null;if(countStable){if(same){stableObservations=Number(prev.stable_observations||0)+1;stableSinceMs=prev.stable_since_ms??nowMs;}else{stableObservations=1;stableSinceMs=nowMs;}}this.workerState.set(workerId,{...prev,candidate_key:item?.key||null,candidate_digest:item?.digest||null,stable_observations:stableObservations,stable_since_ms:stableSinceMs});return{same_candidate:same};}
  async install(adapter){return adapter.evaluate(buildInjectedObserverScript(this.selectors,this.stableMs));}
  async readSnapshot(adapter){return adapter.evaluate(buildInjectedReadScript());}
  async captureBaselineFromPage(workerId,adapter){const snapshot=await this.readSnapshot(adapter);if(!snapshot)throw new Error('OBSERVER_V2_NOT_INSTALLED');return this.captureBaseline(workerId,snapshot);}
  async readAndObserve(workerId,adapter){const snapshot=await this.readSnapshot(adapter);if(!snapshot)return this.observeSnapshot(workerId,{selector_found:false});return this.observeSnapshot(workerId,snapshot);}
  #emit(workerId,pageId,state,reasonCodes,snapshot={},last=null){if(!Object.values(STATE).includes(state))throw new Error(`INVALID_D4_STATE:${state}`);const prev=this.workerState.get(workerId)||{};const event=Object.freeze({schema_version:'D4_CHROME_WORKER_STATE_EVENT_V2',event_id:randomUUID(),sequence:++this.sequence,observed_at:new Date(this.clock()).toISOString(),worker_id:workerId,page_id:pageId,previous_state:prev.last_emitted_state||null,state,command_id:prev.command_id||null,assistant_message_count:Number(snapshot.assistant_message_count||snapshot.assistant_items?.length||0),assistant_message_key:last?.key||null,assistant_digest_sha256:last?.digest||null,generating_ui_active:Boolean(snapshot.generating_ui_active),explicit_error_visible:Boolean(snapshot.explicit_error_visible),error_digest_sha256:snapshot.explicit_error_text?sha256(redactText(snapshot.explicit_error_text)):null,dom_stable_ms:Number(snapshot.dom_stable_ms||0),stable_observations:Number(prev.stable_observations||0),reason_codes:reasonCodes,browser_agent_endpoint:'127.0.0.1:32100',cdp_endpoint:'127.0.0.1:9222',cdp_localhost_only:true,raw_message_persisted:false,live_pass_claimed:false});this.workerState.set(workerId,{...prev,last_emitted_state:state,last_event:event});this.emit('state',event);return event;}
}
module.exports={STATE,DEFAULT_SELECTORS,WorkerCompletionObserverV2,buildInjectedObserverScript,buildInjectedReadScript,normalizeAssistantItems,explicitError,makeCdpRuntimeAdapter,sha256};
