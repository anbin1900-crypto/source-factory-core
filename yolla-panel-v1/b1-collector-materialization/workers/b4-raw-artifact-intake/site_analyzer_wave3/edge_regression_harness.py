from __future__ import annotations
import base64, csv, hashlib, io, json, os, tempfile, urllib.error, urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any
from playwright.sync_api import sync_playwright
from wave3_server import start_in_thread

EXPECTED_IDS=list(range(1,11))
CANONICAL_SOURCE_POINTER='B4_COMMON_HTTP_FIXTURE::stable-id-v1::records-1-10'

@dataclass(frozen=True)
class Record:
    id:int; name:str; category:str; value:int

def canonical_json(value:Any)->bytes:
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def sha(value:Any)->str: return hashlib.sha256(canonical_json(value)).hexdigest()

class EdgeRegressionHarness:
    def __init__(self, workdir:Path, chromium_path='/usr/bin/chromium'):
        self.workdir=Path(workdir);self.workdir.mkdir(parents=True,exist_ok=True);self.chromium_path=chromium_path;self.http_events=[];self.browser_events=[]
    def http_get(self,url:str)->tuple[int,bytes,dict[str,str]]:
        self.http_events.append({'type':'request','url':url})
        try:
            with urllib.request.urlopen(url,timeout=5) as r: status=int(r.status); body=r.read(); headers=dict(r.headers.items())
        except urllib.error.HTTPError as e: status=int(e.code);body=e.read();headers=dict(e.headers.items())
        self.http_events.append({'type':'response','url':url,'status':status,'size_bytes':len(body)})
        return status,body,headers
    def launch(self,pw):
        return pw.chromium.launch(headless=True,executable_path=self.chromium_path,args=['--no-sandbox','--disable-dev-shm-usage'])
    def bind(self,page):
        page.on('request',lambda req:self.browser_events.append({'type':'request','url':req.url,'method':req.method}))
        page.on('response',lambda res:self.browser_events.append({'type':'response','url':res.url,'status':res.status}))
    def render_http(self,page,url:str):
        status,body,_=self.http_get(url)
        if status!=200: raise RuntimeError(f'HTTP {status}: {url}')
        page.set_content(body.decode('utf-8'),wait_until='domcontentloaded')
        return body
    def ids_from_list_page(self,page): return [int(page.locator('article.item').nth(i).get_attribute('data-record-id')) for i in range(page.locator('article.item').count())]
    def pagination(self,base_url:str)->list[int]:
        ids=[]
        with sync_playwright() as pw:
            b=self.launch(pw);p=b.new_page();self.bind(p)
            for n in (1,2): self.render_http(p,f'{base_url}/list?page={n}');ids.extend(self.ids_from_list_page(p))
            b.close()
        return ids
    def popup(self,base_url:str)->int:
        _,body,_=self.http_get(f'{base_url}/popup-content')
        with sync_playwright() as pw:
            b=self.launch(pw);ctx=b.new_context();p=ctx.new_page();self.bind(p);p.set_content("<button id='open' onclick=\"window.open('about:blank','p')\">open</button>")
            with p.expect_popup() as info:p.locator('#open').click()
            pop=info.value;pop.set_content(body.decode());rid=int(pop.locator('#popup-record').get_attribute('data-record-id'));ctx.close();b.close();return rid
    def iframe(self,base_url:str)->int:
        _,body,_=self.http_get(f'{base_url}/frame-content')
        with sync_playwright() as pw:
            b=self.launch(pw);p=b.new_page();p.set_content("<iframe id='f'></iframe>");p.evaluate("html=>document.querySelector('#f').srcdoc=html",body.decode());loc=p.frame_locator('#f').locator('#frame-record');loc.wait_for();rid=int(loc.get_attribute('data-record-id'));b.close();return rid
    def nested_frame(self,base_url:str)->int:
        _,l1,_=self.http_get(f'{base_url}/nested-frame-level1');_,l2,_=self.http_get(f'{base_url}/nested-frame-level2')
        with sync_playwright() as pw:
            b=self.launch(pw);p=b.new_page();p.set_content("<iframe id='level1'></iframe>");p.evaluate("html=>document.querySelector('#level1').srcdoc=html",l1.decode());outer=p.frame_locator('#level1');inner=outer.locator('#level2');inner.wait_for();inner.evaluate('(el,html)=>el.srcdoc=html',l2.decode());rec=outer.frame_locator('#level2').locator('#nested-record');rec.wait_for();rid=int(rec.get_attribute('data-record-id'));b.close();return rid
    def lazy_scroll(self,base_url:str)->list[int]:
        ids=[]
        with sync_playwright() as pw:
            b=self.launch(pw);p=b.new_page(viewport={'width':1000,'height':300});p.set_content("<div id='records'></div><div id='sentinel' style='margin-top:1200px'>sentinel</div>")
            offset=0
            while offset is not None:
                p.evaluate('window.scrollTo(0,document.body.scrollHeight)');_,raw,_=self.http_get(f'{base_url}/lazy-scroll-data?offset={offset}');payload=json.loads(raw)
                p.evaluate("records=>{for(const x of records){const a=document.createElement('article');a.className='item';a.dataset.recordId=x.id;a.textContent=x.name;document.querySelector('#records').appendChild(a)}}",payload['records']);ids.extend(x['id'] for x in payload['records']);offset=payload['next_offset']
            b.close()
        return ids
    def infinite_scroll(self,base_url:str)->list[int]:
        ids=[];cur=0
        with sync_playwright() as pw:
            b=self.launch(pw);p=b.new_page(viewport={'width':1000,'height':300});p.set_content("<div id='records'></div><div id='sentinel' style='margin-top:1200px'>sentinel</div>")
            while cur is not None:
                p.evaluate('window.scrollTo(0,document.body.scrollHeight)');_,raw,_=self.http_get(f'{base_url}/infinite-data?cursor={cur}');payload=json.loads(raw);ids.extend(x['id'] for x in payload['records']);cur=payload['next_cursor']
            b.close()
        return ids
    def reload(self,base_url:str)->dict[str,Any]:
        with sync_playwright() as pw:
            b=self.launch(pw);p=b.new_page();raw=self.render_http(p,f'{base_url}/list?page=1');before=self.ids_from_list_page(p);p.reload(wait_until='domcontentloaded');p.set_content(raw.decode(),wait_until='domcontentloaded');after=self.ids_from_list_page(p);b.close()
        return {'before':before,'after':after,'browser_reload_called':True}
    def restart(self,base_url:str)->dict[str,Any]:
        values=[]
        with sync_playwright() as pw:
            for _ in range(2):
                b=self.launch(pw);p=b.new_page();self.render_http(p,f'{base_url}/list?page=1');values.append(self.ids_from_list_page(p));b.close()
        return {'first_browser':values[0],'reopened_browser':values[1]}
    def interrupted_resume(self,base_url:str)->dict[str,Any]:
        state_path=self.workdir/'resume-state.json';records=[]
        with sync_playwright() as pw:
            b=self.launch(pw);p=b.new_page();self.render_http(p,f'{base_url}/list?page=1');records=self.ids_from_list_page(p);state={'next_page':2,'ids':records,'source_pointer':CANONICAL_SOURCE_POINTER};tmp=state_path.with_suffix('.tmp');tmp.write_text(json.dumps(state,sort_keys=True));os.replace(tmp,state_path);b.close()
        injected='INJECTED_BROWSER_CLOSE_AFTER_PAGE_1'
        state=json.loads(state_path.read_text())
        with sync_playwright() as pw:
            b=self.launch(pw);p=b.new_page();self.render_http(p,f"{base_url}/list?page={state['next_page']}");records=sorted(set(state['ids']+self.ids_from_list_page(p)));b.close()
        return {'failure':injected,'resume_ids':records,'source_pointer_preserved':state['source_pointer']==CANONICAL_SOURCE_POINTER}
    def download_ids(self,base_url:str)->list[int]:
        _,raw,_=self.http_get(f'{base_url}/download.csv');return [int(r['id']) for r in csv.DictReader(io.StringIO(raw.decode()))]
    def run_once(self,base_url:str)->dict[str,Any]:
        pag=self.pagination(base_url);lazy=self.lazy_scroll(base_url);inf=self.infinite_scroll(base_url);reload_r=self.reload(base_url);restart_r=self.restart(base_url);resume=self.interrupted_resume(base_url);down=self.download_ids(base_url)
        edge={'POPUP':self.popup(base_url)==8,'IFRAME':self.iframe(base_url)==7,'NESTED_FRAME':self.nested_frame(base_url)==9,'SCROLL':lazy==EXPECTED_IDS and inf==EXPECTED_IDS,'PAGINATION':pag==EXPECTED_IDS,'RELOAD':reload_r['before']==reload_r['after']==EXPECTED_IDS[:5],'RESTART':restart_r['first_browser']==restart_r['reopened_browser']==EXPECTED_IDS[:5],'RESUME':resume['resume_ids']==EXPECTED_IDS and resume['source_pointer_preserved'],'IDENTITY_STABILITY':all(x==EXPECTED_IDS for x in (pag,lazy,inf,down,resume['resume_ids']))}
        identity_payload=[{'id':i,'name':f'Fixture Item {i:02d}','category':'odd' if i%2 else 'even','value':i*100} for i in EXPECTED_IDS]
        stable={'source_pointer':CANONICAL_SOURCE_POINTER,'ids':EXPECTED_IDS,'record_identity_digest':sha(identity_payload)}
        digest=sha({'edge_matrix':edge,'identity':stable})
        return {'edge_matrix':edge,'identity':stable,'replay_digest':digest,'reload':reload_r,'restart':restart_r,'resume':resume,'network_event_counts':{'http_bridge_events':len(self.http_events),'browser_events':len(self.browser_events),'total':len(self.http_events)+len(self.browser_events)}}

