'use strict';
const crypto = require('crypto');

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = value => String(value ?? '').trim();
const eventName = event => text(event.eventType || event.event_type || event.method || event.type || event.name).toUpperCase();
const payloadOf = event => event.payload || event.params || event.data || event.result || {};

function isLiveEvent(event) {
  const producer = text(event.producer || event.worker || event.sourceWorker || event.source_worker).toUpperCase();
  const source = text(event.source || event.captureMode || event.capture_mode).toUpperCase();
  const liveFlag = event.live === true || event.isLive === true || event.is_live === true || source.includes('LIVE');
  return liveFlag && (producer === 'A-3' || producer === 'A3' || producer === 'A-3_LIVE_CDP_CAPTURE_OWNER');
}

function snapshotFrom(event) {
  const name = eventName(event);
  const payload = payloadOf(event);
  if (!(name.includes('DOMSNAPSHOT') || name === 'DOM_SNAPSHOT' || name === 'DOMSNAPSHOT')) return null;
  return payload.domSnapshot || payload.snapshot || payload.result || payload;
}

function navigationFrom(event) {
  const name = eventName(event);
  const payload = payloadOf(event);
  if (!(name.includes('NAVIGAT') || name === 'PAGE.FRAMENAVIGATED' || name === 'PAGE.NAVIGATEDWITHINDOCUMENT')) return null;
  const frame = payload.frame || {};
  return {
    type: name,
    eventId: event.eventId || event.event_id || null,
    timestamp: event.timestamp || event.capturedAt || event.captured_at || null,
    fromUrl: payload.fromUrl || payload.from_url || event.fromUrl || null,
    toUrl: payload.toUrl || payload.to_url || payload.url || frame.url || event.url || null,
    requestUrl: payload.requestUrl || payload.request_url || null,
    frameId: payload.frameId || payload.frame_id || frame.id || null,
    cursor: payload.cursor || null,
    itemCountBefore: payload.itemCountBefore ?? payload.item_count_before ?? null,
    itemCountAfter: payload.itemCountAfter ?? payload.item_count_after ?? null
  };
}

function classifyCounts(events) {
  const counts = { network: 0, responseBody: 0, domSnapshot: 0, navigation: 0, frame: 0, console: 0 };
  for (const event of events) {
    const name = eventName(event);
    if (name.includes('NETWORK') || name.startsWith('NETWORK.')) counts.network += 1;
    if (name.includes('RESPONSE_BODY') || name.includes('GETRESPONSEBODY') || name.includes('RESPONSEBODY')) counts.responseBody += 1;
    if (name.includes('DOMSNAPSHOT') || name === 'DOM_SNAPSHOT') counts.domSnapshot += 1;
    if (name.includes('NAVIGAT')) counts.navigation += 1;
    if (name.includes('FRAME')) counts.frame += 1;
    if (name.includes('CONSOLE') || name.includes('RUNTIME.CONSOLEAPICALLED')) counts.console += 1;
  }
  return counts;
}

