'use strict';
const assert = require('node:assert/strict');
const { parseWavePointer, PointerRelayState } = require('../c_mode_wave_pointer.cjs');
let n=0; const ok=(v,m)=>{assert.ok(v,m);n++}; const eq=(a,b,m)=>{assert.equal(a,b,m);n++};
const src=`C_MODE_WAVE_V2|WAVE_ID=V1-C-MODE-6W-WAVE-006|READY=true|WORKER_COUNT=2|END_WAVE=W1\nW1|ROLE=AUTOMATION-C-W1|PR=59|COMMENT=5193423147|RESULT_KEY=519342314700\nW1|ROLE=AUTOMATION-C-W2|PR=60|COMMENT=5193426330|RESULT_KEY=519342633000`;
const p=parseWavePointer(src); eq(p.worker_count,2); eq(p.rows[0].result_key,'519342314700');
for (const [bad,code] of [
 [src.replace('READY=true','READY=false'),'WAVE_NOT_READY'],
 [src.replace('WORKER_COUNT=2','WORKER_COUNT=２'),'WORKER_COUNT_NOT_ASCII_DIGITS'],
 [src.replace('519342314700','1'),'RESULT_KEY_MISMATCH'],
 [src.replace('AUTOMATION-C-W2','AUTOMATION-C-W1'),'DUPLICATE_ROLE'],
 [src.replace('PR=60','PR=59'),'DUPLICATE_PR'],
 [src.replace('COMMENT=5193426330','COMMENT=5193423147').replace('RESULT_KEY=519342633000','RESULT_KEY=519342314700'),'DUPLICATE_COMMENT']
]) { let got=''; try{parseWavePointer(bad)}catch(e){got=e.code} eq(got,code,code); }
const s=new PointerRelayState(); let got=''; try{s.dispatchAll(p,()=>{})}catch(e){got=e.code} eq(got,'PREFETCH_REQUIRED_BEFORE_DISPATCH');
let fetches=0; eq(s.prefetch(p,(pr,c)=>{fetches++; return `${pr}:${c}`}),2); eq(fetches,2);
const sent=[]; eq(s.dispatchAll(p,r=>sent.push(r.role)).length,2); eq(sent.length,2); eq(s.dispatchAll(p,()=>{throw new Error('must not send')}).length,0);
const restored=new PointerRelayState(s.snapshot()); eq(restored.dispatchAll(p,()=>{throw new Error('must not resend')}).length,0);
ok(restored.snapshot().dispatched.length===2,'restart state retained');
console.log(`PASS_${n}_OF_${n}`);
