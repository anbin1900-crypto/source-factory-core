import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {applyEvidence,summarizeSiteMatrix} from './site_factory_build_plan_model.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const read=n=>JSON.parse(fs.readFileSync(path.join(ROOT,n),'utf8'));
const cov=read('B2_IMPLEMENTATION_DECISION_COVERAGE_V1.json');const fx=read('fixtures/B2_SITE_FACTORY_INCREMENTAL_COVERAGE_FIXTURE_V1.json');
const before=summarizeSiteMatrix(cov.site_matrix);assert.equal(before.candidate,fx.initial.candidate);assert.equal(before.unknown_or_waiting,fx.initial.unknown_or_waiting);
const untouched1=JSON.stringify(cov.site_matrix.find(s=>s.site_id==='WAITING_SITE_03').screens.LIST);const untouched2=JSON.stringify(cov.site_matrix.find(s=>s.site_id==='WAITING_SITE_04').screens.SEARCH);
const r=applyEvidence(cov.site_matrix,fx.increment_event);assert.equal(r.summary.candidate,fx.expected_after.candidate);assert.equal(r.summary.unknown_or_waiting,fx.expected_after.unknown_or_waiting);assert.equal(r.summary.confirmed,0);
assert.equal(JSON.stringify(r.siteMatrix.find(s=>s.site_id==='WAITING_SITE_03').screens.LIST),untouched1);assert.equal(JSON.stringify(r.siteMatrix.find(s=>s.site_id==='WAITING_SITE_04').screens.SEARCH),untouched2);assert.equal(r.current.decision,'EVIDENCE_CANDIDATE');assert.notEqual(r.current.decision,'CONFIRMED');
console.log(JSON.stringify({status:'PASS',before,after:r.summary,touched:'WAITING_SITE_03/SEARCH',unrelated_cells_unchanged:true,no_auto_confirm:true}));