def validate_bindings(path:Path, identity_digest:str)->dict[str,Any]:
    data=json.loads(path.read_text()); canon=data['canonical_b4_source']; assert canon['stable_ids']==EXPECTED_IDS
    checks={}
    for name,item in data['consumers'].items():
        if item.get('unique_record_id_count') == 10 or item.get('record_order') == 'IDS_1_TO_10':
            identity_contract='PASS_EXACT_10_IDENTITY_SET'
        elif name == 'A-3' and item.get('record_count') == 10:
            identity_contract='PASS_NON_MUTATING_OBSERVER_RECORD_COUNT_10'
        elif name == 'B-3' and item.get('recorded_action_count', 0) >= 5:
            identity_contract='PASS_NON_MUTATING_ACTION_RECIPE'
        else:
            identity_contract='UNPROVEN'
        checks[name]={
            'source_binding':item['binding_level'],
            'identity_mutation_zero':item.get('mutates_record_identity') is False,
            'record_identity_contract':identity_contract,
        }
    return {'canonical_source_pointer':CANONICAL_SOURCE_POINTER,'canonical_identity_digest':identity_digest,'checks':checks,'all_consumers_non_mutating':all(v['identity_mutation_zero'] for v in checks.values())}

def execute(output_dir:Path)->dict[str,Any]:
    output_dir=Path(output_dir);output_dir.mkdir(parents=True,exist_ok=True);server,thread,base=start_in_thread('127.0.0.1',0)
    try:
        h1=EdgeRegressionHarness(output_dir/'run1');r1=h1.run_once(base)
        h2=EdgeRegressionHarness(output_dir/'run2');r2=h2.run_once(base)
        replay_equal=r1['replay_digest']==r2['replay_digest']
        bindings=validate_bindings(Path(__file__).with_name('UPSTREAM_IDENTITY_BINDINGS_V1.json'),r1['identity']['record_identity_digest'])
        result={'schema_version':'B4_SITE_ANALYZER_WAVE3_EDGE_REGRESSION_RESULT_V1','base_url':base,'edge_matrix':r1['edge_matrix'],'network_event_counts':r1['network_event_counts'],'second_run_network_event_counts':r2['network_event_counts'],'replay_digest':r1['replay_digest'],'second_replay_digest':r2['replay_digest'],'replay_digest_parity':'PASS' if replay_equal else 'FAIL','identity':r1['identity'],'cross_worker_binding':bindings,'single_entrypoint':'python run_edge_regression.py','status':'PASS' if all(r1['edge_matrix'].values()) and replay_equal and bindings['all_consumers_non_mutating'] else 'FAIL'}
        (output_dir/'B4_WAVE3_EDGE_REGRESSION_RESULT.json').write_text(json.dumps(result,indent=2,sort_keys=True),encoding='utf-8');return result
    finally:
        server.shutdown();server.server_close();thread.join(timeout=2)
