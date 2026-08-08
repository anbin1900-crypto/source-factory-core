from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from hashlib import sha256
import json
import re
from typing import Any


class RecorderError(ValueError):
    pass


class ActionValidationError(RecorderError):
    pass


class LocatorGenerationError(RecorderError):
    pass


class ReplayFailure(RuntimeError):
    def __init__(self, step_id: str, reason: str, locator: dict[str, Any] | None = None) -> None:
        super().__init__(f"{step_id}: {reason}")
        self.step_id = step_id
        self.reason = reason
        self.locator = deepcopy(locator)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def stable_hash(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()


def require_text(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ActionValidationError(f"{field_name} must be a non-empty string")
    return value.strip()


def safe_identifier(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_]+", "_", value).strip("_") or "value"
    return f"v_{normalized}" if normalized[0].isdigit() else normalized


def css_escape(value: str) -> str:
    return re.sub(r"([^a-zA-Z0-9_-])", lambda m: "\\" + m.group(1), value)


def quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


SEMANTIC_SIGNATURE_KEYS = ("tag", "role", "accessible_name", "name", "label", "placeholder", "text")


def target_signature(target: dict[str, Any]) -> str:
    return stable_hash({key: target.get(key) for key in SEMANTIC_SIGNATURE_KEYS if target.get(key) is not None})


@dataclass(frozen=True)
class LocatorCandidate:
    strategy: str
    value: str
    score: int
    metadata: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {"strategy": self.strategy, "value": self.value, "score": self.score, "metadata": deepcopy(self.metadata)}


class LocatorGenerator:
    ORDER = {"test_id": 0, "role": 1, "label": 2, "placeholder": 3, "id": 4, "text": 5, "css": 6}

    @classmethod
    def candidates(cls, target: dict[str, Any]) -> list[LocatorCandidate]:
        if not isinstance(target, dict):
            raise LocatorGenerationError("target must be an object")
        out: list[LocatorCandidate] = []
        test_id = target.get("test_id") or target.get("data_testid")
        if isinstance(test_id, str) and test_id.strip():
            out.append(LocatorCandidate("test_id", test_id.strip(), 100))
        role, name = target.get("role"), target.get("accessible_name") or target.get("name")
        if isinstance(role, str) and role.strip() and isinstance(name, str) and name.strip():
            out.append(LocatorCandidate("role", role.strip(), 95, {"name": name.strip(), "exact": True}))
        for key, strategy, score in (("label", "label", 90), ("placeholder", "placeholder", 85), ("id", "id", 80)):
            value = target.get(key)
            if isinstance(value, str) and value.strip():
                metadata = {"exact": True} if strategy in {"label", "placeholder"} else {}
                out.append(LocatorCandidate(strategy, value.strip(), score, metadata))
        text = target.get("text")
        if isinstance(text, str) and text.strip() and len(text.strip()) <= 160:
            out.append(LocatorCandidate("text", text.strip(), 65, {"exact": True}))
        css = target.get("css") or target.get("css_path")
        if isinstance(css, str) and css.strip():
            out.append(LocatorCandidate("css", css.strip(), 40))
        elif isinstance(target.get("tag"), str):
            classes = sorted({c.strip() for c in target.get("classes", []) if isinstance(c, str) and c.strip()})
            if target["tag"].strip() and classes:
                out.append(LocatorCandidate("css", target["tag"].strip().lower() + "".join(f".{css_escape(c)}" for c in classes), 30))
        dedup: dict[tuple[str, str, str], LocatorCandidate] = {}
        for item in out:
            key = (item.strategy, item.value, canonical_json(item.metadata))
            if key not in dedup or item.score > dedup[key].score:
                dedup[key] = item
        ordered = sorted(dedup.values(), key=lambda x: (-x.score, cls.ORDER[x.strategy], x.value, canonical_json(x.metadata)))
        if not ordered:
            raise LocatorGenerationError("no stable locator candidate available")
        return ordered

    @classmethod
    def best(cls, target: dict[str, Any]) -> dict[str, Any]:
        return cls.candidates(target)[0].as_dict()

    @staticmethod
    def playwright_expression(locator: dict[str, Any], page_ref: str = "page") -> str:
        strategy, value = locator.get("strategy"), require_text(locator.get("value"), "locator.value")
        metadata = locator.get("metadata") or {}
        if strategy == "test_id": return f"{page_ref}.getByTestId({quote(value)})"
        if strategy == "role":
            name = require_text(metadata.get("name"), "locator.metadata.name")
            return f"{page_ref}.getByRole({quote(value)}, {{ name: {quote(name)}, exact: {str(bool(metadata.get('exact', True))).lower()} }})"
        if strategy == "label": return f"{page_ref}.getByLabel({quote(value)}, {{ exact: true }})"
        if strategy == "placeholder": return f"{page_ref}.getByPlaceholder({quote(value)}, {{ exact: true }})"
        if strategy == "id": return f"{page_ref}.locator({quote('#' + css_escape(value))})"
        if strategy == "text": return f"{page_ref}.getByText({quote(value)}, {{ exact: true }})"
        if strategy == "css": return f"{page_ref}.locator({quote(value)})"
        raise LocatorGenerationError(f"unsupported locator strategy: {strategy}")


def validate_recipe(recipe: dict[str, Any], action_types: set[str], target_required: set[str]) -> bool:
    if not isinstance(recipe, dict) or recipe.get("schema_version") != "B3_EXTRACTION_RECIPE_V1":
        raise ActionValidationError("unsupported recipe schema")
    require_text(recipe.get("recipe_id"), "recipe_id")
    require_text(recipe.get("start_url"), "start_url")
    steps = recipe.get("steps")
    if not isinstance(steps, list) or not steps:
        raise ActionValidationError("recipe steps required")
    for expected, step in enumerate(steps, 1):
        if step.get("sequence") != expected: raise ActionValidationError("step sequence must be contiguous")
        if step.get("action_type") not in action_types: raise ActionValidationError("unknown action_type")
        if step["action_type"] in target_required and not isinstance(step.get("locator"), dict):
            raise ActionValidationError("target action requires locator")
    clone = deepcopy(recipe)
    actual = clone.pop("recipe_hash", None)
    if actual != stable_hash(clone): raise ActionValidationError("recipe_hash mismatch")
    return True
