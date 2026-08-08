export const SCREEN_IDS=['SEARCH','LIST','DETAIL','MAP','AGENCY','MY_LISTING','CREATE','EDIT'];
export const STATES=['CONFIRMED','EVIDENCE_CANDIDATE','UNKNOWN','WAITING_INPUT'];
export function summarizeSiteMatrix(siteMatrix){
  const cells=siteMatrix.flatMap(s=>Object.values(s.screens));
  const confirmed=cells.filter(c=>c.decision==='CONFIRMED').length;
  const candidate=cells.filter(c=>c.decision==='EVIDENCE_CANDIDATE').length;
  const unknownOrWaiting=cells.filter(c=>c.decision==='UNKNOWN'||c.decision==='WAITING_INPUT').length;
  return {total:cells.length,confirmed,candidate,unknown_or_waiting:unknownOrWaiting,
    confirmed_percent:+(confirmed/cells.length*100).toFixed(2),candidate_percent:+(candidate/cells.length*100).toFixed(2),unknown_or_waiting_percent:+(unknownOrWaiting/cells.length*100).toFixed(2)};
}
export function applyEvidence(siteMatrix,event){
  const out=structuredClone(siteMatrix);
  let site=out.find(s=>s.site_id===event.site_id);
  if(!site && String(event.site_id||'').startsWith('WAITING_SITE_')) site=out.find(s=>s.site_id===event.site_id);
  if(!site) throw new Error('SITE_SLOT_NOT_FOUND');
  if(!SCREEN_IDS.includes(event.screen_id)) throw new Error('UNKNOWN_SCREEN');
  if(!['CONFIRMED','EVIDENCE_CANDIDATE'].includes(event.new_state)) throw new Error('EVIDENCE_EVENT_STATE_NOT_PROMOTABLE');
  if(!event.evidence_pointer) throw new Error('EVIDENCE_POINTER_REQUIRED');
  const prior=site.screens[event.screen_id];
  site.screens[event.screen_id]={decision:event.new_state,confidence:event.confidence,evidence_pointer:event.evidence_pointer};
  if(site.identity_state==='WAITING_INPUT') site.identity_state='EVIDENCE_CANDIDATE';
  return {siteMatrix:out,prior,current:site.screens[event.screen_id],summary:summarizeSiteMatrix(out)};
}
export function validateDependencyDAG(items){
  const map=new Map(items.map(x=>[x.backlog_id,x]));
  const visiting=new Set(),done=new Set();
  function visit(id){
    if(done.has(id)) return;
    if(visiting.has(id)) throw new Error('DEPENDENCY_CYCLE:'+id);
    const item=map.get(id); if(!item) throw new Error('MISSING_BACKLOG:'+id);
    visiting.add(id);
    for(const dep of item.dependency){ if(!map.has(dep)) throw new Error('MISSING_DEP:'+dep); visit(dep); }
    visiting.delete(id); done.add(id);
  }
  for(const id of map.keys()) visit(id);
  return true;
}
