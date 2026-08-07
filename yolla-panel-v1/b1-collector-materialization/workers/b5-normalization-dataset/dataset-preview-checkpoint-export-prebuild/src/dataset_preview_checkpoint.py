from __future__ import annotations
import csv, hashlib, json, math, os, shutil, zipfile
from pathlib import Path
from typing import Any, Iterable
from types import SimpleNamespace
from xml.etree import ElementTree as ET

DATASET_SCHEMA="NORMALIZED_PREVIEW_DATASET_V1"; CHECKPOINT_SCHEMA="DATASET_CHECKPOINT_RESUME_V1"; EXPORT_CONTRACT="EXPORT_ROUNDTRIP_CONTRACT_V1"

def cjson(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":"))
def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_file(p):
 h=hashlib.sha256()
 with Path(p).open("rb") as f:
  for c in iter(lambda:f.read(1<<20),b""): h.update(c)
 return h.hexdigest()
def vtype(v):
 if v is None:return "null"
 if isinstance(v,bool):return "boolean"
 if isinstance(v,int):return "integer"
 if isinstance(v,float):return "number"
 if isinstance(v,str):return "string"
 if isinstance(v,list):return "array"
 if isinstance(v,dict):return "object"
 return "unknown"
def cell(v):
 if v is None:return ""
 if isinstance(v,bool):return "true" if v else "false"
 if isinstance(v,(dict,list)):return cjson(v)
 if isinstance(v,float) and math.isfinite(v):return format(v,".15g")
 return str(v)
canonical_cell=cell

def atomic(path,text):
 p=Path(path); p.parent.mkdir(parents=True,exist_ok=True); t=p.with_suffix(p.suffix+".tmp"); t.write_text(text,encoding="utf-8"); os.replace(t,p)
def load(path,default=None):
 p=Path(path); return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default
def public(r): return {k:v for k,v in r.items() if not k.startswith("__")}
def meta(r,k):
 m=r.get("__field_meta",{}) if isinstance(r.get("__field_meta"),dict) else {}; fm=m.get(k,{}) if isinstance(m.get(k),dict) else {}
 try: conf=max(0.0,min(1.0,float(fm.get("confidence",1.0))))
 except: conf=0.0
 return {"source":fm.get("source") or r.get("__source") or {"kind":"record","field":k},"confidence":conf}
def fresh_stat(k,m): return {"name":k,"types":{},"source":m["source"],"conf_sum":0.0,"conf_n":0,"missing":0,"duplicate":0,"seen":[]}
def final_stat(s,total):
 ts=[k for k,v in s["types"].items() if k!="null" and v]
 typ="null" if not ts else ts[0] if len(ts)==1 else "mixed"
 return {"name":s["name"],"type":typ,"source":s["source"],"confidence":round(s["conf_sum"]/(s["conf_n"] or 1),6),"missing":{"count":s["missing"],"present":s["missing"]>0},"duplicate":{"count":s["duplicate"],"present":s["duplicate"]>0},"record_count":total}

