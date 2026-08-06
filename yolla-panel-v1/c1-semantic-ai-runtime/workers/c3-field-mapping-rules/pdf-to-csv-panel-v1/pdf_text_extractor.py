from __future__ import annotations
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Callable, Iterable
import re
import unicodedata

class ExtractionError(RuntimeError):
    def __init__(self, code: str, message: str, page_no: int | None = None):
        super().__init__(message)
        self.code = code
        self.page_no = page_no

@dataclass(frozen=True)
class Config:
    min_chars: int = 20
    min_alnum_ratio: float = .15
    ocr_dpi: int = 200
    fail_on_empty_page: bool = True
    fail_on_empty_document: bool = True

    def validate(self) -> None:
        if self.min_chars < 0:
            raise ValueError("min_chars")
        if not 0 <= self.min_alnum_ratio <= 1:
            raise ValueError("min_alnum_ratio")
        if self.ocr_dpi < 72:
            raise ValueError("ocr_dpi")

def normalize(text: str | None) -> str:
    value = unicodedata.normalize("NFC", text or "").replace("\r\n", "\n").replace("\r", "\n")
    value = "\n".join(re.sub(r"[\t\f\v ]+", " ", line).strip() for line in value.split("\n"))
    return re.sub(r"\n{3,}", "\n\n", value).strip()

def quality(text: str) -> tuple[int, float]:
    return (0, 0.0) if not text else (len(text), sum(c.isalnum() for c in text) / len(text))

def _open(path: Path):
    try:
        import fitz
    except ImportError as exc:
        raise ExtractionError("PYMUPDF_NOT_INSTALLED", "PyMuPDF is required") from exc
    try:
        return fitz.open(path)
    except Exception as exc:
        raise ExtractionError("PDF_OPEN_FAILED", str(exc)) from exc

def _page_has_raster_images(page: Any) -> bool:
    getter = getattr(page, "get_images", None)
    if getter is None:
        return True
    try:
        return bool(getter(full=True))
    except TypeError:
        try:
            return bool(getter())
        except Exception:
            return True
    except Exception:
        return True

class TesseractOCR:
    def __init__(self, language: str = "kor+eng", config: str = "--psm 6", tesseract_cmd: str | None = None):
        self.language = language
        self.config = config
        self.tesseract_cmd = tesseract_cmd
        self._language_validated = False

    def _validate_language(self, pytesseract: Any, *, page_no: int) -> None:
        if self._language_validated:
            return
        try:
            available = set(pytesseract.get_languages(config=""))
        except Exception as exc:
            raise ExtractionError("TESSERACT_LANGUAGE_PROBE_FAILED", str(exc), page_no) from exc
        requested = [part for part in self.language.split("+") if part]
        missing = [part for part in requested if part not in available]
        if missing:
            raise ExtractionError(
                "TESSERACT_LANGUAGE_UNAVAILABLE",
                f"missing language packs: {','.join(missing)}; requested={self.language}",
                page_no,
            )
        self._language_validated = True

    def recognize(self, png: bytes, *, page_no: int, source_path: str) -> str:
        try:
            from PIL import Image
            import pytesseract
        except ImportError as exc:
            raise ExtractionError("TESSERACT_BINDING_NOT_INSTALLED", "Pillow and pytesseract are required", page_no) from exc
        if self.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = self.tesseract_cmd
        self._validate_language(pytesseract, page_no=page_no)
        try:
            with Image.open(BytesIO(png)) as image:
                return pytesseract.image_to_string(image, lang=self.language, config=self.config)
        except ExtractionError:
            raise
        except Exception as exc:
            raise ExtractionError("TESSERACT_EXECUTION_FAILED", f"{source_path}: {exc}", page_no) from exc

