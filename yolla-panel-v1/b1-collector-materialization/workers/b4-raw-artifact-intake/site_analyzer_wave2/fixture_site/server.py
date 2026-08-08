from __future__ import annotations

import csv
import io
import json
import threading
import urllib.parse
from dataclasses import asdict, dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


@dataclass(frozen=True)
class Item:
    id: int
    name: str
    category: str
    value: int


ITEMS = [
    Item(id=i, name=f"Fixture Item {i:02d}", category="odd" if i % 2 else "even", value=i * 100)
    for i in range(1, 11)
]


class FixtureState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.failure_counts: dict[str, int] = {}

    def should_fail_once(self, key: str) -> bool:
        with self.lock:
            count = self.failure_counts.get(key, 0)
            self.failure_counts[key] = count + 1
            return count == 0


STATE = FixtureState()


def _json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")


def _html_page(title: str, body: str, script: str = "") -> bytes:
    return f"""<!doctype html>
<html><head><meta charset='utf-8'><title>{title}</title>
<style>
body{{font-family:Arial,sans-serif;margin:20px}} .item{{border:1px solid #bbb;padding:8px;margin:6px 0}}
#sentinel{{height:10px}} iframe{{width:100%;height:180px;border:1px solid #555}}
</style></head><body><h1>{title}</h1>{body}<script>{script}</script></body></html>""".encode("utf-8")


