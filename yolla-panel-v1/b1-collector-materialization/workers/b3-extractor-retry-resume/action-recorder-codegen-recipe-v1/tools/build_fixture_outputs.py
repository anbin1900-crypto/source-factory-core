from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from core import stable_hash
from recorder_codegen import ActionRecorder, PlaywrightCodegen
from replay import RecipeReplayer, SyntheticBrowser

fixture = json.loads((ROOT / "fixtures/action_recording_fixture_v1.json").read_text(encoding="utf-8"))
recorder = ActionRecorder(session_id=fixture["session_id"], start_url=fixture["start_url"])
recorder.record("input", target=fixture["recording_targets"]["keyword"], value="apartment")
recorder.record("select", target=fixture["recording_targets"]["region"], value="seoul")
recorder.record("click", target=fixture["recording_targets"]["search_button_stale"])
recorder.record("scroll", value={"x": 0, "y": 850})
recorder.record("popup", target=fixture["recording_targets"]["details"], metadata={"popup_alias": "detailPage"})
recorder.record("frame", target=fixture["recording_targets"]["frame"], metadata={"operation": "enter", "frame_alias": "resultFrame"})
recorder.record("navigation", url="https://fixture.local/details/1")
recorder.record("frame", target=fixture["recording_targets"]["frame"], metadata={"operation": "exit", "frame_alias": "resultFrame"})


def compact_step(step: dict) -> dict:
    return {key: deepcopy(step.get(key)) for key in (
        "step_id", "sequence", "action_type", "enabled", "page_alias", "frame_path",
        "target_signature", "locator", "value", "url", "metadata",
    )}


workflow = {
    "schema_version": "B3_RECORDED_USER_WORKFLOW_V1",
    "session_id": fixture["session_id"],
    "start_url": fixture["start_url"],
    "recorded_action_count": len(recorder.steps),
    "recorded_action_types": sorted({step["action_type"] for step in recorder.steps}),
    "editable_fields": ["enabled", "value", "url", "metadata", "locator", "locator_candidates"],
    "steps": [compact_step(step) for step in recorder.steps],
    "fixture_only": True,
    "actual_site_execution": False,
}
recipe = recorder.compile_recipe(
    recipe_id="fixture-recipe-001",
    extraction={"mode": "DOM", "fields": [{"name": "title", "locator": {"strategy": "css", "value": "h1", "score": 40, "metadata": {}}}]},
    variables={"keyword": "apartment"},
)
for step in recipe["steps"]:
    step.pop("locator_candidates", None)
recipe.pop("recipe_hash", None)
recipe["recipe_hash"] = stable_hash(recipe)

failed = RecipeReplayer(auto_repair=False).replay(
    recipe, SyntheticBrowser(elements=fixture["elements"], start_url=fixture["start_url"])
)
repaired = RecipeReplayer(auto_repair=True).replay(
    recipe, SyntheticBrowser(elements=fixture["elements"], start_url=fixture["start_url"])
)
code = PlaywrightCodegen.generate_typescript(repaired["recipe"])

failure_evidence = {
    "schema_version": "B3_REPLAY_FAILURE_TRACE_V1",
    "status": failed["status"],
    "failed_step_id": failed["failed_step_id"],
    "reason": failed["reason"],
    "trace": failed["trace"],
    "original_recipe_hash": recipe["recipe_hash"],
    "expected_repair": "SEMANTIC_TARGET_SIGNATURE_TO_ALTERNATE_STABLE_LOCATOR",
}
pass_evidence = {
    "schema_version": "B3_REPLAY_REPAIR_AND_PASS_TRACE_V1",
    "status": repaired["status"],
    "step_count": repaired["step_count"],
    "repair_count": repaired["repair_count"],
    "repairs": repaired["repairs"],
    "trace": repaired["trace"],
    "original_recipe_hash": repaired["original_recipe_hash"],
    "repaired_recipe_hash": repaired["repaired_recipe_hash"],
    "repaired_recipe_path": "generated/EXTRACTION_RECIPE_V1.json",
}

out = ROOT / "generated"
out.mkdir(exist_ok=True)


def dump(name: str, value: object) -> None:
    (out / name).write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")


dump("RECORDED_USER_WORKFLOW_V1.json", workflow)
dump("EXTRACTION_RECIPE_V1.json", repaired["recipe"])
(out / "PLAYWRIGHT_RECIPE_V1.ts").write_text(code, encoding="utf-8")
dump("REPLAY_FAILURE_TRACE_V1.json", failure_evidence)
dump("REPLAY_REPAIR_AND_PASS_TRACE_V1.json", pass_evidence)

print(json.dumps({
    "recorded_action_count": len(recorder.steps),
    "action_type_count": len(workflow["recorded_action_types"]),
    "initial_status": failed["status"],
    "failed_step_id": failed["failed_step_id"],
    "final_status": repaired["status"],
    "repair_count": repaired["repair_count"],
    "original_recipe_hash": recipe["recipe_hash"],
    "repaired_recipe_hash": repaired["repaired_recipe_hash"],
}, ensure_ascii=False, indent=2))
