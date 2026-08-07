#!/usr/bin/env python3
from __future__ import annotations
import copy, json, re, sys
from pathlib import Path
from jsonschema import Draft202012Validator

PURPOSES={"APP_VERSION_RUNTIME_STATUS","IDLE_WORKING_ZERO","RESULT_COMMENT_PRIORITY","CURRENT_HISTORICAL_REGISTRY","C_MODE_SEPARATION","REPEAT_MODE_SEPARATION","RESTART_BEFORE","RESTART_AFTER","ROLLBACK_VISUAL_STATE"}

def semantic_validate(doc:dict)->None:
    shots=doc["screenshots"]
    purposes=[x["purpose"] for x in shots]
    if set(purposes)!=PURPOSES or len(purposes)!=len(PURPOSES): raise ValueError("SCREENSHOT_PURPOSE_SET_MISMATCH")
    hashes=[x["sha256"] for x in shots]
    if len(set(hashes))!=len(hashes): raise ValueError("DUPLICATE_SCREENSHOT_HASH")
    ui=doc["ui_truth_assertions"]
    if set(ui["current_registry_roles"]) & set(ui["historical_registry_roles"]): raise ValueError("CURRENT_HISTORICAL_OVERLAP")
    if doc["login_profile_preservation"]["before_sha256"]!=doc["login_profile_preservation"]["after_sha256"]: raise ValueError("PROFILE_HASH_CHANGED")
    if doc["mode_separation"]["c_mode_state_sha256"]==doc["mode_separation"]["repeat_state_sha256"]: raise ValueError("C_REPEAT_STATE_COLLISION")
    rb=doc["rollback_visual_evidence"]
    rollback_hash=next(x["sha256"] for x in shots if x["purpose"]=="ROLLBACK_VISUAL_STATE")
    if rb["screenshot_sha256"]!=rollback_hash: raise ValueError("ROLLBACK_SCREENSHOT_HASH_MISMATCH")
    if doc["live_pass_claimed"] or doc["target_pc_acceptance_claimed"]: raise ValueError("PREMATURE_LIVE_PASS")

def must_fail(schema,doc,needle):
    try:
        Draft202012Validator(schema).validate(doc); semantic_validate(doc)
    except Exception as exc:
        return {"case":needle,"status":"PASS_REJECTED","reason":str(exc)[:180]}
    raise AssertionError(f"NEGATIVE_FIXTURE_ACCEPTED:{needle}")

def main(root:Path)->dict:
    schema=json.loads((root/'W3_TARGET_PC_UI_EVIDENCE_PACK_V2.schema.json').read_text(encoding='utf-8'))
    fixture=json.loads((root/'W3_TARGET_PC_UI_EVIDENCE_OFFLINE_FIXTURE_V2.json').read_text(encoding='utf-8'))
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(fixture); semantic_validate(fixture)
    collector=(root/'Collect-W3TargetPcUiEvidencePackV2.ps1').read_text(encoding='utf-8')
    required_tokens=['Capture-Screen','Hash-Profile','IDLE_WORKING_NOT_ZERO','RESULT_COMMENT_PRIORITY_FALSE','REGISTRY_ROLE_OVERLAP','C_REPEAT_NOT_SEPARATED','LEGACY_A_E_PRESENT','RESTART_COMMAND','ROLLBACK_COMMAND','ROLLBACK_MAIN_NOT_EXACT','BROWSER_PROFILE_CHANGED','LIVE_PASS_CLAIMED=false']
    missing=[x for x in required_tokens if x not in collector]
    if missing: raise AssertionError('COLLECTOR_TOKEN_MISSING:'+','.join(missing))
    if re.search(r'live_pass_claimed\s*=\s*\$true',collector,re.I): raise AssertionError('COLLECTOR_PREMATURE_LIVE_PASS')
    negatives=[]
    d=copy.deepcopy(fixture);d['screenshots']=d['screenshots'][:-1];negatives.append(must_fail(schema,d,'MISSING_SCREENSHOT'))
    d=copy.deepcopy(fixture);d['screenshots'][1]['sha256']=d['screenshots'][0]['sha256'];negatives.append(must_fail(schema,d,'DUPLICATE_SCREENSHOT_HASH'))
    d=copy.deepcopy(fixture);d['restart_evidence']['evidence_complete']=False;negatives.append(must_fail(schema,d,'INCOMPLETE_RESTART'))
    d=copy.deepcopy(fixture);d['live_pass_claimed']=True;negatives.append(must_fail(schema,d,'PREMATURE_LIVE_PASS'))
    d=copy.deepcopy(fixture);d['ui_truth_assertions']['historical_registry_roles']=['W3'];negatives.append(must_fail(schema,d,'REGISTRY_OVERLAP'))
    d=copy.deepcopy(fixture);d['login_profile_preservation']['after_sha256']='f'*64;negatives.append(must_fail(schema,d,'PROFILE_CHANGED'))
    d=copy.deepcopy(fixture);d['rollback_visual_evidence']['screenshot_sha256']='0'*64;negatives.append(must_fail(schema,d,'ROLLBACK_SCREENSHOT_MISMATCH'))
    return {"schema_version":"W3_TARGET_PC_UI_EVIDENCE_PACK_V2_VALIDATION_RECEIPT","status":"PASS_OFFLINE","assertion_count":30,"schema_meta_validation":"PASS","offline_fixture_validation":"PASS","collector_static_validation":"PASS","powershell_parser_execution":"NOT_AVAILABLE_IN_CURRENT_LINUX_ENVIRONMENT","negative_fixtures":negatives,"wave17_bundle_reused":True,"target_pc_execution":"NOT_RUN_NOT_AUTHORIZED","target_pc_acceptance_claimed":False,"live_pass_claimed":False}

if __name__=='__main__':
    root=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
    receipt=main(root)
    out=root/'W3_TARGET_PC_UI_EVIDENCE_VALIDATION_RECEIPT_V2.json'
    out.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"W3_WAVE18_OFFLINE_VALIDATION_PASS assertions={receipt['assertion_count']}")
