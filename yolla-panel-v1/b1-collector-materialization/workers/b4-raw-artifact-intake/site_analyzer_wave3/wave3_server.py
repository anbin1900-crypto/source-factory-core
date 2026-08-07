from __future__ import annotations
import importlib.util, json, sys, threading, urllib.parse
from pathlib import Path
from http.server import ThreadingHTTPServer

WAVE2_SERVER_PATH = Path(__file__).resolve().parents[1] / 'site_analyzer_wave2' / 'fixture_site' / 'server.py'
spec = importlib.util.spec_from_file_location('b4_wave2_server', WAVE2_SERVER_PATH)
if spec is None or spec.loader is None: raise RuntimeError('cannot load wave2 fixture server')
wave2 = importlib.util.module_from_spec(spec); sys.modules[spec.name]=wave2; spec.loader.exec_module(wave2)
ITEMS=wave2.ITEMS

class Wave3FixtureHandler(wave2.FixtureHandler):
    server_version='YollaFixtureSite/3.0'
    def do_GET(self):
        parsed=urllib.parse.urlparse(self.path); query=urllib.parse.parse_qs(parsed.query); path=parsed.path
        if path=='/nested-frame':
            self._send(200,wave2._html_page('Nested Host',"<iframe id='level1' src='/nested-frame-level1'></iframe>"),'text/html; charset=utf-8');return
        if path=='/nested-frame-level1':
            self._send(200,wave2._html_page('Nested L1',"<iframe id='level2' src='/nested-frame-level2'></iframe>"),'text/html; charset=utf-8');return
        if path=='/nested-frame-level2':
            self._send(200,wave2._html_page('Nested L2',"<article id='nested-record' data-record-id='9'>Fixture Item 09</article>"),'text/html; charset=utf-8');return
        if path=='/lazy-scroll':
            self._send(200,wave2._html_page('Lazy Scroll',"<div id='records'></div><div id='sentinel'>sentinel</div><div id='status'></div>"),'text/html; charset=utf-8');return
        if path=='/lazy-scroll-data':
            offset=max(0,int(query.get('offset',['0'])[0])); records=[wave2.asdict(x) for x in ITEMS[offset:offset+2]]; nxt=offset+2 if offset+2<len(ITEMS) else None
            self._send(200,wave2._json_bytes({'records':records,'next_offset':nxt}),'application/json');return
        if path=='/identity-manifest':
            self._send(200,wave2._json_bytes({'source_key':'B4_COMMON_HTTP_FIXTURE','stable_ids':[x.id for x in ITEMS],'record_count':len(ITEMS)}),'application/json');return
        super().do_GET()

def create_server(host='127.0.0.1',port=0): return ThreadingHTTPServer((host,port),Wave3FixtureHandler)
def start_in_thread(host='127.0.0.1',port=0):
    server=create_server(host,port); thread=threading.Thread(target=server.serve_forever,name='b4-wave3-http',daemon=True);thread.start();return server,thread,f'http://{host}:{server.server_address[1]}'
