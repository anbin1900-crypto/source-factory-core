export const PASS_KEYS = Object.freeze([
  'DOM_NETWORK_SYNC','ELEMENT_TO_FIELD_POINTER','LIVE_PREVIEW','DYNAMIC_DOM','POPUP_IFRAME','EMBEDDED_STANDALONE_PARITY'
]);
const clone = (v) => v === undefined ? undefined : structuredClone(v);
const arr = (v) => Array.isArray(v) ? v : [];
const normSel = (s) => String(s || '').trim();

export class VisualInspectorSyncModel {
  constructor({mode='embedded', sessionId='B2-WAVE3'}={}) {
    this.state = {
      mode, sessionId,
      runtime:{connected:false,inbound:0,lastTopic:null},
      browser:{url:'about:blank',title:'',scrollY:0,popupCount:0,iframeCount:0,dynamicMutationCount:0},
      network:[], responses:[], responseBodies:[], domSnapshots:[],
      structure:{repeatedRegions:[],fields:[],locators:[],pagination:null,highlights:[]},
      schema:{status:'UNBOUND',mode:'UNKNOWN',endpointGroups:[],responseSchemas:[],identifierRelations:[],sourceAuthority:null},
      selection:null, selectedNetworkId:null, selectedFieldId:null,
      workflow:[], preview:{columns:[],rows:[],selectedRow:null,revision:0},
      sourcePointerIndex:{}, pass:Object.fromEntries(PASS_KEYS.map(k=>[k,false]))
    };
  }
  touch(topic){ this.state.runtime.connected=true; this.state.runtime.inbound++; this.state.runtime.lastTopic=topic; }
  ingestBrowserState(p={}){ this.touch('analyzer:browser-state'); Object.assign(this.state.browser, clone(p)); return this.snapshot(); }
  ingestA3(event={}){
    this.touch('analyzer:a3-event');
    const type=event.type||event.event_type||event.classification?.type||event.topic||'UNKNOWN';
    const requestId=String(event.request_id||event.requestId||event.request?.request_id||event.request?.requestId||event.event_id||`net-${this.state.network.length+1}`);
    if (/network\.request|requestWillBeSent|NETWORK_REQUEST/i.test(type)) {
      const row={requestId,url:event.url||event.request?.url||event.request?.url_pattern||'',method:event.method||event.request?.method||'GET',resourceType:event.resource_type||event.request?.resource_type||'',sequence:Number(event.sequence||0)};
      const i=this.state.network.findIndex(x=>x.requestId===requestId); if(i>=0)this.state.network[i]=row; else this.state.network.push(row);
    } else if (/response_body|responseBody/i.test(type)) {
      this.state.responseBodies.push({requestId,url:event.url||'',sha256:event.sha256||event.body_sha256||'',sizeBytes:Number(event.size_bytes||event.response_size_bytes||0)});
    } else if (/network\.response|responseReceived|NETWORK_RESPONSE/i.test(type)) {
      const row={requestId,url:event.url||event.response?.url||event.request?.url||'',status:event.status??event.response?.status??null,mimeType:event.mime_type||event.response?.mime_type||event.response?.content_type||''};
      const i=this.state.responses.findIndex(x=>x.requestId===requestId); if(i>=0)this.state.responses[i]=row; else this.state.responses.push(row);
    } else if (/dom\.snapshot|DOM_SNAPSHOT/i.test(type)) {
      this.state.domSnapshots.push({url:event.url||'',sha256:event.sha256||'',nodeCount:Number(event.node_count||event.nodeCount||0)});
    } else if (/popup|target.*created/i.test(type)) {
      this.state.browser.popupCount += 1;
      this.state.browser.lastPopupUrl = String(event.url||event.target_url||event.target?.url||'');
      this.state.pass.POPUP_IFRAME=this.state.browser.popupCount>0&&this.state.browser.iframeCount>0;
    } else if (/frame/i.test(type)) {
      this.state.browser.iframeCount=Math.max(this.state.browser.iframeCount, Number(event.child_frame_count||1));
      this.state.pass.POPUP_IFRAME=this.state.browser.popupCount>0&&this.state.browser.iframeCount>0;
    }
    this._recomputeSelectionBindings(); return this.snapshot();
  }
  ingestA4(p={}){
    this.touch('analyzer:a4-candidates');
    const repeated=arr(p.repeatedRegions||p.repeated_regions).map((x,i)=>({id:String(x.id||`repeat-${i+1}`),selector:normSel(x.selector||x.semanticLocator||x.locator),count:Number(x.count||x.itemCount||0),confidence:Number(x.confidence||0)}));
    const rawFields=arr(p.fieldCandidates||p.field_candidates);
    const fields=rawFields.map((x,i)=>({id:String(x.id||x.field_id||`field-${i+1}`),name:String(x.name||x.field||`field_${i+1}`),selector:normSel(x.selector||x.css||x.locator),sourceKey:String(x.source_key||x.name||x.field||`field_${i+1}`),networkRequestId:x.networkRequestId||x.request_id||null,sourcePointer:x.sourcePointer||null}));
    const rawLoc=arr(p.locatorCandidates||p.locator_candidates);
    const locators=rawLoc.map((x,i)=>({id:String(x.id||`loc-${i+1}`),fieldId:String(x.fieldId||x.field_id||x.field||''),selector:normSel(x.selector||x.css||x.locator),strategy:String(x.strategy||'css')}));
    const highlights=arr(p.highlightPayload?.highlights||p.highlight_payload?.highlights||p.highlights).map((x,i)=>({id:String(x.id||`hl-${i+1}`),kind:String(x.kind||'field'),selector:normSel(x.selector||x.locator),label:String(x.label||'')}));
    this.state.structure={repeatedRegions:repeated,fields,locators,pagination:clone(p.pagination||null),highlights};
    this._recomputeSelectionBindings(); return this.snapshot();
  }
  ingestA5(p={}){
    this.touch('analyzer:a5-inference');
    this.state.schema={
      status:String(p.status||'BOUND'),
      mode:String(p.mode_decision||p.extraction_mode||p.mode||p.generator_input?.extraction_mode||'UNKNOWN').toUpperCase(),
      endpointGroups:clone(p.endpoint_groups||p.endpointGroups||p.generator_input?.endpoint_groups||[]),
      responseSchemas:clone(p.response_schemas||p.schema_candidates||p.responseSchemas||p.generator_input?.response_schemas||[]),
      identifierRelations:clone(p.identifier_relations||p.identifierRelations||p.generator_input?.identifier_relations||[]),
      sourceAuthority:clone(p.sourceAuthority||p.authority||null)
    };
    this._recomputeSelectionBindings(); return this.snapshot();
  }
  ingestB3(p={}){ this.touch('analyzer:b3-workflow'); this.state.workflow=clone(p.steps||p.workflow||p.recipe?.steps||p.actions||[]); return this.snapshot(); }
  ingestB5(p={}){
    this.touch('analyzer:b5-preview');
    const rows=clone(p.records||p.rows||p.preview_rows||[]); const cols=clone(p.columns||p.fields||p.preview_columns||[]);
    this.state.preview={columns:cols,rows,selectedRow:null,revision:this.state.preview.revision+1}; this.state.sourcePointerIndex={};
    rows.forEach((row,index)=>{
      const source=row.source||row.__source||row._source||{};
      const rowPointer=source.rowPointer||source.row_pointer||row.__source_pointer||null;
      const recordId=row.data?.id??row.id??source.recordId??source.record_id??null;
      if(recordId!==null) this.state.sourcePointerIndex[`record:${recordId}`]=index;
      if(rowPointer?.jsonPointer) this.state.sourcePointerIndex[`json:${rowPointer.jsonPointer}`]=index;
    });
    this._syncPreviewToSelection(); this.state.pass.LIVE_PREVIEW=rows.length>0; return this.snapshot();
  }
  selectElement(p={}){
    const selector=normSel(p.selector); if(!selector) throw new Error('ELEMENT_SELECTOR_REQUIRED');
    this.state.selection={selector,framePath:p.framePath||'main',recordId:p.recordId??p.attributes?.['data-record-id']??null,networkRequestId:p.networkRequestId??p.attributes?.['data-source-request-id']??null,text:String(p.text||'').slice(0,300),attributes:clone(p.attributes||{}),sourcePointer:clone(p.sourcePointer||null),fieldIds:[],locatorIds:[],networkIds:[]};
    this._recomputeSelectionBindings(); this._syncPreviewToSelection(); return this.snapshot();
  }
  selectNetwork(requestId){ this.state.selectedNetworkId=String(requestId); const n=this.state.network.find(x=>x.requestId===String(requestId)); if(n){
    const field=this.state.structure.fields.find(f=>f.networkRequestId===n.requestId)||this._fieldForUrl(n.url); if(field){this.state.selectedFieldId=field.id; this.state.selection={...(this.state.selection||{}),selector:field.selector,fieldIds:[field.id],locatorIds:this.state.structure.locators.filter(l=>l.fieldId===field.id||l.fieldId===field.name).map(l=>l.id),networkIds:[n.requestId],networkRequestId:n.requestId};}
  } this._syncPreviewToSelection(); return this.snapshot(); }
  recordDynamicMutation(count=1){ this.state.browser.dynamicMutationCount+=Number(count||1); this.state.pass.DYNAMIC_DOM=this.state.browser.dynamicMutationCount>0 && !!this.state.selection; return this.snapshot(); }
  recordScroll(y){ this.state.browser.scrollY=Number(y||0); return this.snapshot(); }
  recordPopup(url){ this.state.browser.popupCount++; this.state.browser.lastPopupUrl=String(url||''); this.state.pass.POPUP_IFRAME=this.state.browser.popupCount>0&&this.state.browser.iframeCount>0; return this.snapshot(); }
  recordIframe(path){ this.state.browser.iframeCount=Math.max(this.state.browser.iframeCount,1); this.state.browser.lastIframePath=String(path||''); this.state.pass.POPUP_IFRAME=this.state.browser.popupCount>0&&this.state.browser.iframeCount>0; return this.snapshot(); }
  parityKey(){ const s=this.state; return JSON.stringify({network:s.network.map(x=>[x.method,x.url]).sort(),fields:s.structure.fields.map(x=>[x.id,x.selector]),schema:s.schema.mode,selection:s.selection?{selector:s.selection.selector,fieldIds:s.selection.fieldIds,networkUrls:s.selection.networkIds.map(id=>s.network.find(n=>n.requestId===id)?.url||'').filter(Boolean).sort()}:null,preview:s.preview.rows.length,workflow:s.workflow.length}); }
  markParity(other){ this.state.pass.EMBEDDED_STANDALONE_PARITY=this.parityKey()===other.parityKey(); return this.state.pass.EMBEDDED_STANDALONE_PARITY; }
  _fieldForUrl(url){ const groups=this.state.schema.endpointGroups; const rel=arr(this.state.schema.identifierRelations); for(const r of rel){ const pat=r.url_pattern||r.urlPattern||r.endpoint||''; if(pat && String(url).includes(String(pat).replace(/\{[^}]+\}/g,''))){ return this.state.structure.fields.find(f=>f.id===r.field_id||f.name===r.field||f.name===r.target_field); }} return null; }
  _recomputeSelectionBindings(){ const s=this.state.selection; if(!s)return; const fields=this.state.structure.fields.filter(f=>f.selector&&this._selectorRelated(s.selector,f.selector)); s.fieldIds=fields.map(f=>f.id); s.locatorIds=this.state.structure.locators.filter(l=>s.fieldIds.includes(l.fieldId)||fields.some(f=>f.name===l.fieldId)).map(l=>l.id); const ids=new Set(); if(s.networkRequestId) ids.add(String(s.networkRequestId)); for(const f of fields) if(f.networkRequestId) ids.add(String(f.networkRequestId)); for(const rel of arr(this.state.schema.identifierRelations)){ const fieldName=rel.field||rel.target_field||rel.field_name; if(fields.some(f=>f.name===fieldName)&&rel.request_id) ids.add(String(rel.request_id)); } s.networkIds=[...ids].filter(id=>this.state.network.some(n=>n.requestId===id)); this.state.selectedFieldId=s.fieldIds[0]||null; this.state.selectedNetworkId=s.networkIds[0]||null; this.state.pass.ELEMENT_TO_FIELD_POINTER=s.fieldIds.length>0&&s.locatorIds.length>0; this.state.pass.DOM_NETWORK_SYNC=s.networkIds.length>0&&s.fieldIds.length>0; }
  _selectorRelated(a,b){ return a===b||a.endsWith(b)||b.endsWith(a)||a.includes(b)||b.includes(a); }
  _syncPreviewToSelection(){ const s=this.state.selection; if(!s){this.state.preview.selectedRow=null;return;} let idx=-1; if(s.recordId!==null&&s.recordId!==undefined) idx=this.state.sourcePointerIndex[`record:${s.recordId}`]??-1; if(idx<0&&s.sourcePointer?.jsonPointer) idx=this.state.sourcePointerIndex[`json:${s.sourcePointer.jsonPointer}`]??-1; this.state.preview.selectedRow=idx>=0?idx:null; if(idx>=0){const row=this.state.preview.rows[idx]||{};const source=row.source||row.__source||row._source||{};const rowPointer=source.rowPointer||source.row_pointer||row.__source_pointer||null;if(rowPointer)s.sourcePointer=clone(rowPointer);const selectedField=this.state.structure.fields.find(f=>s.fieldIds.includes(f.id));if(selectedField&&source.elementPointers?.[selectedField.name])s.sourceElementPointer=clone(source.elementPointers[selectedField.name]);} }
  assertPass(){ const missing=PASS_KEYS.filter(k=>!this.state.pass[k]); if(missing.length) throw new Error(`PASS_MISSING:${missing.join(',')}`); return true; }
  snapshot(){ return clone(this.state); }
}