function dedupeEvents(events, maxEvents = 50000) {
  if (!Array.isArray(events)) throw new Error('EVENT_STREAM_NOT_ARRAY');
  if (events.length > maxEvents) throw new Error(`EVENT_STREAM_LIMIT_EXCEEDED:${events.length}`);
  const seen = new Set();
  const output = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || typeof event !== 'object') throw new Error(`EVENT_NOT_OBJECT:${index}`);
    const explicitId = event.eventId || event.event_id || event.id;
    const key = explicitId ? `id:${explicitId}` : `hash:${sha256([eventName(event), event.timestamp || null, payloadOf(event)])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(event);
  }
  return output;
}

function buildInferenceInput(events, options = {}) {
  const uniqueEvents = dedupeEvents(events, options.maxEvents || 50000);
  const liveEvents = uniqueEvents.filter(isLiveEvent);
  if (liveEvents.length === 0) throw new Error('A3_NONZERO_LIVE_EVENT_REQUIRED');

  const snapshots = liveEvents.map(snapshotFrom).filter(Boolean);
  if (snapshots.length === 0) throw new Error('A3_LIVE_DOM_SNAPSHOT_REQUIRED');
  const navigationEvents = liveEvents.map(navigationFrom).filter(Boolean);
  const documentEvents = [...liveEvents].reverse().map(event => {
    const payload = payloadOf(event);
    const frame = payload.frame || {};
    return payload.url || frame.url || event.url || null;
  }).filter(Boolean);
  const latestSnapshot = snapshots[snapshots.length - 1];
  const snapshotEvent = [...liveEvents].reverse().find(event => snapshotFrom(event)) || {};
  const snapshotPayload = payloadOf(snapshotEvent);
  const counts = classifyCounts(liveEvents);

  return {
    schemaVersion: 'A3_LIVE_DOM_NAVIGATION_INPUT_V1',
    snapshotId: snapshotEvent.snapshotId || snapshotEvent.snapshot_id || snapshotPayload.snapshotId || sha256(latestSnapshot).slice(0, 24),
    url: snapshotPayload.url || snapshotEvent.url || documentEvents[0] || options.url || '',
    domSnapshot: latestSnapshot,
    navigationEvents,
    eventStreamProvenance: {
      producer: 'A-3',
      live: true,
      inputEventCount: events.length,
      uniqueEventCount: uniqueEvents.length,
      liveEventCount: liveEvents.length,
      duplicateEventCount: events.length - uniqueEvents.length,
      eventCounts: counts,
      sourceHead: options.sourceHead || null,
      streamId: options.streamId || snapshotEvent.streamId || snapshotEvent.stream_id || null,
      firstEventAt: liveEvents[0].timestamp || liveEvents[0].capturedAt || null,
      lastEventAt: liveEvents[liveEvents.length - 1].timestamp || liveEvents[liveEvents.length - 1].capturedAt || null,
      eventDigest: sha256(liveEvents)
    },
    viewportHeight: snapshotPayload.viewportHeight || options.viewportHeight || 0,
    documentScrollHeight: snapshotPayload.documentScrollHeight || options.documentScrollHeight || 0
  };
}

function validateInferenceResult(result) {
  const fields = Array.isArray(result?.fieldCandidates) ? result.fieldCandidates : [];
  const locators = Array.isArray(result?.locatorCandidates) ? result.locatorCandidates : [];
  const highlights = Array.isArray(result?.highlightPayload?.highlights) ? result.highlightPayload.highlights : [];
  const regions = Array.isArray(result?.repeatedRegions) ? result.repeatedRegions : [];
  if (!result?.pageType?.type) throw new Error('PAGE_TYPE_REQUIRED');
  if (fields.length < 5) throw new Error(`FIELD_CANDIDATE_MINIMUM_NOT_MET:${fields.length}`);
  if (locators.length < 5) throw new Error(`LOCATOR_CANDIDATE_MINIMUM_NOT_MET:${locators.length}`);
  if (!result?.pagination || (result.pagination.detected !== true && result.pagination.explicitNone !== true)) throw new Error('PAGINATION_DECISION_REQUIRED');
  if (highlights.length === 0) throw new Error('HIGHLIGHT_PAYLOAD_REQUIRED');
  if (new Set(fields.map(field => field.fieldId)).size !== fields.length) throw new Error('DUPLICATE_FIELD_ID');
  if (new Set(locators.map(locator => locator.locatorId)).size !== locators.length) throw new Error('DUPLICATE_LOCATOR_ID');
  return { fieldCount: fields.length, locatorCount: locators.length, highlightCount: highlights.length, repeatedRegionCount: regions.length };
}

function bindLiveEventStream(events, options = {}) {
  const inferStructure = options.inferStructure || require('../live_structure_inference_engine.cjs').inferStructure;
  const input = buildInferenceInput(events, options);
  const result = inferStructure(input);
  const pass = validateInferenceResult(result);
  const handoff = {
    schemaVersion: 'A4_WAVE2_LIVE_EVENT_STRUCTURE_HANDOFF_V1',
    directiveId: 'A0-SITE-ANALYZER-WAVE2-EXECUTION-RECOVERY-SPRINT-V1-20260807-001',
    source: input.eventStreamProvenance,
    inference: result,
    workflow: {
      pageType: result.pageType,
      repeatedRegions: result.repeatedRegions,
      fields: result.fieldCandidates,
      locators: result.locatorCandidates,
      listDetailRelation: result.listDetailRelation,
      pagination: result.pagination
    },
    b2HighlightPayload: result.highlightPayload,
    pass,
    terminalReady: true
  };
  handoff.handoffSha256 = sha256(handoff);
  return handoff;
}

module.exports = { eventName, isLiveEvent, snapshotFrom, navigationFrom, classifyCounts, dedupeEvents, buildInferenceInput, validateInferenceResult, bindLiveEventStream };
