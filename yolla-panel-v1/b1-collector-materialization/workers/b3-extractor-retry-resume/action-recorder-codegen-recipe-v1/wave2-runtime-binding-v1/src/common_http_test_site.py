from __future__ import annotations

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from typing import Iterator


LIST_HTML = """<!doctype html>
<html><head><meta charset='utf-8'><title>YOLLA Analyzer Test</title>
<style>body{font-family:sans-serif;min-height:1400px}.card{margin-top:700px;padding:16px;border:1px solid #ccc}</style></head>
<body>
<h1>Analyzer Test Listings</h1>
<label>Keyword <input id='keyword' data-testid='keyword-input' aria-label='Keyword'></label>
<button id='search-btn' data-testid='search-submit' aria-label='Search'>Search</button>
<div id='search-status'>idle</div>
<div class='card'>
<a id='detail-link' data-testid='detail-open' aria-label='Open detail' href='about:blank' target='_blank' onclick="window.open('about:blank','_blank'); return false;">Open Detail</a>
</div>
<script>
document.querySelector('#search-btn').addEventListener('click',()=>{
 const value=document.querySelector('#keyword').value;
 document.querySelector('#search-status').textContent='searched:'+value;
});
</script>
</body></html>"""

DETAIL_HTML = """<!doctype html>
<html><head><meta charset='utf-8'><title>Detail</title></head>
<body><h1>Detail 1</h1><iframe id='details-frame' data-yolla-frame='details-frame' src='frame.html'></iframe></body></html>"""

FRAME_HTML = """<!doctype html>
<html><head><meta charset='utf-8'><title>Frame</title></head>
<body><button id='frame-action' data-testid='frame-action' aria-label='Load frame detail'>Load Frame Detail</button>
<div id='frame-status'>idle</div>
<script>document.querySelector('#frame-action').addEventListener('click',()=>document.querySelector('#frame-status').textContent='loaded');</script>
</body></html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith('/detail'):
            body = DETAIL_HTML
        elif self.path.startswith('/frame'):
            body = FRAME_HTML
        elif self.path == '/health':
            body = 'ok'
        else:
            body = LIST_HTML
        payload = body.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:
        return


@contextmanager
def running_site() -> Iterator[str]:
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        yield f'http://{host}:{port}'
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()
