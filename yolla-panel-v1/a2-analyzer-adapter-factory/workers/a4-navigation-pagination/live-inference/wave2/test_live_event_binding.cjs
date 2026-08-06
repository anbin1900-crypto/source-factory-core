'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./live_event_binding.cjs');

function live(type, payload = {}, id = type) {
  return {
    eventId: id,
    eventType: type,
    producer: 'A-3',
    source: 'LIVE_ELECTRON_CDP',
    live: true,
    timestamp: '2026-08-07T03:52:00+09:00',
    payload
  };
}

const snapshot = {
  strings: ['HTML'],
  documents: [{
    nodes: {
      nodeName: [0],
      nodeValue: [0],
      parentIndex: [-1],
      backendNodeId: [1],
      attributes: [[]]
    },
    layout: { nodeIndex: [0], bounds: [[0, 0, 100, 100]] }
  }]
};

function events() {
  return [
    live('Network.requestWillBeSent', { url: 'http://127.0.0.1/list' }, 'n1'),
    live('DOMSnapshot.captureSnapshot.result', { domSnapshot: snapshot, url: 'http://127.0.0.1/list' }, 'd1'),
    live('Page.frameNavigated', { frame: { id: 'f1', url: 'http://127.0.0.1/list' } }, 'p1'),
    live('Page.frameNavigated', { frame: { id: 'f1', url: 'http://127.0.0.1/detail/1' } }, 'p2')
  ];
}

function inference() {
  return {
    pageType: { type: 'LIST', confidence: 0.9 },
    repeatedRegions: [{ regionId: 'r1' }],
    fieldCandidates: Array.from({ length: 5 }, (_, i) => ({ fieldId: `f${i + 1}` })),
    locatorCandidates: Array.from({ length: 5 }, (_, i) => ({ locatorId: `l${i + 1}` })),
    listDetailRelation: { detected: true },
    pagination: { type: 'NEXT', detected: true },
    highlightPayload: { highlights: [{ id: 'h1' }] }
  };
}

test('accepts nonzero A-3 live stream and builds inference input', () => {
  const input = B.buildInferenceInput(events(), { sourceHead: 'a3head' });
  assert.equal(input.eventStreamProvenance.liveEventCount, 4);
  assert.equal(input.eventStreamProvenance.eventCounts.domSnapshot, 1);
  assert.equal(input.navigationEvents.length, 2);
  assert.equal(input.eventStreamProvenance.sourceHead, 'a3head');
});

test('rejects fixture-only events', () => {
  const fixtureEvents = events().map(event => ({ ...event, live: false, source: 'FIXTURE' }));
  assert.throws(() => B.buildInferenceInput(fixtureEvents), /NONZERO_LIVE_EVENT/);
});

test('rejects stream without live DOM snapshot', () => {
  assert.throws(() => B.buildInferenceInput([live('Network.requestWillBeSent', {})]), /DOM_SNAPSHOT/);
});

test('deduplicates exact event ids and prevents loop growth', () => {
  const source = events();
  const input = B.buildInferenceInput([...source, source[0]]);
  assert.equal(input.eventStreamProvenance.duplicateEventCount, 1);
  assert.equal(input.eventStreamProvenance.uniqueEventCount, 4);
});

test('fails closed above event limit', () => {
  assert.throws(() => B.dedupeEvents(events(), 2), /LIMIT_EXCEEDED/);
});

test('binds result and B-2 highlight handoff', () => {
  const output = B.bindLiveEventStream(events(), { inferStructure: inference });
  assert.equal(output.terminalReady, true);
  assert.equal(output.pass.fieldCount, 5);
  assert.equal(output.pass.locatorCount, 5);
  assert.equal(output.b2HighlightPayload.highlights.length, 1);
  assert.match(output.handoffSha256, /^[a-f0-9]{64}$/);
});

test('fails on field omission', () => {
  const bad = inference();
  bad.fieldCandidates = bad.fieldCandidates.slice(0, 4);
  assert.throws(() => B.bindLiveEventStream(events(), { inferStructure: () => bad }), /FIELD_CANDIDATE/);
});

test('fails on locator omission', () => {
  const bad = inference();
  bad.locatorCandidates = bad.locatorCandidates.slice(0, 4);
  assert.throws(() => B.bindLiveEventStream(events(), { inferStructure: () => bad }), /LOCATOR_CANDIDATE/);
});

test('requires pagination detected or explicit none', () => {
  const bad = inference();
  bad.pagination = { detected: false };
  assert.throws(() => B.bindLiveEventStream(events(), { inferStructure: () => bad }), /PAGINATION_DECISION/);
});

test('requires highlights', () => {
  const bad = inference();
  bad.highlightPayload = { highlights: [] };
  assert.throws(() => B.bindLiveEventStream(events(), { inferStructure: () => bad }), /HIGHLIGHT_PAYLOAD/);
});

test('requires unique field and locator ids', () => {
  const bad = inference();
  bad.fieldCandidates[4].fieldId = 'f1';
  assert.throws(() => B.bindLiveEventStream(events(), { inferStructure: () => bad }), /DUPLICATE_FIELD_ID/);
});
