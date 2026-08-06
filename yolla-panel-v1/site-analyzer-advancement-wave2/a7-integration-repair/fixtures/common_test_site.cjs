'use strict';
const http = require('node:http');
const os = require('node:os');

function makeItems(page = 1) {
  const start = (page - 1) * 10 + 1;
  return Array.from({ length: 10 }, (_, index) => {
    const id = start + index;
    return {
      id,
      title: `Fixture Item ${id}`,
      price: 1000 + id * 10,
      address: id % 2 ? 'Seoul' : 'Busan',
      description: `Common test record ${id}`,
      date: '2026-08-07'
    };
  });
}

function buildCommonTestHtml({ transport = 'http' } = {}) {
  const embeddedItems = JSON.stringify(makeItems(1));
  const fetchExpression = transport === 'data'
    ? `fetch('data:application/json,' + encodeURIComponent(JSON.stringify({items: ${embeddedItems}})))`
    : `fetch('/api/items?page=' + page)`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>YOLLA Common Test Site</title></head>
<body>
  <h1>YOLLA Site Analyzer Fixture</h1>
  <button data-action="load">Load</button>
  <button data-action="next" rel="next">다음</button>
  <a data-action="popup" href="/popup" target="_blank">Popup</a>
  <a data-action="download" href="/download.csv" download>Download</a>
  <iframe data-action="frame" src="/frame"></iframe>
  <main id="records"></main>
<script>
const root = document.getElementById('records');
async function loadPage(page = 1, append = false) {
  const response = await ${fetchExpression};
  const payload = await response.json();
  if (!append) root.innerHTML = '';
  for (const item of payload.items) {
    const article = document.createElement('article');
    article.setAttribute('data-record', String(item.id));
    article.innerHTML = '<span data-field="id">' + item.id + '</span>' +
      '<span data-field="title">' + item.title + '</span>' +
      '<span data-field="price">' + item.price + '</span>' +
      '<span data-field="address">' + item.address + '</span>' +
      '<span data-field="description">' + item.description + '</span>' +
      '<span data-field="date">' + item.date + '</span>';
    root.appendChild(article);
  }
  console.log('loaded-page', page, payload.items.length);
  return payload.items.length;
}
document.querySelector('[data-action="load"]').addEventListener('click', () => loadPage(1));
document.querySelector('[data-action="next"]').addEventListener('click', () => loadPage(2, true));
window.__fixtureReady = loadPage(1).then(() => true);
</script>
</body></html>`;
}

async function startCommonTestSite() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(buildCommonTestHtml());
      return;
    }
    if (url.pathname === '/api/items') {
      const page = Number(url.searchParams.get('page') || '1');
      const body = JSON.stringify({ page, next: page < 2 ? page + 1 : null, items: makeItems(page) });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    if (url.pathname === '/frame') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><p data-field="frame_value">Frame Ready</p>');
      return;
    }
    if (url.pathname === '/popup') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><h2>Popup Ready</h2>');
      return;
    }
    if (url.pathname === '/download.csv') {
      res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="fixture.csv"' });
      res.end('id,title\n1,Fixture Item 1\n');
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', resolve);
  });
  const address = server.address();
  const interfaces = os.networkInterfaces();
  const host = Object.values(interfaces).flat().find(info => info && info.family === 'IPv4' && !info.internal)?.address || '127.0.0.1';
  return {
    server,
    url: `http://${host}:${address.port}/`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

module.exports = { startCommonTestSite, makeItems, buildCommonTestHtml };
