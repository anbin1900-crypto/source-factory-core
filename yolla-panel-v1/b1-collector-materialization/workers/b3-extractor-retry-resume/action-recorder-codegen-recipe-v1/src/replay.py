from __future__ import annotations

from copy import deepcopy
from typing import Any, Iterable

from core import LocatorGenerationError, LocatorGenerator, ReplayFailure, stable_hash, target_signature, validate_recipe
from recorder_codegen import ActionRecorder


class SyntheticBrowser:
    def __init__(self, *, elements: Iterable[dict[str, Any]], start_url: str) -> None:
        self.url, self.scroll = start_url, {"x": 0, "y": 0}
        self.pages, self.frames, self.values, self.trace = {"page"}, [], {}, []
        self.elements = [deepcopy(item) for item in elements]

    @staticmethod
    def matches(element: dict[str, Any], locator: dict[str, Any]) -> bool:
        strategy, value, meta = locator.get("strategy"), locator.get("value"), locator.get("metadata") or {}
        if strategy == "test_id": return element.get("test_id") == value
        if strategy == "role": return element.get("role") == value and (element.get("accessible_name") or element.get("name")) == meta.get("name")
        if strategy == "label": return element.get("label") == value
        if strategy == "placeholder": return element.get("placeholder") == value
        if strategy == "id": return element.get("id") == value
        if strategy == "text": return element.get("text") == value
        if strategy == "css": return element.get("css") == value or element.get("css_path") == value
        return False

    def resolve(self, locator: dict[str, Any]) -> dict[str, Any] | None:
        matches = [element for element in self.elements if self.matches(element, locator)]
        return matches[0] if len(matches) == 1 else None

    def alternate_locator(self, step: dict[str, Any]) -> dict[str, Any] | None:
        signature = step.get("target_signature")
        for element in self.elements:
            if signature and target_signature(element) == signature:
                try:
                    for candidate in LocatorGenerator.candidates(element):
                        locator = candidate.as_dict()
                        if self.resolve(locator) is not None: return locator
                except LocatorGenerationError:
                    return None
        return None

    def execute(self, step: dict[str, Any]) -> None:
        action = step["action_type"]
        if action == "navigation": self.url = step["url"]
        elif action == "scroll": self.scroll = deepcopy(step["value"])
        elif action == "frame":
            operation, alias = step.get("metadata",{}).get("operation"), step.get("metadata",{}).get("frame_alias")
            if operation == "enter": self.frames.append(alias)
            elif operation == "exit":
                if not self.frames: raise ReplayFailure(step["step_id"], "frame stack empty")
                self.frames.pop()
        else:
            element = self.resolve(step["locator"])
            if element is None: raise ReplayFailure(step["step_id"], "locator_not_found_or_ambiguous", step.get("locator"))
            key = element.get("id") or element.get("test_id") or element.get("text") or step["step_id"]
            if action in {"input", "select"}: self.values[str(key)] = deepcopy(step.get("value"))
            elif action == "popup": self.pages.add(step["metadata"]["popup_alias"])
            elif action != "click": raise ReplayFailure(step["step_id"], f"unsupported action {action}")
        self.trace.append({"step_id": step["step_id"], "action_type": action, "status": "PASS"})


class RecipeReplayer:
    def __init__(self, *, auto_repair: bool = True) -> None:
        self.auto_repair = auto_repair

    def replay(self, recipe: dict[str, Any], browser: SyntheticBrowser) -> dict[str, Any]:
        validate_recipe(recipe, ActionRecorder.ACTION_TYPES, ActionRecorder.TARGET_REQUIRED)
        working, repairs = deepcopy(recipe), []
        for step in working["steps"]:
            try:
                browser.execute(step)
            except ReplayFailure as failure:
                if not self.auto_repair or failure.reason != "locator_not_found_or_ambiguous":
                    return {"status":"FAILED", "failed_step_id":failure.step_id, "reason":failure.reason,
                            "repairs":repairs, "trace":deepcopy(browser.trace), "recipe":working}
                replacement = browser.alternate_locator(step)
                if replacement is None or replacement == step.get("locator"):
                    return {"status":"FAILED", "failed_step_id":failure.step_id, "reason":"locator_repair_unavailable",
                            "repairs":repairs, "trace":deepcopy(browser.trace), "recipe":working}
                old = deepcopy(step["locator"]); step["locator"] = replacement
                repairs.append({"step_id":step["step_id"], "failure":failure.reason, "old_locator":old, "new_locator":deepcopy(replacement)})
                browser.execute(step)
        original_hash = working.pop("recipe_hash", None); working["recipe_hash"] = stable_hash(working)
        return {"status":"PASS", "step_count":len(working["steps"]), "repair_count":len(repairs), "repairs":repairs,
                "trace":deepcopy(browser.trace), "recipe":working, "original_recipe_hash":original_hash,
                "repaired_recipe_hash":working["recipe_hash"]}
