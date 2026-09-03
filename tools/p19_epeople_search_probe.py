from __future__ import annotations

import hashlib
import html
import json
import re
import subprocess
import urllib.parse
from pathlib import Path

BASE = "https://www.epeople.go.kr"
LIST = BASE + "/nep/pttn/gnrlPttn/pttnSmlrCaseList.npaid"
DETAIL = BASE + "/nep/pttn/gnrlPttn/pttnSmlrCaseDetail.npaid"
OUT = Path("p19_search_probe_out")
OUT.mkdir(exist_ok=True)
COOKIE = OUT / "cookies.txt"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/151 Safari/537.36 P19-EPEOPLE-READONLY/1.0"


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
    rows: list[dict[str, str]] = []
    pattern = re.compile(
        r"<tr>\s*<td>(\d+)</td>\s*<td[^>]*>\s*<a[^>]+onclick=\"javaScript:fn_detail\(this,'([^']+)','([^']+)'\);\"[^>]*>(.*?)</a>\s*</td>\s*<td>(.*?)</td>\s*<td>(\d{4}-\d{2}-\d{2})</td>",
        re.I | re.S,
    )
    for no, ep_union_sn, duty, title_raw, agency_raw, date in pattern.findall(text):
        ep_union_sn = html.unescape(ep_union_sn)
        rows.append({
            "board_no": no,
            "ep_union_sn": ep_union_sn,
            "dutySctnNm": duty,
            "title": clean_html(title_raw),
            "agency": clean_html(agency_raw),
            "date": date,
            "detail_url": DETAIL + "?" + urllib.parse.urlencode({"epUnionSn": ep_union_sn, "dutySctnNm": duty}),
        })
    return total, pages, rows


def parse_detail(text: str) -> dict[str, str]:
    block = re.search(r'<div class="samBox mw">(.*?)<div class="samBox ans">', text, re.I | re.S)
    if not block:
        return {}
    case = block.group(1)
    title_match = re.search(r'<div class="samC_top">\s*<strong>(.*?)</strong>', case, re.I | re.S)
    body_match = re.search(r'<div class="samC_c">(.*?)</div>\s*<span class="samC_date">(.*?)</span>', case, re.I | re.S)
    dept_match = re.search(r'<dt>담당부서</dt>\s*<dd>(.*?)</dd>', text, re.I | re.S)
    return {
        "title": clean_html(title_match.group(1)) if title_match else "",
        "question": clean_html(body_match.group(1)) if body_match else "",
        "date": clean_html(body_match.group(2)) if body_match else "",
        "department": clean_html(dept_match.group(1)) if dept_match else "",
    }


def curl_fetch(url: str, output: Path, *, fields: dict[str, str] | None = None, headers: list[str] | None = None) -> None:
    cmd = [
        "curl", "-4", "--silent", "--show-error", "--fail-with-body", "--location",
        "--connect-timeout", "20", "--max-time", "120",
        "--retry", "10", "--retry-delay", "4", "--retry-max-time", "600", "--retry-all-errors",
        "--user-agent", UA,
        "--cookie", str(COOKIE), "--cookie-jar", str(COOKIE),
        "--header", "Accept-Language: ko-KR,ko;q=0.9,en;q=0.7",
        "--header", "Connection: close",
        "--output", str(output),
    ]
    for header in headers or []:
        cmd += ["--header", header]
    if fields is not None:
        cmd += ["--request", "POST", "--referer", LIST]
        for key, value in fields.items():
            cmd += ["--data-urlencode", f"{key}={value}"]
    cmd.append(url)
    print("CURL", "POST" if fields is not None else "GET", url, flush=True)
    subprocess.run(cmd, check=True)


def main() -> None:
    initial_path = OUT / "initial.html"
    curl_fetch(LIST, initial_path)
    initial = initial_path.read_text(encoding="utf-8", errors="replace")
    csrf_match = re.search(r'name="_csrf"\s+value="([^"]+)"', initial)
    if not csrf_match:
        raise RuntimeError("CSRF token not found")
    csrf = csrf_match.group(1)
    print("CSRF", csrf, flush=True)

    keywords = ["주유소", "세차장", "위험물", "면세유", "탱크로리"]
    result: dict[str, object] = {"keywords": {}}
    for keyword in keywords:
        fields = {
            "_csrf": csrf,
            "recordCountPerPage": "100",
            "pageIndex": "1",
            "epUnionSn": "",
            "dutySctnNm": "",
            "lcgovBlngInstCd": "",
            "searchOptionClickYn": "Y",
            "searchWordType": "0",
            "searchWord": keyword,
            "rqstStDt": "2025-08-26",
            "rqstEndDt": "2026-08-25",
            "dateType": "6",
            "pttnTypeNm": "",
            "searchInstNm": "",
            "searchInstCd": "all",
            "focusPerPageYn": "",
        }
        search_path = OUT / f"search_{keyword}.html"
        curl_fetch(LIST, search_path, fields=fields, headers=[f"X-CSRF-TOKEN: {csrf}"])
        text = search_path.read_text(encoding="utf-8", errors="replace")
        total, pages, rows = parse_rows(text)
        print("SEARCH", keyword, "total", total, "pages", pages, "rows", len(rows), flush=True)
        print(json.dumps(rows[:5], ensure_ascii=False), flush=True)
        detail_samples = []
        for row in rows[:3]:
            detail_path = OUT / f"detail_{keyword}_{row['board_no']}.html"
            curl_fetch(row["detail_url"], detail_path)
            parsed = parse_detail(detail_path.read_text(encoding="utf-8", errors="replace"))
            parsed.update({"url": row["detail_url"], "ep_union_sn": row["ep_union_sn"], "dutySctnNm": row["dutySctnNm"]})
            detail_samples.append(parsed)
        result["keywords"][keyword] = {"total": total, "pages": pages, "rows": rows, "detail_samples": detail_samples}
        partial = json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8")
        (OUT / "search_probe.partial.json").write_bytes(partial)

    encoded = json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8")
    (OUT / "search_probe.json").write_bytes(encoded)
    (OUT / "sha256.txt").write_text(hashlib.sha256(encoded).hexdigest() + "\n", encoding="ascii")


if __name__ == "__main__":
    main()
