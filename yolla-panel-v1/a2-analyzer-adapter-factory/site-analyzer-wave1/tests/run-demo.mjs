import { AnalyzerCore } from '../src/analyzer-core.mjs';
const html = `<article data-record data-id="1"><span data-field="title">Demo</span><span data-field="price">100</span><span data-field="address">Seoul</span><span data-field="category">Office</span><span data-field="updatedAt">2026-08-07</span></article>`;
const core = new AnalyzerCore({ sharedStateId: 'demo' });
core.registerSite({ id: 'demo', url: 'fixture://demo' });
const result = await core.runSiteAnalysis('demo', { html });
console.log(JSON.stringify(result.metrics, null, 2));
