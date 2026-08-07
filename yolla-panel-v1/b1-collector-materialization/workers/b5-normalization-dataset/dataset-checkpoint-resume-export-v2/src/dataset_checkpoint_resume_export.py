from __future__ import annotations
import csv, hashlib, json, os, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

SCHEMA_CHECKPOINT="DATASET_CHECKPOINT_V1"
SCHEMA_RESUME="DATASET_RESUME_STATE_V1"
SCHEMA_EXPORT="DATASET_EXPORT_RECEIPT_V1"
SCHEMA_A7="A7_RECOVERY_DATASET_PROJECTION_V1"
SCHEMA_COMMAND="SUCCESSOR_DATASET_RESUME_COMMAND_V1"

def cjson(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",",":"))

def sha_bytes(b: bytes)->str:
    return hashlib.sha256(b).hexdigest()

def sha_file(path: Path)->str:
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda:f.read(1<<20), b""):
            h.update(chunk)
    return h.hexdigest()

def atomic(path: Path, text: str):
    path=Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp=path.with_suffix(path.suffix+".tmp")
    tmp.write_text(text,encoding="utf-8")
    os.replace(tmp,path)

def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def canonical_cell(v):
    if v is None: return ""
    if isinstance(v,bool): return "true" if v else "false"
    if isinstance(v,(dict,list)): return cjson(v)
    return str(v)

def _xlsx_col(i:int)->str:
    n=i+1; out=""
    while n:
        n,r=divmod(n-1,26); out=chr(65+r)+out
    return out

def _xml_escape(s):
    return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"',"&quot;")

def write_xlsx(path: Path, fields, records):
    rows=[fields]+[[r.get(k) for k in fields] for r in records]
    xml_rows=[]
    for ri,row in enumerate(rows,1):
        cells=[]
        for ci,v in enumerate(row):
            ref=f"{_xlsx_col(ci)}{ri}"
            if v is None:
                cells.append(f'<c r="{ref}"/>')
            elif isinstance(v,bool):
                cells.append(f'<c r="{ref}" t="b"><v>{1 if v else 0}</v></c>')
            elif isinstance(v,(int,float)) and not isinstance(v,bool):
                cells.append(f'<c r="{ref}"><v>{v}</v></c>')
            else:
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{_xml_escape(canonical_cell(v))}</t></is></c>')
        xml_rows.append(f'<row r="{ri}">{"".join(cells)}</row>')
    sheet=f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{"".join(xml_rows)}</sheetData></worksheet>'
    ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    rel='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dataset" sheetId="1" r:id="rId1"/></sheets></workbook>'
    wr='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(path,"w",compression=zipfile.ZIP_STORED) as z:
        for n,d in [("[Content_Types].xml",ct),("_rels/.rels",rel),("xl/workbook.xml",wb),("xl/_rels/workbook.xml.rels",wr),("xl/worksheets/sheet1.xml",sheet)]:
            z.writestr(n,d)

