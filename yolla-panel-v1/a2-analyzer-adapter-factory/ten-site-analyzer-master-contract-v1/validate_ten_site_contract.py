import json,hashlib,sys
UNKNOWN={"UNKNOWN","WAITING_INPUT",None,""}
REQ=["target_pc_working_root","chrome_executable_or_existing_browser_agent_exact_binding","target_url","site_id","authorized_user_session_reference","target_page_binding"]
LANES=["DATA","PRODUCT","WRITE","MY_LISTING","EDIT"]
def val(slot,key):
    if key in ("target_pc_working_root","chrome_executable_or_existing_browser_agent_exact_binding"):
        return slot.get("runtime_binding",{}).get(key)
    return slot.get(key)
def validate(reg):
    errs=[]; slots=reg.get("slots",[]); common=reg.get("common_slot_contract",{})
    if len(slots)!=10: errs.append("SLOT_COUNT_NE_10")
    if len({s.get("slot_id") for s in slots})!=len(slots): errs.append("DUPLICATE_SLOT_ID")
    caps=common.get("capabilities",{})
    for lane in LANES:
        if lane not in caps: errs.append("MISSING_COMMON_LANE:"+lane)
    if "USER_CONFIRM" not in str(caps.get("WRITE")): errs.append("WRITE_CONFIRM_GUARD")
    if "USER_CONFIRM" not in str(caps.get("EDIT")): errs.append("EDIT_CONFIRM_GUARD")
    ready=waiting=0
    for s in slots:
        missing=[k for k in REQ if val(s,k) in UNKNOWN]
        expected="WAITING_INPUT" if missing else "READY_FOR_SUCCESSOR_DISPATCH"
        if s.get("status")!=expected: errs.append(f"{s.get('slot_id')}:STATUS_MISMATCH:{expected}")
        ready+=expected=="READY_FOR_SUCCESSOR_DISPATCH"; waiting+=expected=="WAITING_INPUT"
    canonical=json.dumps(reg,sort_keys=True,separators=(",",":"))
    return {"pass":not errs,"errors":errs,"ready_slots":ready,"waiting_slots":waiting,"digest_sha256":hashlib.sha256(canonical.encode()).hexdigest()}
if __name__=="__main__":
    with open(sys.argv[1],encoding="utf-8") as f: reg=json.load(f)
    print(json.dumps(validate(reg),ensure_ascii=False,sort_keys=True))
