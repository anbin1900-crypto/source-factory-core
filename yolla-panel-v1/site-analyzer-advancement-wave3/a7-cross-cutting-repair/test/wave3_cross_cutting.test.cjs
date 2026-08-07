'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {EventEmitter}=require('node:events');
const bindings=require('../fixtures/A7_WAVE3_AUTHORITY_BINDINGS_V1.json');
const {PackageResolver,normalizeRelativePath,CanonicalEventBridge,bindIpc,validateRecipeSelectors,buildIntegrationReceipt}=require('../src/cross_cutting_repair.cjs');
const B6=process.env.B6_PACKAGE_ROOT;
function requireB6(){if(!B6) throw new Error('B6_PACKAGE_ROOT_REQUIRED');return B6;}

test('path resolver fail-closes traversal and recovers missing B1 runtime from exact B6 bytes',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a7-wave3-b1-')); fs.writeFileSync(path.join(tmp,'launcher.cjs'),'// B1 launcher placeholder\n');
 assert.throws(()=>normalizeRelativePath('../escape'),/PATH_TRAVERSAL_REJECTED/);
 const r=new PackageResolver({declaredRoot:tmp,fallbackRoots:[requireB6()],expectedMembers:bindings.critical_members});
 const x=r.resolve('runtime/scenario-runner.cjs'); assert.equal(x.source,'VERIFIED_EXTERNAL_PACKAGE'); assert.equal(x.sha256,bindings.critical_members['runtime/scenario-runner.cjs']);
});

test('IPC bridge replaces stale owner and event bridge deduplicates while preserving monotonic sequence',()=>{
 const handlers=new Map();const ipc={handle:(n,f)=>{if(handlers.has(n))throw new Error('duplicate');handlers.set(n,f)},removeHandler:n=>handlers.delete(n)};
 const a=bindIpc({ipcMain:ipc,ownerId:'A',handlers:{'site-analyzer:run':()=>1,'site-analyzer:state':()=>({})}});assert.equal(handlers.size,2);
 const b=bindIpc({ipcMain:ipc,ownerId:'B',handlers:{'site-analyzer:run':()=>2}});assert.equal(b.generation,2);assert.equal(handlers.size,1);assert.notEqual(a,b);
 const e=new CanonicalEventBridge(); e.push('x','network.request',{url:'u'}); e.push('x','network.request',{url:'u'}); e.push('x','network.response',{url:'u',status:200});
 const s=e.snapshot();assert.equal(s.count,2);assert.equal(s.unique_fingerprint_count,2);assert.equal(s.monotonic,true);b.dispose();assert.equal(handlers.size,0);
});

test('selector bridge resolves stable recipe locators against actual B6 fixture HTML',()=>{
 const root=requireB6(), out=path.join(root,'outputs');
 if(!fs.existsSync(path.join(out,'workflow-recipe.json'))) throw new Error('RUN_SAMPLE_FIRST');
 const recipe=JSON.parse(fs.readFileSync(path.join(out,'workflow-recipe.json')));const http=JSON.parse(fs.readFileSync(path.join(out,'node-http-runtime-receipt.json')));
 const html=(http.bodies||[]).map(x=>x.body||'');const rows=validateRecipeSelectors(recipe,html);assert.ok(rows.length>=5);assert.equal(rows.filter(x=>x.status==='NOT_FOUND').length,0);
});

test('actual B6 launcher survives two A7 restart-recovery runs with exact 10 and deterministic parity',()=>{
 const root=requireB6(), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a7-wave3-restart-')), checkpoint=path.join(tmp,'checkpoint.json');
 const resolver=new PackageResolver({fallbackRoots:[root],expectedMembers:bindings.critical_members});
 const first=buildIntegrationReceipt({packageRoot:root,resolver,checkpointFile:checkpoint}); assert.equal(first.status,'PASS');assert.equal(first.runtime.extracted_record_count,10);assert.equal(first.restart_recovery.run_count,1);
 const second=buildIntegrationReceipt({packageRoot:root,resolver,checkpointFile:checkpoint}); assert.equal(second.status,'PASS');assert.equal(second.restart_recovery.pass,true);assert.equal(second.restart_recovery.run_count,2);assert.equal(second.invariant.result_sha256,first.invariant.result_sha256);assert.equal(second.event_contract.duplicate_count,0);
});
