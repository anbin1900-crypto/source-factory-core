'use strict';
function ws(v){return String(v??'').replace(/\s+/g,' ').trim();}
function attrs(v){if(!v)return{};if(!Array.isArray(v))return{...v};const o={};for(let i=0;i<v.length;i+=2)o[String(v[i])]=String(v[i+1]??'');return o;}
function tag(v){return String(v||'').replace(/^#/,'').toLowerCase();}
function role(n){const a=n.attributes||{};if(a.role)return String(a.role).toLowerCase();return({a:'link',button:'button',img:'img',table:'table',tr:'row',select:'combobox'}[n.tag]||(/^h[1-6]$/.test(n.tag)?'heading':n.tag==='input'?(a.type==='checkbox'?'checkbox':'textbox'):null));}
function unpack(input){
 if(Array.isArray(input.nodes))return input.nodes.map((n,i)=>({id:String(n.id??n.backendNodeId??i),parentId:n.parentId==null?null:String(n.parentId),tag:tag(n.tag||n.nodeName),role:n.role||null,text:ws(n.text||n.nodeValue||n.name),attributes:attrs(n.attributes),bounds:n.bounds||null,visible:n.visible!==false,sourceIndex:i}));
 const s=input.domSnapshot||input.snapshot||input,strings=s.strings||[],d=(s.documents||[])[0];if(!d?.nodes)throw new Error('UNSUPPORTED_DOM_SNAPSHOT_INPUT');
 const n=d.nodes,l=d.layout||{},bm=new Map();for(let i=0;i<(l.nodeIndex||[]).length;i++)bm.set(l.nodeIndex[i],l.bounds[i]);const out=[];
 for(let i=0;i<(n.nodeName||[]).length;i++){const a={},pa=(n.attributes||[])[i]||[];for(let j=0;j<pa.length;j+=2)a[strings[pa[j]]]=strings[pa[j+1]]||'';const pi=(n.parentIndex||[])[i],name=tag(strings[(n.nodeName||[])[i]]||'');out.push({id:String((n.backendNodeId||[])[i]??i),parentId:pi>=0?String((n.backendNodeId||[])[pi]??pi):null,tag:name,role:a.role||null,text:ws(strings[(n.nodeValue||[])[i]]||''),attributes:a,bounds:bm.get(i)||null,visible:bm.has(i)||!['script','style','meta','link'].includes(name),sourceIndex:i});}
 return out;
}
function tree(nodes){const byId=new Map(nodes.map(n=>[n.id,{...n,children:[]}])),roots=[];for(const n of byId.values()){if(n.parentId&&byId.has(n.parentId))byId.get(n.parentId).children.push(n);else roots.push(n);}return{byId,roots};}
function descendants(n){const out=[],q=[...(n.children||[])];while(q.length){const x=q.shift();out.push(x);q.unshift(...(x.children||[]));}return out;}
function text(n){return ws([n.text,...descendants(n).map(x=>x.text)].filter(Boolean).join(' '));}
module.exports={ws,attrs,tag,role,unpack,tree,descendants,text};
