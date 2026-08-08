from __future__ import annotations

from copy import deepcopy
from typing import Any

from core import ActionValidationError, LocatorGenerator, quote, require_text, safe_identifier, stable_hash, target_signature, validate_recipe


class ActionRecorder:
    ACTION_TYPES = {"click", "input", "select", "scroll", "popup", "frame", "navigation"}
    TARGET_REQUIRED = {"click", "input", "select", "popup", "frame"}

    def __init__(self, *, session_id: str, start_url: str) -> None:
        self.session_id = require_text(session_id, "session_id")
        self.start_url = require_text(start_url, "start_url")
        self._steps: list[dict[str, Any]] = []
        self._frame_stack: list[str] = []
        self._page_alias = "page"

    @property
    def steps(self) -> list[dict[str, Any]]:
        return deepcopy(self._steps)

    def record(self, action_type: str, *, target: dict[str, Any] | None = None, value: Any = None,
               url: str | None = None, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        if action_type not in self.ACTION_TYPES: raise ActionValidationError(f"unsupported action_type: {action_type}")
        if action_type in self.TARGET_REQUIRED and not isinstance(target, dict): raise ActionValidationError(f"target is required for {action_type}")
        if action_type in {"input", "select"} and value is None: raise ActionValidationError(f"value is required for {action_type}")
        if action_type == "scroll" and (not isinstance(value, dict) or not all(isinstance(value.get(k, 0), int) for k in ("x", "y"))):
            raise ActionValidationError("scroll value must contain integer x/y")
        if action_type == "navigation": require_text(url, "url")
        candidates = [x.as_dict() for x in LocatorGenerator.candidates(target)] if target else []
        step = {
            "step_id": f"step-{len(self._steps)+1:04d}", "sequence": len(self._steps)+1,
            "action_type": action_type, "enabled": True, "page_alias": self._page_alias,
            "frame_path": list(self._frame_stack), "target_signature": target_signature(target) if target else None,
            "locator": candidates[0] if candidates else None, "locator_candidates": candidates,
            "value": deepcopy(value), "url": url, "metadata": deepcopy(metadata or {}),
        }
        if action_type == "popup":
            alias = safe_identifier((metadata or {}).get("popup_alias", f"popup_{len(self._steps)+1}"))
            step["metadata"]["popup_alias"] = alias
            self._page_alias = alias
        elif action_type == "frame":
            alias = safe_identifier((metadata or {}).get("frame_alias", f"frame_{len(self._frame_stack)+1}"))
            operation = (metadata or {}).get("operation", "enter")
            if operation == "enter": self._frame_stack.append(alias)
            elif operation == "exit":
                if not self._frame_stack: raise ActionValidationError("cannot exit empty frame stack")
                self._frame_stack.pop()
            else: raise ActionValidationError("frame operation must be enter or exit")
            step["metadata"].update({"frame_alias": alias, "operation": operation})
        self._steps.append(step)
        return deepcopy(step)

    def _index(self, step_id: str) -> int:
        for index, step in enumerate(self._steps):
            if step["step_id"] == step_id: return index
        raise ActionValidationError(f"unknown step_id: {step_id}")

    def _renumber(self) -> None:
        for index, step in enumerate(self._steps, 1): step["sequence"] = index

    def update_step(self, step_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(patch, dict): raise ActionValidationError("patch must be an object")
        if {"step_id", "sequence"}.intersection(patch): raise ActionValidationError("step identity fields are immutable")
        index, updated = self._index(step_id), deepcopy(self._steps[self._index(step_id)])
        allowed = {"enabled", "value", "url", "metadata", "locator", "locator_candidates"}
        for key, value in patch.items():
            if key not in allowed: raise ActionValidationError(f"unsupported editable field: {key}")
            updated[key] = deepcopy(value)
        if not isinstance(updated.get("enabled"), bool): raise ActionValidationError("enabled must be boolean")
        self._steps[index] = updated
        return deepcopy(updated)

    def move_step(self, step_id: str, new_index: int) -> None:
        if not isinstance(new_index, int) or not 0 <= new_index < len(self._steps): raise ActionValidationError("new_index out of bounds")
        self._steps.insert(new_index, self._steps.pop(self._index(step_id)))
        self._renumber()

    def remove_step(self, step_id: str) -> dict[str, Any]:
        removed = self._steps.pop(self._index(step_id)); self._renumber(); return deepcopy(removed)

    def compile_recipe(self, *, recipe_id: str, extraction: dict[str, Any] | None = None,
                       variables: dict[str, Any] | None = None) -> dict[str, Any]:
        steps = [deepcopy(s) for s in self._steps if s["enabled"]]
        if not steps: raise ActionValidationError("recipe requires at least one enabled step")
        for index, step in enumerate(steps, 1): step["sequence"] = index
        recipe = {
            "schema_version": "B3_EXTRACTION_RECIPE_V1", "recipe_id": require_text(recipe_id, "recipe_id"),
            "session_id": self.session_id, "start_url": self.start_url, "variables": deepcopy(variables or {}),
            "steps": steps, "extraction": deepcopy(extraction or {"mode": "NONE", "fields": []}),
            "safety": {"production": False, "ready": False, "merge": False},
        }
        recipe["recipe_hash"] = stable_hash(recipe)
        return recipe


class PlaywrightCodegen:
    @staticmethod
    def page_ref(step: dict[str, Any]) -> str:
        base = safe_identifier(step.get("page_alias", "page"))
        for frame in step.get("frame_path") or []:
            base += f".frameLocator({quote('[data-yolla-frame=' + safe_identifier(frame) + ']')})"
        return base

    @classmethod
    def generate_typescript(cls, recipe: dict[str, Any]) -> str:
        validate_recipe(recipe, ActionRecorder.ACTION_TYPES, ActionRecorder.TARGET_REQUIRED)
        lines = ["import { chromium } from 'playwright';", "", "export async function runRecipe(): Promise<void> {",
                 "  const browser = await chromium.launch({ headless: true });", "  const context = await browser.newContext();",
                 "  const page = await context.newPage();", f"  await page.goto({quote(recipe['start_url'])}, {{ waitUntil: 'domcontentloaded' }});"]
        declared = {"page"}
        for step in recipe["steps"]:
            ref, action = cls.page_ref(step), step["action_type"]
            if action == "navigation": lines.append(f"  await {ref}.goto({quote(step['url'])}, {{ waitUntil: 'domcontentloaded' }});")
            elif action == "scroll":
                value = step.get("value") or {}; lines.append(f"  await {ref}.evaluate(() => window.scrollTo({int(value.get('x',0))}, {int(value.get('y',0))}));")
            elif action == "popup":
                alias = safe_identifier(step["metadata"]["popup_alias"])
                if alias in declared: raise ActionValidationError(f"duplicate popup alias: {alias}")
                expr = LocatorGenerator.playwright_expression(step["locator"], ref)
                lines += [f"  const [{alias}] = await Promise.all([context.waitForEvent('page'), {expr}.click()]);", f"  await {alias}.waitForLoadState('domcontentloaded');"]
                declared.add(alias)
            elif action == "frame": lines.append(f"  // frame {step['metadata'].get('operation')}: {quote(step['metadata'].get('frame_alias','frame'))}")
            else:
                expr = LocatorGenerator.playwright_expression(step["locator"], ref)
                if action == "click": lines.append(f"  await {expr}.click();")
                elif action == "input": lines.append(f"  await {expr}.fill({quote(str(step.get('value','')))});")
                elif action == "select": lines.append(f"  await {expr}.selectOption({quote(str(step.get('value','')))});")
                else: raise ActionValidationError(f"unsupported codegen action: {action}")
        return "\n".join(lines + ["  await browser.close();", "}", ""])
