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
OUT = Path("p19_harvest_rows_out")
OUT.mkdir(exist_ok=True)
COOKIE = OUT / "cookies.txt"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/151 Safari/537.36 P19-EPEOPLE-READONLY/1.0"

KEYWORDS = [
    "주유소", "석유판매", "석유판매업", "유류판매", "이동판매", "배달판매", "이동탱크", "탱크로리",
    "주유기", "정량미달", "가짜석유", "혼유", "석유 품질검사", "휘발유", "경유", "등유",
    "가격표시 주유소", "오피넷", "주유취급소", "위험물 탱크", "지하탱크", "흡연 주유소",
    "금연 주유소", "유증기", "토양오염 주유소", "누출 주유소", "세차장", "자동세차",
    "셀프세차", "세차 폐수", "유수분리", "폐수배출 세차", "면세유", "수급보고", "석유수급",
    "선박연료", "선박급유", "급유선", "연료공급업", "석유운송", "유조차", "개발제한구역 주유소",
    "주유소 허가", "주유소 변경", "주유소 편의점", "주유소 진입로", "주유소 세차", "주유소 화재",
    "주유소 흡연", "주유소 위험물",
]


def clean(fragment: str) -> str:
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    fragment = html.unescape(fragment)
    return re.sub(r"\s+", " ", fragment).strip()


def parse_rows(text: str) -> tuple[int, int, list[dict[str, str]]]:
    m = re.search(r"총\s*<span>([0-9,]+)</span>건\s*등록\s*\((\d+)/(\d+)\)", text)
    total = int(m.group(1).replace(",", "")) if m else 0
    pages = int(m.group(3)) if m else 0
    pattern = re.compile(
        r"<tr>\s*<td>(\d+)</td>\s*<td[^>]*>\s*<a[^>]+onclick=\"javaScript:fn_detail\(this,'([^']+)','([^']+)'\);\"[^>]*>(.*?)</a>\s*</td>\s*<td>(.*?)</td>\s*<td>(\d{4}-\d{2}-\d{2})</td>",
        re.I | re.S,
    )
    rows = []
    for no, ep, duty, title, agency, date in pattern.findall(text):
        ep = html.unescape(ep)
        rows.append({
            "board_no": no,
            "ep_union_sn": ep,
            "dutySctnNm": duty,
            "title": clean(title),
            "agency": clean(agency),
            "date": date,
            "detail_url": DETAIL + "?" + urllib.parse.urlencode({"epUnionSn": ep, "dutySctnNm": duty}),
        })
    return total, pages, rows


def curl(url: str, output: Path, *, fields: dict[str, str] | None = None, csrf: str = "") -> None:
    cmd = [
        "curl", "-4", "--silent", "--show-error", "--fail-with-body", "--location",
        "--connect-timeout", "20", "--max-time", "120", "--retry", "8", "--retry-delay", "4",
        "--retry-max-time", "480", "--retry-all-errors", "--user-agent", UA,
        "--cookie", str(COOKIE), "--cookie-jar", str(COOKIE),
        "--header", "Accept-Language: ko-KR,ko;q=0.9,en;q=0.7", "--header", "Connection: close",
        "--output", str(output),
    ]
    if fields is not None:
        cmd += ["--request", "POST", "--referer", LIST, "--header", f"X-CSRF-TOKEN: {csrf}"]
        for key, value in fields.items():
            cmd += ["--data-urlencode", f"{key}={value}"]
    cmd.append(url)
    subprocess.run(cmd, check=True)


def main() -> None:
    initial_path = OUT / "initial.html"
    curl(LIST, initial_path)
    initial = initial_path.read_text(encoding="utf-8", errors="replace")
    m = re.search(r'name="_csrf"\s+value="([^"]+)"', initial)
    if not m:
        raise RuntimeError("csrf not found")
    csrf = m.group(1)
    by_keyword: dict[str, object] = {}
    unique: dict[str, dict[str, str]] = {}
    for index, keyword in enumerate(KEYWORDS, 1):
        fields = {
            "_csrf": csrf, "recordCountPerPage": "100", "pageIndex": "1", "epUnionSn": "",
            "dutySctnNm": "", "lcgovBlngInstCd": "", "searchOptionClickYn": "Y",
            "searchWordType": "0", "searchWord": keyword, "rqstStDt": "2025-08-26",
            "rqstEndDt": "2026-08-25", "dateType": "6", "pttnTypeNm": "",
            "searchInstNm": "", "searchInstCd": "all", "focusPerPageYn": "",
        }
        output = OUT / f"search_{index:02d}.html"
        curl(LIST, output, fields=fields, csrf=csrf)
        total, pages, rows = parse_rows(output.read_text(encoding="utf-8", errors="replace"))
        print(f"{index:02d}/{len(KEYWORDS)} {keyword} total={total} pages={pages} rows={len(rows)}", flush=True)
        by_keyword[keyword] = {"total": total, "pages": pages, "rows": rows}
        for row in rows:
            current = unique.setdefault(row["ep_union_sn"], {**row, "matched_keywords": []})
            current["matched_keywords"].append(keyword)
        partial = {"keywords": by_keyword, "unique_rows": list(unique.values())}
        (OUT / "harvest.partial.json").write_text(json.dumps(partial, ensure_ascii=False, indent=2), encoding="utf-8")
    result = {"keywords": by_keyword, "unique_rows": list(unique.values())}
    data = json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8")
    (OUT / "harvest.json").write_bytes(data)
    (OUT / "sha256.txt").write_text(hashlib.sha256(data).hexdigest() + "\n", encoding="ascii")
    print("UNIQUE", len(unique), flush=True)


if __name__ == "__main__":
    main()
