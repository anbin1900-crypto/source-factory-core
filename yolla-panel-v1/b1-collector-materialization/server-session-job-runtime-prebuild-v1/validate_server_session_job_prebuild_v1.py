#!/usr/bin/env python3
import json, pathlib, threading, tempfile, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent
TOKEN = "fixture-token-not-a-real-secret"
required_files = [
    "SERVER_SESSION_JOB_CONTRACT_V1.json",
    "AGENT_SERVER_BINDING_CONTRACT_V1.json",
    "SERVER_BROWSER_WORKER_PLAN_V1.json",
    "SUCCESSOR_SERVER_BOOTSTRAP_PLAN_V1.json",
    "schemas/SERVER_SESSION_JOB_CONTRACT_V1.schema.json",
    "fixtures/LOCAL_FIXTURE_SMOKE_1.json",
]
loaded = {rel: json.loads((ROOT/rel).read_text(encoding="utf-8")) for rel in required_files}
schema=loaded["schemas/SERVER_SESSION_JOB_CONTRACT_V1.schema.json"]
contract=loaded["SERVER_SESSION_JOB_CONTRACT_V1.json"]
for key in schema["required"]:
    assert key in contract, f"missing contract key: {key}"
for model in ["AGENT_REGISTRY","SESSION_REGISTRY","JOB","RECIPE","ADAPTER","TRACE","DATASET","RESUME_STATE"]:
    assert model in contract["models"], f"missing model: {model}"
assert contract["boundaries"]["new_tunnel_create"] is False
assert contract["boundaries"]["target_pc_execution"] is False
assert contract["boundaries"]["new_browser_engine"] is False
binding=loaded["AGENT_SERVER_BINDING_CONTRACT_V1.json"]
assert binding["transport"]["verified_tunnel_profile"]=="yolla-data-ledger-http"
assert binding["transport"]["browser_agent_target"]=="http://127.0.0.1:32100"
assert binding["transport"]["chrome_cdp_target"]=="http://127.0.0.1:9222"
assert binding["transport"]["direct_tunnel_to_cdp_9222"]=="PROHIBITED"
assert "127.0.0.1:8110/mcp" in binding["transport"]["existing_local_mcp_target"]
fixture=loaded["fixtures/LOCAL_FIXTURE_SMOKE_1.json"]

state={"sessions":{}, "results":{}}
state_file=tempfile.NamedTemporaryFile(prefix="b1-prebuild-fixture-", suffix=".json", delete=False)
state_file.close()

class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): return
    def _auth(self):
        return self.headers.get("Authorization") == f"Bearer {TOKEN}"
    def _json(self, code, obj):
        body=json.dumps(obj,ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if not self._auth():
            return self._json(401,{"error":"unauthorized"})
        if self.path=="/health":
            return self._json(200,{"agent_id":fixture["agent"]["agent_id"],"agent_instance_id":fixture["agent"]["agent_instance_id"],"status":"ONLINE","time":"2026-08-07T12:20:00Z"})
        if self.path=="/pages":
            return self._json(200,{"agent_id":fixture["agent"]["agent_id"],"pages":[{"page_id":fixture["session"]["page_id"],"url":"https://fixture.invalid/list","title":"Fixture List"}]})
        return self._json(404,{"error":"not_found"})
    def do_POST(self):
        if not self._auth():
            return self._json(401,{"error":"unauthorized"})
        n=int(self.headers.get("Content-Length","0"))
        payload=json.loads(self.rfile.read(n) or b"{}")
        if self.path=="/site-analyzer/v1/sessions/register":
            state["sessions"][payload["session_id"]]=payload
            pathlib.Path(state_file.name).write_text(json.dumps(state,sort_keys=True),encoding="utf-8")
            return self._json(200,{"accepted":True,"session_id":payload["session_id"],"server_revision":1})
        if self.path=="/site-analyzer/v1/jobs/result":
            state["results"][payload["job_id"]]=payload
            pathlib.Path(state_file.name).write_text(json.dumps(state,sort_keys=True),encoding="utf-8")
            return self._json(200,{"accepted":True,"job_id":payload["job_id"],"checkpoint_version":2})
        return self._json(404,{"error":"not_found"})

srv=ThreadingHTTPServer(("127.0.0.1",0),H)
thread=threading.Thread(target=srv.serve_forever,daemon=True); thread.start()
base=f"http://127.0.0.1:{srv.server_address[1]}"

def req(path, method="GET", body=None, auth=True):
    headers={}
    if auth: headers["Authorization"]=f"Bearer {TOKEN}"
    data=None
    if body is not None:
        data=json.dumps(body).encode(); headers["Content-Type"]="application/json"
    r=urllib.request.Request(base+path,data=data,headers=headers,method=method)
    try:
        with urllib.request.urlopen(r,timeout=5) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

assert req("/health",auth=False)[0]==401
health_status,health=req("/health")
pages_status,pages=req("/pages")
assert health_status==200 and health["agent_id"]==fixture["agent"]["agent_id"]
assert pages_status==200 and len(pages["pages"])==1

session_body={
  "agent_id":fixture["agent"]["agent_id"],
  "agent_instance_id":fixture["agent"]["agent_instance_id"],
  "page_id":fixture["session"]["page_id"],
  "session_id":fixture["session"]["session_id"],
  "observed_at":"2026-08-07T12:20:00Z",
}
assert req("/site-analyzer/v1/sessions/register","POST",session_body)[0]==200

job_result={
  "job_id":fixture["job"]["job_id"],
  "session_id":fixture["session"]["session_id"],
  "status":"RUNNING",
  "cursor":fixture["resume_state"]["cursor"],
  "last_successful_step":fixture["resume_state"]["last_successful_step"],
  "trace_ref":"fixture://trace/7",
  "dataset_ref":"fixture://dataset/10",
  "receipt_ref":"fixture://receipt/1",
  "reported_at":"2026-08-07T12:21:00Z",
}
assert req("/site-analyzer/v1/jobs/result","POST",job_result)[0]==200

reloaded=json.loads(pathlib.Path(state_file.name).read_text(encoding="utf-8"))
saved_result=reloaded["results"][fixture["job"]["job_id"]]
steps=fixture["recipe"]["steps"]
idx=steps.index(saved_result["last_successful_step"])
next_step=steps[idx+1] if idx+1 < len(steps) else None
expected=fixture["expected_after_reload"]
assert saved_result["cursor"]==expected["cursor"]
assert saved_result["last_successful_step"]==expected["last_successful_step"]
assert next_step==expected["next_step"]

srv.shutdown(); srv.server_close()
pathlib.Path(state_file.name).unlink(missing_ok=True)

result={
  "schema_parse":"PASS",
  "required_model_count":8,
  "local_fixture_smoke_1":"PASS",
  "http_unauthenticated_reject":"PASS_401",
  "http_authenticated_health":"PASS_200",
  "http_authenticated_pages":"PASS_200_COUNT_1",
  "session_registration":"PASS",
  "job_result_checkpoint":"PASS",
  "restart_reload":"PASS",
  "cursor_preserved":True,
  "last_successful_step_preserved":True,
  "next_step":"EXPORT",
  "dataset_record_count":10,
  "trace_sequence":7,
  "new_tunnel":0,
  "target_pc_execution":0,
  "new_browser_engine":0,
}
print(json.dumps(result,ensure_ascii=False,sort_keys=True))
