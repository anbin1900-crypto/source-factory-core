import json,subprocess,sys
from pathlib import Path
from ai_yolla_wave3_integration import run
R=Path(__file__).resolve().parent
M=json.loads((R/"AI_YOLLA_WAVE3_EXACT_INPUT_MATRIX.json").read_text(encoding="utf-8"))
F=json.loads((R/"fixtures/AI_YOLLA_WAVE3_PC_ENVIRONMENT_E2E_FIXTURE.json").read_text(encoding="utf-8"))
c=subprocess.run([sys.executable,"-m","py_compile",str(R/"ai_yolla_wave3_integration.py"),str(R/"tests/test_wave3_final.py")])
t=subprocess.run([sys.executable,"-m","unittest","discover","-s",str(R/"tests"),"-p","test_*.py","-v"],capture_output=True,text=True)
e=run(F,M)
o={"schema_version":"1.0.0","receipt_id":"C6_AI_YOLLA_PC_ENVIRONMENT_E2E_WAVE3_VALIDATION_V1","directive_id":M["directive_id"],"wave_id":"WAVE_3","duplicate_prompt_key":M["duplicate_prompt_key"],"input_matrix":"PASS_4_OF_4" if e["matrix_validation"]["pass"] else "FAIL","python_compile":"PASS" if c.returncode==0 else "FAIL","unit_tests":"PASS_21_OF_21" if t.returncode==0 else "FAIL","e2e_checks":e["checks"],"restart_recovery":e["restart_recovery"],"rollback_blob_parity":e["rollback_blob_parity"],"service_count":e["service_count"],"session_count":e["session_count"],"actual_pc_dispatch_count":0,"actual_panel_apply_count":0,"production":False,"ready":False,"merge":False,"pass":c.returncode==0 and t.returncode==0 and e["pass"],"test_output":t.stderr.strip()}
(R/"VALIDATION_RECEIPT.json").write_text(json.dumps(o,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(o,ensure_ascii=False,indent=2));raise SystemExit(0 if o["pass"] else 1)
