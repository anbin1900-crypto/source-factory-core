'use strict';
const http = require('node:http');
const { once } = require('node:events');
const records = Array.from({length: 10}, (_, i) => ({
  listingId: `L${String(i + 1).padStart(2, '0')}`,
  regionId: i < 5 ? 'R1' : 'R2',
  title: `Apartment ${i + 1}`,
  price: 100000000 + (i + 1) * 10000000,
  address: `Seoul Test-ro ${i + 1}`,
  detailUrl: `/details/${i + 1}`
}));
function htmlPage(baseUrl) {
  const cards = records.map(r => `<article class="property-card listing-card" data-id="${r.listingId}"><a class="title" href="${r.detailUrl}">${r.title}</a><span class="price">${r.price}</span><p class="address">${r.address}</p><span class="region">${r.regionId}</span></article>`).join('');
  return `<!doctype html><html><body><h1>Apartments</h1><input data-testid="keyword-input"><select data-testid="region-select"><option value="seoul">Seoul</option></select><button data-testid="search-submit-new">Search</button><section class="results-grid">${cards}</section><a data-testid="details-link" href="${baseUrl}/details/1">Details</a><iframe data-testid="result-frame" src="${baseUrl}/details/1"></iframe></body></html>`;
}
async function startServer(port = 0) {
  const requestLog = [];
  let failOnce = true;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    requestLog.push({method:req.method, path:url.pathname, search:url.search, at:new Date().toISOString()});
    const send = (status, body, type='application/json') => { res.writeHead(status, {'content-type': type, 'cache-control':'no-store'}); res.end(type.includes('json') ? JSON.stringify(body) : body); };
    if (url.pathname === '/search') return send(200, htmlPage(`http://${req.headers.host}`), 'text/html; charset=utf-8');
    if (url.pathname === '/api/listing') return send(404, {error:'stale endpoint; use /api/listings'});
    if (url.pathname === '/api/listings') {
      const page = Number(url.searchParams.get('page') || '1');
      const size = Number(url.searchParams.get('size') || '5');
      if (url.searchParams.get('inject') === 'transient' && failOnce) { failOnce=false; return send(503,{error:'transient'}); }
      const start=(page-1)*size, items=records.slice(start,start+size);
      return send(200,{page,size,items,lastPage:start+size>=records.length});
    }
    const detail = url.pathname.match(/^\/details\/(\d+)$/);
    if (detail) { const item=records[Number(detail[1])-1]; return item ? send(200,{item}) : send(404,{error:'not found'}); }
    return send(404,{error:'not found'});
  });
  server.listen(port,'127.0.0.1'); await once(server,'listening');
  const address=server.address();
  return {server, baseUrl:`http://127.0.0.1:${address.port}`, requestLog, records};
}
module.exports={startServer,records};
if (require.main===module) startServer(Number(process.env.PORT||0)).then(({baseUrl})=>console.log(baseUrl));
