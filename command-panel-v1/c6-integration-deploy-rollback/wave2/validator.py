from __future__ import annotations
import json
import re
from pathlib import Path
from typing import Any

SHA40 = re.compile(r"^[0-9a-f]{40}$")
EXPECTED_PARTIAL = "C6_AI_YOLLA_WAVE2_PREFLIGHT_WAITING_INPUTS"
EXPECTED_FINAL = "C6_AI_YOLLA_WAVE2_INTEGRATION_E2E_PASS"


def validate(matrix: dict[str, Any]) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    def check(name: str, ok: bool, observed: Any) -> None:
        checks.append({"name": name, "pass": bool(ok), "observed": observed})

    check("wave_id", matrix.get("wave_id") == "WAVE_2", matrix.get("wave_id"))
    check("directive_registered_at", matrix.get("directive_registered_at_kst") == "2026-08-02 18:03 KST", matrix.get("directive_registered_at_kst"))
    inputs = matrix.get("inputs", {})
    check("four_worker_inputs", set(inputs) == {"C-2", "C-3", "C-4", "C-5"}, sorted(inputs))
    for worker, item in sorted(inputs.items()):
        check(f"{worker}_directive_comment", isinstance(item.get("directive_comment_id"), int) and item["directive_comment_id"] > 0, item.get("directive_comment_id"))
        check(f"{worker}_start_head", bool(SHA40.fullmatch(str(item.get("start_head", "")))), item.get("start_head"))
        check(f"{worker}_no_virtual_pass", not (item.get("terminal_status") == "PUBLISHED_PASS" and not item.get("result_comment_id")), item.get("terminal_status"))

    published = [item for item in inputs.values() if item.get("terminal_status") == "PUBLISHED_PASS"]
    published_count = len(published)
    check("published_count_consistent", matrix.get("published_terminal_count") == published_count, matrix.get("published_terminal_count"))
    check("virtual_pass_zero", matrix.get("virtual_pass_count") == 0, matrix.get("virtual_pass_count"))
    hard_pass = all(c["pass"] for c in checks)
    if hard_pass and published_count == 4:
        terminal = EXPECTED_FINAL
        decision = "PASS"
        blocker = None
    else:
        terminal = EXPECTED_PARTIAL
        decision = "BLOCKED"
        missing = [worker for worker, item in sorted(inputs.items()) if item.get("terminal_status") != "PUBLISHED_PASS"]
        blocker = "WAVE2_TERMINALS_NOT_PUBLISHED:" + ",".join(missing)
    return {
        "decision": decision,
        "terminal": terminal,
        "blocker": blocker,
        "checks": checks,
        "check_count": len(checks),
        "check_pass_count": sum(1 for c in checks if c["pass"]),
        "published_terminal_count": published_count,
        "required_terminal_count": 4,
        "virtual_pass_rejected": published_count < 4,
        "source_change_authorized": False,
        "runtime_dispatch_authorized": published_count == 4
    }


def main() -> None:
    root = Path(__file__).parent
    matrix = json.loads((root / "C2_TO_C5_WAVE2_INTAKE_MATRIX.json").read_text(encoding="utf-8"))
    print(json.dumps(validate(matrix), ensure_ascii=False, sort_keys=True, indent=2))

if __name__ == "__main__":
    main()
