'use strict';
const crypto=require('node:crypto');
function cleanToken(v){return String(v||'').trim().replace(/\s+/g,' ').replace(/[a-f0-9]{8,}/ig,'<HASH>').replace(/\d{4,}/g,'<NUM>');}
function signature(candidate={}){
  const stable={strategy:candidate.strategy||'UNKNOWN',tag:candidate.tag||null,role:candidate.role||null,data_key:candidate.data_key||null,locator:cleanToken(candidate.locator),ancestor:cleanToken(candidate.ancestor),field_role:candidate.field_role||null};
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
function baseScore(c={}){
  const s=String(c.strategy||'').toUpperCase(); let score={DATA:0.96,ROLE:0.93,LABEL:0.91,TEXT:0.78,CSS:0.72,XPATH:0.55}[s]||0.45;
  const loc=String(c.locator||''); if(/:nth-(child|of-type)|\/div\[\d+\]/i.test(loc))score-=0.18;if(/[a-f0-9]{8,}|\d{5,}/i.test(loc))score-=0.17;if(c.observed===true)score+=0.03;
  return Math.max(0,Math.min(1,Number(score.toFixed(4))));
}
function rank(candidates=[]){return candidates.map(c=>({...c,confidence:baseScore(c),drift_signature:signature(c),fallback:c.fallback||null,evidence_status:c.observed?'OBSERVED':(c.inferred?'INFERRED':'UNKNOWN')})).sort((a,b)=>b.confidence-a.confidence||a.drift_signature.localeCompare(b.drift_signature));}
function compare(previous=[],current=[]){const p=new Map(previous.map(x=>[x.drift_signature,x])),c=new Map(current.map(x=>[x.drift_signature,x]));return {stable:[...c.keys()].filter(k=>p.has(k)),added:[...c.keys()].filter(k=>!p.has(k)),missing:[...p.keys()].filter(k=>!c.has(k)),drift_detected:[...p.keys()].some(k=>!c.has(k))};}
module.exports={signature,baseScore,rank,compare};
