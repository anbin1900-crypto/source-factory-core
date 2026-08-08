'use strict';

const PAGINATION_TEXT = /^(next|more|다음|더보기|›|»|>)$/i;
const FIELD_ALIASES = {
  title: ['title','name','제목','명칭'], price: ['price','amount','가격','금액'],
  address: ['address','location','주소','소재지'], id: ['id','identifier','번호'],
  description: ['description','summary','설명','내용'], date: ['date','created','updated','일자','날짜']
};

function normalizeRecords(snapshot) {
  if (!snapshot) return [];
  if (Array.isArray(snapshot.records)) return snapshot.records.filter(v => v && typeof v === 'object');
  if (Array.isArray(snapshot.snapshot?.records)) return snapshot.snapshot.records.filter(v => v && typeof v === 'object');
  const cdp = snapshot.snapshot || snapshot;
  if (!Array.isArray(cdp.documents) || !Array.isArray(cdp.strings)) return [];
  const records = [];
  for (const doc of cdp.documents) {
    const nodes = doc.nodes || {};
    const names = nodes.nodeName || [];
    const values = nodes.nodeValue || [];
    const attrs = nodes.attributes || [];
    const parents = nodes.parentIndex || [];
    const grouped = new Map();
    for (let i = 0; i < names.length; i++) {
      const parent = parents[i] ?? -1;
      if (!grouped.has(parent)) grouped.set(parent, []);
      const attrObj = {};
      const encoded = attrs[i] || [];
      for (let p = 0; p < encoded.length; p += 2) attrObj[cdp.strings[encoded[p]]] = cdp.strings[encoded[p + 1]];
      grouped.get(parent).push({ tag: cdp.strings[names[i]] || '', text: cdp.strings[values[i]] || '', attributes: attrObj });
    }
    for (const siblings of grouped.values()) {
      if (siblings.length < 2) continue;
      const signatureGroups = new Map();
      for (const node of siblings) {
        const signature = `${node.tag}|${node.attributes.class || ''}`;
        if (!signatureGroups.has(signature)) signatureGroups.set(signature, []);
        signatureGroups.get(signature).push(node);
      }
      for (const group of signatureGroups.values()) {
        if (group.length >= 2) records.push(...group.map((node, index) => ({ index, text: node.text, ...node.attributes })));
      }
    }
  }
  return records;
}

function canonicalFieldName(key) {
  const lower = String(key).toLowerCase();
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some(a => lower.includes(a))) return canonical;
  }
  return lower.replace(/[^a-z0-9가-힣]+/g, '_').replace(/^_+|_+$/g, '') || 'value';
}

function inferStructure({ snapshot, url = '', networkEvents = [] } = {}) {
  const records = normalizeRecords(snapshot);
  const keyStats = new Map();
  records.forEach(record => {
    Object.entries(record).forEach(([key, value]) => {
      if (value == null || typeof value === 'object') return;
      const canonical = canonicalFieldName(key);
      const stat = keyStats.get(canonical) || { source_keys: new Set(), non_empty: 0, samples: [] };
      stat.source_keys.add(key);
      if (String(value).trim()) { stat.non_empty++; if (stat.samples.length < 3) stat.samples.push(value); }
      keyStats.set(canonical, stat);
    });
  });
  const fieldCandidates = [...keyStats.entries()].map(([name, stat]) => ({
    field_id: `field-${name}`,
    name,
    source_keys: [...stat.source_keys],
    confidence: records.length ? Math.min(1, stat.non_empty / records.length) : 0,
    samples: stat.samples,
    locator_candidates: [...stat.source_keys].map(key => `[data-field="${key}"]`).concat([`.${name}`, `[itemprop="${name}"]`])
  })).sort((a,b) => b.confidence - a.confidence || a.name.localeCompare(b.name));

  const paginationSignals = [];
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const text = String(value || '').trim();
      if (PAGINATION_TEXT.test(text) || /page|cursor|offset|next/i.test(key)) paginationSignals.push({ key, value });
    }
  }
  for (const event of networkEvents) {
    const candidate = event.payload?.request?.url || event.payload?.url || '';
    if (/[?&](page|cursor|offset|start)=/i.test(candidate)) paginationSignals.push({ key: 'network_url', value: candidate });
  }
  const repeatedRegion = records.length >= 2 ? {
    region_id: 'region-primary-list',
    record_count: records.length,
    confidence: Math.min(0.99, 0.6 + Math.min(records.length, 10) * 0.03),
    locator_candidates: ['[data-record]', '.item', 'article', 'li']
  } : null;
  const pageType = repeatedRegion ? 'LIST' : /detail|view|item/i.test(url) ? 'DETAIL' : 'UNKNOWN';
  return {
    schema_version: 'SITE_STRUCTURE_INFERENCE_V1',
    page_type: pageType,
    repeated_regions: repeatedRegion ? [repeatedRegion] : [],
    records,
    field_candidates: fieldCandidates,
    locator_candidates: fieldCandidates.flatMap(f => f.locator_candidates.map(locator => ({ field_id: f.field_id, locator }))),
    pagination: paginationSignals.length ? { decision: 'PAGINATION_DETECTED', signals: paginationSignals.slice(0, 20) } : { decision: 'EXPLICIT_NONE', signals: [] },
    visual_highlights: repeatedRegion ? records.map((_, index) => ({ region_id: repeatedRegion.region_id, record_index: index })) : []
  };
}

module.exports = { inferStructure, normalizeRecords };
