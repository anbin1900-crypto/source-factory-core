from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable
import re, unicodedata

class ExtractionError(RuntimeError):
    def __init__(self, code: str, message: str, page_no: int | None = None):
        super().__init__(message); self.code=code; self.page_no=page_no

@dataclass(frozen=True)
class Config:
    min_chars:int=20; min_alnum_ratio:float=.15; ocr_dpi:int=200
    fail_on_empty_page:bool=True; fail_on_empty_document:bool=True
    def validate(self):
        if self.min_chars<0: raise ValueError('min_chars')
        if not 0<=self.min_alnum_ratio<=1: raise ValueError('min_alnum_ratio')
        if self.ocr_dpi<72: raise ValueError('ocr_dpi')

def normalize(text:str|None)->str:
    value=unicodedata.normalize('NFC',text or '').replace('\r\n','\n').replace('\r','\n')
    value='\n'.join(re.sub(r'[\t\f\v ]+',' ',line).strip() for line in value.split('\n'))
    return re.sub(r'\n{3,}','\n\n',value).strip()

def quality(text:str)->tuple[int,float]:
    return (0,0.0) if not text else (len(text),sum(c.isalnum() for c in text)/len(text))

def _open(path:Path):
    try: import fitz
    except ImportError as exc: raise ExtractionError('PYMUPDF_NOT_INSTALLED','PyMuPDF is required') from exc
    return fitz.open(path)

class TesseractOCR:
    def __init__(self,language='kor+eng',config='--psm 6'): self.language=language; self.config=config
    def recognize(self,png:bytes,*,page_no:int,source_path:str)->str:
        try:
            from PIL import Image
            import pytesseract
            from io import BytesIO
        except ImportError as exc:
            raise ExtractionError('TESSERACT_BINDING_NOT_INSTALLED','Pillow and pytesseract are required',page_no) from exc
        try: return pytesseract.image_to_string(Image.open(BytesIO(png)),lang=self.language,config=self.config)
        except Exception as exc: raise ExtractionError('TESSERACT_EXECUTION_FAILED',str(exc),page_no) from exc

def extract_pdf(path:str|Path,*,document_factory:Callable[[Path],Any]|None=None,ocr:Any=None,config:Config|None=None)->dict:
    cfg=config or Config(); cfg.validate(); src=Path(path); doc=(document_factory or _open)(src); records=[]
    try:
        count=int(doc.page_count)
        for index in range(count):
            no=index+1; page=doc.load_page(index); direct=normalize(page.get_text('text') or '')
            chars,ratio=quality(direct)
            if chars>=cfg.min_chars and ratio>=cfg.min_alnum_ratio:
                text,mode,used,reason=direct,'DIRECT_TEXT',False,None
            else:
                if ocr is None: raise ExtractionError('OCR_BACKEND_REQUIRED',f'page {no}',no)
                pix=page.get_pixmap(dpi=cfg.ocr_dpi,alpha=False); text=normalize(ocr.recognize(pix.tobytes('png'),page_no=no,source_path=str(src)))
                if not text and cfg.fail_on_empty_page: raise ExtractionError('EMPTY_TEXT_AFTER_OCR',f'page {no}',no)
                mode,used,reason=('OCR_FALLBACK' if text else 'EMPTY_AFTER_OCR'),True,'DIRECT_TEXT_BELOW_THRESHOLD'
            final_chars,final_ratio=quality(text)
            records.append({'source_file':src.name,'source_path':str(src),'page_no':no,'extraction_mode':mode,'text':text,'char_count':final_chars,'alnum_ratio':round(final_ratio,6),'direct_text_char_count':chars,'direct_text_alnum_ratio':round(ratio,6),'ocr_applied':used,'ocr_reason':reason,'status':'PASS' if text else 'EMPTY_RECORDED'})
    finally: doc.close()
    if cfg.fail_on_empty_document and not any(r['text'] for r in records): raise ExtractionError('EMPTY_DOCUMENT_TEXT','no page produced text')
    return {'source_file':src.name,'source_path':str(src),'page_count':len(records),'records':records,'direct_text_page_count':sum(r['extraction_mode']=='DIRECT_TEXT' for r in records),'ocr_page_count':sum(r['ocr_applied'] for r in records),'empty_page_count':sum(not r['text'] for r in records),'source_order_preserved':True,'page_order_preserved':[r['page_no'] for r in records]==list(range(1,len(records)+1)),'semantic_analysis_count':0,'gpt_call_count':0,'original_pdf_mutation_count':0}

def extract_batch(paths:Iterable[str|Path],**kwargs)->tuple[dict,...]:
    return tuple(extract_pdf(path,**kwargs) for path in paths)
