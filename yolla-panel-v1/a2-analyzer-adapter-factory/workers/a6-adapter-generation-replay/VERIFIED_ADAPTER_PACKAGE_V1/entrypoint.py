from pathlib import Path
import json, importlib.util
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("candidate_adapter", HERE.parent/"FIXTURE_ONLY_ADAPTER_CANDIDATE_V1"/"adapter.py")
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
def run(input_path):
    bundle=json.loads(Path(input_path).read_text(encoding="utf-8"))
    return mod.replay(bundle)