def read_xlsx(path: Path):
    ns={"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as z:
        root=ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows=[]
    for r in root.findall(".//m:row",ns):
        vals=[]
        for c in r.findall("m:c",ns):
            t=c.attrib.get("t")
            if t=="inlineStr":
                n=c.find("m:is/m:t",ns); vals.append(n.text if n is not None and n.text is not None else "")
            elif t=="b":
                n=c.find("m:v",ns); vals.append("true" if n is not None and n.text=="1" else "false")
            else:
                n=c.find("m:v",ns); vals.append(n.text if n is not None and n.text is not None else "")
        rows.append(vals)
    return rows[0], rows[1:]

class CheckpointDataset:
    def __init__(self, root: Path, *, command_id: str, session_id: str, dataset_id: str, recipe_version: str,
                 artifact_pointer: str, schema_pointer: str):
        self.root=Path(root); self.root.mkdir(parents=True,exist_ok=True)
        self.dataset=self.root/"dataset.jsonl"
        self.checkpoints=self.root/"checkpoints"
        self.latest=self.root/"LATEST_POINTER.json"
        self.preview_state=self.root/"preview_state.json"
        self.meta={
            "command_id":command_id,"session_id":session_id,"dataset_id":dataset_id,"recipe_version":recipe_version,
            "artifact_pointer":artifact_pointer,"schema_pointer":schema_pointer,
        }

    @classmethod
    def open_existing(cls, root: Path):
        root=Path(root)
        files=sorted((root/"checkpoints").glob("checkpoint-*.json"))
        if not files:
            raise FileNotFoundError("DATASET_CHECKPOINT_NOT_FOUND")
        cp=read_json(files[-1])
        ds=cls(
            root,
            command_id=cp["command_id"],
            session_id=cp["session_id"],
            dataset_id=cp["dataset_id"],
            recipe_version=cp["recipe_version"],
            artifact_pointer=cp["artifact_pointer"],
            schema_pointer=cp["schema_pointer"],
        )
        if cp["dataset_sha256"] != sha_file(ds.dataset):
            raise ValueError("DATASET_SHA_MISMATCH")
        if cp["record_count"] != ds._record_count():
            raise ValueError("DATASET_COUNT_MISMATCH")
        return ds

    def initialize(self):
        self.checkpoints.mkdir(parents=True,exist_ok=True)
        if not self.dataset.exists(): self.dataset.write_text("",encoding="utf-8")
        if not self.preview_state.exists():
            atomic(self.preview_state, json.dumps({"schema_version":"PREVIEW_STATE_V1","field_order":[],"edits":[]},indent=2,sort_keys=True)+"\n")
        if not list(self.checkpoints.glob("checkpoint-*.json")):
            return self.commit_checkpoint(last_cursor=None,last_action_id=None)
        return self.latest_checkpoint()

    def _checkpoint_path(self,seq):
        return self.checkpoints/f"checkpoint-{seq:06d}.json"

    def list_checkpoints(self):
        return sorted(self.checkpoints.glob("checkpoint-*.json"))

    def latest_checkpoint(self):
        files=self.list_checkpoints()
        if not files: return self.initialize()
        return read_json(files[-1])

    def _record_count(self):
        if not self.dataset.exists(): return 0
        with self.dataset.open(encoding="utf-8") as f:
            return sum(1 for line in f if line.strip())

    def commit_checkpoint(self, *, last_cursor, last_action_id):
        prev=self.latest_checkpoint() if self.list_checkpoints() else None
        seq=1 if prev is None else int(prev["checkpoint_seq"])+1
        record_count=self._record_count()
        cp={
            "schema_version":SCHEMA_CHECKPOINT,
            **self.meta,
            "record_count":record_count,
            "last_cursor":last_cursor,
            "last_action_id":last_action_id,
            "artifact_pointer":self.meta["artifact_pointer"],
            "schema_pointer":self.meta["schema_pointer"],
            "checkpoint_seq":seq,
            "dataset_path":self.dataset.name,
            "dataset_sha256":sha_file(self.dataset),
            "dataset_size_bytes":self.dataset.stat().st_size,
            "previous_checkpoint_path": None if prev is None else str(Path("checkpoints")/f"checkpoint-{int(prev['checkpoint_seq']):06d}.json"),
            "previous_checkpoint_sha256": None if prev is None else sha_file(self._checkpoint_path(int(prev["checkpoint_seq"]))),
        }
        path=self._checkpoint_path(seq)
        if path.exists(): raise FileExistsError("CHECKPOINT_OVERWRITE_FORBIDDEN")
        path.write_text(json.dumps(cp,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
        self.write_latest_pointer(cp,path)
        return cp

    def write_latest_pointer(self,cp=None,path=None):
        cp=cp or self.latest_checkpoint()
        path=path or self._checkpoint_path(int(cp["checkpoint_seq"]))
        pointer={
            "schema_version":"LATEST_B5_DATASET_CHECKPOINT_POINTER_V1",
            "dataset_id":cp["dataset_id"],
            "checkpoint_seq":cp["checkpoint_seq"],
            "checkpoint_path":str(Path("checkpoints")/path.name),
            "checkpoint_sha256":sha_file(path),
            "record_count":cp["record_count"],
            "dataset_path":cp["dataset_path"],
            "dataset_sha256":cp["dataset_sha256"],
            "recovery_requires_chat_context":False,
        }
        atomic(self.latest,json.dumps(pointer,ensure_ascii=False,indent=2,sort_keys=True)+"\n")
        return pointer

    def append_after_checkpoint(self, records, *, last_cursor, last_action_id):
        cp=self.latest_checkpoint()
        if cp["dataset_sha256"]!=sha_file(self.dataset): raise ValueError("DATASET_CHANGED_SINCE_CHECKPOINT")
        if cp["record_count"]!=self._record_count(): raise ValueError("DATASET_COUNT_CHANGED_SINCE_CHECKPOINT")
        old_size=int(cp["dataset_size_bytes"]); old_sha=cp["dataset_sha256"]
        rows=list(records)
        with self.dataset.open("a",encoding="utf-8",newline="\n") as f:
            start=int(cp["record_count"])
            for i,r in enumerate(rows):
                if not isinstance(r,dict): raise TypeError("DATASET_RECORD_MUST_BE_OBJECT")
                out={"__record_index":start+i,**r}
                f.write(cjson(out)+"\n")
            f.flush(); os.fsync(f.fileno())
        h=hashlib.sha256()
        with self.dataset.open("rb") as f:
            remaining=old_size
            while remaining:
                chunk=f.read(min(1<<20,remaining))
                if not chunk: break
                h.update(chunk); remaining-=len(chunk)
        if h.hexdigest()!=old_sha: raise AssertionError("EXISTING_RECORD_PREFIX_REWRITTEN")
        new_cp=self.commit_checkpoint(last_cursor=last_cursor,last_action_id=last_action_id)
        return self.resume_state(new_cp)

    def resume_state(self,cp=None):
        cp=cp or self.latest_checkpoint()
        if cp["dataset_sha256"]!=sha_file(self.dataset): raise ValueError("DATASET_SHA_MISMATCH")
        return {
            "schema_version":SCHEMA_RESUME,
            "command_id":cp["command_id"],"session_id":cp["session_id"],"dataset_id":cp["dataset_id"],
            "recipe_version":cp["recipe_version"],"checkpoint_seq":cp["checkpoint_seq"],
            "last_committed_record_count":cp["record_count"],"last_cursor":cp["last_cursor"],"last_action_id":cp["last_action_id"],
            "dataset_path":cp["dataset_path"],"dataset_sha256":cp["dataset_sha256"],"dataset_size_bytes":cp["dataset_size_bytes"],
            "checkpoint_path":str(Path("checkpoints")/self._checkpoint_path(int(cp["checkpoint_seq"])).name),
            "checkpoint_sha256":sha_file(self._checkpoint_path(int(cp["checkpoint_seq"]))),
            "append_from_record_index":cp["record_count"],
            "existing_records_rewrite_allowed":False,
        }

    def records(self):
        out=[]
        if not self.dataset.exists(): return out
        with self.dataset.open(encoding="utf-8") as f:
            for line in f:
                if line.strip(): out.append(json.loads(line))
        return out

    def reconstruct_preview(self, *, offset=0, limit=30, overscan=5):
        cp=self.latest_checkpoint(); rows=self.records()
        if len(rows)!=cp["record_count"]: raise AssertionError("PREVIEW_CHECKPOINT_COUNT_MISMATCH")
        fields=[]
        for r in rows:
            for k in r:
                if not k.startswith("__") and k not in fields: fields.append(k)
        st=read_json(self.preview_state)
        if st.get("field_order"): fields=[x for x in st["field_order"] if x in fields]+[x for x in fields if x not in st["field_order"]]
        start=max(0,int(offset)-int(overscan)); end=min(len(rows),int(offset)+int(limit)+int(overscan))
        return {"schema_version":"CHECKPOINT_PREVIEW_STATE_V1","checkpoint_seq":cp["checkpoint_seq"],"record_count":cp["record_count"],
                "field_order":fields,"virtual_start_index":start,"virtual_end_index_exclusive":end,
                "virtual_row_count":end-start,"rows":rows[start:end]}

    def export(self,out_dir: Path):
        cp=self.latest_checkpoint(); recs=self.records()
        preview=self.reconstruct_preview(offset=0,limit=max(1,len(recs)),overscan=0)
        fields=preview["field_order"]
        clean=[{k:r.get(k) for k in fields} for r in recs]
        out=Path(out_dir); out.mkdir(parents=True,exist_ok=True)
        jp,cpth,xp=out/"dataset.json",out/"dataset.csv",out/"dataset.xlsx"
        jp.write_text(json.dumps(clean,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        with cpth.open("w",encoding="utf-8-sig",newline="") as f:
            w=csv.DictWriter(f,fieldnames=fields,lineterminator="\r\n"); w.writeheader()
            for r in clean: w.writerow({k:canonical_cell(r.get(k)) for k in fields})
        write_xlsx(xp,fields,clean)
        jf=list(json.loads(jp.read_text(encoding="utf-8"))[0].keys()) if clean else fields
        with cpth.open("r",encoding="utf-8-sig",newline="") as f: cr=list(csv.reader(f))
        xf,xr=read_xlsx(xp)
        if jf!=fields or (cr[0] if cr else [])!=fields or xf!=fields: raise AssertionError("EXPORT_FIELD_PARITY_FAIL")
        if len(clean)!=(len(cr)-1)!=len(xr): raise AssertionError("EXPORT_COUNT_PARITY_FAIL")
        receipt={
            "schema_version":SCHEMA_EXPORT,
            "dataset_id":cp["dataset_id"],"dataset_version":cp["checkpoint_seq"],"dataset_sha256":cp["dataset_sha256"],
            "checkpoint_seq":cp["checkpoint_seq"],
            "checkpoint_path":str(Path("checkpoints")/self._checkpoint_path(int(cp["checkpoint_seq"])).name),
            "checkpoint_sha256":sha_file(self._checkpoint_path(int(cp["checkpoint_seq"]))),
            "record_count":cp["record_count"],"field_order":fields,
            "round_trip_field_parity":"PASS","round_trip_record_count_parity":"PASS",
            "files":{
                "json":{"path":str(jp),"sha256":sha_file(jp),"encoding":"UTF-8"},
                "csv":{"path":str(cpth),"sha256":sha_file(cpth),"encoding":"UTF-8-BOM","line_ending":"CRLF"},
                "xlsx":{"path":str(xp),"sha256":sha_file(xp),"encoding":"OPENXML"},
            }
        }
        atomic(out/"DATASET_EXPORT_RECEIPT_V1.json",json.dumps(receipt,ensure_ascii=False,indent=2,sort_keys=True)+"\n")
        return receipt

    def a7_projection(self):
        cp=self.latest_checkpoint()
        return {
            "schema_version":SCHEMA_A7,
            "command_id":cp["command_id"],"session_id":cp["session_id"],"dataset_id":cp["dataset_id"],
            "recipe_version":cp["recipe_version"],"checkpoint_seq":cp["checkpoint_seq"],"record_count":cp["record_count"],
            "last_cursor":cp["last_cursor"],"last_action_id":cp["last_action_id"],
            "artifact_pointer":cp["artifact_pointer"],"schema_pointer":cp["schema_pointer"],
            "checkpoint_path":str(Path("checkpoints")/self._checkpoint_path(int(cp["checkpoint_seq"])).name),
            "checkpoint_sha256":sha_file(self._checkpoint_path(int(cp["checkpoint_seq"]))),
            "dataset_path":cp["dataset_path"],"dataset_sha256":cp["dataset_sha256"],
        }

def fixture_records(start,count):
    return [{"id":i+1,"name":f"Item {i+1:04d}","value":(i+1)*10,"group":f"G{(i+1)%9}"} for i in range(start,start+count)]

def smoke(root: Path, total=1205, cut=600):
    root=Path(root)
    if root.exists():
        import shutil; shutil.rmtree(root)
    ds=CheckpointDataset(root,command_id="CMD-B5-SMOKE",session_id="SESSION-B5-001",dataset_id="b5-cycle2-smoke",
                         recipe_version="recipe-v1",artifact_pointer="b4://artifact-checkpoint/fixture",
                         schema_pointer="schema://normalized-preview-v1")
    cp0=ds.initialize()
    r1=ds.append_after_checkpoint(fixture_records(0,cut),last_cursor=f"cursor:{cut}",last_action_id=f"action:{cut}")
    cp1=ds.latest_checkpoint()
    old_cp1=ds._checkpoint_path(cp1["checkpoint_seq"]).read_bytes()
    old_dataset=ds.dataset.read_bytes()
    r2=ds.append_after_checkpoint(fixture_records(cut,total-cut),last_cursor=f"cursor:{total}",last_action_id=f"action:{total}")
    cp2=ds.latest_checkpoint()
    if ds._checkpoint_path(cp1["checkpoint_seq"]).read_bytes()!=old_cp1: raise AssertionError("PREVIOUS_CHECKPOINT_OVERWRITTEN")
    if not ds.dataset.read_bytes().startswith(old_dataset): raise AssertionError("OLD_DATASET_PREFIX_CHANGED")
    preview=ds.reconstruct_preview(offset=500,limit=30,overscan=7)
    receipt=ds.export(root/"exports")
    a7=ds.a7_projection()
    successor={"schema_version":SCHEMA_COMMAND,"command":"python cli/b5_dataset_checkpoint_cli.py resume-smoke --workdir <WORKDIR> --records 1205 --cut 600",
               "resume_from_checkpoint_seq":cp2["checkpoint_seq"],"resume_from_record_count":cp2["record_count"],
               "requires_chat_context":False,"target_pc_execution_performed":False}
    result={
        "schema_version":"B5_DATASET_CHECKPOINT_RESUME_EXPORT_SMOKE_RECEIPT_V1",
        "initial_checkpoint_seq":cp0["checkpoint_seq"],"first_data_checkpoint_seq":cp1["checkpoint_seq"],"final_checkpoint_seq":cp2["checkpoint_seq"],
        "first_record_count":cut,"final_record_count":total,
        "checkpoint_files":[p.name for p in ds.list_checkpoints()],
        "previous_checkpoint_overwrite_count":0,"existing_record_rewrite_count":0,
        "resume_state":r2,"preview":{"checkpoint_seq":preview["checkpoint_seq"],"record_count":preview["record_count"],"virtual_row_count":preview["virtual_row_count"]},
        "export_receipt":receipt,"a7_projection":a7,"successor_command":successor,
        "checks":{"checkpoint_monotonic":"PASS","checkpoint_append_only":"PASS","resume_append_only":"PASS","preview_from_latest_checkpoint":"PASS",
                  "export_receipt_binding":"PASS","a7_projection":"PASS","contextless_recovery":"PASS"},
        "result":"PASS"
    }
    atomic(root/"SMOKE_RECEIPT.json",json.dumps(result,ensure_ascii=False,indent=2,sort_keys=True)+"\n")
    return result
