from __future__ import annotations

import hashlib
import html
import http.cookiejar
import json
import re
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://www.epeople.go.kr"
LIST = BASE + "/nep/pttn/gnrlPttn/pttnSmlrCaseList.npaid"
DETAIL = BASE + "/nep/pttn/gnrlPttn/pttnSmlrCaseDetail.npaid"
OUT = Path("p19_search_probe_out")
OUT.mkdir(exist_ok=True)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/151 Safari/537.36 P19-EPEOPLE-READONLY/1.0"


def decode(raw: bytes, content_type: str = "") -> str:
    m = re.search(r"charset=([^; ]+)", content_type, re.I)
    for enc in ([m.group(1).strip('"\'')] if m else []) + ["utf-8", "euc-kr", "cp949"]:
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode("utf-8", errors="replace")


def clean_html(fragment: str) -> str:
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    fragment = html.unescape(fragment)
    fragment = re.sub(r"[ \t\r\f\v]+", " ", fragment)
    fragment = re.sub(r" *\n *", "\n", fragment)
    return fragment.strip()


def parse_rows(text: str) -> tuple[int, int, list[dict[str, str]]]:
    total_match = re.search(r"총\s*<span>([0-9,]+)</span>건\s*등록\s*\((\d+)/(\d+)\)", text)
    total = int(total_match.group(1).replace(",", "")) if total_match else 0
    pages = int(total_match.group(3)) if total_match else 0
    rows = []
    pattern = re.compile(
        r"<tr>\s*<td>(\d+)</td>\s*<td[^>]*>\s*<a[^>]+onclick=\"javaScript:fn_detail\(this,'([^']+)','([^']+)'\);\"[^>]*>(.*?)</a>\s*</td>\s*<td>(.*?)</td>\s*<td>(\d{4}-\d{2}-\d{2})</td>",
        re.I | re.S,
    )
    for no, ep_union_sn, duty, title_raw, agency_raw, date in pattern.findall(text):
        rows.append({
            "board_no": no,
            "ep_union_sn": html.unescape(ep_union_sn),
            "dutySctnNm": duty,
            "title": clean_html(title_raw),
            "agency": clean_html(agency_raw),
            "date": date,
            "detail_url": DETAIL + "?" + urllib.parse.urlencode({"epUnionSn": html.unescape(ep_union_sn), "dutySctnNm": duty}),
        })
    return total, pages, rows


def parse_detail(text: str) -> dict[str, str]:
    block = re.search(r'<div class="samBox mw">(.*?)<div class="samBox ans">', text, re.I | re.S)
    if not block:
        return {}
    case = block.group(1)
    title_match = re.search(r'<div class="samC_top">\s*<strong>(.*?)</strong>', case, re.I | re.S)
    body_match = re.search(r'<div class="samC_c">(.*?)</div>\s*<span class="samC_date">(.*?)</span>', case, re.I | re.S)
    title = clean_html(title_match.group(1)) if title_match else ""
    question = clean_html(body_match.group(1)) if body_match else ""
    date = clean_html(body_match.group(2)) if body_match else ""
    dept_match = re.search(r'<dt>담당부서</dt>\s*<dd>(.*?)</dd>', text, re.I | re.S)
    dept = clean_html(dept_match.group(1)) if dept_match else ""
    return {"title": title, "question": question, "date": date, "department": dept}


def main() -> None:
    context = ssl.create_default_context()
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), urllib.request.HTTPSHandler(context=context))
    opener.addheaders = [("User-Agent", UA), ("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.7")]

    with opener.open(LIST, timeout=40) as resp:
        initial_raw = resp.read()
        initial = decode(initial_raw, resp.headers.get("Content-Type", ""))
    csrf_match = re.search(r'name="_csrf"\s+value="([^"]+)"', initial)
    if not csrf_match:
        raise RuntimeError("CSRF token not found")
    csrf = csrf_match.group(1)
    print("CSRF", csrf, "COOKIES", [(c.name, c.domain) for c in jar])

    keywords = ["주유소", "세차장", "위험물", "면세유", "탱크로리"]
    result: dict[str, object] = {"keywords": {}}
    for keyword in keywords:
        payload = {
            "_csrf": csrf,
            "recordCountPerPage": "100",
            "pageIndex": "1",
            "epUnionSn": "",
            "dutySctnNm": "",
            "lcgovBlngInstCd": "",
            "searchOptionClickYn": "Y",
            "searchWordType": "0",
            "searchWord": keyword,
            "rqstStDt": "2024-08-26",
            "rqstEndDt": "2026-08-25",
            "dateType": "6",
            "pttnTypeNm": "",
            "searchInstNm": "",
            "searchInstCd": "all",
            "focusPerPageYn": "",
        }
        data = urllib.parse.urlencode(payload).encode("utf-8")
        req = urllib.request.Request(LIST, data=data, headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": LIST, "X-CSRF-TOKEN": csrf}, method="POST")
        with opener.open(req, timeout=60) as resp:
            raw = resp.read()
            text = decode(raw, resp.headers.get("Content-Type", ""))
        total, pages, rows = parse_rows(text)
        print("SEARCH", keyword, "total", total, "pages", pages, "rows", len(rows))
        print(json.dumps(rows[:5], ensure_ascii=False))
        (OUT / f"search_{keyword}.html").write_bytes(raw)
        detail_samples = []
        for row in rows[:3]:
            with opener.open(row["detail_url"], timeout=45) as resp:
                draw = resp.read()
                dtext = decode(draw, resp.headers.get("Content-Type", ""))
            parsed = parse_detail(dtext)
            parsed.update({"url": row["detail_url"], "ep_union_sn": row["ep_union_sn"], "dutySctnNm": row["dutySctnNm"]})
            detail_samples.append(parsed)
            (OUT / f"detail_{keyword}_{row['board_no']}.html").write_bytes(draw)
        result["keywords"][keyword] = {"total": total, "pages": pages, "rows": rows, "detail_samples": detail_samples}

    encoded = json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8")
    (OUT / "search_probe.json").write_bytes(encoded)
    (OUT / "sha256.txt").write_text(hashlib.sha256(encoded).hexdigest() + "\n", encoding="ascii")


if __name__ == "__main__":
    main()
