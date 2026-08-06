'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startServer}=require('../common-test-site.cjs');
(async()=>{
  const root=path.resolve(__dirname,'..');
  require('node:child_process').execFileSync(process.execPath,[path.join(root,'adapter-compiler.cjs')],{stdio:'inherit'});
  const adapter=require('../generated/adapter.cjs');
  const {server,baseUrl,requestLog}=await startServer();
  try{
    const capturePath=path.join(root,'artifacts/live-capture.json'),tracePath=path.join(root,'artifacts/live-trace.json');
    const live=await adapter.execute({baseUrl,maxRecords:10,capturePath,tracePath,injectTransient:true});
    assert.equal(live.capture.fixture_only,false);
    assert.equal(live.capture.actual_http,true);
    assert.equal(live.capture.record_count,10);
    assert.equal(new Set(live.capture.records.map(r=>r.listingId)).size,10);
    assert.equal(live.capture.repaired,true);
    assert.ok(live.trace.some(e=>e.type==='adapter.stepRepaired'));
    assert.ok(live.trace.some(e=>e.type==='adapter.retry'));
    const replayTrace=path.join(root,'artifacts/replay-trace.json');
    const replay=await adapter.replay(live.capture,replayTrace);
    assert.equal(replay.records.length,10);
    assert.equal(replay.records_sha256,live.capture.records_sha256);
    assert.equal(requestLog.length,5);
  } finally { await new Promise(r=>server.close(r)); }
  console.log('PASS_WAVE2_EXACT_10_LOCAL_HTTP_E2E');
})().catch(e=>{console.error(e.stack);process.exit(1)});
