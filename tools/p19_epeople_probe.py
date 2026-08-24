from __future__ import annotations

import gzip
import html
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

OUT = Path("p19_probe_out")
OUT.mkdir(exist_ok=True)

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/151 Safari/537.36 P19-EPEOPLE-READONLY/1.0"
CTX = ssl.create_default_context()


class FormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.forms: list[dict[str, object]] = []
        self._current: dict[str, object] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {k: v for k, v in attrs}
        if tag.lower() == "form":
            self._current = {"attrs": data, "inputs": []}
            self.forms.append(self._current)
        elif self._current is not None and tag.lower() in {"input", "select", "textarea", "button"}:
            self._current["inputs"].append({"tag": tag.lower(), **data})

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "form":
            self._current = None


def fetch(url: str, *, method: str = "GET", data: bytes | None = None, headers: dict[str, str] | None = None) -> dict[str, object]:
    request_headers = {
        "User-Agent": UA,
        "Accept": "*/*",
        "Accept-Encoding": "gzip",
    }
    if headers:
        request_headers.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    started = time.time()
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=40) as resp:
            raw = resp.read()
            if resp.headers.get("Content-Encoding", "").lower() == "gzip":
                raw = gzip.decompress(raw)
            return {
                "ok": True,
                "url": resp.geturl(),
                "status": resp.status,
                "headers": dict(resp.headers.items()),
                "body": raw,
                "elapsed_ms": round((time.time() - started) * 1000),
            }
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            if exc.headers.get("Content-Encoding", "").lower() == "gzip":
                raw = gzip.decompress(raw)
        except Exception:
            pass
        return {
            "ok": False,
            "url": exc.geturl(),
            "status": exc.code,
            "headers": dict(exc.headers.items()),
            "body": raw,
            "error": repr(exc),
            "elapsed_ms": round((time.time() - started) * 1000),
        }
    except Exception as exc:
        return {
            "ok": False,
            "url": url,
            "status": None,
            "headers": {},
            "body": b"",
            "error": repr(exc),
            "elapsed_ms": round((time.time() - started) * 1000),
        }


def decode_body(result: dict[str, object]) -> str:
    body = result.get("body", b"")
    if not isinstance(body, (bytes, bytearray)):
        return str(body)
    headers = result.get("headers", {})
    content_type = str(headers.get("Content-Type", "")) if isinstance(headers, dict) else ""
    charset_match = re.search(r"charset=([^; ]+)", content_type, re.I)
    candidates = [charset_match.group(1).strip('"\'') if charset_match else None, "utf-8", "euc-kr", "cp949"]
    for encoding in candidates:
        if not encoding:
            continue
        try:
            return bytes(body).decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return bytes(body).decode("utf-8", errors="replace")


def summarize_html(text: str) -> dict[str, object]:
    parser = FormParser()
    try:
        parser.feed(text)
    except Exception:
        pass
    title_match = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
    title = re.sub(r"\s+", " ", html.unescape(title_match.group(1))).strip() if title_match else ""
    detail_urls = sorted(set(html.unescape(x) for x in re.findall(r"(?:https?://[^\"'<> ]+)?[^\"'<> ]*pttnSmlrCaseDetail\.npaid[^\"'<> ]*", text, re.I)))
    ep_ids = sorted(set(re.findall(r"(?:epUnionSn|unionSn)[=:'\"\s]+([A-Za-z0-9-]+)", text, re.I)))
    return {
        "title": title,
        "forms": parser.forms,
        "detail_url_samples": detail_urls[:100],
        "ep_union_sn_samples": ep_ids[:100],
        "script_srcs": sorted(set(re.findall(r"<script[^>]+src=[\"']([^\"']+)", text, re.I)))[:100],
        "keyword_contexts": {
            key: [re.sub(r"\s+", " ", html.unescape(m.group(0))).strip() for m in list(re.finditer(r".{0,180}" + re.escape(key) + r".{0,300}", text, re.I | re.S))[:10]]
            for key in ["검색", "search", "epUnionSn", "pttnSmlrCaseDetail", "pageIndex", "유사민원"]
        },
    }


def save_result(name: str, result: dict[str, object]) -> dict[str, object]:
    body = result.pop("body", b"")
    if not isinstance(body, (bytes, bytearray)):
        body = str(body).encode("utf-8")
    body_path = OUT / f"{name}.body"
    body_path.write_bytes(bytes(body))
    text = decode_body({**result, "body": body})
    (OUT / f"{name}.txt").write_text(text, encoding="utf-8")
    meta = {**result, "body_bytes": len(body), "body_sha256": __import__("hashlib").sha256(body).hexdigest()}
    if "html" in str(meta.get("headers", {}).get("Content-Type", "")).lower() or "<html" in text[:2000].lower():
        meta["html_summary"] = summarize_html(text)
    (OUT / f"{name}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def main() -> int:
    targets = {
        "api_root_https": "https://api.epeople.go.kr/",
        "api_root_http": "http://api.epeople.go.kr/",
        "wsdl_https_query": "https://api.epeople.go.kr/soap/CivilAppealService?wsdl",
        "wsdl_http_query": "http://api.epeople.go.kr/soap/CivilAppealService?wsdl",
        "wsdl_https_suffix": "https://api.epeople.go.kr/soap/CivilAppealService.wsdl",
        "wsdl_http_suffix": "http://api.epeople.go.kr/soap/CivilAppealService.wsdl",
        "api_guide_https": "https://api.epeople.go.kr/guide/",
        "list_page": "https://www.epeople.go.kr/nep/pttn/gnrlPttn/pttnSmlrCaseList.npaid?pageIndex=1",
        "known_detail": "https://www.epeople.go.kr/nep/pttn/gnrlPttn/pttnSmlrCaseDetail.npaid?dutySctnNm=tqapttn&epUnionSn=6903173",
    }
    summary: dict[str, object] = {"python": sys.version, "targets": {}}
    for name, url in targets.items():
        print(f"FETCH {name} {url}", flush=True)
        result = fetch(url)
        meta = save_result(name, result)
        summary["targets"][name] = meta
        print(json.dumps({k: meta.get(k) for k in ["ok", "url", "status", "elapsed_ms", "body_bytes", "body_sha256"]}, ensure_ascii=False), flush=True)

    # Inspect common list search POST field candidates without mutating any service.
    search_url = "https://www.epeople.go.kr/nep/pttn/gnrlPttn/pttnSmlrCaseList.npaid"
    variants = [
        {"pageIndex": "1", "searchKeyword": "주유소"},
        {"pageIndex": "1", "searchWord": "주유소"},
        {"pageIndex": "1", "searchText": "주유소"},
        {"pageIndex": "1", "schKeyword": "주유소"},
        {"pageIndex": "1", "q": "주유소"},
    ]
    summary["post_variants"] = []
    for idx, payload in enumerate(variants, 1):
        encoded = urllib.parse.urlencode(payload).encode("utf-8")
        result = fetch(search_url, method="POST", data=encoded, headers={"Content-Type": "application/x-www-form-urlencoded"})
        meta = save_result(f"list_post_{idx}", result)
        summary["post_variants"].append({"payload": payload, "meta": meta})
        print(f"POST_VARIANT {idx} {payload} status={meta.get('status')} bytes={meta.get('body_bytes')}", flush=True)

    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