class FixtureHandler(BaseHTTPRequestHandler):
    server_version = "YollaFixtureSite/2.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def _send(self, status: int, body: bytes, content_type: str, headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if headers:
            for key, value in headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _not_found(self) -> None:
        self._send(HTTPStatus.NOT_FOUND, b"not found", "text/plain; charset=utf-8")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        path = parsed.path

        if path == "/":
            links = "".join(
                f"<li><a href='{href}'>{href}</a></li>"
                for href in [
                    "/list?page=1", "/api/items?page=1", "/load-more", "/infinite",
                    "/frame", "/popup", "/download.csv", "/schema-drift?mode=v2",
                ]
            )
            self._send(200, _html_page("YOLLA Common Fixture Site", f"<ul>{links}</ul>"), "text/html; charset=utf-8")
            return

        if path == "/health":
            self._send(200, _json_bytes({"status": "ok", "record_count": len(ITEMS)}), "application/json")
            return

        if path == "/list":
            page = max(1, int(query.get("page", ["1"])[0]))
            page_size = 5
            start = (page - 1) * page_size
            page_items = ITEMS[start:start + page_size]
            cards = "".join(
                f"<article class='item' data-record-id='{item.id}'><h2 class='name'>{item.name}</h2>"
                f"<span class='category'>{item.category}</span><span class='value'>{item.value}</span>"
                f"<a class='detail' href='/detail/{item.id}'>Detail</a></article>"
                for item in page_items
            )
            next_link = f"<a id='next-page' href='/list?page={page + 1}'>Next</a>" if start + page_size < len(ITEMS) else ""
            self._send(200, _html_page(f"List page {page}", f"<main id='records'>{cards}</main>{next_link}"), "text/html; charset=utf-8")
            return

        if path.startswith("/detail/"):
            try:
                item_id = int(path.rsplit("/", 1)[1])
                item = ITEMS[item_id - 1]
            except (ValueError, IndexError):
                self._not_found()
                return
            body = (
                f"<section id='detail' data-record-id='{item.id}'><h2>{item.name}</h2>"
                f"<dl><dt>Category</dt><dd>{item.category}</dd><dt>Value</dt><dd>{item.value}</dd></dl></section>"
            )
            self._send(200, _html_page(f"Detail {item.id}", body), "text/html; charset=utf-8")
            return

        if path == "/api/items":
            page = max(1, int(query.get("page", ["1"])[0]))
            run_id = query.get("run_id", ["default"])[0]
            fail_once = query.get("fail_once", ["0"])[0] == "1"
            if fail_once and page == 2 and STATE.should_fail_once(f"api-page2:{run_id}"):
                self._send(HTTPStatus.SERVICE_UNAVAILABLE, _json_bytes({"error": "injected transient failure", "retryable": True}), "application/json")
                return
            page_size = 5
            start = (page - 1) * page_size
            records = [asdict(item) for item in ITEMS[start:start + page_size]]
            next_page = page + 1 if start + page_size < len(ITEMS) else None
            self._send(200, _json_bytes({"records": records, "page": page, "next_page": next_page, "total": 10}), "application/json")
            return

        if path == "/load-more":
            body = "<div id='records'></div><button id='load-more'>Load More</button><div id='status'></div>"
            script = """
let offset=0; async function load(){const r=await fetch('/load-more-fragment?offset='+offset); const h=await r.text();
document.querySelector('#records').insertAdjacentHTML('beforeend',h); offset+=2;
if(offset>=10){document.querySelector('#load-more').disabled=true;document.querySelector('#status').textContent='done';}}
document.querySelector('#load-more').addEventListener('click',load);
"""
            self._send(200, _html_page("Load More", body, script), "text/html; charset=utf-8")
            return

        if path == "/load-more-fragment":
            offset = max(0, int(query.get("offset", ["0"])[0]))
            fragment = "".join(
                f"<article class='item' data-record-id='{item.id}'><span class='name'>{item.name}</span></article>"
                for item in ITEMS[offset:offset + 2]
            ).encode("utf-8")
            self._send(200, fragment, "text/html; charset=utf-8")
            return

        if path == "/infinite":
            body = "<div id='records'></div><div id='sentinel'>sentinel</div><div id='status'></div>"
            script = """
let cursor=0, busy=false, done=false;
async function load(){if(busy||done)return;busy=true;const r=await fetch('/infinite-data?cursor='+cursor);const p=await r.json();
for(const x of p.records){const a=document.createElement('article');a.className='item';a.dataset.recordId=x.id;a.textContent=x.name;document.querySelector('#records').appendChild(a);}cursor=p.next_cursor;
if(cursor===null){done=true;document.querySelector('#status').textContent='done';}busy=false;}
const obs=new IntersectionObserver(e=>{if(e.some(x=>x.isIntersecting))load();});obs.observe(document.querySelector('#sentinel'));load();
"""
            self._send(200, _html_page("Infinite Scroll", body, script), "text/html; charset=utf-8")
            return

        if path == "/infinite-data":
            raw = query.get("cursor", ["0"])[0]
            cursor = 0 if raw in {"", "null", "None"} else int(raw)
            records = [asdict(item) for item in ITEMS[cursor:cursor + 2]]
            next_cursor = cursor + 2 if cursor + 2 < len(ITEMS) else None
            self._send(200, _json_bytes({"records": records, "next_cursor": next_cursor}), "application/json")
            return

        if path == "/frame":
            self._send(200, _html_page("Frame Host", "<iframe id='result-frame' src='/frame-content'></iframe>"), "text/html; charset=utf-8")
            return

        if path == "/frame-content":
            self._send(200, _html_page("Frame Content", "<article id='frame-record' data-record-id='7'>Fixture Item 07</article>"), "text/html; charset=utf-8")
            return

        if path == "/popup":
            body = "<button id='open-popup'>Open Popup</button>"
            script = "document.querySelector('#open-popup').addEventListener('click',()=>window.open('/popup-content','fixture-popup','width=500,height=300'));"
            self._send(200, _html_page("Popup Host", body, script), "text/html; charset=utf-8")
            return

        if path == "/popup-content":
            self._send(200, _html_page("Popup Content", "<article id='popup-record' data-record-id='8'>Fixture Item 08</article>"), "text/html; charset=utf-8")
            return

        if path == "/download.csv":
            output = io.StringIO(newline="")
            writer = csv.DictWriter(output, fieldnames=["id", "name", "category", "value"], lineterminator="\n")
            writer.writeheader()
            for item in ITEMS:
                writer.writerow(asdict(item))
            body = output.getvalue().encode("utf-8")
            self._send(200, body, "text/csv; charset=utf-8", {"Content-Disposition": "attachment; filename=fixture-items.csv"})
            return

        if path == "/schema-drift":
            mode = query.get("mode", ["v1"])[0]
            if mode == "v2":
                payload = {"schema": "v2", "records": [{"recordId": x.id, "title": x.name, "amount": x.value, "extra": x.category} for x in ITEMS[:2]]}
            else:
                payload = {"schema": "v1", "records": [{"id": x.id, "name": x.name, "value": x.value} for x in ITEMS[:2]]}
            self._send(200, _json_bytes(payload), "application/json")
            return

        self._not_found()


def create_server(host: str = "127.0.0.1", port: int = 0) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), FixtureHandler)


def start_in_thread(host: str = "127.0.0.1", port: int = 0) -> tuple[ThreadingHTTPServer, threading.Thread, str]:
    server = create_server(host, port)
    thread = threading.Thread(target=server.serve_forever, name="yolla-fixture-http", daemon=True)
    thread.start()
    actual_port = int(server.server_address[1])
    return server, thread, f"http://{host}:{actual_port}"


if __name__ == "__main__":
    server = create_server("127.0.0.1", 43127)
    print(json.dumps({"status": "READY", "base_url": "http://127.0.0.1:43127", "record_count": 10}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
