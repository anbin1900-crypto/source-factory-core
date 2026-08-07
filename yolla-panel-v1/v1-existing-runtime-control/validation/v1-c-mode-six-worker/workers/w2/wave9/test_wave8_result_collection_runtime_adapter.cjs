'use strict';
const assert = require('node:assert/strict');
const { collectWaveResults, NEXT_WAVE_TRIGGER } = require('./wave8_result_collection_runtime_adapter.cjs');

const rows = [
  ['AUTOMATION-C-W1','519385230900'],['AUTOMATION-C-W2','519385708300'],
  ['AUTOMATION-C-W3','519386239100'],['AUTOMATION-C-W4','519386645000'],
  ['AUTOMATION-C-W5','519387122700'],['AUTOMATION-C-W6','519387627700'],
].map(([role,result_key]) => ({ role, result_key }));
const comments = [
  ['AUTOMATION-C-W1','519385230900','PASS',5194273797,'ac15ba87733445d0006953c060e73e488ab49913'],
  ['AUTOMATION-C-W2','519385708300','PASS',5193959441,'d1e12289eb25282601894946f902238306c7b677'],
  ['AUTOMATION-C-W3','519386239100','PASS',5194248288,'3b3f8c792e9eaba9aa495e3e229d3c6019b149db'],
  ['AUTOMATION-C-W4','519386645000','PASS',5194272466,'c104760dc53e8ba07c509b8ef5a472f38bd1d9b3'],
  ['AUTOMATION-C-W5','519387122700','BLOCKED',5193944215,'d3881f439bb393498c69b53d4c5558d4e9869420'],
  ['AUTOMATION-C-W6','519387627700','BLOCKED',5193935894,'3b384eca85f1f2bed6b9fd039ab8d3c76cc1f165'],
].map(([role,result_key,outcome,id,result_commit]) => ({role,result_key,outcome,id,result_commit}));

const result = collectWaveResults(rows, comments);
assert.equal(result.schema, 'C_MODE_WAVE_RESULT_V1');
assert.equal(result.counts.REPORTED, 6);
assert.equal(result.counts.MISSING, 0);
assert.equal(result.counts.DUPLICATE, 0);
assert.equal(result.results.filter(x => x.outcome === 'BLOCKED').length, 2);
assert.ok(result.commander_output.endsWith(NEXT_WAVE_TRIGGER));
assert.ok(result.commander_output.includes('RESULT_COMMENT=5193944215|OUTCOME=BLOCKED'));
assert.equal(collectWaveResults(rows, comments.slice(0,5)).counts.MISSING, 1);
assert.equal(collectWaveResults(rows, [...comments, comments[0]]).counts.DUPLICATE, 1);
assert.equal(collectWaveResults(rows, comments.map(x => x.role === 'AUTOMATION-C-W1' ? {...x,outcome:'NO_WORK'} : x)).counts.REPORTED, 6);
assert.equal(collectWaveResults(rows, comments.map(x => x.role === 'AUTOMATION-C-W1' ? {...x,outcome:'FAIL'} : x)).counts.REPORTED, 6);
console.log('PASS_10_OF_10');
