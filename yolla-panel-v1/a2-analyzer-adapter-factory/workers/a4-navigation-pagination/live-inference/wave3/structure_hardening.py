from __future__ import annotations
import hashlib, json, re
from dataclasses import dataclass
from typing import Any

NEXT_RE = re.compile(r'^(next|다음|›|»|>)$', re.I)
MORE_RE = re.compile(r'(load\s*more|more\s*results|더\s*보기|더보기)', re.I)
PRICE_RE = re.compile(r'(?:₩|\$|€|£|¥)?\s*\d[\d,]*(?:\.\d+)?\s*(?:원|만원|억원|usd|krw|달러)?', re.I)
DATE_RE = re.compile(r'(?:20\d{2}[-./년]\s*\d{1,2}[-./월]\s*\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]20\d{2})')
ADDR_RE = re.compile(r'(시|군|구|읍|면|동|로|길|street|st\.|road|rd\.|avenue|ave\.)', re.I)

def sha(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def ws(v: Any) -> str:
    return re.sub(r'\s+', ' ', str(v or '')).strip()

def css_escape(value: str) -> str:
    return re.sub(r'([^a-zA-Z0-9_-])', lambda m: '\\' + m.group(1), value)

def attrs_from_flat(values: list[str]) -> dict[str, str]:
    return {str(values[i]): str(values[i + 1]) for i in range(0, len(values) - 1, 2)}

def unpack_cdp_snapshot(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    strings = snapshot.get('strings') or []
    result: list[dict[str, Any]] = []
    for doc_index, doc in enumerate(snapshot.get('documents') or []):
        nodes = doc.get('nodes') or {}; layout = doc.get('layout') or {}
        bounds_map = {int(idx): bounds for idx, bounds in zip(layout.get('nodeIndex') or [], layout.get('bounds') or [])}
        names = nodes.get('nodeName') or []; parents = nodes.get('parentIndex') or []; backends = nodes.get('backendNodeId') or []
        node_values = nodes.get('nodeValue') or []; attr_rows = nodes.get('attributes') or []
        doc_url_idx = doc.get('documentURL'); doc_url = strings[doc_url_idx] if isinstance(doc_url_idx, int) and 0 <= doc_url_idx < len(strings) else ''
        frame_id_idx = doc.get('frameId'); frame_id = strings[frame_id_idx] if isinstance(frame_id_idx, int) and 0 <= frame_id_idx < len(strings) else f'doc-{doc_index}'
        ids = [f'{frame_id}:{backends[i] if i < len(backends) else i}' for i in range(len(names))]
        for i, name_idx in enumerate(names):
            tag = str(strings[name_idx] if isinstance(name_idx, int) and name_idx < len(strings) else '').lstrip('#').lower()
            raw_attrs = attr_rows[i] if i < len(attr_rows) else []; flat: list[str] = []
            for token in raw_attrs: flat.append(str(strings[token] if isinstance(token, int) and token < len(strings) else token))
            attrs = attrs_from_flat(flat); parent_index = parents[i] if i < len(parents) else -1
            value_idx = node_values[i] if i < len(node_values) else None; value = strings[value_idx] if isinstance(value_idx, int) and 0 <= value_idx < len(strings) else ''
            result.append({'id': ids[i], 'parent_id': ids[parent_index] if isinstance(parent_index, int) and 0 <= parent_index < len(ids) else None, 'doc_index': doc_index, 'frame_id': frame_id, 'document_url': doc_url, 'tag': tag, 'text': ws(value), 'attributes': attrs, 'bounds': bounds_map.get(i), 'visible': i in bounds_map or tag not in {'script','style','meta','link','#text'}, 'source_index': i})
    return result

def build_tree(nodes: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    by_id = {n['id']: {**n, 'children': []} for n in nodes}; roots = []
    for n in by_id.values():
        pid = n.get('parent_id')
        if pid and pid in by_id: by_id[pid]['children'].append(n)
        else: roots.append(n)
    return by_id, roots

def descendants(n: dict[str, Any]) -> list[dict[str, Any]]:
    out, q = [], list(n.get('children') or [])
    while q:
        x = q.pop(0); out.append(x); q[0:0] = list(x.get('children') or [])
    return out

def full_text(n: dict[str, Any]) -> str:
    return ws(' '.join([n.get('text') or ''] + [x.get('text') or '' for x in descendants(n)]))

def classes(n: dict[str, Any]) -> list[str]:
    return sorted([x for x in ws((n.get('attributes') or {}).get('class')).split(' ') if x])

def signature(n: dict[str, Any], depth: int = 2) -> str:
    head = n.get('tag', '') + ''.join('.' + x for x in classes(n)[:4])
    if not depth: return head
    return head + '[' + '|'.join(signature(c, depth - 1) for c in (n.get('children') or [])[:12]) + ']'

def stable_item_key(n: dict[str, Any]) -> str:
    attrs = n.get('attributes') or {}
    for key in ('data-record-id','data-id','itemid','id'):
        if attrs.get(key): return f'{key}:{attrs[key]}'
    links = [x for x in [n, *descendants(n)] if x.get('tag') == 'a' and (x.get('attributes') or {}).get('href')]
    if links: return 'href:' + str((links[0].get('attributes') or {}).get('href'))
    return 'text:' + full_text(n)[:240]

def semantic_css(n: dict[str, Any]) -> str:
    a = n.get('attributes') or {}; tag = n.get('tag') or '*'
    if a.get('id'): return f"{tag}#{css_escape(a['id'])}"
    for k in ('data-testid','data-test','data-qa','data-field'):
        if a.get(k): return f'{tag}[{k}={json.dumps(a[k])}]'
    cs = [x for x in classes(n) if not re.search(r'\d{3,}', x)][:2]
    return tag + ''.join('.' + css_escape(x) for x in cs)

def repeated_regions(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id, _ = build_tree(nodes); regions = []
    for parent in by_id.values():
        kids = [k for k in parent['children'] if k.get('visible') and k.get('tag') not in {'script','style'}]
        if len(kids) < 2: continue
        groups: dict[str, list[dict[str, Any]]] = {}
        for k in kids: groups.setdefault(signature(k), []).append(k)
        for sig, items in groups.items():
            if len(items) < 2: continue
            rich = [i for i in items if i.get('tag') in {'li','article','tr'} or parent.get('tag') in {'ul','ol','tbody','table'} or len(descendants(i)) >= 2]
            if len(rich) < 2: continue
            unique: dict[str, dict[str, Any]] = {}; duplicates = 0
            for item in rich:
                key = stable_item_key(item)
                if key in unique: duplicates += 1
                else: unique[key] = item
            if len(unique) < 2: continue
            regions.append({'region_id': f"region-{sha([parent['id'], sig])[:12]}", 'parent_node_id': parent['id'], 'parent_tag': parent.get('tag'), 'item_node_ids': [x['id'] for x in unique.values()], 'item_keys': list(unique.keys()), 'raw_item_count': len(rich), 'unique_item_count': len(unique), 'duplicate_item_count': duplicates, 'confidence': round(min(.99, .55 + .05 * len(unique) + (.15 if parent.get('tag') in {'main','ul','ol','tbody','table'} else 0)), 4), 'semantic_locator': semantic_css(parent), 'frame_id': parent.get('frame_id'), 'document_url': parent.get('document_url')})
    return sorted(regions, key=lambda r: (-r['confidence'], -r['unique_item_count'], r['region_id']))

def field_name(n: dict[str, Any], root: dict[str, Any] | None = None) -> str:
    a = n.get('attributes') or {}; t = full_text(n)
    if root is n and a.get('data-record-id'): return 'record_id'
    if a.get('data-field'): return a['data-field']
    cs = classes(n)
    for known in ('name','title','category','value','price','address','date','description','detail'):
        if known in cs: return 'detail_url' if known == 'detail' and n.get('tag') == 'a' else known
    if n.get('tag') == 'a': return 'detail_url'
    if n.get('tag') == 'img': return 'image'
    if re.match(r'^h[1-6]$', n.get('tag','')): return 'title'
    if PRICE_RE.search(t): return 'price'
    if DATE_RE.search(t): return 'date'
    if ADDR_RE.search(t): return 'address'
    return a.get('itemprop') or a.get('name') or f"text_{n.get('tag','field')}"

def node_value(n: dict[str, Any]) -> str:
    a = n.get('attributes') or {}
    if n.get('tag') == 'a': return a.get('href') or full_text(n)
    if n.get('tag') == 'img': return a.get('src') or a.get('alt') or ''
    return full_text(n)

def field_candidates(region: dict[str, Any] | None, nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not region: return []
    by_id, _ = build_tree(nodes); items = [by_id[i] for i in region['item_node_ids'] if i in by_id]
    if not items: return []
    first = items[0]; out = []; seen = set()
    if (first.get('attributes') or {}).get('data-record-id'):
        out.append({'field_id':'field-1','name':'record_id','value_type':'attribute','relative_locator':'[data-record-id]','sample_values':[(x.get('attributes') or {}).get('data-record-id','') for x in items[:3]],'coverage':1.0,'source_node_id':first['id'],'confidence':.99}); seen.add('record_id')
    for n in [first, *descendants(first)]:
        if not n.get('visible') or n.get('tag') in {'script','style'}: continue
        val = node_value(n)
        if len(ws(val)) < 1: continue
        nm = field_name(n, first)
        if nm in seen or (n is first and nm != 'record_id'): continue
        locator = semantic_css(n); vals = []
        for item in items:
            cand = [x for x in [item, *descendants(item)] if semantic_css(x) == locator and field_name(x, item) == nm]
            if cand: vals.append(node_value(cand[0]))
        coverage = len([v for v in vals if ws(v)]) / len(items)
        if coverage < .5: continue
        out.append({'field_id':f'field-{len(out)+1}','name':nm,'value_type':'url' if n.get('tag') == 'a' else 'text','relative_locator':locator,'sample_values':vals[:3],'coverage':round(coverage,4),'source_node_id':n['id'],'confidence':round(min(.99,.55+.4*coverage),4)}); seen.add(nm)
    return out

def locator_candidates(fields: list[dict[str, Any]], nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id, _ = build_tree(nodes); out = []; seen = set()
    for f in fields:
        n = by_id.get(f['source_node_id'])
        if not n: continue
        a = n.get('attributes') or {}; text = full_text(n)[:120]; candidates = []
        css = semantic_css(n); candidates.append(('css', f'locator({json.dumps(css)})', .92 if ('#' in css or '[' in css or '.' in css) else .68))
        if n.get('tag') == 'a' and text: candidates.append(('role', f"getByRole('link', {{ name: {json.dumps(text)} }})", .96))
        if a.get('aria-label'): candidates.append(('label', f"getByLabel({json.dumps(a['aria-label'])})", .95))
        if text and len(text) <= 80: candidates.append(('text', f"getByText({json.dumps(text)}, {{ exact: true }})", .8))
        for strategy, loc, conf in candidates:
            key = (f['name'], strategy, loc)
            if key in seen: continue
            seen.add(key); out.append({'field_id':f['field_id'],'field_name':f['name'],'strategy':strategy,'locator':loc,'confidence':conf,'stable':':nth-' not in loc})
    return out

def detect_pagination(nodes: list[dict[str, Any]], events: list[dict[str, Any]], dynamic_growth: int = 0) -> dict[str, Any]:
    controls = [n for n in nodes if n.get('visible') and n.get('tag') in {'a','button'}]
    for n in controls:
        text = full_text(n); a = n.get('attributes') or {}
        if a.get('rel') == 'next' or NEXT_RE.match(text): return {'type':'NEXT','detected':True,'locator':semantic_css(n),'target':a.get('href'),'confidence':.97}
    for n in controls:
        if MORE_RE.search(full_text(n)): return {'type':'LOAD_MORE','detected':True,'locator':semantic_css(n),'confidence':.96}
    nums = []
    for n in controls:
        a = n.get('attributes') or {}; txt = full_text(n); href = str(a.get('href') or '')
        m = re.search(r'[?&]page=(\d{1,4})', href)
        page_token = a.get('data-page') or (m.group(1) if m else None) or (txt if re.fullmatch(r'\d{1,4}', txt) else None)
        if page_token is not None and str(page_token).isdigit(): nums.append((n, int(page_token)))
    uniq_pages = sorted({x[1] for x in nums})
    if len(uniq_pages) >= 2: return {'type':'PAGE_NUMBER','detected':True,'locators':[semantic_css(n) for n,_ in nums],'pages':uniq_pages,'confidence':.95}
    if dynamic_growth > 0 and any('scroll' in str(e.get('type','')).lower() for e in events): return {'type':'INFINITE_SCROLL','detected':True,'growth':dynamic_growth,'confidence':.94}
    curs = []
    for e in events:
        u = str(e.get('url') or e.get('request_url') or e.get('target') or ''); m = re.search(r'[?&](?:cursor|after|before)=([^&#]+)', u)
        if m: curs.append(m.group(1))
    if curs: return {'type':'CURSOR','detected':True,'cursor':curs[-1],'observed_cursors':curs,'confidence':.92}
    return {'type':'NONE','detected':False,'explicit_none':True,'confidence':.75}

def loop_fingerprint(result: dict[str, Any]) -> str:
    p = result.get('pagination') or {}; region = (result.get('repeated_regions') or [{}])[0]
    return sha({'url':result.get('document_url'),'pagination':p.get('type'),'target':p.get('target'),'cursor':p.get('cursor'),'items':region.get('item_keys',[])})

@dataclass
class LoopGuard:
    seen: set[str]
    def __init__(self): self.seen = set()
    def check(self, result: dict[str, Any]) -> dict[str, Any]:
        fp = loop_fingerprint(result); repeated = fp in self.seen; self.seen.add(fp)
        return {'fingerprint':fp,'stop':repeated,'reason':'REPEATED_PAGINATION_STATE' if repeated else 'CONTINUE','seen_count':len(self.seen)}

def infer_snapshot(snapshot: dict[str, Any], events: list[dict[str, Any]] | None = None, dynamic_growth: int = 0) -> dict[str, Any]:
    events = events or []; nodes = unpack_cdp_snapshot(snapshot); regions = repeated_regions(nodes); primary = regions[0] if regions else None
    fields = field_candidates(primary, nodes); locs = locator_candidates(fields, nodes); pagination = detect_pagination(nodes, events, dynamic_growth)
    doc_url = nodes[0].get('document_url') if nodes else ''
    result = {'schema_version':'A4_A6_DETERMINISTIC_STRUCTURE_INPUT_V3','document_url':doc_url,'repeated_regions':regions,'field_candidates':fields,'locator_candidates':locs,'pagination':pagination,'highlight_payload':{'highlights':[{'kind':'region','locator':r['semantic_locator'],'label':f"{r['unique_item_count']} unique items"} for r in regions[:3]] + [{'kind':'field','locator':f['relative_locator'],'label':f['name']} for f in fields[:20]]},'stats':{'node_count':len(nodes),'region_count':len(regions),'field_count':len(fields),'locator_count':len(locs)}}
    result['result_sha256'] = sha(result); return result

def merge_dynamic(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    fields = {f['name']: f for f in before.get('field_candidates', [])}
    for f in after.get('field_candidates', []): fields[f['name']] = f
    before_l = {(l['field_name'], l['strategy']): l['locator'] for l in before.get('locator_candidates', [])}; after_l = {(l['field_name'], l['strategy']): l['locator'] for l in after.get('locator_candidates', [])}
    stable = sorted([k for k, v in before_l.items() if after_l.get(k) == v])
    return {'field_names':sorted(fields),'stable_locator_keys':[list(k) for k in stable],'stable_locator_count':len(stable),'before_digest':before.get('result_sha256'),'after_digest':after.get('result_sha256')}