def extract_pdf(
    path: str | Path,
    *,
    document_factory: Callable[[Path], Any] | None = None,
    ocr: Any = None,
    config: Config | None = None,
) -> dict:
    cfg = config or Config()
    cfg.validate()
    src = Path(path)
    doc = (document_factory or _open)(src)
    records = []
    try:
        count = int(doc.page_count)
        for index in range(count):
            no = index + 1
            page = doc.load_page(index)
            direct = normalize(page.get_text("text") or "")
            chars, ratio = quality(direct)
            image_hint = _page_has_raster_images(page)

            if chars >= cfg.min_chars and ratio >= cfg.min_alnum_ratio:
                text, mode, used, reason, status = direct, "DIRECT_TEXT", False, None, "PASS"
            elif direct and not image_hint:
                text, mode, used = direct, "DIRECT_TEXT_LOW_VOLUME", False
                reason, status = "DIRECT_TEXT_BELOW_THRESHOLD_NO_RASTER_IMAGE", "PASS_WITH_WARNING"
            elif not direct and not image_hint:
                text, mode, used = "", "EMPTY_PAGE", False
                reason, status = "NO_DIRECT_TEXT_NO_RASTER_IMAGE", "EMPTY_EXPLICIT"
            elif ocr is None:
                if direct:
                    text, mode, used = direct, "DIRECT_TEXT_OCR_UNAVAILABLE", False
                    reason, status = "OCR_UNAVAILABLE_PRESERVED_DIRECT_TEXT", "PASS_WITH_WARNING"
                else:
                    raise ExtractionError(
                        "OCR_BACKEND_REQUIRED",
                        f"page {no} appears image-based and has no direct text",
                        no,
                    )
            else:
                pix = page.get_pixmap(dpi=cfg.ocr_dpi, alpha=False)
                ocr_text = normalize(ocr.recognize(pix.tobytes("png"), page_no=no, source_path=str(src)))
                if ocr_text:
                    text, mode, used = ocr_text, "OCR_FALLBACK", True
                    reason, status = "DIRECT_TEXT_BELOW_THRESHOLD_WITH_RASTER_IMAGE", "PASS"
                elif direct:
                    text, mode, used = direct, "DIRECT_TEXT_AFTER_EMPTY_OCR", True
                    reason, status = "OCR_EMPTY_PRESERVED_DIRECT_TEXT", "PASS_WITH_WARNING"
                elif cfg.fail_on_empty_page:
                    raise ExtractionError("EMPTY_TEXT_AFTER_OCR", f"page {no}", no)
                else:
                    text, mode, used = "", "EMPTY_AFTER_OCR", True
                    reason, status = "OCR_RETURNED_EMPTY", "EMPTY_RECORDED"

            final_chars, final_ratio = quality(text)
            records.append({
                "source_file": src.name,
                "source_path": str(src),
                "page_no": no,
                "extraction_mode": mode,
                "text": text,
                "char_count": final_chars,
                "alnum_ratio": round(final_ratio, 6),
                "direct_text_char_count": chars,
                "direct_text_alnum_ratio": round(ratio, 6),
                "page_has_raster_image": image_hint,
                "ocr_applied": used,
                "ocr_reason": reason,
                "status": status,
            })
    finally:
        doc.close()

    if cfg.fail_on_empty_document and not any(r["text"] for r in records):
        raise ExtractionError("EMPTY_DOCUMENT_TEXT", "no page produced text")

    direct_modes = {
        "DIRECT_TEXT",
        "DIRECT_TEXT_LOW_VOLUME",
        "DIRECT_TEXT_OCR_UNAVAILABLE",
        "DIRECT_TEXT_AFTER_EMPTY_OCR",
    }
    return {
        "source_file": src.name,
        "source_path": str(src),
        "page_count": len(records),
        "records": records,
        "direct_text_page_count": sum(r["extraction_mode"] in direct_modes for r in records),
        "ocr_page_count": sum(r["ocr_applied"] for r in records),
        "empty_page_count": sum(not r["text"] for r in records),
        "warning_page_count": sum(r["status"] == "PASS_WITH_WARNING" for r in records),
        "source_order_preserved": True,
        "page_order_preserved": [r["page_no"] for r in records] == list(range(1, len(records) + 1)),
        "semantic_analysis_count": 0,
        "gpt_call_count": 0,
        "original_pdf_mutation_count": 0,
    }

def extract_batch(paths: Iterable[str | Path], **kwargs) -> tuple[dict, ...]:
    return tuple(extract_pdf(path, **kwargs) for path in paths)