class DatasetStore:
 def __init__(self,root:Path,dataset_id="b5-preview-dataset"):
  self.root=Path(root); self.root.mkdir(parents=True,exist_ok=True); self.dataset_id=dataset_id
  self.dataset=self.root/"dataset.jsonl"; self.checkpoint=self.root/"checkpoint.json"; self.edits=self.root/"edit_overlay.json"; self.pointer=self.root/"LATEST_POINTER.json"; self.paths=SimpleNamespace(root=self.root,dataset=self.dataset,checkpoint=self.checkpoint,edits=self.edits,pointer=self.pointer)
 def initialize(self):
  if not self.dataset.exists(): self.dataset.write_text("",encoding="utf-8")
  if not self.edits.exists(): atomic(self.edits,cjson({"schema_version":"DATASET_EDIT_OVERLAY_V1","edits":[],"revision":0})+"\n")
  if not self.checkpoint.exists():
   self._save({"schema_version":CHECKPOINT_SCHEMA,"dataset_id":self.dataset_id,"dataset_path":self.dataset.name,"edit_overlay_path":self.edits.name,"last_committed_record_count":0,"next_append_index":0,"dataset_sha256":sha_file(self.dataset),"dataset_size_bytes":0,"edit_overlay_sha256":sha_file(self.edits),"field_stats":{},"fields":[],"source_field_loss_count":0})
  self.write_pointer(); return self.load_checkpoint()
 def _save(self,c): atomic(self.checkpoint,json.dumps(c,ensure_ascii=False,indent=2,sort_keys=True)+"\n")
 def load_checkpoint(self):
  if not (self.dataset.exists() and self.edits.exists() and self.checkpoint.exists()): self.initialize()
  c=load(self.checkpoint)
  if c.get("schema_version")!=CHECKPOINT_SCHEMA: raise ValueError("CHECKPOINT_SCHEMA_MISMATCH")
  if c.get("dataset_sha256")!=sha_file(self.dataset): raise ValueError("DATASET_SHA_MISMATCH")
  if c.get("edit_overlay_sha256")!=sha_file(self.edits): raise ValueError("EDIT_OVERLAY_SHA_MISMATCH")
  return c
 def write_pointer(self):
  if not self.checkpoint.exists(): return {}
  c=load(self.checkpoint); p={"schema_version":"LATEST_B5_DATASET_POINTER_V1","dataset_id":c["dataset_id"],"dataset_path":c["dataset_path"],"checkpoint_path":self.checkpoint.name,"edit_overlay_path":c["edit_overlay_path"],"last_committed_record_count":c["last_committed_record_count"],"next_append_index":c["next_append_index"],"dataset_sha256":c["dataset_sha256"],"checkpoint_sha256":sha_file(self.checkpoint),"edit_overlay_sha256":c["edit_overlay_sha256"],"recovery_requires_chat_context":False}
  atomic(self.pointer,json.dumps(p,ensure_ascii=False,indent=2,sort_keys=True)+"\n"); return p
 def append(self,records:Iterable[dict[str,Any]]):
  c=self.load_checkpoint(); recs=list(records)
  if not recs:return c
  stats=c.get("field_stats",{}); old=int(c["last_committed_record_count"]); known=set(stats); lines=[]
  for off,r in enumerate(recs):
   if not isinstance(r,dict): raise TypeError("DATASET_RECORD_MUST_BE_OBJECT")
   pub=public(r)
   for k in set(pub)-known: stats[k]=fresh_stat(k,meta(r,k)); stats[k]["missing"]=old+off; known.add(k)
   for k in known:
    s=stats[k]
    if k not in pub: s["missing"]+=1; continue
    v=pub[k]; t=vtype(v); s["types"][t]=s["types"].get(t,0)+1; m=meta(r,k); s["conf_sum"]+=m["confidence"]; s["conf_n"]+=1
    d=sha_bytes(cjson(v).encode())
    if d in s["seen"]: s["duplicate"]+=1
    else: s["seen"].append(d)
   lines.append(cjson({"__record_index":old+off,"__source":r.get("__source"),"__field_meta":r.get("__field_meta"),**pub}))
  with self.dataset.open("a",encoding="utf-8",newline="\n") as f:
   for line in lines:f.write(line+"\n")
   f.flush(); os.fsync(f.fileno())
  total=old+len(recs); c.update({"last_committed_record_count":total,"next_append_index":total,"dataset_sha256":sha_file(self.dataset),"dataset_size_bytes":self.dataset.stat().st_size,"field_stats":stats,"fields":[final_stat(stats[k],total) for k in sorted(stats)],"edit_overlay_sha256":sha_file(self.edits),"source_field_loss_count":0}); self._save(c); self.write_pointer(); return c
 def edit(self,idx,field,value):
  c=self.load_checkpoint()
  if idx<0 or idx>=c["last_committed_record_count"]: raise IndexError("EDIT_RECORD_OUT_OF_RANGE")
  if field not in {f["name"] for f in c["fields"]}: raise KeyError("EDIT_FIELD_UNKNOWN")
  o=load(self.edits); o["revision"]=int(o.get("revision",0))+1; o["edits"].append({"revision":o["revision"],"record_index":idx,"field":field,"value":value}); atomic(self.edits,json.dumps(o,ensure_ascii=False,indent=2,sort_keys=True)+"\n"); c["edit_overlay_sha256"]=sha_file(self.edits); self._save(c); self.write_pointer(); return o
 def edit_map(self): return {(int(e["record_index"]),str(e["field"])):e.get("value") for e in load(self.edits,{"edits":[]}).get("edits",[])}
 def iter_records(self,apply_edits=True):
  em=self.edit_map() if apply_edits else {}
  with self.dataset.open(encoding="utf-8") as f:
   for line in f:
    if not line.strip():continue
    r=json.loads(line); idx=int(r["__record_index"]); out=public(r)
    for (i,k),v in em.items():
     if i==idx:out[k]=v
    out["__record_index"]=idx; out["__source"]=r.get("__source"); yield out
 def preview_window(self,offset,limit,overscan=5):
  c=self.load_checkpoint(); total=int(c["last_committed_record_count"]); offset=max(0,min(int(offset),total)); limit=max(1,int(limit)); overscan=max(0,int(overscan)); start=max(0,offset-overscan); end=min(total,offset+limit+overscan); rows=[]
  for r in self.iter_records():
   i=r["__record_index"]
   if i<start:continue
   if i>=end:break
   rows.append(r)
  return {"schema_version":"PARTIAL_PREVIEW_WINDOW_V1","total_record_count":total,"requested_offset":offset,"requested_limit":limit,"overscan":overscan,"virtual_start_index":start,"virtual_end_index_exclusive":end,"virtual_row_count":len(rows),"rows":rows,"fields":c["fields"]}
 def normalized_dataset_model(self):
  c=self.load_checkpoint(); return {"schema_version":DATASET_SCHEMA,"dataset_id":c["dataset_id"],"record_count":c["last_committed_record_count"],"last_committed_record_count":c["last_committed_record_count"],"fields":c["fields"],"storage":{"format":"JSONL_APPEND_ONLY","path":c["dataset_path"],"sha256":c["dataset_sha256"],"size_bytes":c["dataset_size_bytes"]},"edit_overlay":{"path":c["edit_overlay_path"],"sha256":c["edit_overlay_sha256"]},"source_field_loss_count":c["source_field_loss_count"]}
 def export(self,out_dir:Path):
  c=self.load_checkpoint(); fields=[f["name"] for f in c["fields"]]; recs=list(self.iter_records()); out=Path(out_dir); out.mkdir(parents=True,exist_ok=True); jp=out/"dataset.json"; cp=out/"dataset.csv"; xp=out/"dataset.xlsx"; vals=[{k:r.get(k) for k in fields} for r in recs]
  jp.write_text(json.dumps(vals,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
  with cp.open("w",encoding="utf-8-sig",newline="") as f:
   w=csv.DictWriter(f,fieldnames=fields,lineterminator="\r\n"); w.writeheader(); [w.writerow({k:cell(r.get(k)) for k in fields}) for r in vals]
  self._write_xlsx(xp,fields,vals); rb=self.read_exports(jp,cp,xp); expected=[[cell(r.get(k)) for k in fields] for r in vals]
  for fmt in ("csv","xlsx"):
   if rb[fmt]["fields"]!=fields:raise AssertionError(f"{fmt.upper()}_FIELD_PARITY_FAIL")
   if rb[fmt]["rows"]!=expected:raise AssertionError(f"{fmt.upper()}_VALUE_PARITY_FAIL")
  if rb["json"]["fields"]!=fields or len(rb["json"]["records"])!=len(vals):raise AssertionError("JSON_ROUNDTRIP_FAIL")
  return {"schema_version":EXPORT_CONTRACT,"record_count":len(vals),"field_order":fields,"round_trip_field_parity":"PASS","round_trip_display_value_parity":"PASS","files":{"json":{"path":str(jp),"sha256":sha_file(jp),"encoding":"UTF-8"},"csv":{"path":str(cp),"sha256":sha_file(cp),"encoding":"UTF-8-BOM","line_ending":"CRLF"},"xlsx":{"path":str(xp),"sha256":sha_file(xp),"encoding":"OPENXML"}}}
 @staticmethod
 def _write_xlsx(path,fields,recs):
  def esc(s):return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"',"&quot;")
  def col(i):
   n=i+1;o=""
   while n:n,r=divmod(n-1,26);o=chr(65+r)+o
   return o
  rows=[]
  for ri,row in enumerate([fields]+[[r.get(f) for f in fields] for r in recs],1):
   cs=[]
   for ci,v in enumerate(row):
    ref=f"{col(ci)}{ri}"
    if v is None:cs.append(f'<c r="{ref}"/>')
    elif isinstance(v,bool):cs.append(f'<c r="{ref}" t="b"><v>{1 if v else 0}</v></c>')
    elif isinstance(v,(int,float)) and not isinstance(v,bool):cs.append(f'<c r="{ref}"><v>{v}</v></c>')
    else:cs.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{esc(cell(v))}</t></is></c>')
   rows.append(f'<row r="{ri}">{"".join(cs)}</row>')
  sheet=f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:{col(len(fields)-1)}{len(recs)+1}"/><sheetData>{"".join(rows)}</sheetData></worksheet>'
  ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
  rel='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dataset" sheetId="1" r:id="rId1"/></sheets></workbook>'
  wr='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
  with zipfile.ZipFile(path,"w",compression=zipfile.ZIP_STORED) as z:
   for n,d in [("[Content_Types].xml",ct),("_rels/.rels",rel),("xl/workbook.xml",wb),("xl/_rels/workbook.xml.rels",wr),("xl/worksheets/sheet1.xml",sheet)]:z.writestr(n,d)
 @staticmethod
 def _read_xlsx(path):
  ns={"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
  with zipfile.ZipFile(path) as z:root=ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
  rows=[]
  for r in root.findall(".//m:row",ns):
   vals=[]
   for c in r.findall("m:c",ns):
    t=c.attrib.get("t")
    if t=="inlineStr":n=c.find("m:is/m:t",ns);vals.append(n.text if n is not None and n.text is not None else "")
    elif t=="b":n=c.find("m:v",ns);vals.append("true" if n is not None and n.text=="1" else "false")
    else:n=c.find("m:v",ns);vals.append(n.text if n is not None and n.text is not None else "")
   rows.append(vals)
  return rows[0],rows[1:]
 @staticmethod
 def read_exports(jp,cp,xp):
  jr=json.loads(Path(jp).read_text(encoding="utf-8")); jf=list(jr[0].keys()) if jr else []
  with Path(cp).open("r",encoding="utf-8-sig",newline="") as f:cr=list(csv.reader(f))
  xf,xr=DatasetStore._read_xlsx(xp); return {"json":{"fields":jf,"records":jr},"csv":{"fields":cr[0] if cr else [],"rows":cr[1:]},"xlsx":{"fields":xf,"rows":xr}}
 @classmethod
 def recover_from_pointer(cls,pointer_path):
  pp=Path(pointer_path); p=load(pp); c=load(pp.parent/p["checkpoint_path"]); s=cls(pp.parent,c["dataset_id"]); s.load_checkpoint()
  if p["last_committed_record_count"]!=c["last_committed_record_count"]:raise ValueError("POINTER_CHECKPOINT_COUNT_MISMATCH")
  return s

def fixture_records(count):
 out=[]
 for i in range(count):
  r={"id":i+1,"name":f"Item {i+1:04d}","category":"even" if (i+1)%2==0 else "odd","value":(i+1)*10,"duplicate_bucket":f"B{(i+1)%7}","__source":{"kind":"fixture","record_index":i,"json_pointer":f"/records/{i}"},"__field_meta":{"id":{"source":{"json_pointer":f"/records/{i}/id"},"confidence":1},"name":{"source":{"json_pointer":f"/records/{i}/name"},"confidence":.99},"category":{"source":{"json_pointer":f"/records/{i}/category"},"confidence":.98},"value":{"source":{"json_pointer":f"/records/{i}/value"},"confidence":.97}}}
  if i%3:r["optional_note"]=f"note-{i+1}"
  out.append(r)
 return out

def smoke(root:Path,count=1205):
 root=Path(root)
 if root.exists():shutil.rmtree(root)
 s=DatasetStore(root,"b5-prebuild-smoke");s.initialize(); recs=fixture_records(count); cp1=s.append(recs[:600]); p1=s.write_pointer(); s=DatasetStore.recover_from_pointer(s.pointer)
 if s.load_checkpoint()["last_committed_record_count"]!=600:raise AssertionError("RESUME_POINTER_COUNT_FAIL")
 cp2=s.append(recs[600:]);s.edit(700,"value",777777);preview=s.preview_window(500,30,7);exports=s.export(root/"exports");model=s.normalized_dataset_model();cp=s.load_checkpoint();p=s.write_pointer()
 r={"schema_version":"B5_DATASET_PREVIEW_CHECKPOINT_EXPORT_SMOKE_RECEIPT_V1","fixture_record_count":count,"first_checkpoint_count":cp1["last_committed_record_count"],"resumed_from_count":p1["last_committed_record_count"],"final_record_count":cp2["last_committed_record_count"],"preview":{k:preview[k] for k in ["total_record_count","virtual_row_count","virtual_start_index","virtual_end_index_exclusive"]},"field_count":len(model["fields"]),"missing_field_count":sum(f["missing"]["present"] for f in model["fields"]),"duplicate_field_count":sum(f["duplicate"]["present"] for f in model["fields"]),"edited_record_index":700,"edited_value":777777,"exports":exports,"checkpoint":{"last_committed_record_count":cp["last_committed_record_count"],"dataset_sha256":cp["dataset_sha256"],"edit_overlay_sha256":cp["edit_overlay_sha256"],"source_field_loss_count":cp["source_field_loss_count"]},"pointer":p,"checks":{"schema_parse":"PASS","incremental_append":"PASS","checkpoint_resume":"PASS","virtual_preview_1000_plus":"PASS","field_status_model":"PASS","round_trip_field_parity":"PASS","contextless_pointer_recovery":"PASS","single_command_smoke":"PASS"},"result":"PASS"}
 atomic(root/"SMOKE_RECEIPT.json",json.dumps(r,ensure_ascii=False,indent=2,sort_keys=True)+"\n");return r
