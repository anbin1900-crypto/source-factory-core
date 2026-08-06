import unittest
from types import SimpleNamespace
from pdf_text_extractor import Config, ExtractionError, TesseractOCR, extract_pdf, quality
from pdf_extraction_runtime_adapter import dependency_doctor

class Pix:
    def tobytes(self, fmt): return b"png"
class Page:
    def __init__(self, text, images=False): self.text=text; self.images=images
    def get_text(self, mode): return self.text
    def get_images(self, full=True): return [(1,)] if self.images else []
    def get_pixmap(self, **kwargs): return Pix()
class Doc:
    def __init__(self, pages): self.pages=pages
    @property
    def page_count(self): return len(self.pages)
    def load_page(self, i): return self.pages[i]
    def close(self): pass
class OCR:
    def __init__(self, value): self.value=value
    def recognize(self, *args, **kwargs): return self.value

def run(pages, ocr=None, config=None):
    return extract_pdf("fixture.pdf", document_factory=lambda p: Doc(pages), ocr=ocr, config=config or Config(min_chars=10))

class DirectRepairTests(unittest.TestCase):
    def test_01_short_direct_without_image_preserved(self):
        r=run([Page("제목")]); self.assertEqual(r["records"][0]["extraction_mode"],"DIRECT_TEXT_LOW_VOLUME")
    def test_02_short_direct_image_without_ocr_preserved(self):
        r=run([Page("note",True)]); self.assertEqual(r["records"][0]["extraction_mode"],"DIRECT_TEXT_OCR_UNAVAILABLE")
    def test_03_blank_page_explicit_with_other_text(self):
        r=run([Page("long enough direct text"),Page("")]); self.assertEqual(r["records"][1]["extraction_mode"],"EMPTY_PAGE")
    def test_04_blank_page_not_counted_as_ocr(self):
        r=run([Page("long enough direct text"),Page("")]); self.assertEqual(r["ocr_page_count"],0)
    def test_05_scanned_page_without_ocr_fails_closed(self):
        with self.assertRaises(ExtractionError) as c: run([Page("",True)])
        self.assertEqual(c.exception.code,"OCR_BACKEND_REQUIRED")
    def test_06_ocr_empty_preserves_existing_direct(self):
        r=run([Page("note",True)],OCR("")); self.assertEqual(r["records"][0]["extraction_mode"],"DIRECT_TEXT_AFTER_EMPTY_OCR")
    def test_07_korean_english_alnum_quality(self):
        self.assertGreater(quality("한글 English 123")[1],0.5)
    def test_08_language_missing_exact_error(self):
        o=TesseractOCR("kor+eng"); fake=SimpleNamespace(get_languages=lambda config="":["eng"])
        with self.assertRaises(ExtractionError) as c: o._validate_language(fake,page_no=1)
        self.assertEqual(c.exception.code,"TESSERACT_LANGUAGE_UNAVAILABLE")
    def test_09_doctor_requires_kor_eng(self):
        d=dependency_doctor(finder=lambda n:object(),which=lambda n:"/tesseract",language_probe=lambda:["eng"])
        self.assertFalse(d["ocr_ready"]); self.assertEqual(d["missing_ocr_languages"],["kor"])
    def test_10_doctor_ready_with_both(self):
        d=dependency_doctor(finder=lambda n:object(),which=lambda n:"/tesseract",language_probe=lambda:["kor","eng"])
        self.assertEqual(d["status"],"READY_DIRECT_TEXT_AND_OCR")
    def test_11_page_order_unchanged(self):
        r=run([Page("long enough direct text"),Page("")]); self.assertEqual([x["page_no"] for x in r["records"]],[1,2])
    def test_12_boundaries_zero(self):
        r=run([Page("long enough direct text")]); self.assertEqual((r["semantic_analysis_count"],r["gpt_call_count"],r["original_pdf_mutation_count"]),(0,0,0))
if __name__=="__main__": unittest.main(verbosity=2)
