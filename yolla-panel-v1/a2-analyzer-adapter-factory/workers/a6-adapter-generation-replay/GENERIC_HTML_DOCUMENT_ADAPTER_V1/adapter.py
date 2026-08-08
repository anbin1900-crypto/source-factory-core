import hashlib, json, re, unicodedata
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

AUTH={"authority_comment":"#17/5189632712","authority_commit":"545425a10d48bf59746d8db98ff2f56b79360cc0","authority_blob":"21e6ca23ccc8027e6b93cadda7f260d08153622a","authority_pointer_blob":"b5b9e2aaec5b3f774e121fa33eaf8d4c1da47da5","route_binding_blob":"e613036257babe24f7bb03ef6bcdc81a68d6a013"}
DROP={"script","style","noscript","template"}
SECRET=[re.compile(x,re.I) for x in [r"\bBearer\s+[\w._~+/=-]{8,}\b",r"\b(?:api[_-]?key|password|secret)\s*[:=]\s*[^\s<]{4,}",r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b",r"\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b",r"\b\d{6}-?[1-4]\d{6}\b"]]
class AdapterError(ValueError): pass
class Parser(HTMLParser):
 def __init__(self): super().__init__(convert_charrefs=True); self.d=0; self.t=[]; self.l=[]
 def handle_starttag(self,tag,attrs):
  tag=tag.lower()
  if tag in DROP: self.d+=1; return
  if not self.d and tag=="a":
   for k,v in attrs:
    if k.lower()=="href" and v: self.l.append(v); break
 def handle_endtag(self,tag):
  if tag.lower() in DROP and self.d: self.d-=1
 def handle_data(self,data):
  if not self.d and data: self.t.append(data)
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))
def sha(b): return hashlib.sha256(b).hexdigest()
def norm_text(parts):
 s=unicodedata.normalize("NFC"," ".join(parts)); s=re.sub(r"\s+"," ",s).strip()
 for p in SECRET: s=p.sub("[REDACTED]",s)
 return s
def norm_link(base,href):
 u=urlsplit(urljoin(base,href)); scheme=u.scheme.lower(); host=(u.hostname or "").lower()
 if scheme not in {"http","https"} or not host: return None
 port=u.port
 if (scheme,port) in {("http",80),("https",443)}: port=None
 return urlunsplit((scheme,host if port is None else f"{host}:{port}",u.path or "/",u.query,""))
def replay(f, routes):
 need={"request_profile_id","requested_url","final_url","http_status","content_type","fetched_at","raw_html"}
 if need-set(f): raise AdapterError("A5_GENERIC_HTML_SCHEMA_VALIDATION_FAILED")
 pid=f["request_profile_id"]
 if pid not in routes: raise AdapterError("A5_GENERIC_HTML_PROFILE_NOT_AUTHORIZED")
 if f["requested_url"]!=routes[pid]: raise AdapterError("A5_GENERIC_HTML_ROUTE_BINDING_MISMATCH")
 if not re.match(r"^text/html(?:\s*;.*)?$",f["content_type"],re.I): raise AdapterError("A5_GENERIC_HTML_CONTENT_TYPE_MISMATCH")
 raw=f["raw_html"].encode();
 if len(raw)>10485760: raise AdapterError("A5_GENERIC_HTML_RESPONSE_TOO_LARGE")
 p=Parser(); p.feed(raw.decode()); p.close(); text=norm_text(p.t)
 links=sorted({x for h in p.l if (x:=norm_link(f["final_url"],h))})
 red={"html_document_text":text,"outbound_links":links}
 return {"request_profile_id":pid,"requested_url":f["requested_url"],"final_url":f["final_url"],"http_status":int(f["http_status"]),"content_type":f["content_type"],"fetched_at":f["fetched_at"],"response_size_bytes":len(raw),"raw_sha256":sha(raw),"redacted_sha256":sha(canon(red).encode()),"html_document_text":text,"outbound_links":links,"source_authority_pointer":AUTH}
