'use strict';
const DYN=/(css|jsx|emotion|hash|[a-f0-9]{8,}|\d{5,})/i;
function clamp(v){return Math.max(0,Math.min(1,v));}
function scoreLocator(c={},ctx={}){let s=.45,r=[];const st=String(c.strategy||'').toLowerCase(),l=String(c.locator||'');
if(st==='testid'||/data-(testid|test|qa)/.test(l)){s+=.42;r.push('stable-data-hook');}
else if(st==='role'){s+=.32;r.push('semantic-role');if(c.name){s+=.08;r.push('accessible-name');}}
else if(st==='id'||l.startsWith('#')){s+=.31;r.push('stable-id');}
else if(st==='text'){s+=.18;r.push('visible-text');}
else if(st==='css'){s+=.12;r.push('css');}
if(c.selected||ctx.selectedNodeId===c.nodeId){s+=.08;r.push('selected-evidence');}
if(c.coverage>=.8){s+=.07;r.push('coverage');}
if(/:nth-(child|of-type)\(/i.test(l)){s-=.22;r.push('nth-penalty');}
if(DYN.test(l)){s-=.25;r.push('dynamic-token-penalty');}
if(l.length>180){s-=.12;r.push('length-penalty');}
if(ctx.virtualized&&st==='text'){s-=.08;r.push('virtualized-text-penalty');}
return {score:+clamp(s).toFixed(4),reasons:r};}
function rankLocators(cs,ctx={}){return (cs||[]).map(c=>({...c,stability:scoreLocator(c,ctx)})).sort((a,b)=>b.stability.score-a.stability.score);}
module.exports={scoreLocator,rankLocators};
