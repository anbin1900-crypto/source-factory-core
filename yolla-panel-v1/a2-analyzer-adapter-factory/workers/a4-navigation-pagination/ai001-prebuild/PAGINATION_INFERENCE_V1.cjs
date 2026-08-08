'use strict';
const NEXT=/^(next|다음|다음\s*페이지|›|»|>)$/i,MORE=/(load\s*more|더\s*보기|더보기)/i;
const t=n=>String(n?.text||n?.name||'').replace(/\s+/g,' ').trim();
function inferPagination({nodes=[],networkHints=[],runtimeHints={},selectedElement=null}={}){const controls=nodes.filter(n=>n?.visible!==false&&(['a','button'].includes(String(n.tag||'').toLowerCase())||['link','button'].includes(String(n.role||'').toLowerCase())));
let n=controls.find(x=>NEXT.test(t(x)));if(n)return{type:'NEXT',detected:true,confidence:.96,source:'DOM',nodeId:n.id,href:n.attributes?.href||null};
n=controls.find(x=>MORE.test(t(x)));if(n)return{type:'LOAD_MORE',detected:true,confidence:.95,source:'DOM',nodeId:n.id};
const nums=controls.filter(x=>/^\d{1,4}$/.test(t(x)));if(nums.length>=2)return{type:'PAGE_NUMBER',detected:true,confidence:.92,source:'DOM',nodeIds:nums.map(x=>x.id)};
const cur=networkHints.find(h=>h?.cursor||/(cursor|after|before)=/i.test(String(h?.url||h?.requestUrl||'')));if(cur)return{type:'CURSOR',detected:true,confidence:.91,source:'NETWORK_HINT',evidence:cur.cursor||cur.url||cur.requestUrl};
const page=networkHints.find(h=>/[?&](page|offset)=\d+/i.test(String(h?.url||h?.requestUrl||'')));if(page)return{type:/offset=/i.test(page.url||page.requestUrl||'')?'OFFSET':'PAGE_NUMBER',detected:true,confidence:.82,source:'NETWORK_HINT',evidence:page.url||page.requestUrl};
const growth=Number(runtimeHints.itemCountAfter||0)>Number(runtimeHints.itemCountBefore||0), scroll=!!(runtimeHints.scrollObserved||runtimeHints.intersectionObserved);if(growth&&scroll)return{type:'INFINITE_SCROLL',detected:true,confidence:.88,source:'RUNTIME_HINT'};
if(selectedElement&&/next|more|pagination/i.test(String(selectedElement.text||selectedElement.role||'')))return{type:'USER_SELECTED_CONTROL',detected:true,confidence:.7,source:'SELECTED_ELEMENT'};
return{type:'NONE',detected:false,explicitNone:true,confidence:.75,source:'NEGATIVE_EVIDENCE'};}
module.exports={inferPagination};
