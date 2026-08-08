import unittest
from pdf_text_extractor import Config,ExtractionError,extract_batch,extract_pdf,normalize,quality

class Pix:
    def __init__(self,value): self.value=value
    def tobytes(self,fmt): return self.value.encode()
class Page:
    def __init__(self,text): self.text=text; self.render=[]
    def get_text(self,mode): return self.text
    def get_pixmap(self,**kw): self.render.append(kw); return Pix(self.text)
class Doc:
    def __init__(self,pages): self.pages=pages; self.closed=False
    @property
    def page_count(self): return len(self.pages)
    def load_page(self,index): return self.pages[index]
    def close(self): self.closed=True
class Factory:
    def __init__(self,*docs): self.docs=list(docs)
    def __call__(self,path): return self.docs.pop(0)
class OCR:
    def __init__(self,*out): self.out=list(out); self.calls=[]
    def recognize(self,png,**kw): self.calls.append((png,kw)); return self.out.pop(0)

class T(unittest.TestCase):
    def setUp(self): self.cfg=Config(min_chars=10,min_alnum_ratio=.2,ocr_dpi=222)
    def run1(self,pages,ocr=None,cfg=None): return extract_pdf('folder/a.pdf',document_factory=Factory(Doc(pages)),ocr=ocr,config=cfg or self.cfg)
    def test_01_normalize(self): self.assertEqual(normalize(' A\t B\r\n\n\nC '),'A B\n\nC')
    def test_02_quality(self): self.assertEqual(quality(''),(0,0.0))
    def test_03_direct_no_ocr(self):
        o=OCR('unused'); r=self.run1([Page('direct text enough')],o); self.assertEqual(r['records'][0]['extraction_mode'],'DIRECT_TEXT'); self.assertEqual(o.calls,[])
    def test_04_low_text_ocr(self):
        o=OCR('ocr recovered text'); r=self.run1([Page('x')],o); self.assertEqual(r['records'][0]['extraction_mode'],'OCR_FALLBACK'); self.assertEqual(len(o.calls),1)
    def test_05_page_order(self): self.assertEqual([x['page_no'] for x in self.run1([Page('page one text'),Page('page two text')],OCR())['records']],[1,2])
    def test_06_source_identity(self): self.assertEqual(self.run1([Page('direct text enough')],OCR())['source_path'],'folder/a.pdf')
    def test_07_ocr_metadata(self):
        o=OCR('ocr recovered text'); self.run1([Page('')],o); self.assertEqual(o.calls[0][1],{'page_no':1,'source_path':'folder/a.pdf'})
    def test_08_no_ocr_backend(self):
        with self.assertRaises(ExtractionError) as c: self.run1([Page('')]); self.assertEqual(c.exception.code,'OCR_BACKEND_REQUIRED')
    def test_09_empty_after_ocr(self):
        with self.assertRaises(ExtractionError) as c: self.run1([Page('')],OCR('')); self.assertEqual(c.exception.code,'EMPTY_TEXT_AFTER_OCR')
    def test_10_explicit_empty(self):
        cfg=Config(min_chars=10,fail_on_empty_page=False,fail_on_empty_document=False); self.assertEqual(self.run1([Page('')],OCR(''),cfg)['records'][0]['status'],'EMPTY_RECORDED')
    def test_11_close_success(self):
        d=Doc([Page('direct text enough')]); extract_pdf('a.pdf',document_factory=Factory(d),ocr=OCR(),config=self.cfg); self.assertTrue(d.closed)
    def test_12_close_failure(self):
        d=Doc([Page('')])
        with self.assertRaises(ExtractionError): extract_pdf('a.pdf',document_factory=Factory(d),config=self.cfg)
        self.assertTrue(d.closed)
    def test_13_batch_order(self):
        f=Factory(Doc([Page('first document')]),Doc([Page('second document')])); self.assertEqual([r['source_file'] for r in extract_batch(['b.pdf','a.pdf'],document_factory=f,ocr=OCR(),config=self.cfg)],['b.pdf','a.pdf'])
    def test_14_counts(self):
        r=self.run1([Page('direct text enough'),Page('')],OCR('ocr recovered text')); self.assertEqual((r['direct_text_page_count'],r['ocr_page_count']),(1,1))
    def test_15_boundaries(self):
        r=self.run1([Page('direct text enough')],OCR()); self.assertEqual((r['semantic_analysis_count'],r['gpt_call_count'],r['original_pdf_mutation_count']),(0,0,0))
    def test_16_bad_ratio(self):
        with self.assertRaises(ValueError): Config(min_alnum_ratio=2).validate()
    def test_17_bad_dpi(self):
        with self.assertRaises(ValueError): Config(ocr_dpi=50).validate()
    def test_18_zero_page(self):
        with self.assertRaises(ExtractionError) as c: extract_pdf('a.pdf',document_factory=Factory(Doc([])),ocr=OCR(),config=self.cfg); self.assertEqual(c.exception.code,'EMPTY_DOCUMENT_TEXT')
    def test_19_ocr_normalized(self): self.assertEqual(self.run1([Page('')],OCR(' A\t B\r\n C '))['records'][0]['text'],'A B\nC')
    def test_20_dpi(self):
        p=Page(''); self.run1([p],OCR('ocr recovered text')); self.assertEqual(p.render[0],{'dpi':222,'alpha':False})
    def test_21_empty_not_silent(self): self.assertTrue(Config().fail_on_empty_page)
    def test_22_page_order_flag(self): self.assertTrue(self.run1([Page('page one text')],OCR())['page_order_preserved'])
if __name__=='__main__': unittest.main(verbosity=2)
