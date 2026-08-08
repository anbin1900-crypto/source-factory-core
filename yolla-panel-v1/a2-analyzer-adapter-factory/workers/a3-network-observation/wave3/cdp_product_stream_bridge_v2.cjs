'use strict';
const base = require('./cdp_product_stream_bridge.cjs');

const A4_EVENT_ALIASES = Object.freeze({
  'dom.snapshot': 'DOM_SNAPSHOT',
  'page.frameNavigated': 'PAGE.FRAMENAVIGATED',
  'page.lifecycleEvent': 'PAGE.LIFECYCLEEVENT',
  'network.requestWillBeSent': 'NETWORK.REQUESTWILLBESENT',
  'network.responseReceived': 'NETWORK.RESPONSERECEIVED',
  'network.responseBody': 'NETWORK.RESPONSE_BODY',
  'runtime.consoleAPICalled': 'RUNTIME.CONSOLEAPICALLED'
});

class CdpProductStreamBridgeV2 extends base.CdpProductStreamBridge {
  createA4EventProjection(events) {
    return Array.from(events || []).map(event => ({
      ...event,
      eventType: A4_EVENT_ALIASES[event.type] || event.type
    }));
  }
}

function validateA4Contract(events) {
  const list = Array.from(events || []);
  if (!list.length) throw new Error('A4_EVENT_STREAM_EMPTY');
  if (!list.every(event => event.producer === 'A-3' && event.live === true)) throw new Error('A4_LIVE_PROVENANCE_MISMATCH');
  const names = list.map(event => String(event.eventType || event.event_type || event.method || event.type || event.name || '').toUpperCase());
  const dom = names.filter(name => name.includes('DOMSNAPSHOT') || name === 'DOM_SNAPSHOT').length;
  const navigation = names.filter(name => name.includes('NAVIGAT') || name === 'PAGE.FRAMENAVIGATED').length;
  if (!dom) throw new Error('A4_DOM_SNAPSHOT_REQUIRED');
  if (!navigation) throw new Error('A4_NAVIGATION_REQUIRED');
  return { event_count: list.length, dom_snapshot_count: dom, navigation_count: navigation };
}

module.exports = {
  ...base,
  A4_EVENT_ALIASES,
  CdpProductStreamBridge: CdpProductStreamBridgeV2,
  CdpProductStreamBridgeV2,
  validateA4Contract
};
