from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parent
JSON_FILES = [
    "A7_CYCLE1_REPAIR_START_REPORT_V1.json",
    "A7_CYCLE1_REPAIR_EXECUTION_CONTRACT_V1.json",
    "A7_CYCLE1_INDEPENDENT_ACCEPTANCE_MATRIX_V1.json",
    "A7_CYCLE1_FINDINGS_AND_CYCLE2_ENTRY_GATE_V1.json",
    "A7_CYCLE1_FINAL_REPORT_V1.json",
    "LATEST_A7_C_MODE_CYCLE1_POINTER.json",
]
for name in JSON_FILES:
    json.loads((ROOT / name).read_text(encoding="utf-8"))

script = (ROOT / "Invoke-CModeCycle1EndToEndRepair.ps1").read_text(encoding="utf-8")
required_tokens = {
    "57012279520de80260bd857c9b6a9edd7aa51cba": "A-3 head",
    "c79e102fa805054d2c2a07b62de2d616ce87454d": "A-3 blob",
    "b54af2bb3272b613be5458a283e22e2eb5d90ade": "A-4 head",
    "82bfd506922b7471d5bd1c4ed6697950a738489f": "A-4 blob",
    "84ea9b34a7c9445a77214288556ff3230442d81e": "A-6 head",
    "0d1e4bbf2220212c2d85c39826b31abe01bd176c": "A-6 harness blob",
    "26c30db46bc103ead553ac723469d099d714d900": "A-6 threshold blob",
    "ACTIVE_RUNTIME_VERSION_NOT_OBSERVED": "runtime identity fail-closed gate",
    "A6_RUNTIME_ACTION_OR_SNAPSHOT_DRIVER_REQUIRED": "driver fail-closed gate",
    "false_live_pass_count": "false live pass output",
}
for token, description in required_tokens.items():
    assert token in script, f"missing {description}"

for forbidden in (
    "production=$true",
    "ready=$true",
    "merge=$true",
    "Invoke-WebRequest",
    "curl.exe",
):
    assert forbidden not in script, f"forbidden token: {forbidden}"

bridge = ROOT / "target_pc_runtime_adapter.cjs"
check = subprocess.run(["node", "--check", str(bridge)], text=True, capture_output=True)
assert check.returncode == 0, check.stderr
bridge_text = bridge.read_text(encoding="utf-8")
for metric in (
    "process_count",
    "private_bytes",
    "renderer_count",
    "webcontents_count",
    "listener_count",
    "timer_count",
    "log_entries",
    "closed_background_active",
):
    assert metric in bridge_text
assert "REQUIRED_METRIC_MISSING" in bridge_text
print("PASS_A7_CYCLE1_REPAIR_STATIC_VALIDATION")
