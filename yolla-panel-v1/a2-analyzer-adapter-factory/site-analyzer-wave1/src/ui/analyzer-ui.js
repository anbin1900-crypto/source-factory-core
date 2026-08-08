const fixture = `<main><article data-record data-id="1"><h3 data-field="title">Alpha</h3><span data-field="price">100</span><span data-field="address">Seoul</span><span data-field="category">Office</span><span data-field="updatedAt">2026-08-07</span></article><article data-record data-id="2"><h3 data-field="title">Beta</h3><span data-field="price">200</span><span data-field="address">Busan</span><span data-field="category">Retail</span><span data-field="updatedAt">2026-08-07</span></article></main>`;
const api = window.analyzerAPI;
const query = new URLSearchParams(location.search);
document.querySelector('#modeBadge').textContent = query.get('mode') || 'embedded';

function render(result) {
  document.querySelector('#browserSurface').innerHTML = fixture;
  document.querySelector('#fieldList').innerHTML = result.structure.fields.map((f) => `<label><input type="checkbox" checked> ${f.name} <code>${f.locator}</code></label><br>`).join('');
  document.querySelector('#timeline').innerHTML = result.timeline.map((e) => `<li>${e.owner} · ${e.module}</li>`).join('');
  const columns = result.preview.columns;
  document.querySelector('#preview').innerHTML = `<thead><tr>${columns.map((c) => `<th contenteditable>${c}</th>`).join('')}</tr></thead><tbody>${result.preview.records.map((r) => `<tr>${columns.map((c) => `<td contenteditable>${r[c] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
  document.querySelector('#workflow').textContent = JSON.stringify(result.adapter.recipe, null, 2);
  document.querySelector('#code').textContent = result.adapter.source;
  document.querySelector('#trace').textContent = JSON.stringify(result.replay.trace, null, 2);
}

document.querySelector('#runButton').addEventListener('click', async () => {
  if (!api) {
    document.querySelector('#trace').textContent = 'Electron preload API가 연결되지 않았습니다.';
    return;
  }
  const site = { id: 'ui-fixture', url: 'fixture://catalog', title: 'Analyzer UI Fixture' };
  try { await api.registerSite(site); } catch {}
  const result = await api.run(site.id, { html: fixture, actions: [{ id: 'click-1', type: 'click', locator: 'article[data-record]:first-child' }] });
  render(result);
});
