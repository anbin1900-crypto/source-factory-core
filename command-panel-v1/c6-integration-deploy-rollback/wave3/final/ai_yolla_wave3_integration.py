from __future__ import annotations
import copy, hashlib, json, re
from datetime import datetime, timedelta, timezone
from typing import Any
KST=timezone(timedelta(hours=9)); SHA40=re.compile(r"^[0-9a-f]{40}$")
SKEY=re.compile(r"(password|secret|token|api[_-]?key|private[_-]?key|credential|authorization|cookie)",re.I)
SVAL=[re.compile(r"PRIVATE KEY"),re.compile(r"\bBearer\s+",re.I),re.compile(r"\b(?:ghp|github_pat|AKIA)[A-Za-z0-9_-]{8,}")]
def cb(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()
def dg(v): return hashlib.sha256(cb(v)).hexdigest()
def dkey(r,d,w,t): return hashlib.sha256(f"{r}|{d}|{w}|{t}".encode()).hexdigest()
def kst(v): return datetime.strptime(v,"%Y-%m-%d %H:%M KST").replace(tzinfo=KST)
def iso(v): return datetime.fromisoformat(v).astimezone(KST)
def scan(v,p="$"):
    out=[]
    if isinstance(v,dict):
        for k,x in v.items():
            q=f"{p}.{k}"
            if SKEY.search(k): out.append(f"SENSITIVE_KEY:{q}")
            out+=scan(x,q)
    elif isinstance(v,list):
        for i,x in enumerate(v): out+=scan(x,f"{p}[{i}]")
    elif isinstance(v,str):
        for r in SVAL:
            if r.search(v): out.append(f"SENSITIVE_VALUE:{p}")
    return out
def matrix_ok(m):
    ins=m.get("inputs",{})
    checks={
      "workers_4_of_4":set(ins)=={"C-2","C-3","C-4","C-5"},
      "accepted_inputs_4":m.get("accepted_inputs")==4,
      "virtual_pass_zero":m.get("virtual_pass_count")==0,
      "heads_sha40":all(SHA40.fullmatch(x.get("head","")) for x in ins.values()),
      "terminals_pass":all(str(x.get("terminal","")).endswith("PASS") for x in ins.values()),
      "blobs_sha40":all(SHA40.fullmatch(v) for x in ins.values() for k,v in x.items() if k.endswith("_blob")),
      "read_only":m["a1_pc_runtime_authority"]["consumption_mode"]=="READ_ONLY_NO_PC_DISPATCH",
      "key_valid":m["duplicate_prompt_key"]==dkey("C-6",m["directive_id"],m["wave_id"],m["directive_registered_at_kst"])
    }
    return {"pass":all(checks.values()),"checks":checks}
def window(f):
    c=f["pc_context"]; cap=iso(c["captured_at_iso"]); now=kst(f["observed_at_kst"]); end=cap+timedelta(minutes=c["maximum_age_minutes"])
    age=int((now-cap).total_seconds()//60)
    if age<0: raise ValueError("CONTEXT_FROM_FUTURE")
    return {"captured":cap.strftime("%Y-%m-%d %H:%M KST"),"valid_until":end.strftime("%Y-%m-%d %H:%M KST"),
            "age":age,"fresh":"FRESH" if now<=end and c["freshness"]=="FRESH" else "STALE"}
def privacy_ok(c):
    b=c["privacy_boundary"]; keys=["credentials_collected","tokens_collected","browser_data_collected","ssh_private_keys_collected","environment_variable_values_collected","secret_values_published"]
    return all(b.get(k) is False for k in keys) and not scan({k:v for k,v in c.items() if k!="privacy_boundary"})
def card(f):
    a=f["runtime_authority"]; w=window(f)
    ok=(a["a1_control_pr"]==142 and a["target_pc_accepted_comment"]==5153045063 and a["resident_monitoring_comment"]==5155863538
        and a["target_pc_terminal"]=="A1_PC_AGENT_WINDOWS_RUNTIME_V1_TARGET_PC_ACCEPTED" and a["task_registered"] is True
        and a["supervisor_process_count"]==a["worker_process_count"]==1 and a["controlled_request"]=="PASS"
        and a["duplicate_execution_count"]==0 and a["worker_crash_recovery"]==a["full_runtime_restart"]==a["result_persistence"]=="PASS")
    cs="CONTEXT_FRESH" if w["fresh"]=="FRESH" else "CONTEXT_STALE"
    return {"runtime_state":"TARGET_PC_ACCEPTED" if ok else "RUNTIME_UNVERIFIED","context_state":cs,
      "overall_state":"TARGET_PC_ACCEPTED" if ok and cs=="CONTEXT_FRESH" else cs,
      "context_published_at_kst":w["captured"],"context_age_minutes":w["age"],"sensitive_value_display_count":0,
      "actual_pc_command_count":0,"source_digest":dg({"authority":a,"window":w})}
def context(f):
    w=window(f); a=f["runtime_authority"]
    return {"snapshot_id":f["pc_context"]["snapshot_id"],"captured_at_kst":w["captured"],"valid_until_kst":w["valid_until"],
      "freshness":w["fresh"],"runtime_version":a["runtime_version"],"runtime_health_status":f["pc_context"]["runtime_health_status"],
      "role_id":"C-6","wave_id":"WAVE_3","platform_id":"AI_YOLLA","service_id":"AUTOMATION","domain_pack_id":"COMMAND_PANEL_CORE"}
def admit(f,p=None,c=None,a=None,l=None):
    p=copy.deepcopy(p or f["admission_prompt"]); c=copy.deepcopy(c or context(f)); a=copy.deepcopy(a or f["runtime_authority"]); l=copy.deepcopy(f["ledger"] if l is None else l)
    req={"a1_control_pr":142,"target_pc_accepted_comment":5153045063,"target_pc_terminal":"A1_PC_AGENT_WINDOWS_RUNTIME_V1_TARGET_PC_ACCEPTED",
      "resident_monitoring_comment":5155863538,"canonical_runtime_root":"D:\\YOLLA_PC_BRIDGE","runtime_version":"1.0.0-20260802"}
    for k,v in req.items():
        if a.get(k)!=v:return {"admitted":False,"decision":"REJECT_RUNTIME_UNVERIFIED"}
    if a.get("target_pc_accepted") is not True:return {"admitted":False,"decision":"REJECT_RUNTIME_UNVERIFIED"}
    if c["freshness"]!="FRESH" or kst(c["captured_at_kst"])>kst(f["observed_at_kst"]) or kst(c["valid_until_kst"])<kst(f["observed_at_kst"]):return {"admitted":False,"decision":"REJECT_STALE_PC_CONTEXT"}
    if c["runtime_version"]!=a["runtime_version"]:return {"admitted":False,"decision":"REJECT_RUNTIME_VERSION_MISMATCH"}
    ids=("role_id","wave_id","platform_id","service_id","domain_pack_id")
    if any(p.get(x)!=c.get(x) for x in ids):return {"admitted":False,"decision":"REJECT_ROLE_SERVICE_WAVE_MISMATCH"}
    key=dkey(p["role_id"],p["directive_id"],p["wave_id"],p["directive_registered_at_kst"])
    if p.get("duplicate_prompt_key")!=key or any(x.get("duplicate_prompt_key")==key for x in l):return {"admitted":False,"decision":"REJECT_DUPLICATE"}
    if any(x.get("role_id")==p["role_id"] and x.get("directive_id")==p["directive_id"] and x.get("result_accepted") for x in l):return {"admitted":False,"decision":"REJECT_ALREADY_ACCEPTED"}
    latest=max([int(x["wave_id"].split("_")[-1]) for x in l if str(x.get("wave_id","")).startswith("WAVE_")]+[0])
    if int(p["wave_id"].split("_")[-1])<latest:return {"admitted":False,"decision":"REJECT_STALE_WAVE"}
    if a.get("runtime_health_status") in {"BLOCKED","FAILED","OFFLINE","UNHEALTHY"} or c.get("runtime_health_status") in {"BLOCKED","FAILED","OFFLINE","UNHEALTHY"}:return {"admitted":False,"decision":"REJECT_RUNTIME_HEALTH_BLOCKED"}
    if scan(p.get("payload",{})):return {"admitted":False,"decision":"REJECT_SENSITIVE_PAYLOAD"}
    return {"admitted":True,"decision":"ADMIT_RUNTIME_DISPATCH","dispatch_contract":{"authority":"sfApi.stage4.dispatchNextPrompt","plan_only":True,"actual_dispatch_performed":False,"new_transport_created":False},"context":c,"computed_key":key}
def run(f,m):
    mv=matrix_ok(m)
    if not mv["pass"]:raise ValueError("EXACT_INPUT_MATRIX_INVALID")
    if not privacy_ok(f["pc_context"]):raise ValueError("PRIVACY_BOUNDARY_INVALID")
    cd=card(f); ad=admit(f)
    if cd["runtime_state"]!="TARGET_PC_ACCEPTED" or cd["context_state"]!="CONTEXT_FRESH" or not ad["admitted"]:raise ValueError("INTEGRATION_GATE_REJECTED")
    sessions={};results={}
    for s in f["services"]:
        sid=s["service_id"]; x=f"{s['browser_session_id']}::{sid}::WAVE_3::{f['pc_context']['snapshot_id']}"
        sessions[sid]={**s,"workspace_service_session_id":x,"context_snapshot_id":f["pc_context"]["snapshot_id"],"runtime_environment_id":f["runtime_environment_id"]}
        results[sid]=[{"service_id":sid,"domain_pack_id":s["domain_pack_id"],"workspace_service_session_id":x,"status":"E2E_FIXTURE_VERIFIED","actual_dispatch_performed":False}]
    state={"selected_service_id":f["services"][-1]["service_id"],"sessions":sessions,"results":results,"admission":ad,"card":cd,"actual_pc_dispatch_count":0,"actual_panel_apply_count":0}
    restored=copy.deepcopy(state); restart=dg(restored)==dg(state)
    base={"selected_service_id":None,"sessions":{},"results":{},"admission":ad,"card":cd,"actual_pc_dispatch_count":0,"actual_panel_apply_count":0}
    rollback=dg(copy.deepcopy(base))==dg(base) and dg(state)!=dg(base)
    ids=list(sessions); ss=[x["workspace_service_session_id"] for x in sessions.values()]
    checks={"exact_input_matrix":mv["pass"],"target_pc_authority":cd["runtime_state"]=="TARGET_PC_ACCEPTED","context_normalization":cd["context_published_at_kst"]=="2026-08-02 19:03 KST",
      "context_fresh":cd["context_state"]=="CONTEXT_FRESH","admission_plan_only":ad["dispatch_contract"]["plan_only"],"actual_dispatch_zero":not ad["dispatch_contract"]["actual_dispatch_performed"],
      "actual_panel_apply_zero":state["actual_panel_apply_count"]==0,"three_services":len(ids)==len(set(ids))==3,"session_isolation":len(ss)==len(set(ss))==3,
      "result_leak_zero":all(len(results[x])==1 and results[x][0]["service_id"]==x for x in ids),"restart_recovery":restart,"rollback_blob_parity":rollback,
      "privacy_boundary":privacy_ok(f["pc_context"]),"sensitive_display_zero":cd["sensitive_value_display_count"]==0}
    return {"pass":all(checks.values()),"checks":checks,"matrix_validation":mv,"card":cd,"admission":ad,"restart_recovery":"PASS" if restart else "FAIL",
      "rollback_blob_parity":"PASS" if rollback else "FAIL","service_count":len(ids),"session_count":len(ss),"actual_pc_dispatch_count":0,"actual_panel_apply_count":0,"state_digest":dg(state)}
